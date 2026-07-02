/**
 * POST /api/chat — InstantDesk AI Agent with deterministic slot memory
 *
 * Per-turn pipeline:
 *  1. Load agent + knowledge sources
 *  2. Resolve / create conversation
 *  3. Load existing lead row (carries confirmed slots from prior turns)
 *  4. Load message history (chronological)
 *  5. BUILD confirmedSlots DETERMINISTICALLY:
 *       — existing lead DB columns + metadata fields
 *       — regex/rule extraction over all user messages + current message
 *       — normalise (krkaow→Krakow, apt/flat→apartment, etc.)
 *  6. COMPUTE missingSlots with code (not AI)
 *  7. Detect booking intent → short-circuit with deterministic reply if ready
 *  8. Persist user message
 *  9. Build enriched prompt: CONFIRMED / MISSING / STRICT RULE blocks
 * 10. Call OpenAI → natural language reply only (slots no longer extracted from LLM)
 * 11. GUARD reply: block any question that asks for a confirmed slot
 *       — if blocked, replace with next deterministic question
 * 12. Persist assistant reply
 * 13. Update lead row with full confirmedSlots (create on first slot, update thereafter)
 * 14. Return reply + conversation_id
 *
 * Console logs every turn:
 *   [SLOTS] confirmedSlots  – what we know
 *   [SLOTS] missingSlots    – what we still need
 *   [GUARD] blockedRepeatedQuestion true/false
 */

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '../../lib/supabase-server'
import { logEvent } from '../_lib/logEvent'
import { getSessionBusinessId } from '../../lib/getSessionBusinessId'
import { scheduleFollowUps } from '../../lib/scheduleFollowUps'
import { retrieveRelevantChunks } from '../../lib/knowledgeChunks'
import { getLimits, checkMonthlyMessageLimit } from '../../lib/usageLimits'
import { loadLeadMemory, upsertLeadMemory, formatMemoryForPrompt } from '../../lib/leadMemory'
import { buildAgentSystemPrompt } from '../../lib/agentPrompt'
import { formatToolResultsForPrompt, runOperationalTools, type AgentToolResult } from '../../lib/agent-tools'
import { parseRentalDateWindow } from '../../lib/rentalDateTime'
import { extractRentalVehicleName } from '../../lib/rentalVehicle'
import { getBusinessTypeConfig, normalizeBusinessType } from '../../lib/businessTypes'
import {
  HANDOVER_REPLY,
  aiCannotAnswer,
  customerRequestedHuman,
  getLiveChatSettings,
  insertStatusEvent,
  markConversationStatus,
  normalizeConversationStatus,
} from '../../lib/live-chat'
import { resolveCustomerIdentity } from '../../lib/customer-identity'

/* ════════════════════════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════════════════════ */

interface AgentRow {
  id: string; name: string; persona: string; objective: string
  tone: string; fallback_msg: string; model: string; temperature: number
}

interface KnowledgeRow { title: string; content: string }

interface Slots {
  name:          string | null
  phone:         string | null
  email:         string | null
  company:       string | null
  notes:         string | null
  service_interest: string | null
  city:          string | null
  area:          string | null   // district / neighbourhood within city
  budget:        string | null
  property_type: string | null
  rooms:         string | null
  deal_type:     string | null
  viewing_time:  string | null
  pickup_location: string | null
  dropoff_location: string | null
  pickup_datetime: string | null
  return_datetime: string | null
  selected_vehicle: string | null
  car_class: string | null
  transmission: string | null
  seats: string | null
  extras: string | null
  booking_number: string | null
  extension_request: string | null
}

const MAX_MESSAGE_LENGTH = 4000
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 20
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

type RateBucket = { count: number; resetAt: number }
const rateBuckets = new Map<string, RateBucket>()

const LEGACY_DEMO_BUSINESS_ID = '0616a47a-2c01-49ce-a798-385f8276b92b'
const PUBLIC_SITE_BUSINESS_ID =
  process.env.PUBLIC_SITE_BUSINESS_ID ||
  process.env.NEXT_PUBLIC_SITE_BUSINESS_ID ||
  'a7827a5c-8480-4cc9-a418-361ea962f50d'

interface ExistingLead {
  id: string; name: string | null; phone: string | null; email: string | null
  interest: string | null; status: string | null; metadata: Record<string, unknown> | null
}

interface SlotDef {
  key:       keyof Slots
  label:     string
  question:  string
  required:  boolean
}

interface AttachmentPayload {
  name?: unknown
  type?: unknown
  size?: unknown
  dataUrl?: unknown
}

/* ════════════════════════════════════════════════════════════════════════════
   GENERIC HELPERS
═══════════════════════════════════════════════════════════════════════════ */

function strOrNull(v: unknown): string | null {
  if (typeof v === 'string' && v.trim() && v.toLowerCase() !== 'null') return v.trim()
  return null
}

function requesterIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || req.headers.get('x-real-ip') || 'unknown'
}

function rateLimitKey(req: NextRequest, businessId: string): string {
  return `${businessId}:${requesterIp(req)}`
}

function requestHost(req: NextRequest): string {
  return (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').toLowerCase()
}

function parseAttachment(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const raw = value as AttachmentPayload
  const name = typeof raw.name === 'string' ? raw.name.slice(0, 140) : 'attachment'
  const type = typeof raw.type === 'string' ? raw.type : ''
  const size = typeof raw.size === 'number' ? raw.size : 0
  const dataUrl = typeof raw.dataUrl === 'string' ? raw.dataUrl : ''
  if (!ALLOWED_ATTACHMENT_TYPES.has(type)) return { error: 'Unsupported file type' as const }
  if (size <= 0 || size > MAX_ATTACHMENT_BYTES) return { error: 'File is too large' as const }
  if (!dataUrl.startsWith(`data:${type};base64,`)) return { error: 'Invalid attachment data' as const }
  return { attachment: { name, type, size, dataUrl, kind: type.startsWith('image/') ? 'image' : 'file' } }
}

function isInstantDeskPublicHost(host: string): boolean {
  const hostname = host.split(':')[0]
  return hostname === 'instantdesk.pl' || hostname === 'www.instantdesk.pl'
}

function resolvePublicWidgetBusinessId(req: NextRequest, requestedBusinessId: string): string {
  const host = requestHost(req)
  if (isInstantDeskPublicHost(host) && requestedBusinessId === LEGACY_DEMO_BUSINESS_ID) {
    return PUBLIC_SITE_BUSINESS_ID
  }
  return requestedBusinessId
}

function checkRateLimit(key: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now()
  const existing = rateBuckets.get(key)
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { ok: true }
  }
  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) }
  }
  existing.count += 1

  if (rateBuckets.size > 10_000) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) rateBuckets.delete(bucketKey)
    }
  }
  return { ok: true }
}

function hasAnySlot(s: Slots): boolean {
  return Object.values(s).some(v => v !== null)
}

function hasMeaningfulSlot(s: Slots): boolean {
  return Object.values(s).some(Boolean)
}

function defaultAgentPayload(businessId: string, businessType?: string | null) {
  return {
    business_id:  businessId,
    name:         'AI Assistant',
    active:       true,
    persona:      'You are a helpful assistant for this business.',
    objective:    'Answer customer questions clearly, qualify leads, and help customers take the next step.',
    tone:         'professional',
    fallback_msg: 'I do not know that yet, but I can connect you with the team.',
    model:        normalizeBusinessType(businessType) === 'car_rental' ? 'gemini-2.5-pro' : 'gpt-4o-mini',
    temperature:  0.4,
  }
}

interface OpenAiAdminErrorLogContext {
  businessId: string
  model: string
}

interface AiAdminErrorLogContext {
  businessId: string
  model: string
  provider: 'openai' | 'gemini'
}

function openAiErrorDetails(error: unknown) {
  const err = error as {
    name?: unknown
    message?: unknown
    status?: unknown
    code?: unknown
    type?: unknown
    param?: unknown
    requestID?: unknown
    headers?: { get?: (name: string) => string | null }
    error?: { message?: unknown; type?: unknown; code?: unknown; param?: unknown }
  }
  const status = typeof err.status === 'number' ? err.status : null
  const code = typeof err.code === 'string'
    ? err.code
    : typeof err.error?.code === 'string'
      ? err.error.code
      : null
  const type = typeof err.type === 'string'
    ? err.type
    : typeof err.error?.type === 'string'
      ? err.error.type
      : null
  const message = typeof err.error?.message === 'string'
    ? err.error.message
    : typeof err.message === 'string'
      ? err.message
      : 'Unexpected OpenAI API error.'
  const requestId = typeof err.requestID === 'string'
    ? err.requestID
    : err.headers?.get?.('x-request-id') ?? err.headers?.get?.('openai-request-id') ?? null

  return {
    name: typeof err.name === 'string' ? err.name : null,
    message,
    status,
    code,
    type,
    param: typeof err.param === 'string' ? err.param : typeof err.error?.param === 'string' ? err.error.param : null,
    requestId,
    payload: {
      message,
      type,
      code,
      param: typeof err.param === 'string' ? err.param : typeof err.error?.param === 'string' ? err.error.param : null,
    },
  }
}

function openAiAdminError(error: unknown) {
  const details = openAiErrorDetails(error)
  const status = details.status
  const code = details.code
  const type = details.type
  const name = details.name ?? ''
  const message = details.message
  const lowerMessage = message.toLowerCase()

  let adminMessage: string
  let responseStatus = status && status >= 400 ? status : 502

  if (status === 401 || code === 'invalid_api_key') {
    adminMessage = 'OPENAI_API_KEY is invalid. Replace it in Vercel Environment Variables and redeploy.'
    responseStatus = 500
  } else if (code === 'insufficient_quota' || lowerMessage.includes('quota')) {
    adminMessage = `OpenAI quota exceeded: ${message}`
    responseStatus = 402
  } else if (status === 429 || code === 'rate_limit_exceeded') {
    adminMessage = `OpenAI rate limit exceeded: ${message}`
    responseStatus = 429
  } else if (code === 'model_not_found' || lowerMessage.includes('model') && lowerMessage.includes('does not exist')) {
    adminMessage = `Selected OpenAI model does not exist or is unavailable: ${message}`
    responseStatus = 500
  } else if (lowerMessage.includes('unsupported') && lowerMessage.includes('model')) {
    adminMessage = `Unsupported OpenAI model selected: ${message}`
    responseStatus = 500
  } else if (code === 'context_length_exceeded' || lowerMessage.includes('context length')) {
    adminMessage = `OpenAI context length exceeded: ${message}`
    responseStatus = 400
  } else if (name.includes('Timeout') || code === 'ETIMEDOUT' || lowerMessage.includes('timeout')) {
    adminMessage = `OpenAI request timed out: ${message}`
    responseStatus = 504
  } else if (name.includes('APIConnection') || code === 'ECONNRESET' || code === 'ENOTFOUND' || code === 'ECONNREFUSED') {
    adminMessage = `OpenAI network/connectivity error: ${message}`
    responseStatus = 502
  } else if (!process.env.OPENAI_API_KEY) {
    adminMessage = 'OPENAI_API_KEY is missing. Add it in Vercel Environment Variables and redeploy.'
    responseStatus = 500
  } else {
    adminMessage = `Unexpected OpenAI API error: ${message}`
  }

  return { adminMessage, responseStatus, details }
}

function logOpenAiError(error: unknown, context: OpenAiAdminErrorLogContext) {
  const classified = openAiAdminError(error)
  console.error('[POST /api/chat] OpenAI API failure', {
    timestamp: new Date().toISOString(),
    endpoint: '/api/chat',
    business_id: context.businessId,
    selected_model: context.model,
    openai_request_id: classified.details.requestId,
    http_status: classified.details.status,
    openai_error_code: classified.details.code,
    openai_error_type: classified.details.type,
    complete_error_payload: classified.details.payload,
  })
  return classified
}

class GeminiApiError extends Error {
  status: number | null
  code: string | null
  type: string | null
  payload: unknown
  constructor(message: string, status: number | null, code: string | null, type: string | null, payload: unknown) {
    super(message)
    this.name = 'GeminiApiError'
    this.status = status
    this.code = code
    this.type = type
    this.payload = payload
  }
}

function isGeminiModel(model: string | null | undefined) {
  return typeof model === 'string' && model.startsWith('gemini-')
}

function geminiErrorDetails(error: unknown) {
  const err = error as { name?: unknown; message?: unknown; status?: unknown; code?: unknown; type?: unknown; payload?: unknown }
  const payload = err.payload
  const payloadObj = payload && typeof payload === 'object' ? payload as { error?: { message?: unknown; status?: unknown; code?: unknown } } : null
  const status = typeof err.status === 'number'
    ? err.status
    : typeof payloadObj?.error?.code === 'number'
      ? payloadObj.error.code
      : null
  const code = typeof err.code === 'string'
    ? err.code
    : typeof payloadObj?.error?.status === 'string'
      ? payloadObj.error.status
      : null
  const type = typeof err.type === 'string' ? err.type : code
  const message = typeof payloadObj?.error?.message === 'string'
    ? payloadObj.error.message
    : typeof err.message === 'string'
      ? err.message
      : 'Unexpected Gemini API error.'
  return {
    name: typeof err.name === 'string' ? err.name : null,
    message,
    status,
    code,
    type,
    requestId: null as string | null,
    payload: payload ?? { message, code, type },
  }
}

function geminiAdminError(error: unknown) {
  const details = geminiErrorDetails(error)
  const status = details.status
  const code = details.code ?? ''
  const name = details.name ?? ''
  const message = details.message
  const lowerMessage = message.toLowerCase()
  let adminMessage: string
  let responseStatus = status && status >= 400 ? status : 502

  if (!process.env.GEMINI_API_KEY) {
    adminMessage = 'GEMINI_API_KEY is missing. Add it in Vercel Environment Variables and redeploy.'
    responseStatus = 500
  } else if ((status === 400 && (lowerMessage.includes('api key') || lowerMessage.includes('key not valid'))) || status === 401 || (status === 403 && lowerMessage.includes('api key'))) {
    adminMessage = 'GEMINI_API_KEY is invalid.'
    responseStatus = 500
  } else if (status === 429 || code === 'RESOURCE_EXHAUSTED' || lowerMessage.includes('quota') || lowerMessage.includes('rate limit')) {
    adminMessage = `Gemini quota/rate limit exceeded: ${message}`
    responseStatus = 429
  } else if (status === 404 || code === 'NOT_FOUND' || lowerMessage.includes('model') && lowerMessage.includes('not found')) {
    adminMessage = `Gemini model not found or unavailable: ${message}`
    responseStatus = 500
  } else if (name.includes('AbortError') || name.includes('Timeout') || lowerMessage.includes('timeout')) {
    adminMessage = `Gemini request timed out: ${message}`
    responseStatus = 504
  } else {
    adminMessage = `Unexpected Gemini API error: ${message}`
  }

  return { adminMessage, responseStatus, details }
}

function logAiProviderError(error: unknown, context: AiAdminErrorLogContext) {
  if (context.provider === 'openai') {
    const classified = logOpenAiError(error, { businessId: context.businessId, model: context.model })
    return classified
  }
  const classified = geminiAdminError(error)
  console.error('[POST /api/chat] Gemini API failure', {
    timestamp: new Date().toISOString(),
    endpoint: '/api/chat',
    business_id: context.businessId,
    selected_model: context.model,
    provider: 'gemini',
    request_id: classified.details.requestId,
    http_status: classified.details.status,
    gemini_error_code: classified.details.code,
    gemini_error_type: classified.details.type,
    complete_error_payload: classified.details.payload,
  })
  return classified
}

/* ════════════════════════════════════════════════════════════════════════════
   DETERMINISTIC SLOT EXTRACTORS
═══════════════════════════════════════════════════════════════════════════ */

/* ── City ──────────────────────────────────────────────────────────────── */

const CITY_ALIASES: Record<string, string> = {
  // Polish (with common typos)
  krakow: 'Krakow', kraków: 'Krakow', krkaow: 'Krakow', cracow: 'Krakow', crackow: 'Krakow',
  warsaw: 'Warsaw', warszawa: 'Warsaw',
  wroclaw: 'Wroclaw', wrocław: 'Wroclaw',
  gdansk: 'Gdansk', gdańsk: 'Gdansk',
  poznan: 'Poznan', poznań: 'Poznan',
  lodz: 'Lodz', 'łódź': 'Lodz',
  katowice: 'Katowice', lublin: 'Lublin', rzeszow: 'Rzeszow',
  rzeszów: 'Rzeszow', szczecin: 'Szczecin',
  bialystok: 'Bialystok', białystok: 'Bialystok',
  // UK
  london: 'London', manchester: 'Manchester', birmingham: 'Birmingham',
  liverpool: 'Liverpool', leeds: 'Leeds', edinburgh: 'Edinburgh',
  bristol: 'Bristol', glasgow: 'Glasgow',
  // International
  dubai: 'Dubai', 'new york': 'New York', paris: 'Paris', berlin: 'Berlin',
  amsterdam: 'Amsterdam', vienna: 'Vienna', prague: 'Prague', budapest: 'Budapest',
  barcelona: 'Barcelona', madrid: 'Madrid', lisbon: 'Lisbon',
}

function extractCity(text: string): string | null {
  const lower = text.toLowerCase()
  // Match known city aliases (longest first to avoid partial matches)
  for (const alias of Object.keys(CITY_ALIASES).sort((a, b) => b.length - a.length)) {
    const esc = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${esc}\\b`, 'i').test(lower)) return CITY_ALIASES[alias]
  }
  // "in/near/around/from [TitleCase City]"
  const m = text.match(/\b(?:in|near|around|from|to|at)\s+([A-Z][a-zA-ZÀ-ž\s]{2,20}?)(?:\s*[,.]|$)/m)
  if (m) {
    const candidate = m[1].trim()
    const skip = new Set(['the','a','an','my','our','your','this','that','what','where',
      'when','how','looking','searching','interested','want','need','area'])
    if (candidate.length >= 3 && !skip.has(candidate.toLowerCase())) return candidate
  }
  return null
}

/* ── Deal type ─────────────────────────────────────────────────────────── */

function extractDealType(text: string): 'rent' | 'buy' | null {
  const t = text.toLowerCase()
  if (/\b(rent|rental|renting|for rent|to rent|lease|leasing|wynajem|do wynajęcia|na wynajem|mieten|louer)\b/.test(t)) return 'rent'
  if (/\b(buy|buying|purchase|purchasing|for sale|to buy|kupno|kupić|kaufen|acheter|na sprzedaż)\b/.test(t)) return 'buy'
  return null
}

/* ── Property type ─────────────────────────────────────────────────────── */

function extractPropertyType(text: string): string | null {
  const t = text.toLowerCase()
  if (/\bstudio\b/.test(t)) return 'studio'
  if (/\b(apartment|apt|flat|mieszkanie|appt)\b/.test(t)) return 'apartment'
  if (/\b(house|dom|villa|willa|bungalow|townhouse|detached)\b/.test(t)) return 'house'
  if (/\bpenthouse\b/.test(t)) return 'penthouse'
  if (/\b(office|biuro)\b/.test(t)) return 'office'
  if (/\bduplex\b/.test(t)) return 'duplex'
  return null
}

/* ── Rooms ─────────────────────────────────────────────────────────────── */

function extractRooms(text: string): string | null {
  const t = text.toLowerCase()
  if (/\bstudio\b/.test(t)) return 'studio'
  // "2-room", "2 rooms", "2 bedroom", "2 bed", "2br"
  let m = text.match(/\b(\d+)[\s-]*(room|bedroom|bed|br|pokój|pokoje|pokoi|zimmer|pièce)s?\b/i)
  if (m) return `${m[1]}-room`
  // Polish "2+1", "3+1"
  m = text.match(/\b(\d)\+\d\b/)
  if (m) return `${m[1]}-room`
  // "one/two/three bedroom"
  const words: Record<string, string> = { one:'1', two:'2', three:'3', four:'4', five:'5' }
  for (const [w, n] of Object.entries(words)) {
    if (new RegExp(`\\b${w}\\s*(?:room|bedroom|bed)`, 'i').test(text)) return `${n}-room`
  }
  return null
}

/* ── Budget ────────────────────────────────────────────────────────────── */

function extractBudget(text: string): string | null {
  const withoutContactNumbers = text.replace(/(\+?\d[\d\s\-().]{8,18}\d)/g, ' ')
  const isMonthly = /\b(per month|\/month|\/mo|monthly|\bpm\b|miesięcznie)\b/i.test(text)
  const suffix    = isMonthly ? '/month' : ''
  // Symbol before number: £2500, €3000, $2000, AED 5000
  let m = text.match(/(£|€|\$|AED|USD|EUR|GBP|PLN|zł)\s*([\d,]{2,7}(?:\.\d{1,2})?)/i)
  if (m) return `${m[1]}${m[2].replace(/,/g,'')}${suffix}`
  // Number before currency: 3000 PLN, 3500 zł
  m = text.match(/([\d,]{3,7})\s*(PLN|zł|EUR|GBP|USD|AED)/i)
  if (m) return `${m[1].replace(/,/g,'')} ${m[2]}${suffix}`
  // Bare number ≥500 with month context, or "around 3000", "up to 4000"
  m = withoutContactNumbers.match(/(?:around|about|up to|max(?:imum)?|upto|approx\.?)?\s*([\d,]{3,6})\b/i)
  if (m) {
    const n = parseInt(m[1].replace(/,/g,''))
    if (n >= 400) return `${n}${suffix}`
  }
  return null
}

/* ── Viewing time ──────────────────────────────────────────────────────── */

function extractViewingTime(text: string): string | null {
  const parts: string[] = []
  const day = text.match(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this weekend|next week|this week)\b/i)
  if (day) parts.push(day[1])
  const clock = text.match(/\b(at\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}(?::\d{2})\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b/i)
  if (clock) parts.push(clock[1])
  else {
    const period = text.match(/\b(morning|afternoon|evening|noon|lunchtime|night)\b/i)
    if (period) parts.push(period[1])
  }
  return parts.length ? parts.join(' ') : null
}

/* ── Name ──────────────────────────────────────────────────────────────── */

const VERB_GUARD = /^(?:looking|searching|interested|ready|available|trying|want|hoping|here|calling|writing|just|also|currently|from|based|a|an|the)\b/i

// Normalise any capitalisation to Title Case ("jordan smith" → "Jordan Smith")
function toTitleCase(s: string): string {
  return s.replace(/\b([a-zA-ZÀ-ž])/g, c => c.toUpperCase())
}

// Capture 1-3 alpha words after a trigger phrase (any capitalisation).
// Stops at punctuation, digits, or end of string.
const NAME_AFTER_TRIGGER = /^([A-Za-zÀ-ž]+(?:\s+[A-Za-zÀ-ž]+){0,2})(?=[,.\s\d]|$)/

// Words that signal the end of a name — strip them if they appear as the second word.
const NAME_STOP_WORDS = new Set([
  'phone','number','mobile','whatsapp','email','mail','budget','rent',
  'looking','viewing','appointment','tomorrow','today','at','on',
  'arrange','book','schedule','and','or','with','for',
])
const NAME_CONTEXT_WORDS = new Set(['again'])
function trimNameStop(raw: string): string {
  const words = raw.trim().split(/\s+/)
  const stopIndex = words.findIndex((word, index) => index > 0 && NAME_STOP_WORDS.has(word.toLowerCase()))
  const trimmed = stopIndex > 0 ? words.slice(0, stopIndex) : words
  while (trimmed.length > 1 && NAME_CONTEXT_WORDS.has(trimmed[trimmed.length - 1].toLowerCase())) {
    trimmed.pop()
  }
  return trimmed.join(' ')
}

function cleanNameCandidate(raw: string): string | null {
  const candidate = trimNameStop(raw)
    .replace(/^\s*(?:sure|ok|okay|yes|yeah|yep|hi|hello|hey)[,\s]+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!candidate || VERB_GUARD.test(candidate)) return null
  if (candidate.includes('@') || /\d/.test(candidate)) return null
  const words = candidate.split(/\s+/)
  if (!words.length || words.length > 3) return null
  if (words.some(word => word.length < 2 || NAME_STOP_WORDS.has(word.toLowerCase()))) return null
  return toTitleCase(candidate)
}

function extractName(text: string): string | null {
  let ph: RegExpMatchArray | null

  // "my name is jordan" / "my name is Jordan Smith"
  ph = text.match(/\bmy name is\s+/i)
  if (ph?.index !== undefined) {
    const m = NAME_AFTER_TRIGGER.exec(text.slice(ph.index + ph[0].length))
    if (m) return toTitleCase(trimNameStop(m[1]))
  }

  // "I'm Jordan" / "I am jordan" — guard against "I'm looking for…"
  ph = text.match(/\bI(?:'m| am)\s+/i)
  if (ph?.index !== undefined) {
    const after = text.slice(ph.index + ph[0].length)
    if (!VERB_GUARD.test(after)) {
      const m = NAME_AFTER_TRIGGER.exec(after)
      if (m) return toTitleCase(trimNameStop(m[1]))
    }
  }

  // "call me Jordan"
  ph = text.match(/\bcall me\s+/i)
  if (ph?.index !== undefined) {
    const m = NAME_AFTER_TRIGGER.exec(text.slice(ph.index + ph[0].length))
    if (m) return toTitleCase(trimNameStop(m[1]))
  }

  // "name is X" / "name's X" / "this is X"
  ph = text.match(/\b(?:name(?:'s| is)|this is|it(?:'s| is))\s+/i)
  if (ph?.index !== undefined) {
    const after = text.slice(ph.index + ph[0].length)
    if (!VERB_GUARD.test(after)) {
      const m = NAME_AFTER_TRIGGER.exec(after)
      if (m) return toTitleCase(trimNameStop(m[1]))
    }
  }

  // "Jordan here" — name at start of sentence or after punctuation
  ph = text.match(/(?:^|[,.;!?]\s+)([A-Za-zÀ-ž]{2,}(?:\s+[A-Za-zÀ-ž]{2,})?)\s+here\b/im)
  if (ph) {
    const candidate = ph[1].trim()
    if (!VERB_GUARD.test(candidate)) return toTitleCase(candidate)
  }

  // "Tommy again" — short returning-visitor shorthand.
  ph = text.match(/^\s*([A-Za-zÀ-ž]{2,}(?:\s+[A-Za-zÀ-ž]{2,}){0,2})\s+again\b/im)
  if (ph) {
    const candidate = trimNameStop(ph[1])
    if (candidate && !VERB_GUARD.test(candidate)) return toTitleCase(candidate)
  }

  // "sure, Mike mike@example.com, 510 998 000" / "Mike, email, phone"
  const withoutMailto = text.replace(/\[([^\]]+)\]\(mailto:[^)]+\)/gi, '$1')
  const contactIndex = withoutMailto.search(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?\d[\d\s().-]{5,}\d/i)
  if (contactIndex > 0) {
    const beforeContact = withoutMailto
      .slice(0, contactIndex)
      .replace(/\b(?:email|mail|phone|mobile|number|whatsapp)\b/gi, ' ')
      .replace(/[()[\]<>]/g, ' ')
      .trim()
    const pieces = beforeContact.split(/[,;.!?]+/).map(piece => piece.trim()).filter(Boolean)
    const candidate = cleanNameCandidate(pieces.at(-1) ?? beforeContact)
    if (candidate) return candidate
  }

  return null
}

/* ── Phone ─────────────────────────────────────────────────────────────── */

// Month names used to strip "30 May", "May 30", etc. before digit matching
const _MONTHS = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'

function extractPhone(text: string): string | null {
  // Strip date/time patterns so trailing day numbers don't bleed into the phone.
  const stripped = text
    .replace(/\bat\s*\d{1,2}:\d{2}\b/gi, ' ')
    .replace(new RegExp(`\\b\\d{1,2}\\s+${_MONTHS}(?:\\s+\\d{2,4})?\\b`, 'gi'), ' ')
    .replace(new RegExp(`\\b${_MONTHS}\\s+\\d{1,2}(?:,?\\s*\\d{2,4})?\\b`, 'gi'), ' ')
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ')

  // International or national with separators
  const m = stripped.match(/(\+?\d[\d\s\-().]{8,18}\d)/)
  if (m) {
    const digits = m[1].replace(/\D/g, '')
    if (digits.length >= 9 && digits.length <= 15) return m[1].trim()
  }
  // Bare digit run
  const bare = stripped.match(/\b(\d{9,12})\b/)
  if (bare) return bare[1]
  return null
}

/* ── Email ─────────────────────────────────────────────────────────────── */

function extractEmail(text: string): string | null {
  const m = text.match(/\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/)
  return m ? m[0] : null
}

function extractCompany(text: string): string | null {
  const patterns = [
    /\b(?:company|business|organisation|organization)\s*(?:is|:)\s*([^.\n,]{2,80})/i,
    /\b(?:from|at|with)\s+([A-Z][A-Za-z0-9&'. -]{2,80}?)(?:\s+(?:company|team|business|organisation|organization))?(?:[.\n,]|$)/,
  ]
  for (const pattern of patterns) {
    const value = text.match(pattern)?.[1]?.trim()
    if (value && !VERB_GUARD.test(value) && !/^(the|a|an|my|our|your)$/i.test(value)) return value
  }
  return null
}

function extractNotes(text: string): string | null {
  const match = text.match(/\b(?:notes?|additional info|anything else)\s*(?:are|is|:|-)\s*([\s\S]{2,500})/i)
  return match?.[1]?.trim() ?? null
}

function extractServiceInterest(text: string): string | null {
  const match = text.match(/\b(?:interested in|need help with|looking for|service is|service:)\s+([^.\n,]{2,120})/i)
  return match?.[1]?.trim() ?? null
}

/* ── Combined extractor ────────────────────────────────────────────────── */

function extractFromText(text: string): Partial<Slots> {
  const carRentalIntent = /\b(car|vehicle|fleet|pickup|pick-up|drop[-\s]?off|return|corolla|camry|x5|bmw|mercedes|skoda|suv|automatic|manual)\b/i.test(text)
  const returnOnlyCorrection =
    /\b(?:return|drop(?:off|-off)?)\b/i.test(text) &&
    /\b(?:wrong|preferred|correct|change|update)\b/i.test(text) &&
    !/\b(?:pick\s*up|pickup|pick-up|from)\s+(?:on\s+)?(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}[./-]|\d{4}-\d{2}-\d{2})\b/i.test(text)
  const carClass = text.match(/\b(economy|compact|suv|van|minivan|premium|luxury|standard)\b/i)?.[1]
  const transmission = text.match(/\b(automatic|manual)\b/i)?.[1]
  const seats = text.match(/\b(\d+)\s*(?:seats?|people|passengers)\b/i)?.[1]
  const bookingNumber = text.match(/\b(?:CR|ID|BK)-?\d{4,8}\b/i)?.[0]
  const airportMention = /\bairport|terminal\b/i.test(text)
  const pickupLocation = text.match(/\bpick(?:up|-up)?\s+location\s+([^.\n,]+?)(?:[.\n,]|$)/i)?.[1]
    ?? text.match(/\bpick(?:up|-up)?\s+(?:at|from)\s+([^,.]+?)(?:\s+(?:tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|at)|[,.]|$)/i)?.[1]
  const dropoffLocation = text.match(/\b(?:drop(?:off|-off)?)\s+location\s+([^.\n,]+?)(?:[.\n,]|$)/i)?.[1]
    ?? text.match(/\b(?:drop(?:off|-off)?|return)\s+(?:at|to)\s+([^,.]+?)(?:\s+(?:tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|at)|[,.]|$)/i)?.[1]
  const rentalWindow = parseRentalDateWindow(text)

  return {
    name:          extractName(text)         ?? undefined,
    phone:         extractPhone(text)        ?? undefined,
    email:         extractEmail(text)        ?? undefined,
    company:       extractCompany(text)      ?? undefined,
    notes:         extractNotes(text)        ?? undefined,
    service_interest: extractServiceInterest(text) ?? undefined,
    city:          extractCity(text)         ?? undefined,
    area:          undefined,   // derived later from context if needed
    budget:        extractBudget(text)       ?? undefined,
    property_type: extractPropertyType(text) ?? undefined,
    rooms:         extractRooms(text)        ?? undefined,
    deal_type:     carRentalIntent ? undefined : extractDealType(text)     ?? undefined,
    viewing_time:  carRentalIntent ? undefined : extractViewingTime(text)  ?? undefined,
    pickup_location: pickupLocation?.trim() ?? (airportMention ? 'Airport' : undefined),
    dropoff_location: dropoffLocation?.trim() ?? undefined,
    pickup_datetime: returnOnlyCorrection ? undefined : rentalWindow.pickupAt ?? undefined,
    return_datetime: rentalWindow.dropoffAt ?? (/\b(?:return|drop(?:off|-off)?)\b/i.test(text) ? extractViewingTime(text) ?? undefined : undefined),
    selected_vehicle: extractRentalVehicleName(text) ?? undefined,
    car_class: carClass ? carClass.toLowerCase() : undefined,
    transmission: transmission ? transmission.toLowerCase() : undefined,
    seats: seats ?? undefined,
    booking_number: bookingNumber?.toUpperCase() ?? undefined,
    extension_request: /\bextend|extension|more days|keep the car|keep it longer\b/i.test(text) ? 'requested' : undefined,
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   CONFIRMED SLOTS  —  single source of truth
═══════════════════════════════════════════════════════════════════════════ */

function latestExtractedSlots(userTexts: string[]): Partial<Slots> {
  return userTexts.reduce<Partial<Slots>>((acc, text) => {
    const next = extractFromText(text)
    for (const [key, value] of Object.entries(next) as [keyof Slots, string | undefined][]) {
      if (value) acc[key] = value
    }
    return acc
  }, {})
}

function isLocationAffirmation(text: string) {
  return /\b(yes|yeah|yep|ok|okay|fine|correct|that location|same location|works|sounds good)\b/i.test(text)
}

function latestAssistantSuggestedLocation(history: { role: string; content: string }[]): string | null {
  const assistantMessages = history.filter(message => message.role === 'assistant').map(message => message.content).reverse()
  for (const content of assistantMessages) {
    const known = content.match(/\bKrak[oó]w\s+Boche[ńn]ska\s+2a\b/i)?.[0]
    if (known) return known
    const labelled = content.match(/\b(?:pickup|pick-up)\s+location(?: is|:)?\s+([^.\n]+?)(?:[.\n]|$)/i)?.[1]?.trim()
    if (labelled && labelled.length <= 90) return labelled
  }
  return null
}

/**
 * Merge existing lead row + latest user-confirmed values into one
 * authoritative Slots object. Rental operational fields are newest-message-wins
 * so corrected dates, cars, and locations do not stay stale in the Test AI UI.
 */
function buildConfirmedSlots(
  existingLead:  ExistingLead | null,
  history:       { role: string; content: string }[],
  currentMsg:    string,
): Slots {
  const meta = (existingLead?.metadata ?? {}) as Record<string, unknown>

  // Base: what's already persisted in the lead row
  const fromDB: Slots = {
    name:          strOrNull(existingLead?.name),
    phone:         strOrNull(existingLead?.phone),
    email:         strOrNull(existingLead?.email),
    company:       strOrNull(meta.company),
    notes:         strOrNull(meta.notes),
    service_interest: strOrNull(meta.service_interest),
    city:          strOrNull(meta.city),
    area:          strOrNull(meta.area),
    budget:        strOrNull(meta.budget),
    property_type: strOrNull(meta.property_type),
    rooms:         strOrNull(meta.rooms),
    deal_type:     strOrNull(meta.deal_type),
    viewing_time:  strOrNull(meta.viewing_time),
    pickup_location: strOrNull(meta.pickup_location),
    dropoff_location: strOrNull(meta.dropoff_location),
    pickup_datetime: strOrNull(meta.pickup_datetime),
    return_datetime: strOrNull(meta.return_datetime),
    selected_vehicle: strOrNull(meta.selected_vehicle),
    car_class: strOrNull(meta.car_class),
    transmission: strOrNull(meta.transmission),
    seats: strOrNull(meta.seats),
    extras: strOrNull(meta.extras),
    booking_number: strOrNull(meta.booking_number),
    extension_request: strOrNull(meta.extension_request),
  }

  const userTexts = [
    ...history.filter(m => m.role === 'user').map(m => m.content),
    currentMsg,
  ]
  const extracted = latestExtractedSlots(userTexts)
  const currentExtracted = extractFromText(currentMsg)
  if (!currentExtracted.pickup_location && isLocationAffirmation(currentMsg)) {
    const suggestedLocation = latestAssistantSuggestedLocation(history)
    if (suggestedLocation) extracted.pickup_location = suggestedLocation
  }
  if (!currentExtracted.dropoff_location && /\b(?:drop(?:off|-off)?|return)\b.*\bsame location\b|\bsame location\b.*\b(?:drop(?:off|-off)?|return)\b/i.test(currentMsg)) {
    const pickupLocation = extracted.pickup_location ?? fromDB.pickup_location
    if (pickupLocation) extracted.dropoff_location = pickupLocation
  }

  // Stable identity fields keep DB continuity; operational rental fields use
  // latest confirmed values so corrections update immediately.
  return {
    name:          fromDB.name          ?? extracted.name          ?? null,
    phone:         fromDB.phone         ?? extracted.phone         ?? null,
    email:         fromDB.email         ?? extracted.email         ?? null,
    company:       fromDB.company       ?? extracted.company       ?? null,
    notes:         fromDB.notes         ?? extracted.notes         ?? null,
    service_interest: fromDB.service_interest ?? extracted.service_interest ?? null,
    city:          fromDB.city          ?? extracted.city          ?? null,
    area:          fromDB.area          ?? null,
    budget:        fromDB.budget        ?? extracted.budget        ?? null,
    property_type: fromDB.property_type ?? extracted.property_type ?? null,
    rooms:         fromDB.rooms         ?? extracted.rooms         ?? null,
    deal_type:     fromDB.deal_type     ?? extracted.deal_type     ?? null,
    viewing_time:  fromDB.viewing_time  ?? extracted.viewing_time  ?? null,
    pickup_location: extracted.pickup_location ?? fromDB.pickup_location ?? null,
    dropoff_location: extracted.dropoff_location ?? fromDB.dropoff_location ?? null,
    pickup_datetime: extracted.pickup_datetime ?? fromDB.pickup_datetime ?? null,
    return_datetime: extracted.return_datetime ?? fromDB.return_datetime ?? null,
    selected_vehicle: extracted.selected_vehicle ?? fromDB.selected_vehicle ?? null,
    car_class: extracted.car_class ?? fromDB.car_class ?? null,
    transmission: extracted.transmission ?? fromDB.transmission ?? null,
    seats: extracted.seats ?? fromDB.seats ?? null,
    extras: extracted.extras ?? fromDB.extras ?? null,
    booking_number: fromDB.booking_number ?? extracted.booking_number ?? null,
    extension_request: fromDB.extension_request ?? extracted.extension_request ?? null,
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   MISSING SLOTS  — computed by code, never by AI
═══════════════════════════════════════════════════════════════════════════ */

function defaultSlotDefsForBusinessType(businessType: string | null | undefined): SlotDef[] {
  return getBusinessTypeConfig(businessType).qualificationSlots.map(slot => ({
    key: slot.key as keyof Slots,
    label: slot.label,
    question: slot.question,
    required: slot.required,
  }))
}

function computeMissingSlots(confirmed: Slots, slotDefs: SlotDef[]): SlotDef[] {
  return slotDefs.filter(def => {
    if (def.key === 'car_class' && confirmed.selected_vehicle) return false
    if (def.key === 'selected_vehicle' && confirmed.car_class) return false
    return !confirmed[def.key]
  })
}

function computeQualificationStage(confirmed: Slots, missing: SlotDef[]): string {
  const hasAnySlot = Object.values(confirmed).some(Boolean)

  const hasContact =
    Boolean(confirmed.name) ||
    Boolean(confirmed.phone) ||
    Boolean(confirmed.email)

  const hasIntent =
    Object.entries(confirmed).some(([key, value]) => !['name', 'phone', 'email'].includes(key) && Boolean(value))

  const hasAppointment = Boolean(confirmed.viewing_time || confirmed.pickup_datetime)

  if (!hasAnySlot) return 'discovery'
  if (missing.length > 0) return 'qualifying'
  if (hasContact && hasIntent && !hasAppointment) return 'ready_to_book'
  if (hasContact && hasIntent && hasAppointment) return 'booked'
  return 'qualifying'
}

type RentalFleetCarForState = {
  id?: string
  name?: string | null
  model?: string | null
  transmission?: string | null
  seats?: number | null
  fuel_type?: string | null
  daily_price?: number | null
  car_classes?: { name?: string | null } | { name?: string | null }[] | null
}

function normalizeRentalLookup(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function rentalClassName(row: RentalFleetCarForState) {
  const related = Array.isArray(row.car_classes) ? row.car_classes[0] : row.car_classes
  return related?.name ?? null
}

function rentalCarMatchesSelection(row: RentalFleetCarForState, selectedVehicle: string) {
  const selected = normalizeRentalLookup(extractRentalVehicleName(selectedVehicle) ?? selectedVehicle)
  if (!selected) return false
  const haystack = normalizeRentalLookup(`${row.name ?? ''} ${row.model ?? ''} ${rentalClassName(row) ?? ''}`)
  if (!haystack) return false
  const selectedWords = selected.split(/\s+/).filter(Boolean)
  return selectedWords.every(word => haystack.includes(word))
}

async function hydrateSelectedRentalVehicle(
  sb: SupabaseClient,
  businessId: string,
  slots: Slots,
  businessType?: string | null,
): Promise<Slots> {
  if (normalizeBusinessType(businessType) !== 'car_rental' || !slots.selected_vehicle) return slots
  const { data, error } = await sb
    .from('cars')
    .select('id,name,model,transmission,seats,fuel_type,daily_price,active,car_classes(name)')
    .eq('business_id', businessId)
    .eq('active', true)
  if (error) {
    console.error('[RENTAL STATE] selected vehicle hydration failed:', JSON.stringify(error))
    return slots
  }
  const selectedVehicle = slots.selected_vehicle
  if (!selectedVehicle) return slots
  const matches = ((data ?? []) as RentalFleetCarForState[]).filter(row => rentalCarMatchesSelection(row, selectedVehicle))
  if (matches.length !== 1) return slots
  const car = matches[0]
  return {
    ...slots,
    selected_vehicle: car.name?.trim() || slots.selected_vehicle,
    car_class: slots.car_class ?? rentalClassName(car),
    transmission: slots.transmission ?? strOrNull(car.transmission)?.toLowerCase() ?? null,
    seats: slots.seats ?? (typeof car.seats === 'number' ? String(car.seats) : null),
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   BOOKING INTENT DETECTION
═══════════════════════════════════════════════════════════════════════════ */

function detectBookingIntent(text: string): boolean {
  return /\b(book|schedule|arrange|set up|make)\s+(?:a\s+|the\s+|me\s+a\s+)?(?:viewing|visit|appointment|meeting|call|tour)\b/i.test(text)
    || /\bwhen\s+can\s+(?:i|we)\s+(?:view|visit|see|come|meet)\b/i.test(text)
    || /\bi(?:'m|\s+am)\s+(?:ready|interested|available)\s+to\s+(?:view|visit|see|meet)\b/i.test(text)
}

function hasEnoughForBooking(confirmed: Slots, businessType?: string | null): boolean {
  const type = normalizeBusinessType(businessType)
  if (type === 'car_rental') {
    const hasContact = !!(confirmed.name && confirmed.phone && confirmed.email)
    return !!(confirmed.pickup_location && confirmed.dropoff_location && confirmed.pickup_datetime && confirmed.return_datetime && confirmed.selected_vehicle && hasContact)
  }
  const hasLocation = !!(confirmed.city)
  const hasProperty = !!(confirmed.property_type || confirmed.deal_type)
  const hasContact  = !!(confirmed.name || confirmed.phone || confirmed.email)
  return hasLocation && hasProperty && hasContact
}

/* ════════════════════════════════════════════════════════════════════════════
   SYSTEM PROMPT BUILDER
═══════════════════════════════════════════════════════════════════════════ */

function buildSystemPrompt(
  agent:     AgentRow,
  knowledge: KnowledgeRow[],
  confirmed: Slots,
  missing:   SlotDef[],
  stage:     string,
  memory:    string,
  businessType?: string | null,
  toolResults: AgentToolResult[] = [],
): string {
  const knowledgeBlock = knowledge.length > 0
    ? knowledge.map(k => `### ${k.title}\n${k.content}`).join('\n\n')
    : '(No knowledge configured for this client.)'
  const toolBlock = formatToolResultsForPrompt(toolResults)

  const confirmedLines: string[] = []
  if (confirmed.name)          confirmedLines.push(`Name: ${confirmed.name}`)
  if (confirmed.phone)         confirmedLines.push(`Phone: ${confirmed.phone}`)
  if (confirmed.email)         confirmedLines.push(`Email: ${confirmed.email}`)
  if (confirmed.company)       confirmedLines.push(`Company: ${confirmed.company}`)
  if (confirmed.service_interest) confirmedLines.push(`Service interest: ${confirmed.service_interest}`)
  if (confirmed.city)          confirmedLines.push(`City/location: ${confirmed.city}`)
  if (confirmed.area)          confirmedLines.push(`Area/district: ${confirmed.area}`)
  if (confirmed.budget)        confirmedLines.push(`Budget: ${confirmed.budget}`)
  if (confirmed.property_type) confirmedLines.push(`Property type: ${confirmed.property_type}`)
  if (confirmed.rooms)         confirmedLines.push(`Rooms: ${confirmed.rooms}`)
  if (confirmed.deal_type)     confirmedLines.push(`Deal type: ${confirmed.deal_type}`)
  if (confirmed.viewing_time)  confirmedLines.push(`Preferred viewing time: ${confirmed.viewing_time}`)
  if (confirmed.pickup_location) confirmedLines.push(`Pickup location: ${confirmed.pickup_location}`)
  if (confirmed.dropoff_location) confirmedLines.push(`Drop-off location: ${confirmed.dropoff_location}`)
  if (confirmed.pickup_datetime) confirmedLines.push(`Pickup date/time: ${confirmed.pickup_datetime}`)
  if (confirmed.return_datetime) confirmedLines.push(`Return date/time: ${confirmed.return_datetime}`)
  if (confirmed.selected_vehicle) confirmedLines.push(`Selected vehicle: ${confirmed.selected_vehicle}`)
  if (confirmed.car_class) confirmedLines.push(`Car class: ${confirmed.car_class}`)
  if (confirmed.transmission) confirmedLines.push(`Transmission: ${confirmed.transmission}`)
  if (confirmed.seats) confirmedLines.push(`Seats: ${confirmed.seats}`)
  if (confirmed.extras) confirmedLines.push(`Extras: ${confirmed.extras}`)
  if (confirmed.booking_number) confirmedLines.push(`Booking number: ${confirmed.booking_number}`)
  if (confirmed.extension_request) confirmedLines.push(`Extension request: ${confirmed.extension_request}`)
  if (confirmed.notes)         confirmedLines.push(`Notes: ${confirmed.notes}`)

  return buildAgentSystemPrompt({
    config: agent,
    businessType,
    knowledgeText: `${knowledgeBlock}${toolBlock ? `\n\nLIVE OPERATIONAL TOOL RESULTS\n${toolBlock}\n\nUse these tool results as authoritative for fleet inventory, availability, pricing, policies, and locations. Do not contradict tool results. If a required tool failed, explain that the live check could not be completed and offer human support.` : ''}`,
    collectedData: confirmedLines,
    missingFields: missing.map(field => ({ label: field.label, required: field.required })),
    stage,
    memory,
  })
}

/* ════════════════════════════════════════════════════════════════════════════
   SERVER-SIDE REPETITION GUARD
═══════════════════════════════════════════════════════════════════════════ */

interface RepeatCheck {
  keys:     (keyof Slots)[]
  patterns: RegExp[]
}

const REPEAT_CHECKS: RepeatCheck[] = [
  { keys: ['city'],          patterns: [/which city/i, /what city/i, /where.*(?:looking|search)/i, /which area/i, /what area/i, /which location/i, /looking.*in which/i, /city.*looking/i, /area.*looking/i] },
  { keys: ['deal_type'],     patterns: [/rent or buy/i, /buy or rent/i, /looking to (?:rent|buy)/i, /renting or buying/i, /purchase or rent/i, /for rent or/i] },
  { keys: ['property_type'], patterns: [/type of property/i, /what kind of property/i, /apartment or house/i, /house or apartment/i, /looking for a.*type/i] },
  { keys: ['rooms'],         patterns: [/how many (?:rooms|bedroom)/i, /number of (?:rooms|bedroom)/i, /(?:rooms?|bedrooms?).* need/i, /size.*looking/i] },
  { keys: ['budget'],        patterns: [/what.*budget/i, /budget.*looking/i, /how much.*(?:spend|afford|pay)/i, /price range/i, /financial.*budget/i] },
  { keys: ['name'],          patterns: [/your name/i, /may i (?:have|get) your name/i, /could i (?:get|have) your name/i, /what(?:'s| is) your name/i] },
  { keys: ['phone'],         patterns: [/phone number/i, /contact number/i, /mobile number/i, /telephone/i, /call you on/i] },
  { keys: ['email'],         patterns: [/email address/i, /your email/i, /email.*(?:reach|contact)/i] },
  { keys: ['viewing_time'],  patterns: [/when.*view/i, /schedule.*viewing/i, /(?:viewing|visit) time/i, /when.*(?:come|visit|see)/i, /best time.*view/i] },
]

function guardReply(
  reply:     string,
  confirmed: Slots,
  missing:   SlotDef[],
): { reply: string; blocked: boolean } {
  for (const check of REPEAT_CHECKS) {
    const allConfirmed = check.keys.every(k => !!confirmed[k])
    if (!allConfirmed) continue
    const triggered = check.patterns.some(p => p.test(reply))
    if (!triggered) continue

    // Blocked: replace with a minimal field-label redirect (no hardcoded question text)
    if (missing.length === 0) {
      return {
        reply:   "I believe I have everything I need — our team will be in contact with you shortly to take this forward.",
        blocked: true,
      }
    }
    return { reply: `One more thing — could you share your ${missing[0].label.toLowerCase()}?`, blocked: true }
  }
  return { reply, blocked: false }
}

type FleetReplyCar = {
  name?: string | null
  className?: string | null
  transmission?: string | null
  dailyPrice?: number | null
}

function firstFleetReplyCar(toolResults: AgentToolResult[]) {
  const fleet = toolResults.find(result => result.tool === 'searchFleet' && result.ok)
  const data = fleet?.data as { cars?: FleetReplyCar[] } | undefined
  return data?.cars?.[0] ?? null
}

function selectedVehicleIntro(confirmed: Slots, car?: FleetReplyCar | null) {
  const name = car?.name || confirmed.selected_vehicle || 'that vehicle'
  const attrs = [
    car?.transmission || confirmed.transmission || null,
    car?.dailyPrice ? `${car.dailyPrice} PLN/day` : null,
  ].filter(Boolean)
  return attrs.length
    ? `Great — ${name} is ${attrs.join(' and ')}.`
    : `Great — ${name} is selected.`
}

function selectedVehicleNextStepReply(confirmed: Slots, missing: SlotDef[], toolResults: AgentToolResult[]) {
  if (!confirmed.selected_vehicle) return null
  const car = firstFleetReplyCar(toolResults)
  const missingKeys = new Set(missing.map(field => field.key))
  const intro = selectedVehicleIntro(confirmed, car)
  if (missingKeys.has('pickup_location')) return `${intro} What pickup location should I use?`
  if (missingKeys.has('dropoff_location')) return `${intro} What drop-off location should I use?`
  if (missingKeys.has('pickup_datetime') || missingKeys.has('return_datetime')) {
    return `${intro} What pickup date and time should I use, and what return date and time should I use?`
  }
  if (missingKeys.has('name')) return `${intro} Could you please provide your name?`
  if (missingKeys.has('phone')) return 'What is your phone number?'
  if (missingKeys.has('email')) return 'What is your email address?'
  return null
}

function rentalToolReplyOverride(
  toolResults: AgentToolResult[],
  confirmed: Slots,
  missing: SlotDef[],
  businessType?: string | null,
  userMessage = '',
): string | null {
  if (normalizeBusinessType(businessType) !== 'car_rental') return null
  const missingDropoff = missing.some(field => field.key === 'dropoff_location')
  if (missingDropoff && /\b(?:return|date|time|automatic|manual|correct|wrong|preferred)\b/i.test(userMessage)) {
    const pieces = ['Thanks, I updated the rental details.']
    if (confirmed.selected_vehicle) pieces.push(`Vehicle: ${confirmed.selected_vehicle}.`)
    if (confirmed.pickup_datetime) pieces.push(`Pickup: ${confirmed.pickup_datetime}.`)
    if (confirmed.return_datetime) pieces.push(`Return: ${confirmed.return_datetime}.`)
    if (confirmed.transmission) pieces.push(`Transmission: ${confirmed.transmission}.`)
    pieces.push('I still need the drop-off location before I can check final availability and create the booking.')
    return pieces.join(' ')
  }
  if (toolResults.length === 0) return null
  const create = toolResults.find(result => result.tool === 'createBooking')
  const availability = toolResults.find(result => result.tool === 'checkAvailability')
  const price = toolResults.find(result => result.tool === 'calculatePrice')
  const fleet = toolResults.find(result => result.tool === 'searchFleet')
  const locations = toolResults.find(result => result.tool === 'getLocations')
  const selected = confirmed.selected_vehicle ?? confirmed.car_class ?? 'the selected car'

  if (create?.ok) {
    const data = create.data as { bookingNumber?: string; status?: string } | undefined
    if (!data?.bookingNumber) return 'Booking creation failed because no booking reference was returned. I can connect you with the team to finish this safely.'
    return [
      `Your booking request has been created for ${selected}.`,
      data?.bookingNumber ? `Reference: ${data.bookingNumber}.` : null,
      data?.status ? `Status: ${data.status}.` : null,
      confirmed.pickup_datetime && confirmed.return_datetime ? `Rental window: ${confirmed.pickup_datetime} to ${confirmed.return_datetime}.` : null,
      'Payment and deposit will be handled at pickup.',
    ].filter(Boolean).join(' ')
  }

  if (create && !create.ok) {
    const requiredOrder = ['dropoff_location', 'pickup_location', 'pickup_datetime', 'return_datetime', 'selected_vehicle', 'car_class', 'name', 'phone', 'email']
    const nextMissing = requiredOrder
      .map(key => missing.find(field => field.key === key))
      .find(Boolean)
    if (nextMissing) return `${create.summary} ${nextMissing.question}`
    return create.error ? `${create.summary} ${create.error}` : create.summary
  }

  if (availability) {
    const contactMissing = missing.find(field => ['name', 'phone', 'email'].includes(String(field.key)))
    if (contactMissing && confirmed.selected_vehicle) {
      const selectedNext = selectedVehicleNextStepReply(confirmed, missing, toolResults)
      if (selectedNext) return selectedNext
    }
    if (!availability.ok) {
      const nextMissing = missing.find(field => ['dropoff_location', 'pickup_location', 'pickup_datetime', 'return_datetime', 'selected_vehicle', 'car_class'].includes(String(field.key)))
      return nextMissing ? `${availability.summary} ${nextMissing.question}` : availability.summary
    }
    const nextMissing = missing.find(field => ['name', 'phone', 'email', 'dropoff_location', 'pickup_location'].includes(String(field.key)))
    const pieces = [availability.summary]
    if (price?.ok) pieces.push(price.summary)
    if (nextMissing) pieces.push(nextMissing.question)
    const availabilityData = availability.data as { available?: boolean } | undefined
    if (!nextMissing && availabilityData?.available && price?.ok) {
      pieces.push('Would you like me to create the booking request?')
    }
    return pieces.join(' ')
  }

  const selectedNextStep = selectedVehicleNextStepReply(confirmed, missing, toolResults)
  if (selectedNextStep && confirmed.pickup_location && confirmed.dropoff_location) return selectedNextStep

  if (locations?.ok) {
    const data = locations.data as { locations?: { name?: string | null; address?: string | null }[] } | undefined
    const list = data?.locations ?? []
    if (list.length === 1) {
      const location = list[0]
      const label = [location.name, location.address].filter(Boolean).join(', ')
      return `Our pickup location is ${label}.`
    }
    if (list.length > 1) {
      return `Our pickup locations are: ${list.map(location => [location.name, location.address].filter(Boolean).join(', ')).join('; ')}.`
    }
    return 'No active pickup locations are configured yet. I can connect you with the team to confirm pickup options.'
  }

  if (selectedNextStep) return selectedNextStep

  if (fleet?.ok && !availability && !price) {
    if (confirmed.selected_vehicle) return null
    const data = fleet.data as { cars?: { name?: string | null; className?: string | null; transmission?: string | null; dailyPrice?: number | null }[] } | undefined
    const cars = data?.cars ?? []
    if (cars.length === 0) return 'I do not see any matching cars currently listed in the live fleet.'
    const listed = cars.slice(0, 8).map(car => {
      const details = [car.className, car.transmission, car.dailyPrice ? `${car.dailyPrice} per day` : null].filter(Boolean).join(', ')
      return details ? `${car.name} (${details})` : String(car.name)
    }).join('; ')
    return `Here are the matching cars from the live fleet: ${listed}. Which one would you like?`
  }

  return null
}

function rentalClarificationReply(
  confirmed: Slots,
  missing: SlotDef[],
  businessType?: string | null,
  userMessage = '',
): string | null {
  if (normalizeBusinessType(businessType) !== 'car_rental') return null
  const text = userMessage.toLowerCase()
  const hasRentalIntent = /\b(rent|rental|car|vehicle|tomorrow|today|economy|economical|suv|automatic|manual|corolla|camry|x5|bmw|mercedes|skoda)\b/.test(text)
  if (!hasRentalIntent) return null
  const missingKeys = new Set(missing.map(field => field.key))
  const hasOnlyDateIntent = /\b(today|tomorrow)\b/.test(text) && !confirmed.pickup_datetime && !confirmed.return_datetime
  if (hasOnlyDateIntent) {
    return 'Sure — what time would you like to pick it up, and when would you like to return it?'
  }
  if (missingKeys.has('pickup_datetime') || missingKeys.has('return_datetime')) {
    return 'Sure — what pickup date and time should I use, and what return date and time should I use?'
  }
  if (confirmed.selected_vehicle) {
    const intro = selectedVehicleIntro(confirmed)
    if (missingKeys.has('pickup_location')) return `${intro} What pickup location should I use?`
    if (missingKeys.has('dropoff_location')) return `${intro} What drop-off location should I use?`
    if (missingKeys.has('name')) return `${intro} Could you please provide your name?`
    if (missingKeys.has('phone')) return 'What is your phone number?'
    if (missingKeys.has('email')) return 'What is your email address?'
  }
  if (!confirmed.selected_vehicle && confirmed.car_class) {
    return `I can help with ${confirmed.car_class} cars. Which specific vehicle would you like?`
  }
  const nextMissing = missing.find(field => ['selected_vehicle', 'car_class', 'pickup_location', 'dropoff_location', 'name', 'phone', 'email'].includes(String(field.key)))
  return nextMissing ? nextMissing.question : null
}

/* ════════════════════════════════════════════════════════════════════════════
   OPENAI CALLER  — text reply only (slots extracted deterministically)
═══════════════════════════════════════════════════════════════════════════ */

async function callOpenAI(
  client:      OpenAI,
  model:       string,
  temperature: number,
  systemPrompt: string,
  history:     { role: 'user' | 'assistant'; content: string }[],
  userMessage: string,
): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
  ]

  const response = await client.chat.completions.create({
    model,
    temperature,
    messages,
    max_tokens: 300,
  })

  const text = response.choices[0]?.message?.content?.trim() ?? ''
  if (!text) throw new Error('Empty OpenAI response')

  // Strip any accidental JSON the model might include
  const stripped = text.replace(/^```(?:json)?\n?/i, '').replace(/```$/,'').trim()
  // If the model still returned JSON (old prompt leaking), extract the reply field
  try {
    const parsed = JSON.parse(stripped) as Record<string, unknown>
    if (typeof parsed.reply === 'string') return parsed.reply.trim()
  } catch { /* not JSON, good */ }

  return stripped
}

function stripModelReply(text: string) {
  const stripped = text.replace(/^```(?:json)?\n?/i, '').replace(/```$/,'').trim()
  try {
    const parsed = JSON.parse(stripped) as Record<string, unknown>
    if (typeof parsed.reply === 'string') return parsed.reply.trim()
  } catch { /* not JSON */ }
  return stripped
}

async function callGemini(
  model: string,
  temperature: number,
  systemPrompt: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  userMessage: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new GeminiApiError('GEMINI_API_KEY is missing. Add it in Vercel Environment Variables and redeploy.', 500, 'MISSING_API_KEY', 'config_error', null)
  }
  const contents = [
    ...history.map(message => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    })),
    { role: 'user', parts: [{ text: userMessage }] },
  ]
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: 300,
        },
      }),
    })
    const payload = await res.json().catch(() => null) as {
      error?: { message?: string; status?: string; code?: number }
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    } | null
    if (!res.ok) {
      throw new GeminiApiError(payload?.error?.message ?? `Gemini request failed with HTTP ${res.status}`, res.status, payload?.error?.status ?? null, payload?.error?.status ?? null, payload)
    }
    const text = payload?.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('').trim() ?? ''
    if (!text) throw new GeminiApiError('Empty Gemini response', 502, 'EMPTY_RESPONSE', 'empty_response', payload)
    return stripModelReply(text)
  } finally {
    clearTimeout(timeout)
  }
}

async function callAIProvider(
  client: OpenAI,
  model: string,
  temperature: number,
  systemPrompt: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  userMessage: string,
) {
  if (isGeminiModel(model)) {
    return callGemini(model, temperature, systemPrompt, history, userMessage)
  }
  return callOpenAI(client, model, temperature, systemPrompt, history, userMessage)
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN ROUTE HANDLER
═══════════════════════════════════════════════════════════════════════════ */

export async function POST(req: NextRequest) {
  /* 1. Parse ─────────────────────────────────────────────────────────────── */
  let body: { business_id?: unknown; conversation_id?: unknown; message?: unknown; attachment?: unknown; visitor_context?: unknown; debug?: unknown; test_ai?: unknown }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const requestedBusinessId = typeof body.business_id === 'string' ? body.business_id.trim() : null
  const conversation_id = typeof body.conversation_id === 'string' ? body.conversation_id.trim() : null
  const message         = typeof body.message         === 'string' ? body.message.trim()         : null
  const attachmentResult = parseAttachment(body.attachment)
  const debugMode       = body.debug === true
  const testAiMode      = body.test_ai === true

  if (!requestedBusinessId) return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
  if (attachmentResult && 'error' in attachmentResult) return NextResponse.json({ error: attachmentResult.error }, { status: 400 })
  if (!message && !attachmentResult?.attachment) return NextResponse.json({ error: 'message is required' }, { status: 400 })
  const business_id = resolvePublicWidgetBusinessId(req, requestedBusinessId)
  if ((message ?? '').length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `message must be ${MAX_MESSAGE_LENGTH} characters or fewer` }, { status: 413 })
  }
  const messageText = message ?? attachmentResult?.attachment?.name ?? ''
  const visitorContext = body.visitor_context && typeof body.visitor_context === 'object' && !Array.isArray(body.visitor_context)
    ? body.visitor_context as Record<string, unknown>
    : null
  const customerMessageMetadata = {
    sender_type: 'customer',
    delivery_status: 'delivered',
    attachment: attachmentResult?.attachment ?? null,
    visitor_context: visitorContext,
  }
  const rate = checkRateLimit(rateLimitKey(req, business_id))
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Too many chat messages. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } },
    )
  }

  /* 2. Resolve session IDs ────────────────────────────────────────────────── */
  let clientId:     string  = business_id
  let businessId:   string  = business_id
  let fallbackUsed: boolean = true
  try {
    const session = await getSessionBusinessId()
    if (session.fromSession) {
      clientId     = session.clientId
      businessId   = session.businessId ?? session.clientId
      fallbackUsed = false
    }
  } catch { /* no session — use body business_id */ }
  console.log('[LiveChatDebug] chat request resolved', {
    host: requestHost(req),
    requested_business_id: requestedBusinessId,
    effective_business_id: businessId,
    client_id: clientId,
    fallback_used: fallbackUsed,
    conversation_id: conversation_id ?? null,
    test_ai: testAiMode,
  })

  /* 3. Supabase ───────────────────────────────────────────────────────────── */
  const sb = createAdminClient()

  const liveChatSettings = await getLiveChatSettings(sb, businessId)
  console.log('[LiveChatDebug] settings resolved', {
    host: requestHost(req),
    business_id: businessId,
    ai_auto_replies_enabled: liveChatSettings.ai_auto_replies_enabled,
    live_chat_enabled: liveChatSettings.live_chat_enabled,
    human_handover_enabled: liveChatSettings.human_handover_enabled,
  })

  let resolvedConversation: { convId: string; status: string | null; isNewConv: boolean } | null = null
  async function resolveConversation() {
    if (resolvedConversation) return resolvedConversation

    let convId: string
    let status: string | null = null

    if (conversation_id) {
      const { data: existing } = await sb
        .from('conversations').select('id, business_id, status').eq('id', conversation_id).maybeSingle()
      if (existing?.id && existing.business_id === businessId) {
        convId = existing.id
        status = typeof existing.status === 'string' ? existing.status : null
      } else {
        convId = crypto.randomUUID()
        if (existing?.id) {
          console.warn('[LiveChatDebug] ignored mismatched conversation_id', {
            requested_conversation_id: conversation_id,
            conversation_business_id: existing.business_id,
            effective_business_id: businessId,
          })
        }
      }
    } else {
      convId = crypto.randomUUID()
    }

    const isNewConv = convId !== conversation_id
    if (isNewConv) {
      const { error: ce } = await sb.from('conversations').insert({
        id:              convId,
        business_id:     businessId,
        channel:         'website',
        status:          'ai_active',
        unread_count:    1,
        last_message_at: new Date().toISOString(),
      })
      if (ce) {
        const { error: fallbackError } = await sb.from('conversations').insert({
          id:              convId,
          business_id:     businessId,
          channel:         'website',
          status:          'open',
          last_message_at: new Date().toISOString(),
        })
        if (fallbackError) {
          console.error('[POST /api/chat] conversation insert failed:', JSON.stringify(fallbackError))
          throw new Error(`Failed to create conversation: ${fallbackError.message}`)
        }
      }
      status = 'ai_active'
    } else {
      await sb
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', convId)
    }

    resolvedConversation = { convId, status, isNewConv }
    console.log('[LiveChatDebug] conversation resolved', {
      business_id: businessId,
      conversation_id: convId,
      status,
      is_new_conversation: isNewConv,
    })
    return resolvedConversation
  }

  async function incrementUnread(convId: string) {
    try {
      const { data } = await sb.from('conversations').select('unread_count').eq('id', convId).maybeSingle()
      const current = typeof data?.unread_count === 'number' ? data.unread_count : 0
      await sb.from('conversations').update({ unread_count: current + 1 }).eq('id', convId)
    } catch { /* unread counter is best-effort */ }
  }

  async function linkCustomerIdentity(convId: string, confirmed: Slots, leadId: string | null) {
    try {
      const result = await resolveCustomerIdentity(sb, {
        businessId,
        conversationId: convId,
        channel: 'website',
        externalIdentifier: `website:${convId}`,
        email: confirmed.email,
        phone: confirmed.phone,
        displayName: confirmed.name,
        company: confirmed.company,
        country: typeof visitorContext?.country === 'string' ? visitorContext.country : null,
        language: typeof visitorContext?.language === 'string' ? visitorContext.language : null,
        timezone: typeof visitorContext?.timezone === 'string' ? visitorContext.timezone : null,
        metadata: {
          lead_id: leadId,
          source: 'website_chat',
          visitor_context: visitorContext,
        },
      })
      console.log('[CustomerIdentity] website conversation linked', {
        business_id: businessId,
        conversation_id: convId,
        customer_id: result.customer_id,
        matched_by: result.matched_by,
        confidence_score: result.confidence_score,
      })
      return result.customer_id
    } catch (err) {
      console.warn('[CustomerIdentity] link failed', err instanceof Error ? err.message : err)
      return null
    }
  }

  if (!testAiMode && !liveChatSettings.ai_auto_replies_enabled && liveChatSettings.live_chat_enabled) {
    console.log('[LiveChatDebug] entering human-only branch', {
      business_id: businessId,
      ai_auto_replies_enabled: liveChatSettings.ai_auto_replies_enabled,
      live_chat_enabled: liveChatSettings.live_chat_enabled,
    })
    let convId: string
    try {
      ;({ convId } = await resolveConversation())
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create conversation' }, { status: 500 })
    }

    const { error: userMsgErr } = await sb.from('messages').insert({
      conversation_id: convId, business_id: businessId, role: 'user', content: messageText, metadata: customerMessageMetadata,
    })
    if (userMsgErr) console.error('[POST /api/chat] live-chat user message insert failed:', JSON.stringify(userMsgErr))
    await incrementUnread(convId)
    await markConversationStatus(sb, convId, businessId, 'handover_requested')
    if ((await resolveConversation()).isNewConv) {
      await insertStatusEvent(sb, convId, businessId, 'Waiting for a human reply.', 'handover_requested')
    }
    const { data: existingLiveLead } = await sb.from('leads').select('id, name, phone, email, interest, status, metadata')
      .eq('conversation_id', convId).maybeSingle()
    const confirmed = buildConfirmedSlots(existingLiveLead as ExistingLead | null, [], messageText)
    const missing = computeMissingSlots(confirmed, defaultSlotDefsForBusinessType(null))
    const qualificationStage = computeQualificationStage(confirmed, missing)
    const liveChatPersist = await persistLead(
      sb,
      existingLiveLead as ExistingLead | null,
      convId,
      clientId,
      businessId,
      confirmed,
      missing,
      confirmed.name && (confirmed.phone || confirmed.email) ? 'contacted' : 'new',
      qualificationStage,
      '',
      messageText,
      null,
    )
    console.log('[LiveChatDebug] human-only persisted', {
      business_id: businessId,
      conversation_id: convId,
      lead_id: liveChatPersist.lead_id,
      lead_insert_error: liveChatPersist.insert_error,
      message_insert_error: userMsgErr?.message ?? null,
    })
    const customerId = await linkCustomerIdentity(convId, confirmed, liveChatPersist.lead_id)

    return NextResponse.json({
      reply: null,
      conversation_id: convId,
      customer_id: customerId,
      status: 'handover_requested',
      handover: true,
      ai_reply_skipped: true,
      waiting_for_human: true,
      lead_id: liveChatPersist.lead_id,
      lead_insert_error: liveChatPersist.insert_error,
      message_insert_error: userMsgErr?.message ?? null,
    })
  }

  /* 3a. Monthly message limit ─────────────────────────────────────────────── */
  try {
    const limits = await getLimits(sb, businessId)
    const msgCheck = await checkMonthlyMessageLimit(sb, businessId, limits)
    if (!msgCheck.ok) {
      return NextResponse.json(
        { error: msgCheck.message, reply: "I'm sorry, this assistant has reached its monthly message limit. Please try again next month." },
        { status: 429 },
      )
    }
  } catch (err) {
    console.warn('[LIMITS] monthly check failed (non-fatal):', err instanceof Error ? err.message : err)
  }

  /* 4. Load active agent ──────────────────────────────────────────────────── */
  // Try session businessId first; if not found, fall back to the widget's body business_id.
  // This handles the case where an authenticated owner tests the widget from their browser
  // (session overrides businessId) but the agent row is keyed on the widget's configured ID.
  console.log('[LiveChatDebug] entering AI branch', {
    business_id: businessId,
    requested_business_id: requestedBusinessId,
    body_business_id: business_id,
    ai_auto_replies_enabled: liveChatSettings.ai_auto_replies_enabled,
    live_chat_enabled: liveChatSettings.live_chat_enabled,
    human_handover_enabled: liveChatSettings.human_handover_enabled,
    test_ai: testAiMode,
  })
  console.log('[POST /api/chat] agent lookup — session businessId:', businessId, '| body business_id:', business_id)

  const { data: businessRow, error: businessTypeError } = await sb
    .from('businesses')
    .select('business_type')
    .eq('id', businessId)
    .maybeSingle()
  if (businessTypeError && businessTypeError.code !== '42703') {
    console.warn('[POST /api/chat] business_type lookup failed:', JSON.stringify(businessTypeError))
  }
  const businessType = normalizeBusinessType(typeof businessRow?.business_type === 'string' ? businessRow.business_type : null)

  let agentRow: AgentRow | null = null
  let agentLookupId = businessId

  // Primary lookup: session-resolved businessId
  const { data: agentPrimary, error: agentErr } = await sb
    .from('agents').select('*')
    .eq('business_id', businessId).eq('active', true)
    .limit(1).maybeSingle()

  if (agentErr) {
    console.error('[POST /api/chat] agent primary lookup error:', JSON.stringify(agentErr))
    return NextResponse.json({ error: 'Failed to load agent', details: agentErr }, { status: 500 })
  }

  if (agentPrimary) {
    agentRow = agentPrimary as AgentRow
    console.log('[POST /api/chat] agent found via session businessId:', businessId, '| agent id:', agentRow.id)
  } else if (business_id && business_id !== businessId) {
    // Fallback: try the body's business_id (widget embed ID may differ from session ID)
    console.log('[POST /api/chat] no agent for session businessId, trying body business_id:', business_id)
    const { data: agentFallback, error: agentFallbackErr } = await sb
      .from('agents').select('*')
      .eq('business_id', business_id).eq('active', true)
      .limit(1).maybeSingle()

    if (agentFallbackErr) {
      console.error('[POST /api/chat] agent fallback lookup error:', JSON.stringify(agentFallbackErr))
    } else if (agentFallback) {
      agentRow = agentFallback as AgentRow
      agentLookupId = business_id
      // Agent config found via widget ID — but all DB writes still use the session-resolved
      // clientId/businessId so leads and appointments land in the right account.
      console.log('[POST /api/chat] agent found via body business_id:', business_id, '| agent id:', agentRow.id, '| writes use session:', businessId)
    }
  }

  if (!agentRow) {
    if (testAiMode) {
      const { data: existingAgents, error: existingAgentsErr } = await sb
        .from('agents').select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: true })
        .limit(1)

      if (existingAgentsErr) {
        console.error('[POST /api/chat] Test AI fallback agent lookup error:', JSON.stringify(existingAgentsErr))
        return NextResponse.json({ error: 'Failed to load agent', details: existingAgentsErr }, { status: 500 })
      }

      const existingAgent = existingAgents?.[0] as AgentRow | undefined
      if (existingAgent?.id) {
        const { data: activatedAgent, error: activateErr } = await sb
          .from('agents')
          .update({ active: true })
          .eq('id', existingAgent.id)
          .select('*')
          .maybeSingle()

        if (activateErr) {
          console.error('[POST /api/chat] Test AI fallback agent activation error:', JSON.stringify(activateErr))
          return NextResponse.json({ error: 'Failed to activate default AI agent', details: activateErr.message }, { status: 500 })
        }

        agentRow = activatedAgent as AgentRow
        agentLookupId = businessId
        console.log('[POST /api/chat] Test AI activated existing agent fallback:', {
          business_id: businessId,
          agent_id: agentRow?.id,
        })
      } else {
        const { data: createdAgent, error: createErr } = await sb
          .from('agents')
          .insert(defaultAgentPayload(businessId, businessType))
          .select('*')
          .maybeSingle()

        if (createErr) {
          console.error('[POST /api/chat] Test AI default agent creation error:', JSON.stringify(createErr))
          return NextResponse.json({ error: 'Failed to create default AI agent', details: createErr.message }, { status: 500 })
        }

        agentRow = createdAgent as AgentRow
        agentLookupId = businessId
        console.log('[POST /api/chat] Test AI created default active agent:', {
          business_id: businessId,
          agent_id: agentRow?.id,
        })
      }
    }
  }

  if (!agentRow) {
    // Diagnostic: count ALL agents for both IDs to help debug
    const { data: allAgents } = await sb
      .from('agents').select('id, business_id, active, name')
      .in('business_id', [businessId, business_id ?? businessId].filter(Boolean))
    console.error('[POST /api/chat] NO ACTIVE AGENT FOUND', {
      sessionBusinessId: businessId,
      bodyBusinessId:    business_id,
      agentsFound:       allAgents ?? [],
    })
    return NextResponse.json({
      error:  'No active agent found',
      details: {
        sessionBusinessId: businessId,
        bodyBusinessId:    business_id,
        hint: 'Create an active agent in the dashboard AI section, or ensure the widget business_id matches your account.',
      },
    }, { status: 404 })
  }
  void agentLookupId  // consumed above
  const agent = agentRow as AgentRow

  /* 4. Retrieve relevant knowledge ───────────────────────────────────────── */
  // Priority: 1) vector chunks  2) capped fallback from knowledge_sources  3) empty
  let knowledge: KnowledgeRow[] = []

  let vectorOk = false
  let ragCount = 0
  let ragTitles = 'none'
  try {
    const ragChunks = await retrieveRelevantChunks(sb, businessId, messageText, 6)
    ragCount  = ragChunks.length
    ragTitles = [...new Set(ragChunks.map(c => c.title))].join(', ') || 'none'
    if (ragChunks.length > 0) {
      knowledge = ragChunks.map(c => ({ title: c.title, content: c.content }))
      vectorOk = true
    }
  } catch (err) {
    console.error('[RAG] error:', err instanceof Error ? err.message : String(err))
  }

  console.log('[RAG] retrieved chunk count:', ragCount)
  console.log('[RAG] source titles:', ragTitles)

  if (vectorOk) {
    console.log('[KNOWLEDGE MODE] vector')
  } else {
    // Fallback: load knowledge_sources, cap total content at 3000 chars
    const { data: fallbackRows } = await sb
      .from('knowledge_sources').select('title, content')
      .eq('business_id', businessId).eq('is_active', true)
      .order('created_at', { ascending: true })

    const capped: KnowledgeRow[] = []
    let total = 0
    for (const row of (fallbackRows ?? []) as KnowledgeRow[]) {
      if (total >= 3000) break
      const slice = row.content.slice(0, 3000 - total)
      capped.push({ title: row.title, content: slice })
      total += slice.length
    }
    knowledge = capped

    if (knowledge.length > 0) {
      console.log('[KNOWLEDGE MODE] fallback —', knowledge.length, 'sources,', total, 'chars')
    } else {
      console.log('[KNOWLEDGE MODE] empty')
    }
  }

  /* 5. Resolve / create conversation ─────────────────────────────────────── */
  let convId: string
  let conversationStatus: string | null = null
  try {
    const resolved = await resolveConversation()
    convId = resolved.convId
    conversationStatus = resolved.status
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create conversation' }, { status: 500 })
  }

  const normalizedStatus = normalizeConversationStatus(conversationStatus)
  if (normalizedStatus === 'live_chat' || normalizedStatus === 'handover_requested' || normalizedStatus === 'resolved') {
    const { error: userMsgErr } = await sb.from('messages').insert({
      conversation_id: convId, business_id: businessId, role: 'user', content: messageText, metadata: customerMessageMetadata,
    })
    if (userMsgErr) console.error('[POST /api/chat] handover user message insert failed:', JSON.stringify(userMsgErr))
    await incrementUnread(convId)
    if (normalizedStatus === 'resolved') {
      await markConversationStatus(sb, convId, businessId, 'handover_requested')
      await insertStatusEvent(sb, convId, businessId, 'Conversation reopened by customer message.', 'conversation_reopened')
    }
    const { data: activeLead } = await sb.from('leads').select('id, name, phone, email, interest, status, metadata')
      .eq('conversation_id', convId).maybeSingle()
    const confirmed = buildConfirmedSlots(activeLead as ExistingLead | null, [], messageText)
    const missing = computeMissingSlots(confirmed, defaultSlotDefsForBusinessType(null))
    const qualificationStage = computeQualificationStage(confirmed, missing)
    const handoverPersist = await persistLead(
      sb,
      activeLead as ExistingLead | null,
      convId,
      clientId,
      businessId,
      confirmed,
      missing,
      confirmed.name && (confirmed.phone || confirmed.email) ? 'contacted' : 'new',
      qualificationStage,
      '',
      messageText,
      null,
    )
    const customerId = await linkCustomerIdentity(convId, confirmed, handoverPersist.lead_id)
    return NextResponse.json({
      reply: null,
      conversation_id: convId,
      customer_id: customerId,
      status: normalizedStatus === 'resolved' ? 'handover_requested' : normalizedStatus,
      handover: true,
      ai_reply_skipped: true,
      waiting_for_human: true,
      lead_id: handoverPersist.lead_id,
      lead_insert_error: handoverPersist.insert_error,
      message_insert_error: userMsgErr?.message ?? null,
    })
  }

  /* 6. Load existing lead, message history, and qualification fields ─────── */
  // All three in parallel — none depend on each other.
  const [leadResult, historyResult, qualResult] = await Promise.all([
    sb.from('leads').select('id, name, phone, email, interest, status, metadata')
      .eq('conversation_id', convId).maybeSingle(),
    sb.from('messages').select('role, content')
      .eq('conversation_id', convId).order('created_at', { ascending: true }).limit(40),
    sb.from('agent_qualification_fields')
      .select('field_key, label, prompt, required, sort_order')
      .eq('business_id', businessId).eq('active', true)
      .order('sort_order', { ascending: true }),
  ])

  if (leadResult.error) console.error('[POST /api/chat] lead lookup error:', JSON.stringify(leadResult.error))
  if (historyResult.error) console.error('[POST /api/chat] history lookup error:', JSON.stringify(historyResult.error))

  const existingLead = leadResult.data as ExistingLead | null
  const history      = ((historyResult.data as { role: string; content: string }[] | null) ?? []).map(r => ({
    role:    r.role,
    content: r.content,
  }))

  // Build slotDefs from Supabase rows; fall back to hardcoded defaults if table is empty/missing
  const qualRows = qualResult.data as { field_key: string; label: string; prompt: string; required: boolean }[] | null
  const slotDefs: SlotDef[] = qualRows?.length
    ? qualRows.map(r => ({
        key:      r.field_key as keyof Slots,
        label:    r.label,
        question: r.prompt,
        required: r.required,
      }))
    : defaultSlotDefsForBusinessType(businessType)

  /* 7. Build confirmedSlots deterministically ─────────────────────────────── */
  let confirmed            = buildConfirmedSlots(existingLead, history, messageText)
  confirmed                = await hydrateSelectedRentalVehicle(sb, businessId, confirmed, businessType)
  const missing            = computeMissingSlots(confirmed, slotDefs)
  const qualificationStage = computeQualificationStage(confirmed, missing)

  /* 7a. Load lead memory (non-blocking — null if table missing or no row yet) */
  let leadMemoryStr = ''
  if (existingLead?.id) {
    try {
      const mem = await loadLeadMemory(sb, businessId, existingLead.id)
      leadMemoryStr = formatMemoryForPrompt(mem)
    } catch { /* table may not exist yet — safe to ignore */ }
  }

  console.log('[SLOTS] confirmedSlots:', JSON.stringify(confirmed))
  console.log('[SLOTS] missingSlots:',  missing.map(d => d.key).join(', ') || 'none')
  console.log('[SLOTS] qualificationStage:', qualificationStage)

  const operationalToolResults = await runOperationalTools(sb, {
    businessId,
    businessType,
    conversationId: convId,
    message: messageText,
    slots: confirmed,
  })
  if (operationalToolResults.length > 0) {
    console.log('[AGENT TOOLS] executed', operationalToolResults.map(result => ({
      tool: result.tool,
      ok: result.ok,
      summary: result.summary,
      error: result.error ?? null,
    })))
  }

  /* 8. Check booking intent → short-circuit if ready ─────────────────────── */
  if (!testAiMode && customerRequestedHuman(messageText, liveChatSettings) && liveChatSettings.live_chat_enabled) {
    const { error: userMsgErr } = await sb.from('messages').insert({
      conversation_id: convId, business_id: businessId, role: 'user', content: messageText, metadata: customerMessageMetadata,
    })
    if (userMsgErr) console.error('[POST /api/chat] handover-request user message insert failed:', JSON.stringify(userMsgErr))
    const { error: assistantMsgErr } = await sb.from('messages').insert({
      conversation_id: convId, business_id: businessId, role: 'assistant', content: HANDOVER_REPLY,
    })
    if (assistantMsgErr) console.error('[POST /api/chat] handover assistant message insert failed:', JSON.stringify(assistantMsgErr))
    await incrementUnread(convId)
    await markConversationStatus(sb, convId, businessId, 'handover_requested')
    await insertStatusEvent(sb, convId, businessId, 'Customer requested a human handover.', 'handover_requested')
    const handoverPersist = await persistLead(
      sb,
      existingLead,
      convId,
      clientId,
      businessId,
      confirmed,
      missing,
      confirmed.name && (confirmed.phone || confirmed.email) ? 'contacted' : 'new',
      qualificationStage,
      HANDOVER_REPLY,
      messageText,
      businessType,
    )
    const customerId = await linkCustomerIdentity(convId, confirmed, handoverPersist.lead_id)
    return NextResponse.json({
      reply: HANDOVER_REPLY,
      conversation_id: convId,
      customer_id: customerId,
      status: 'handover_requested',
      handover: true,
      lead_id: handoverPersist.lead_id,
      lead_insert_error: handoverPersist.insert_error,
      message_insert_error: userMsgErr?.message ?? null,
    })
  }

  if (normalizeBusinessType(businessType) !== 'car_rental' && detectBookingIntent(messageText) && hasEnoughForBooking(confirmed, businessType)) {
    const stillNeedContact = !confirmed.phone && !confirmed.email
    const bookingReply = stillNeedContact
      ? `I'd love to arrange a viewing! Could I get your phone number or email so our team can confirm the available times?`
      : `Perfect! I have everything I need to request your viewing. Our team will review the details and contact you shortly to confirm a time that works. 🏠`

    // Persist user message first, then assistant — sequential so user always gets an earlier
    // created_at timestamp (parallel inserts can produce same or reversed timestamps).
    const uMsgR = await sb.from('messages').insert({ conversation_id: convId, business_id: businessId, role: 'user', content: messageText, metadata: customerMessageMetadata })
    if (uMsgR.error) console.error('[POST /api/chat] booking user-msg insert:', JSON.stringify(uMsgR.error))
    const aMsgR = await sb.from('messages').insert({ conversation_id: convId, business_id: businessId, role: 'assistant', content: bookingReply })
    if (aMsgR.error) console.error('[POST /api/chat] booking ai-msg insert:', JSON.stringify(aMsgR.error))

    console.log('[GUARD] blockedRepeatedQuestion: false (booking short-circuit)')
    console.log('PERSIST IDS', { resolvedClientId: clientId, resolvedBusinessId: businessId, bodyBusinessId: business_id, fallbackUsed })
    const bResult = await persistLead(sb, existingLead, convId, clientId, businessId, confirmed, missing, 'qualified', qualificationStage, bookingReply, messageText, businessType)
    const customerId = await linkCustomerIdentity(convId, confirmed, bResult.lead_id)

    if (bResult.lead_id) {
      void scheduleFollowUps(sb, {
        businessId,
        clientId:        clientId,
        leadId:          bResult.lead_id,
        leadName:        confirmed.name ?? undefined,
        conversationId:  convId,
        appointmentId:   bResult.appointment_id,
        appointmentTime: bResult.appointment_scheduled_at,
        isHotLead:       !!(confirmed.name && (confirmed.phone || confirmed.email)),
      })
    }

    const bookingBody: Record<string, unknown> = {
      reply:                    bookingReply,
      conversation_id:          convId,
      customer_id:              customerId,
      intent:                   'booking',
      lead_ready:               true,
      lead_id:                  bResult.lead_id,
      lead_insert_error:        bResult.insert_error,
      appointment_id:           bResult.appointment_id,
      appointment_insert_error: bResult.appointment_insert_error,
    }
    if (debugMode) {
      bookingBody.debug = {
        confirmedSlots: confirmed,
        missingSlots:   missing.map(d => d.key),
        isQualified:    true,
        ai_summary:     null,
        blocked:        false,
      }
    }
    return NextResponse.json(bookingBody)
  }

  /* 9. Persist user message ──────────────────────────────────────────────── */
  const { error: userMsgErr } = await sb.from('messages').insert({
    conversation_id: convId,
    business_id: businessId,
    role: 'user',
    content: messageText,
    metadata: {
      ...customerMessageMetadata,
      operational_tools: operationalToolResults.map(result => ({
        tool: result.tool,
        ok: result.ok,
        summary: result.summary,
        error: result.error ?? null,
      })),
    },
  })
  if (userMsgErr) console.error('[POST /api/chat] user message insert failed:', JSON.stringify(userMsgErr))
  await incrementUnread(convId)

  const deterministicRentalReply =
    rentalToolReplyOverride(operationalToolResults, confirmed, missing, businessType, messageText) ??
    rentalClarificationReply(confirmed, missing, businessType, messageText)

  if (deterministicRentalReply) {
    const { reply: finalReply, blocked } = guardReply(deterministicRentalReply, confirmed, missing)
    const { error: aiMsgErr } = await sb.from('messages').insert({
      conversation_id: convId, business_id: businessId, role: 'assistant', content: finalReply,
    })
    if (aiMsgErr) console.error('[POST /api/chat] deterministic rental ai-msg insert failed:', JSON.stringify(aiMsgErr))

    const isQualified = !!(confirmed.name && confirmed.phone && confirmed.email)
    const intent      = detectDealType(messageText) ? 'inquiry' : 'greeting'
    const persist = await persistLead(sb, existingLead, convId, clientId, businessId, confirmed, missing, isQualified ? 'contacted' : 'new', qualificationStage, finalReply, messageText, businessType)
    const customerId = await linkCustomerIdentity(convId, confirmed, persist.lead_id ?? existingLead?.id ?? null)

    const response: Record<string, unknown> = {
      reply:                    finalReply,
      conversation_id:          convId,
      customer_id:              customerId,
      intent,
      lead_ready:               isQualified,
      lead_id:                  persist.lead_id,
      lead_insert_error:        persist.insert_error,
      appointment_id:           persist.appointment_id,
      appointment_insert_error: persist.appointment_insert_error,
      message_insert_error:     userMsgErr?.message ?? null,
    }
    if (debugMode) {
      response.debug = {
        confirmedSlots: confirmed,
        missingSlots:   missing.map(d => d.key),
        isQualified,
        ai_summary:     finalReply,
        blocked,
        businessType,
        operationalTools: operationalToolResults.map(result => ({
          tool: result.tool,
          ok: result.ok,
          summary: result.summary,
          error: result.error ?? null,
        })),
      }
    }
    return NextResponse.json(response)
  }

  /* 10. Build prompt + call OpenAI ───────────────────────────────────────── */
  const provider = isGeminiModel(agent.model) ? 'gemini' : 'openai'
  const openaiKey = process.env.OPENAI_API_KEY
  const geminiKey = process.env.GEMINI_API_KEY
  if (provider === 'openai' && !openaiKey) {
    return NextResponse.json({
      error: 'OPENAI_API_KEY is missing. Add it in Vercel Environment Variables and redeploy.',
    }, { status: 500 })
  }
  if (provider === 'gemini' && !geminiKey) {
    return NextResponse.json({
      error: 'GEMINI_API_KEY is missing. Add it in Vercel Environment Variables and redeploy.',
    }, { status: 500 })
  }

  const openai       = new OpenAI({ apiKey: openaiKey || 'unused-for-gemini' })
  const systemPrompt = buildSystemPrompt(agent, knowledge, confirmed, missing, qualificationStage, leadMemoryStr, businessType, operationalToolResults)

  console.log('[PROMPT] qualificationStage:', qualificationStage, '| nextField:', missing[0]?.label ?? 'none')
  if (process.env.DEBUG_PROMPT === 'true') {
    console.log('[PROMPT] clientPersonaLoaded:',   agent.persona   ? agent.persona.slice(0, 120)   : 'none')
    console.log('[PROMPT] clientObjectiveLoaded:', agent.objective ? agent.objective.slice(0, 120) : 'none')
    console.log('[PROMPT] toneLoaded:',            agent.tone      || 'none')
    console.log('[PROMPT] finalSystemPrompt:\n',   systemPrompt)
  }

  const historyForLLM = history.map(r => ({
    role:    r.role === 'assistant' ? 'assistant' as const : 'user' as const,
    content: r.content,
  }))

  let rawReply: string
  try {
    rawReply = await callAIProvider(openai, agent.model, agent.temperature, systemPrompt, historyForLLM, messageText)
  } catch (err) {
    const classified = logAiProviderError(err, { businessId, model: agent.model, provider })
    return NextResponse.json({ error: classified.adminMessage }, { status: classified.responseStatus })
  }

  /* 11. Guard reply — block stale/holding answers and repeated questions ─── */
  const operationalReply = rentalToolReplyOverride(operationalToolResults, confirmed, missing, businessType, messageText)
  const { reply: finalReply, blocked } = guardReply(operationalReply ?? rawReply, confirmed, missing)
  console.log('[GUARD] blockedRepeatedQuestion:', blocked)

  if (!testAiMode && aiCannotAnswer(finalReply, liveChatSettings, agent.fallback_msg) && liveChatSettings.live_chat_enabled) {
    const { error: assistantMsgErr } = await sb.from('messages').insert({
      conversation_id: convId, business_id: businessId, role: 'assistant', content: HANDOVER_REPLY,
    })
    if (assistantMsgErr) console.error('[POST /api/chat] cannot-answer handover message insert failed:', JSON.stringify(assistantMsgErr))
    await markConversationStatus(sb, convId, businessId, 'handover_requested')
    await insertStatusEvent(sb, convId, businessId, 'AI could not answer and requested human handover.', 'ai_cannot_answer')
    return NextResponse.json({
      reply: HANDOVER_REPLY,
      conversation_id: convId,
      status: 'handover_requested',
      handover: true,
      message_insert_error: userMsgErr?.message ?? null,
    })
  }

  /* 12. Persist assistant reply ──────────────────────────────────────────── */
  const { error: aiMsgErr } = await sb.from('messages').insert({
    conversation_id: convId, business_id: businessId, role: 'assistant', content: finalReply,
  })
  if (aiMsgErr) console.error('[POST /api/chat] ai message insert failed:', JSON.stringify(aiMsgErr))

  /* 13. Update / create lead ─────────────────────────────────────────────── */
  console.log('PERSIST IDS', {
    resolvedClientId:   clientId,
    resolvedBusinessId: businessId,
    bodyBusinessId:     business_id,
    fallbackUsed,
  })
  const isQualified = !!(confirmed.name && confirmed.phone && confirmed.email)
  const intent      = detectDealType(messageText) ? 'inquiry' : 'greeting'
  const persist = await persistLead(sb, existingLead, convId, clientId, businessId, confirmed, missing, isQualified ? 'contacted' : 'new', qualificationStage, finalReply, messageText, businessType)
  const customerId = await linkCustomerIdentity(convId, confirmed, persist.lead_id ?? existingLead?.id ?? null)

  /* 14. Update lead memory (fire-and-forget) ──────────────────────────────── */
  const resolvedLeadId = persist.lead_id ?? existingLead?.id
  if (resolvedLeadId) {
    void upsertLeadMemory(sb, {
      businessId,
      leadId:         resolvedLeadId,
      conversationId: convId,
      confirmed,
      stage:          qualificationStage,
      messages:       history,
      userMessage:    messageText,
    })
  }

  /* 15. Fire webhook if fully qualified ──────────────────────────────────── */
  const webhookUrl = process.env.MAKE_WEBHOOK_URL
  if (webhookUrl && isQualified && resolvedLeadId) {
    fetch(webhookUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'lead_qualified', lead_id: resolvedLeadId, business_id: businessId, conversation_id: convId, slots: confirmed }),
    }).catch(e => console.warn('[POST /api/chat] webhook error:', e))
  }

  /* 15. Schedule AI follow-ups (fire-and-forget) ───────────────────────── */
  if (resolvedLeadId) {
    void scheduleFollowUps(sb, {
      businessId,
      clientId:        clientId,
      leadId:          resolvedLeadId,
      leadName:        confirmed.name ?? undefined,
      conversationId:  convId,
      appointmentId:   persist.appointment_id,
      appointmentTime: persist.appointment_scheduled_at ?? null,
      isHotLead:       !!(confirmed.name && (confirmed.phone || confirmed.email)),
    })
  }

  /* 16. Return ─────────────────────────────────────────────────────────────── */
  const response: Record<string, unknown> = {
    reply:                    finalReply,
    conversation_id:          convId,
    customer_id:              customerId,
    intent,
    lead_ready:               isQualified,
    lead_id:                  persist.lead_id,
    lead_insert_error:        persist.insert_error,
    appointment_id:           persist.appointment_id,
    appointment_insert_error: persist.appointment_insert_error,
    message_insert_error:     userMsgErr?.message ?? null,
  }
  if (debugMode) {
    const meta = (existingLead?.metadata ?? {}) as Record<string, unknown>
    response.debug = {
      confirmedSlots: confirmed,
      missingSlots:   missing.map(d => d.key),
      isQualified,
      ai_summary:     typeof meta.ai_summary === 'string' ? meta.ai_summary : null,
      blocked,
      businessType,
      operationalTools: operationalToolResults,
      finalSystemPrompt: systemPrompt,
    }
  }
  return NextResponse.json(response)
}

/* ════════════════════════════════════════════════════════════════════════════
   VIEWING TIME → DATE PARSER
═══════════════════════════════════════════════════════════════════════════ */

function parseViewingTime(text: string | null): Date {
  // Fallback: tomorrow at noon UTC (safe across all server timezones).
  // Using UTC construction avoids the common "midnight crossover" bug where
  // setHours(12) on a local-time Date maps to a different UTC day.
  function tomorrowNoonUTC(): Date {
    const now = new Date()
    return new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1,
      12, 0, 0, 0,
    ))
  }

  if (!text) {
    console.log('[parseViewingTime] no text — defaulting to tomorrow noon UTC')
    return tomorrowNoonUTC()
  }

  const t = text.toLowerCase()

  // Extract clock time from the original text and apply it to a UTC base date.
  function applyClock(utcBase: Date): void {
    const c = (text ?? '').match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i)
    if (c) {
      let h = parseInt(c[1])
      const m = parseInt(c[2] ?? '0')
      if (/pm/i.test(c[3] ?? '') && h < 12) h += 12
      if (h >= 0 && h <= 23) {
        utcBase.setUTCHours(h, m, 0, 0)
        return
      }
    }
    utcBase.setUTCHours(12, 0, 0, 0)
  }

  const now = new Date()
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0))

  if (/\btoday\b/.test(t)) { applyClock(todayUTC); return todayUTC }

  if (/\btomorrow\b/.test(t)) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 12, 0, 0, 0))
    applyClock(d); return d
  }

  const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
  for (let i = 0; i < DAYS.length; i++) {
    if (t.includes(DAYS[i])) {
      const diff = ((i - now.getUTCDay()) + 7) % 7 || 7
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff, 12, 0, 0, 0))
      applyClock(d); return d
    }
  }

  if (/\bmorning\b/.test(t))   {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 10, 0, 0, 0))
  }
  if (/\bafternoon\b/.test(t)) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 14, 0, 0, 0))
  }
  if (/\bevening\b/.test(t))   {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 18, 0, 0, 0))
  }

  // No recognisable pattern — default to tomorrow noon UTC
  console.log('[parseViewingTime] unrecognised text, defaulting to tomorrow noon UTC:', text)
  return tomorrowNoonUTC()
}

/* ════════════════════════════════════════════════════════════════════════════
   LEAD PERSISTENCE HELPER
═══════════════════════════════════════════════════════════════════════════ */

function detectDealType(text: string): boolean {
  return extractDealType(text) !== null
}

async function persistLead(
  sb:                  ReturnType<typeof createAdminClient>,
  existing:            ExistingLead | null,
  convId:              string,
  clientId:            string,
  businessId:          string,
  confirmed:           Slots,
  missing:             SlotDef[],
  status:              string,
  qualificationStage:  string,
  lastReply:    string,
  message:      string,
  businessType: string | null,
): Promise<{
  lead_id:                  string | null
  insert_error:             string | null
  appointment_id:           string | null
  appointment_insert_error: string | null
  appointment_scheduled_at: string | null
}> {
  console.log('PERSIST IDS', { resolvedClientId: clientId, resolvedBusinessId: businessId })
  const normalizedBusinessType = normalizeBusinessType(businessType)

  // Build AI summary from confirmed slots
  const namePart = confirmed.name ? confirmed.name : null
  let summary = ''
  if (namePart && normalizedBusinessType === 'car_rental') {
    const carPart = confirmed.selected_vehicle ?? (confirmed.car_class ? `${confirmed.car_class} car` : 'car rental')
    const pickupPart = confirmed.pickup_location ? ` from ${confirmed.pickup_location}` : ''
    const dropoffPart = confirmed.dropoff_location ? ` to ${confirmed.dropoff_location}` : ''
    const datesPart = confirmed.pickup_datetime || confirmed.return_datetime
      ? `, ${confirmed.pickup_datetime ?? 'pickup TBD'} to ${confirmed.return_datetime ?? 'return TBD'}`
      : ''
    summary = `${namePart} asked about ${carPart}${pickupPart}${dropoffPart}${datesPart}.`
  } else if (namePart && normalizedBusinessType === 'real_estate') {
    const actionPart = confirmed.deal_type    ? `looking to ${confirmed.deal_type}` : 'enquiring about'
    const roomsPart  = confirmed.rooms        ? `${confirmed.rooms} `               : ''
    const propPart   = confirmed.property_type ?? 'property'
    const cityPart   = confirmed.city         ? ` in ${confirmed.city}`             : ''
    const areaPart   = confirmed.area         ? `, ${confirmed.area}`               : ''
    const budgetPart = confirmed.budget       ? `, budget ${confirmed.budget}`       : ''
    const viewPart   = confirmed.viewing_time ? ` — prefers viewing ${confirmed.viewing_time}` : ''
    summary = `${namePart} is ${actionPart} a ${roomsPart}${propPart}${cityPart}${areaPart}${budgetPart}.${viewPart}`
  } else if (namePart) {
    summary = `${namePart} contacted the business through website chat.`
  }

  const nextAction  = missing[0]?.question ?? 'Follow up and confirm booking.'
  const missingKeys = missing.map(d => d.label).join(', ')

  // Lead payload uses both direct columns and metadata for full compatibility
  const leadPayload = {
    name:          confirmed.name  ?? (existing?.name === 'Website Visitor' ? null : existing?.name) ?? null,
    phone:         confirmed.phone ?? existing?.phone ?? null,
    email:         confirmed.email ?? existing?.email ?? null,
    interest:      confirmed.service_interest ?? confirmed.selected_vehicle ?? confirmed.car_class ?? confirmed.property_type ?? confirmed.deal_type ?? existing?.interest ?? null,
    // Direct columns on leads table
    ai_summary:    summary || null,
    intent:        confirmed.deal_type ?? null,
    budget:        confirmed.budget ?? null,
    location:      confirmed.city ?? null,
    property_type: confirmed.property_type ?? null,
    preferred_time: confirmed.viewing_time ?? null,
    missing_info:         missingKeys || null,
    next_action:          nextAction || null,
    qualification_stage:  qualificationStage,
    // Keep metadata for backwards compat (legacy reads)
    metadata:      {
      ...(existing?.metadata as Record<string, unknown> ?? {}),
      ...(confirmed.name          && { name:          confirmed.name          }),
      ...(confirmed.company       && { company:       confirmed.company       }),
      ...(confirmed.service_interest && { service_interest: confirmed.service_interest }),
      ...(confirmed.notes         && { notes:         confirmed.notes         }),
      ...(confirmed.city          && { city:          confirmed.city          }),
      ...(confirmed.area          && { area:          confirmed.area          }),
      ...(confirmed.budget        && { budget:        confirmed.budget        }),
      ...(confirmed.property_type && { property_type: confirmed.property_type }),
      ...(confirmed.rooms         && { rooms:         confirmed.rooms         }),
      ...(confirmed.deal_type     && { deal_type:     confirmed.deal_type     }),
      ...(confirmed.viewing_time  && { viewing_time:  confirmed.viewing_time  }),
      ...(confirmed.pickup_location && { pickup_location: confirmed.pickup_location }),
      ...(confirmed.dropoff_location && { dropoff_location: confirmed.dropoff_location }),
      ...(confirmed.pickup_datetime && { pickup_datetime: confirmed.pickup_datetime }),
      ...(confirmed.return_datetime && { return_datetime: confirmed.return_datetime }),
      ...(confirmed.selected_vehicle && { selected_vehicle: confirmed.selected_vehicle }),
      ...(confirmed.car_class && { car_class: confirmed.car_class }),
      ...(confirmed.transmission && { transmission: confirmed.transmission }),
      ...(confirmed.seats && { seats: confirmed.seats }),
      ...(confirmed.extras && { extras: confirmed.extras }),
      ...(confirmed.booking_number && { booking_number: confirmed.booking_number }),
      ...(confirmed.extension_request && { extension_request: confirmed.extension_request }),
      business_type: normalizedBusinessType,
    },
    ...(status === 'contacted' && { status }),
  }

  // ── Resolve lead_id ────────────────────────────────────────────────────────
  let resolvedLeadId: string | null = null
  let insertError:    string | null = null

  if (existing) {
    // UPDATE existing lead (conversation_id already set on it)
    const upd = await sb.from('leads').update({ ...leadPayload, conversation_id: convId }).eq('id', existing.id)
    if (upd.error) console.error('[persistLead] lead UPDATE error:', JSON.stringify(upd.error))
    resolvedLeadId = existing.id
    console.log('[LEAD] updated lead_id:', resolvedLeadId)

  } else if (hasMeaningfulSlot(confirmed)) {
    // INSERT new lead with conversation_id so the link is set immediately
    const ins = await sb.from('leads').insert({
      ...leadPayload,
      name:            confirmed.name ?? null,
      business_id:     businessId,
      source:          'website_chat',
      status:          'new',
      conversation_id: convId,
    }).select('id').single()

    if (ins.error) console.error('[persistLead] lead INSERT error:', JSON.stringify(ins.error))

    if (ins.error) {
      insertError = ins.error.message
    } else if (ins.data?.id) {
      resolvedLeadId = ins.data.id
      console.log('[LEAD] created lead_id:', resolvedLeadId)
      // Update conversation with lead contact info (conversations has no lead_id FK,
      // but does have lead_name/phone/email for display)
      const convUpd = await sb.from('conversations').update({
        lead_name:  confirmed.name  ?? null,
        lead_phone: confirmed.phone ?? null,
        lead_email: confirmed.email ?? null,
      }).eq('id', convId)
      console.log('[persistLead] conv UPDATE:', convUpd.error ? JSON.stringify(convUpd.error) : 'ok')
      // Log to activity_events
      void logEvent({
        type:        'sms',
        title:       `New lead — ${confirmed.name ?? 'Website Visitor'}`,
        description: confirmed.pickup_location
          ? `Pickup from ${confirmed.pickup_location}`
          : confirmed.city ? `Looking in ${confirmed.city}` : 'Website chat',
        leadId:      resolvedLeadId,
        meta:        { actor: 'AI Agent', undoable: false, entity_type: 'lead' as const, entity_id: resolvedLeadId ?? undefined, entity_name: confirmed.name ?? 'Website Visitor' },
      }, businessId)
    } else {
      insertError = 'insert returned no row'
    }
  } else {
    console.log('[LEAD] skipped — no meaningful slot captured yet')
  }

  // ── Create appointment if booking intent or viewing_time captured ──────────
  let appointmentId:            string | null = null
  let appointmentInsertError:   string | null = null
  let appointmentScheduledAt:   string | null = null

  const shouldBook = normalizedBusinessType !== 'car_rental' && !!(confirmed.viewing_time || (detectBookingIntent(message) && hasEnoughForBooking(confirmed, normalizedBusinessType)))

  if (!shouldBook) {
    console.log('[APPOINTMENT] skipped reason: no viewing_time and no booking intent')
  } else if (!resolvedLeadId) {
    console.log('[APPOINTMENT] skipped reason: no lead resolved')
  } else {
    // Parse the desired time first so we can compare against existing appointments.
    const scheduledAt = parseViewingTime(confirmed.viewing_time)
    appointmentScheduledAt = scheduledAt.toISOString()

    // Duplicate guard: same lead + same minute → skip.
    // Different time (rescheduled) → create a new appointment.
    const scheduledMinute = scheduledAt.toISOString().slice(0, 16) // "YYYY-MM-DDTHH:MM"
    const { data: dupRows } = await sb
      .from('appointments')
      .select('id, scheduled_at')
      .eq('lead_id', resolvedLeadId)
      .eq('business_id', businessId)
      .gte('scheduled_at', `${scheduledMinute}:00.000Z`)
      .lt('scheduled_at',  `${scheduledMinute}:59.999Z`)
      .limit(1)

    const existingAppt = dupRows?.[0] ?? null

    if (existingAppt) {
      appointmentId = existingAppt.id as string
      console.log('[APPOINTMENT] skipped reason: duplicate exists id:', existingAppt.id, 'scheduled_at:', existingAppt.scheduled_at)
    } else {
      // No duplicate at this time — create the appointment.
      const leadFullName = confirmed.name ?? 'Website Visitor'
      const apptPayload: Record<string, unknown> = {
        client_id:    clientId,
        business_id:  businessId,
        lead_id:      resolvedLeadId,
        lead_name:    leadFullName,
        lead_company: '',
        type:         'viewing',
        scheduled_at: scheduledAt.toISOString(),
        status:       'pending',
      }
      const apptInsert = await sb.from('appointments').insert(apptPayload).select('*').single()

      if (apptInsert.error) {
        console.error('[APPOINTMENT] insert failed:', JSON.stringify({
          message: apptInsert.error.message,
          code:    apptInsert.error.code,
          details: apptInsert.error.details,
          hint:    apptInsert.error.hint,
          payload: apptPayload,
        }))
        appointmentInsertError = apptInsert.error.message
      } else if (apptInsert.data?.id) {
        appointmentId = apptInsert.data.id as string
        console.log('[APPOINTMENT] created appointment_id:', appointmentId)
        void logEvent({
          type:        'appointment',
          title:       `Viewing requested — ${leadFullName}`,
          description: confirmed.viewing_time ?? 'Time TBD',
          leadId:      resolvedLeadId,
          meta:        { actor: 'AI Agent', undoable: false, entity_type: 'appointment', entity_id: appointmentId, entity_name: leadFullName },
        }, businessId)
      }
    }
  }

  return {
    lead_id:                  resolvedLeadId,
    insert_error:             insertError,
    appointment_id:           appointmentId,
    appointment_scheduled_at: appointmentScheduledAt,
    appointment_insert_error: appointmentInsertError,
  }
}
