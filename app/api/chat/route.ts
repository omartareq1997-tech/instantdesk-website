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
import { logBotResolution, resolveBotContext } from '../../lib/bot-context'
import { parseRentalDateWindow } from '../../lib/rentalDateTime'
import { extractRentalVehicleName } from '../../lib/rentalVehicle'
import { getBusinessTypeConfig, normalizeBusinessType } from '../../lib/businessTypes'
import { agentTraceRow, persistAgentTraceRows, type AgentTraceInsert } from '../../lib/agent-traces'
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
  pickup_location_id: string | null
  dropoff_location_id: string | null
  pickup_date: string | null
  return_date: string | null
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

const ADMIN_WEBSITE_BUSINESS_ID = '59bd9987-46b9-48a3-ad14-cfe1ab733453'
const PUBLIC_SITE_BUSINESS_ID =
  process.env.PUBLIC_SITE_BUSINESS_ID ||
  process.env.NEXT_PUBLIC_SITE_BUSINESS_ID ||
  ADMIN_WEBSITE_BUSINESS_ID

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

type PersistedChatMessage = {
  id: string
  role: string
  content: string
  created_at?: string | null
  read_at?: string | null
  delivery_status?: string | null
  metadata?: Record<string, unknown> | null
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
  if (isInstantDeskPublicHost(host) && requestedBusinessId !== ADMIN_WEBSITE_BUSINESS_ID) {
    return ADMIN_WEBSITE_BUSINESS_ID
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

function looksMidSentence(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (/[.!?。！？)"'\]]$/.test(trimmed)) return false
  if (trimmed.length < 24) return true
  const tail = trimmed.split(/\s+/).slice(-5).join(' ').toLowerCase()
  return /\b(?:at|to|from|until|and|or|the|a|an|your|my|our|would you like me|you mentioned pickup)\b$/.test(tail)
}

function safeAiFallback(agent?: Pick<AgentRow, 'fallback_msg'> | null) {
  return agent?.fallback_msg?.trim() || 'I can continue from the details already saved. Let me verify the next booking detail.'
}

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
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

class GeminiIncompleteResponseError extends GeminiApiError {
  constructor(message: string, code: string, payload: unknown) {
    super(message, 502, code, 'incomplete_response', payload)
    this.name = 'GeminiIncompleteResponseError'
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

function plainNameAnswer(text: string): string | null {
  const normalized = text
    .replace(/\[([^\]]+)\]\(mailto:[^)]+\)/gi, '$1')
    .replace(/\b(?:sure|ok|okay|yes|yeah|yep|hi|hello|hey|thanks|thank you)[,.\s]+/gi, ' ')
    .trim()
  if (!/^[A-Za-zÀ-ž]+(?:\s+[A-Za-zÀ-ž]+){0,2}$/.test(normalized)) return null
  return cleanNameCandidate(normalized)
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
    .replace(/\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g, ' ')
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

function extractFromText(text: string, existingSlots: Partial<Slots> = {}): Partial<Slots> {
  const carRentalIntent = /\b(car|vehicle|fleet|pickup|pick-up|drop[-\s]?off|return|corolla|camry|x5|bmw|mercedes|skoda|suv|automatic|manual)\b/i.test(text)
  const asksLocationQuestion =
    /\b(?:what|which|where).{0,60}(?:pick\s*up|pickup|pick-up|drop\s*off|dropoff|return)?.{0,35}locations?\b/i.test(text) ||
    /\bwhat\s+pick\s*up\s+location\b/i.test(text) ||
    /\bwhere\s+can\s+i\s+pick/i.test(text)
  const returnOnlyCorrection =
    /\b(?:return|drop(?:off|-off)?)\b/i.test(text) &&
    /\b(?:wrong|preferred|correct|change|update)\b/i.test(text) &&
    !/\b(?:pick\s*up|pickup|pick-up|from)\s+(?:on\s+)?(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}[./-]|\d{4}-\d{2}-\d{2})\b/i.test(text)
  const carClass = text.match(/\b(economy|compact|suv|van|minivan|premium|luxury|standard)\b/i)?.[1]
  const transmission = text.match(/\b(automatic|manual)\b/i)?.[1]
  const seats = text.match(/\b(\d+)\s*(?:seats?|people|passengers)\b/i)?.[1]
  const bookingNumber = text.match(/\b(?:CR|ID|BK)-?\d{4,8}\b/i)?.[0]
  const airportMention = /\bairport|terminal\b/i.test(text)
  const pickupLocation = asksLocationQuestion ? undefined : text.match(/\bpick(?:\s*up|-up)?\s+location\s+([^.\n,]+?)(?:[.\n,]|$)/i)?.[1]
    ?? text.match(/\bpick(?:\s*up|-up)?\s+(?:at|from)\s+([^,.]+?)(?:\s+(?:tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|at)|[,.]|$)/i)?.[1]
  const dropoffLocation = asksLocationQuestion ? undefined : text.match(/\b(?:drop(?:\s*off|-off)?)\s+location\s+([^.\n,]+?)(?:[.\n,]|$)/i)?.[1]
    ?? text.match(/\b(?:drop(?:\s*off|-off)?|return)\s+(?:at|to)\s+([^,.]+?)(?:\s+(?:tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|at)|[,.]|$)/i)?.[1]
  const rentalWindow = parseRentalDateWindow(text, existingSlots)

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
    pickup_date: rentalWindow.pickupDate ?? undefined,
    return_date: rentalWindow.returnDate ?? undefined,
    pickup_datetime: returnOnlyCorrection ? undefined : rentalWindow.pickupAt ?? undefined,
    return_datetime: rentalWindow.dropoffAt ?? (!carRentalIntent && /\b(?:return|drop(?:off|-off)?)\b/i.test(text) ? extractViewingTime(text) ?? undefined : undefined),
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
    const next = extractFromText(text, acc)
    for (const [key, value] of Object.entries(next) as [keyof Slots, string | undefined][]) {
      if (value) acc[key] = value
    }
    return acc
  }, {})
}

function slotsFromConversationAgentState(metadata: Record<string, unknown> | null | undefined): Partial<Slots> {
  const agentState = safeRecord(metadata?.agent_state)
  const state = safeRecord(agentState.state)
  const slots = safeRecord(agentState.slots)
  const source = Object.keys(slots).length ? slots : state
  const out: Partial<Slots> = {}
  const slotKeys: (keyof Slots)[] = [
    'name','phone','email','company','notes','service_interest','city','area','budget',
    'property_type','rooms','deal_type','viewing_time','pickup_location','dropoff_location',
    'pickup_location_id','dropoff_location_id',
    'pickup_date','return_date','pickup_datetime','return_datetime','selected_vehicle',
    'car_class','transmission','seats','extras','booking_number','extension_request',
  ]
  for (const key of slotKeys) {
    const value = strOrNull(source[key])
    if (value) out[key] = value
  }
  return out
}

type RentalUserIntent =
  | 'ASK_LOCATIONS'
  | 'ACCEPT_LOCATION'
  | 'CONFIRM_BOOKING'
  | 'ASK_PRICE'
  | 'SELECT_VEHICLE'
  | 'ASK_FLEET'
  | 'PROVIDE_CONTACT'
  | 'CORRECTION'
  | 'OTHER'

type RentalSemanticIntent =
  | 'START_RENTAL'
  | 'UPDATE_RENTAL_DETAILS'
  | 'CORRECT_RENTAL_DETAILS'
  | 'ASK_AVAILABLE_VEHICLES'
  | 'ASK_AVAILABLE_VEHICLES_BY_CLASS'
  | 'SELECT_VEHICLE'
  | 'ASK_LOCATION'
  | 'ASK_PRICE'
  | 'ASK_DEPOSIT'
  | 'ASK_POLICY'
  | 'CONFIRM_BOOKING'
  | 'CANCEL_BOOKING'
  | 'EXTEND_BOOKING'
  | 'UPDATE_BOOKING'
  | 'PROVIDE_CUSTOMER_DETAILS'
  | 'GENERAL_QUESTION'
  | 'UNKNOWN'

type RentalSemanticField =
  | 'pickup_location'
  | 'dropoff_location'
  | 'pickup_datetime'
  | 'return_datetime'
  | 'pickup_date'
  | 'return_date'
  | 'pickup_time'
  | 'return_time'
  | 'selected_vehicle'
  | 'car_class'
  | 'transmission'
  | 'name'
  | 'phone'
  | 'email'

type RentalSemanticRelation =
  | { type: 'SAME_AS'; source: RentalSemanticField; target: RentalSemanticField }
  | { type: 'SAME_LOCATION'; fields: RentalSemanticField[] }

type RentalSemanticReference = {
  expression?: string
  resolved_to?: 'last_offered_location' | 'pickup_location' | 'dropoff_location' | 'last_offered_vehicle' | 'last_recommended_vehicle' | 'first_offered_vehicle' | 'cheapest_offered_vehicle' | 'lowest_price_candidate' | 'ambiguous' | string
  field?: RentalSemanticField
}

type RentalSemanticCorrection = {
  field: RentalSemanticField
  operation?: 'REPLACE' | 'CLEAR' | 'SET'
}

type RentalSemanticInterpretation = {
  intent: RentalSemanticIntent
  state_patch: Partial<Slots> & {
    selected_vehicle_name?: string | null
    pickup_time?: string | null
    return_time?: string | null
  }
  relations: RentalSemanticRelation[]
  references: RentalSemanticReference[]
  corrections: RentalSemanticCorrection[]
  question: string | null
  confirmation: 'yes' | 'no' | null
  confidence: number
  source: 'llm' | 'fallback' | 'none'
}

type RentalSemanticTraceMeta = {
  semantic_source: 'llm' | 'legacy_fallback' | 'deterministic'
  fallback_used: boolean
  fallback_reason: RentalSemanticFallbackReason | null
  fallback_reason_detail?: string | null
  interpreter_latency_ms: number | null
  semantic_parse_success: boolean
  semantic_retry_used?: boolean
  validation_issues?: RentalSemanticValidationIssue[]
  finish_reason?: string | null
}

type RentalResponseTraceMeta = {
  generator_source: 'llm' | 'deterministic_fallback'
  response_latency_ms: number | null
  fallback_used: boolean
  fallback_reason?: string | null
  provider_retry_used: boolean
  finish_reason: string | null
  output_length: number
}

type RentalSemanticFallbackReason =
  | 'PROVIDER_REQUEST_FAILED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_EMPTY_RESPONSE'
  | 'UNSUPPORTED_STRUCTURED_OUTPUT'
  | 'JSON_PARSE_FAILED'
  | 'SCHEMA_VALIDATION_FAILED'
  | 'INVALID_INTENT'
  | 'INVALID_RELATION'
  | 'INVALID_REFERENCE'
  | 'MODEL_CONFIGURATION_ERROR'
  | 'PROVIDER_ADAPTER_ERROR'
  | 'SEMANTIC_RETRY_EXHAUSTED'
  | 'UNKNOWN_SEMANTIC_FAILURE'

type RentalSemanticValidationIssue = {
  path: string
  code: string
}

type SemanticProvider = 'openai' | 'gemini' | 'claude'

const EMPTY_RENTAL_SEMANTICS: RentalSemanticInterpretation = {
  intent: 'UNKNOWN',
  state_patch: {},
  relations: [],
  references: [],
  corrections: [],
  question: null,
  confirmation: null,
  confidence: 0,
  source: 'none',
}

function agentTraceLogsEnabled() {
  return process.env.AGENT_TRACE_LOGS === 'true'
}

function emitAgentTrace(event: string, payload: Record<string, unknown>) {
  if (!agentTraceLogsEnabled()) return
  console.info(JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    ...payload,
  }))
}

function relationTrace(relations: RentalSemanticRelation[]) {
  return relations.map(relation => relation.type === 'SAME_AS'
    ? { type: relation.type, source: relation.source, target: relation.target }
    : { type: relation.type, fields: relation.fields })
}

function referenceTrace(references: RentalSemanticReference[]) {
  return references.map(reference => ({
    resolved_to: reference.resolved_to ?? null,
    field: reference.field ?? null,
  }))
}

function slotChangedFields(before: Slots, after: Slots) {
  return (Object.keys(after) as (keyof Slots)[]).filter(key => before[key] !== after[key]).map(String)
}

function countPreservedFields(before: Slots, after: Slots) {
  return (Object.keys(after) as (keyof Slots)[]).filter(key => before[key] && before[key] === after[key]).length
}

function isoLeakValidatorPassed(reply: string) {
  return !/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:[+-]\d{2}:\d{2}|Z)?\b/.test(reply)
}

function redactedSlotPresence(slots: Slots) {
  return Object.fromEntries(
    (Object.keys(slots) as (keyof Slots)[]).map(key => [key, slots[key] != null && slots[key] !== ''])
  )
}

function asRentalSemanticIntent(value: unknown): RentalSemanticIntent {
  const allowed: RentalSemanticIntent[] = [
    'START_RENTAL',
    'UPDATE_RENTAL_DETAILS',
    'CORRECT_RENTAL_DETAILS',
    'ASK_AVAILABLE_VEHICLES',
    'ASK_AVAILABLE_VEHICLES_BY_CLASS',
    'SELECT_VEHICLE',
    'ASK_LOCATION',
    'ASK_PRICE',
    'ASK_DEPOSIT',
    'ASK_POLICY',
    'CONFIRM_BOOKING',
    'CANCEL_BOOKING',
    'EXTEND_BOOKING',
    'UPDATE_BOOKING',
    'PROVIDE_CUSTOMER_DETAILS',
    'GENERAL_QUESTION',
    'UNKNOWN',
  ]
  return typeof value === 'string' && allowed.includes(value as RentalSemanticIntent) ? value as RentalSemanticIntent : 'UNKNOWN'
}

const RENTAL_SEMANTIC_INTENTS: RentalSemanticIntent[] = [
  'START_RENTAL',
  'UPDATE_RENTAL_DETAILS',
  'CORRECT_RENTAL_DETAILS',
  'ASK_AVAILABLE_VEHICLES',
  'ASK_AVAILABLE_VEHICLES_BY_CLASS',
  'SELECT_VEHICLE',
  'ASK_LOCATION',
  'ASK_PRICE',
  'ASK_DEPOSIT',
  'ASK_POLICY',
  'CONFIRM_BOOKING',
  'CANCEL_BOOKING',
  'EXTEND_BOOKING',
  'UPDATE_BOOKING',
  'PROVIDE_CUSTOMER_DETAILS',
  'GENERAL_QUESTION',
  'UNKNOWN',
]

function asRentalSemanticField(value: unknown): RentalSemanticField | null {
  const allowed: RentalSemanticField[] = [
    'pickup_location',
    'dropoff_location',
    'pickup_datetime',
    'return_datetime',
    'pickup_date',
    'return_date',
    'pickup_time',
    'return_time',
    'selected_vehicle',
    'car_class',
    'transmission',
    'name',
    'phone',
    'email',
  ]
  return typeof value === 'string' && allowed.includes(value as RentalSemanticField) ? value as RentalSemanticField : null
}

function validateSemanticInterpretationPayload(value: unknown): RentalSemanticValidationIssue[] {
  const issues: RentalSemanticValidationIssue[] = []
  const record = safeRecord(value)
  if (!record || Object.keys(record).length === 0) return [{ path: '$', code: 'not_object' }]
  if (typeof record.intent !== 'string') issues.push({ path: 'intent', code: 'missing_or_not_string' })
  else if (!RENTAL_SEMANTIC_INTENTS.includes(record.intent as RentalSemanticIntent)) issues.push({ path: 'intent', code: 'invalid_enum' })

  if (record.relations != null && !Array.isArray(record.relations)) {
    issues.push({ path: 'relations', code: 'not_array' })
  } else if (Array.isArray(record.relations)) {
    record.relations.forEach((item, index) => {
      const relation = safeRecord(item)
      if (relation.type === 'SAME_AS') {
        if (!asRentalSemanticField(relation.source)) issues.push({ path: `relations[${index}].source`, code: 'invalid_field' })
        if (!asRentalSemanticField(relation.target)) issues.push({ path: `relations[${index}].target`, code: 'invalid_field' })
      } else if (relation.type === 'SAME_LOCATION') {
        if (!Array.isArray(relation.fields) || relation.fields.filter(asRentalSemanticField).length < 2) issues.push({ path: `relations[${index}].fields`, code: 'invalid_fields' })
      } else {
        issues.push({ path: `relations[${index}].type`, code: 'invalid_enum' })
      }
    })
  }

  if (record.references != null && !Array.isArray(record.references)) {
    issues.push({ path: 'references', code: 'not_array' })
  } else if (Array.isArray(record.references)) {
    record.references.forEach((item, index) => {
      const ref = safeRecord(item)
      if (ref.field != null && !asRentalSemanticField(ref.field)) issues.push({ path: `references[${index}].field`, code: 'invalid_field' })
      if (ref.resolved_to != null && typeof ref.resolved_to !== 'string') issues.push({ path: `references[${index}].resolved_to`, code: 'not_string' })
    })
  }

  if (record.corrections != null && !Array.isArray(record.corrections)) {
    issues.push({ path: 'corrections', code: 'not_array' })
  } else if (Array.isArray(record.corrections)) {
    record.corrections.forEach((item, index) => {
      const correction = safeRecord(item)
      if (!asRentalSemanticField(correction.field)) issues.push({ path: `corrections[${index}].field`, code: 'invalid_field' })
      if (correction.operation != null && correction.operation !== 'CLEAR' && correction.operation !== 'REPLACE' && correction.operation !== 'SET') {
        issues.push({ path: `corrections[${index}].operation`, code: 'invalid_enum' })
      }
    })
  }

  if (record.confirmation != null && record.confirmation !== 'yes' && record.confirmation !== 'no') issues.push({ path: 'confirmation', code: 'invalid_enum' })
  return issues
}

function rentalSemanticIntentToUserIntent(intent: RentalSemanticIntent): RentalUserIntent | 'NON_RENTAL' {
  if (intent === 'ASK_LOCATION') return 'ASK_LOCATIONS'
  if (intent === 'CONFIRM_BOOKING') return 'CONFIRM_BOOKING'
  if (intent === 'ASK_PRICE' || intent === 'ASK_DEPOSIT') return 'ASK_PRICE'
  if (intent === 'SELECT_VEHICLE') return 'SELECT_VEHICLE'
  if (intent === 'ASK_AVAILABLE_VEHICLES' || intent === 'ASK_AVAILABLE_VEHICLES_BY_CLASS') return 'ASK_FLEET'
  if (intent === 'PROVIDE_CUSTOMER_DETAILS') return 'PROVIDE_CONTACT'
  if (intent === 'CORRECT_RENTAL_DETAILS' || intent === 'UPDATE_RENTAL_DETAILS') return 'CORRECTION'
  if (intent === 'UNKNOWN' || intent === 'GENERAL_QUESTION') return 'OTHER'
  return 'OTHER'
}

function normalizeSemanticInterpretation(value: unknown, source: RentalSemanticInterpretation['source']): RentalSemanticInterpretation {
  const record = safeRecord(value)
  const rawPatch = safeRecord(record.state_patch)
  const state_patch: RentalSemanticInterpretation['state_patch'] = {}
  const patchKeys: (keyof RentalSemanticInterpretation['state_patch'])[] = [
    'name',
    'phone',
    'email',
    'pickup_location',
    'dropoff_location',
    'pickup_date',
    'return_date',
    'pickup_datetime',
    'return_datetime',
    'selected_vehicle',
    'selected_vehicle_name',
    'car_class',
    'transmission',
    'pickup_time',
    'return_time',
  ]
  for (const key of patchKeys) {
    const next = strOrNull(rawPatch[key])
    if (next) state_patch[key] = next
  }
  const relations: RentalSemanticRelation[] = Array.isArray(record.relations)
    ? record.relations.flatMap((item): RentalSemanticRelation[] => {
      const relation = safeRecord(item)
      if (relation.type === 'SAME_AS') {
        const sourceField = asRentalSemanticField(relation.source)
        const targetField = asRentalSemanticField(relation.target)
        return sourceField && targetField ? [{ type: 'SAME_AS' as const, source: sourceField, target: targetField }] : []
      }
      if (relation.type === 'SAME_LOCATION') {
        const fields = Array.isArray(relation.fields)
          ? relation.fields.map(asRentalSemanticField).filter(Boolean) as RentalSemanticField[]
          : []
        return fields.length >= 2 ? [{ type: 'SAME_LOCATION' as const, fields }] : []
      }
      return []
    })
    : []
  const references = Array.isArray(record.references)
    ? record.references.map(item => {
      const ref = safeRecord(item)
      return {
        expression: strOrNull(ref.expression) ?? undefined,
        resolved_to: strOrNull(ref.resolved_to) ?? undefined,
        field: asRentalSemanticField(ref.field) ?? undefined,
      }
    })
    : []
  const corrections: RentalSemanticCorrection[] = Array.isArray(record.corrections)
    ? record.corrections.flatMap((item): RentalSemanticCorrection[] => {
      const correction = safeRecord(item)
      const field = asRentalSemanticField(correction.field)
      if (!field) return []
      const operation: RentalSemanticCorrection['operation'] = correction.operation === 'CLEAR' || correction.operation === 'REPLACE' || correction.operation === 'SET'
        ? correction.operation
        : undefined
      return [{ field, operation }]
    })
    : []
  const confidence = typeof record.confidence === 'number'
    ? Math.max(0, Math.min(1, record.confidence))
    : Number.isFinite(Number(record.confidence)) ? Math.max(0, Math.min(1, Number(record.confidence))) : 0
  const confirmation = record.confirmation === 'yes' || record.confirmation === 'no' ? record.confirmation : null
  return {
    intent: asRentalSemanticIntent(record.intent),
    state_patch,
    relations,
    references,
    corrections,
    question: strOrNull(record.question),
    confirmation,
    confidence,
    source,
  }
}

function deterministicSemanticFallback(message: string, confirmed: Slots): RentalSemanticInterpretation {
  const patch = extractFromText(message, confirmed)
  if (patch.pickup_location && !normalizeRentalLocationText(patch.pickup_location, confirmed.pickup_location)) delete patch.pickup_location
  if (patch.dropoff_location && !normalizeRentalLocationText(patch.dropoff_location, confirmed.pickup_location)) delete patch.dropoff_location
  const intent = detectRentalUserIntent(message, confirmed)
  const mapped: RentalSemanticIntent =
    intent === 'ASK_LOCATIONS' ? 'ASK_LOCATION' :
    intent === 'CONFIRM_BOOKING' ? 'CONFIRM_BOOKING' :
    intent === 'ASK_PRICE' ? 'ASK_PRICE' :
    intent === 'SELECT_VEHICLE' ? 'SELECT_VEHICLE' :
    intent === 'ASK_FLEET' ? 'ASK_AVAILABLE_VEHICLES' :
    intent === 'PROVIDE_CONTACT' ? 'PROVIDE_CUSTOMER_DETAILS' :
    intent === 'CORRECTION' ? 'CORRECT_RENTAL_DETAILS' :
    'UNKNOWN'
  return {
    ...EMPTY_RENTAL_SEMANTICS,
    intent: mapped,
    state_patch: patch,
    confirmation: wantsRentalBookingConfirmation(message) ? 'yes' : null,
    confidence: Object.keys(patch).length || mapped !== 'UNKNOWN' ? 0.55 : 0.2,
    source: 'fallback',
  }
}

function semanticRelationInvolvesLocation(semantics: RentalSemanticInterpretation) {
  return semantics.relations.some(relation => {
    if (relation.type === 'SAME_AS') return relation.source.includes('location') || relation.target.includes('location')
    return relation.fields.some(field => field.includes('location'))
  })
}

function latestAssistantOfferedVehicleNames(history: { role: string; content: string }[]) {
  const lastAssistant = [...history].reverse().find(message => message.role === 'assistant')?.content ?? ''
  const candidates = ['Skoda Superb', 'Toyota Corolla', 'Toyota Camry', 'BMW X5', 'Mercedes GLC']
  return candidates.filter(name => new RegExp(`\\b${name.replace(/\s+/g, '\\s+')}\\b`, 'i').test(lastAssistant))
}

function resolveSemanticVehicleReference(semantics: RentalSemanticInterpretation, history: { role: string; content: string }[], toolResults: AgentToolResult[] = []) {
  const fleet = toolResults.find(result => result.tool === 'searchFleet' && result.ok)?.data as { cars?: FleetReplyCar[] } | undefined
  const cars: FleetReplyCar[] = fleet?.cars ?? latestAssistantOfferedVehicleNames(history).map(name => ({ name }))
  if (!cars.length) return null
  const firstReference = semantics.references.find(ref => ref.resolved_to === 'first_offered_vehicle')
  if (firstReference) return cars[0]?.name ?? null
  const lastReference = semantics.references.find(ref => ref.resolved_to === 'last_offered_vehicle' || ref.resolved_to === 'last_recommended_vehicle')
  if (lastReference && cars.length === 1) return cars[0]?.name ?? null
  const cheaperReference = semantics.references.find(ref => ref.resolved_to === 'cheapest_offered_vehicle' || ref.resolved_to === 'lowest_price_candidate')
  if (cheaperReference) {
    const priced = cars.filter(car => typeof car.dailyPrice === 'number')
    if (priced.length) return [...priced].sort((a, b) => Number(a.dailyPrice) - Number(b.dailyPrice))[0]?.name ?? null
  }
  return null
}

function copyRentalLocationField(next: Slots, source: RentalSemanticField, target: RentalSemanticField) {
  if (source === 'pickup_location' && target === 'dropoff_location' && next.pickup_location) {
    next.dropoff_location = next.pickup_location
    next.dropoff_location_id = next.pickup_location_id
  }
  if (source === 'dropoff_location' && target === 'pickup_location' && next.dropoff_location) {
    next.pickup_location = next.dropoff_location
    next.pickup_location_id = next.dropoff_location_id
  }
}

function mergeSemanticTimePatch(next: Slots, field: 'pickup_time' | 'return_time', value: string | null | undefined) {
  if (!value) return
  const normalized = value.match(/\b([01]?\d|2[0-3])(?::?([0-5]\d))?\b/)?.[0]
  if (!normalized) return
  const [hourRaw, minuteRaw = '00'] = normalized.includes(':') ? normalized.split(':') : [normalized, '00']
  const hour = hourRaw.padStart(2, '0')
  const minute = minuteRaw.padStart(2, '0')
  const date = field === 'pickup_time'
    ? next.pickup_date ?? next.pickup_datetime?.slice(0, 10)
    : next.return_date ?? next.return_datetime?.slice(0, 10)
  if (!date) return
  const iso = `${date}T${hour}:${minute}:00+02:00`
  if (field === 'pickup_time') next.pickup_datetime = iso
  else next.return_datetime = iso
}

function reduceRentalState(
  previous: Slots,
  semantics: RentalSemanticInterpretation,
  history: { role: string; content: string }[] = [],
  toolResults: AgentToolResult[] = [],
) {
  const next: Slots = { ...previous }
  const patch = semantics.state_patch
  const patchMap: Partial<Record<keyof Slots, string | null | undefined>> = {
    name: patch.name,
    phone: patch.phone,
    email: patch.email,
    pickup_location: patch.pickup_location,
    dropoff_location: patch.dropoff_location,
    pickup_date: patch.pickup_date,
    return_date: patch.return_date,
    pickup_datetime: patch.pickup_datetime,
    return_datetime: patch.return_datetime,
    selected_vehicle: patch.selected_vehicle ?? patch.selected_vehicle_name,
    car_class: patch.car_class,
    transmission: patch.transmission,
  }
  for (const [key, value] of Object.entries(patchMap) as [keyof Slots, string | null | undefined][]) {
    if (value) next[key] = value
  }
  mergeSemanticTimePatch(next, 'pickup_time', patch.pickup_time)
  mergeSemanticTimePatch(next, 'return_time', patch.return_time)

  for (const correction of semantics.corrections) {
    if (correction.operation === 'CLEAR') {
      if (correction.field === 'selected_vehicle') next.selected_vehicle = null
      if (correction.field === 'pickup_location') {
        next.pickup_location = null
        next.pickup_location_id = null
      }
      if (correction.field === 'dropoff_location') {
        next.dropoff_location = null
        next.dropoff_location_id = null
      }
    }
  }

  for (const relation of semantics.relations) {
    if (relation.type === 'SAME_AS') copyRentalLocationField(next, relation.source, relation.target)
    if (relation.type === 'SAME_LOCATION' && relation.fields.includes('pickup_location') && relation.fields.includes('dropoff_location')) {
      if (next.pickup_location) {
        next.dropoff_location = next.pickup_location
        next.dropoff_location_id = next.pickup_location_id
      } else if (next.dropoff_location) {
        next.pickup_location = next.dropoff_location
        next.pickup_location_id = next.dropoff_location_id
      }
    }
  }

  if (!next.selected_vehicle) {
    const referencedVehicle = resolveSemanticVehicleReference(semantics, history, toolResults)
    if (referencedVehicle) next.selected_vehicle = referencedVehicle
  }
  return next
}

function semanticNeedsLocationTool(semantics: RentalSemanticInterpretation) {
  return semantics.intent === 'ASK_LOCATION' ||
    semanticRelationInvolvesLocation(semantics) ||
    semantics.references.some(ref => ref.resolved_to === 'last_offered_location')
}

function detectRentalUserIntent(text: string, confirmed: Slots): RentalUserIntent {
  const lower = text.toLowerCase()
  if (/\b(?:what|which|where).{0,50}(?:pick\s*up|pickup|pick-up|drop\s*off|dropoff|return)?.{0,30}locations?\b/i.test(text) ||
      /\bwhat\s+pick\s*up\s+location\b/i.test(text) ||
      /\bwhere\s+can\s+i\s+pick/i.test(text)) return 'ASK_LOCATIONS'
  if (isLocationAffirmation(text) && /\b(?:use it|for both|same|that location|there)\b/i.test(text)) return 'ACCEPT_LOCATION'
  if (/\b(?:change|update|actually|instead|correction|wrong)\b/i.test(text)) return 'CORRECTION'
  if (/\b(?:how much|price|cost|deposit|total)\b/i.test(text)) return 'ASK_PRICE'
  if (extractRentalVehicleName(text) || /\b(?:i will take|i'll take|interested in|go with|choose)\b/i.test(text) && confirmed.car_class) return 'SELECT_VEHICLE'
  if (/\b(?:economy|economical|cheap|budget|suv|available cars|what cars|which cars|fleet)\b/i.test(text)) return 'ASK_FLEET'
  if (wantsRentalBookingConfirmation(text)) return 'CONFIRM_BOOKING'
  if (extractName(text) || extractPhone(text) || extractEmail(text) || plainNameAnswer(text)) return 'PROVIDE_CONTACT'
  return 'OTHER'
}

function wantsRentalBookingConfirmation(text: string) {
  return /\b(?:yes|yeah|yep|ok|okay|please|go ahead|confirm|create|book|reserve)\b/i.test(text)
}

type RentalToolLocation = { id?: string | null; name?: string | null; address?: string | null }
type RentalAgentLocationReference = { id?: string | null; name?: string | null; address?: string | null; label?: string | null }
type RentalAgentVehicleReference = { id?: string | null; name?: string | null; dailyPrice?: number | null }
type RentalAgentReferences = {
  last_offered_locations: RentalAgentLocationReference[]
  last_offered_vehicles: RentalAgentVehicleReference[]
  last_recommended_vehicle: RentalAgentVehicleReference | null
  last_pending_confirmation_subject: string | null
}

function locationListFromTool(toolResults: AgentToolResult[]) {
  const locations = toolResults.find(result => result.tool === 'getLocations' && result.ok)
  const data = locations?.data as { locations?: RentalToolLocation[] } | undefined
  return data?.locations ?? []
}

function fleetListFromTool(toolResults: AgentToolResult[]) {
  const fleet = toolResults.find(result => result.tool === 'searchFleet' && result.ok)
  const data = fleet?.data as { cars?: FleetReplyCar[] } | undefined
  return data?.cars ?? []
}

function normalizedLocationLabel(location: RentalToolLocation) {
  return Array.from(new Set([location.name, location.address].filter(Boolean))).join(', ') || 'the configured location'
}

function agentReferencesFromState(metadata: Record<string, unknown> | null | undefined): RentalAgentReferences {
  const agentState = safeRecord(metadata?.agent_state)
  const references = safeRecord(agentState.references)
  const locations = Array.isArray(references.last_offered_locations)
    ? references.last_offered_locations.map(item => {
      const row = safeRecord(item)
      return {
        id: strOrNull(row.id),
        name: strOrNull(row.name),
        address: strOrNull(row.address),
        label: strOrNull(row.label),
      }
    }).filter(location => location.id || location.name || location.address || location.label)
    : []
  const vehicles = Array.isArray(references.last_offered_vehicles)
    ? references.last_offered_vehicles.map(item => {
      const row = safeRecord(item)
      return {
        id: strOrNull(row.id),
        name: strOrNull(row.name),
        dailyPrice: typeof row.dailyPrice === 'number' ? row.dailyPrice : null,
      }
    }).filter(vehicle => vehicle.id || vehicle.name)
    : []
  const recommended = safeRecord(references.last_recommended_vehicle)
  const lastRecommended = strOrNull(recommended.id) || strOrNull(recommended.name)
    ? {
      id: strOrNull(recommended.id),
      name: strOrNull(recommended.name),
      dailyPrice: typeof recommended.dailyPrice === 'number' ? recommended.dailyPrice : null,
    }
    : null
  return {
    last_offered_locations: locations,
    last_offered_vehicles: vehicles,
    last_recommended_vehicle: lastRecommended,
    last_pending_confirmation_subject: strOrNull(references.last_pending_confirmation_subject),
  }
}

function referencesFromToolResults(toolResults: AgentToolResult[], previous: RentalAgentReferences, missing: SlotDef[]): RentalAgentReferences {
  const locations = locationListFromTool(toolResults)
  const fleet = fleetListFromTool(toolResults)
  const missingLocation = missing.some(field => field.key === 'pickup_location' || field.key === 'dropoff_location')
  const nextLocations = locations.length
    ? locations.map(location => ({
      id: location.id ?? null,
      name: location.name ?? null,
      address: location.address ?? null,
      label: normalizedLocationLabel(location),
    }))
    : previous.last_offered_locations
  const nextVehicles = fleet.length
    ? fleet.map(car => ({
      id: car.id ?? null,
      name: car.name ?? null,
      dailyPrice: typeof car.dailyPrice === 'number' ? car.dailyPrice : null,
    }))
    : previous.last_offered_vehicles
  return {
    last_offered_locations: nextLocations,
    last_offered_vehicles: nextVehicles,
    last_recommended_vehicle: fleet.length === 1
      ? { id: fleet[0]?.id ?? null, name: fleet[0]?.name ?? null, dailyPrice: typeof fleet[0]?.dailyPrice === 'number' ? fleet[0]?.dailyPrice : null }
      : previous.last_recommended_vehicle,
    last_pending_confirmation_subject: !missingLocation
      ? null
      : locations.length ? 'use_location_for_both' : previous.last_pending_confirmation_subject,
  }
}

function messageSenderType(message: PersistedChatMessage) {
  return strOrNull(message.metadata?.sender_type) ?? (
    message.role === 'user' ? 'customer' :
    message.role === 'system' ? 'system' :
    'ai'
  )
}

function unprocessedRentalMessages(metadata: Record<string, unknown> | null | undefined, messages: PersistedChatMessage[]) {
  const agentState = safeRecord(metadata?.agent_state)
  const checkpointAt = strOrNull(agentState.last_semantically_processed_at)
  const checkpointId = strOrNull(agentState.last_semantically_processed_message_id)
  const resumedAt = strOrNull(agentState.handover_resumed_at)
  const startedAt = strOrNull(agentState.handover_started_at)
  const afterCheckpoint = checkpointAt
    ? messages.filter(message => message.created_at && message.created_at > checkpointAt)
    : messages
  const relevant = afterCheckpoint.filter(message => {
    const sender = messageSenderType(message)
    if (message.id === checkpointId) return false
    if (message.role === 'user') return true
    if (message.role === 'assistant' && sender === 'human') return true
    return false
  })
  return {
    checkpointAt,
    checkpointId,
    handoverStartedAt: startedAt,
    handoverResumedAt: resumedAt,
    messages: relevant,
  }
}

function sameLocationIntent(text: string) {
  return /\b(?:same\s+(?:as\s+)?(?:pick\s*up|pickup|drop\s*off|dropoff|place|location)|same place|same location|for both|both there|use (?:it|that location) for both|pickup and return there|pick\s*up and drop\s*off there|drop (?:it )?off there|return (?:it )?there|both at the same place)\b/i.test(text)
}

function dropoffSameAsPickupIntent(text: string) {
  return /\b(?:drop\s*off|dropoff|return)(?:\s+\w+){0,4}\s+(?:same as|there|same place|same location)|same as pick\s*up|same as pickup|pickup and return there|pick\s*up and drop\s*off there|drop (?:it )?off there|return (?:it )?there\b/i.test(text)
}

function pickupSameAsDropoffIntent(text: string) {
  return /\b(?:pick\s*up|pickup)(?:\s+\w+){0,4}\s+same as (?:drop\s*off|dropoff|return)|same as (?:drop\s*off|dropoff|return)\b/i.test(text)
}

function wantsBothLocations(text: string) {
  return sameLocationIntent(text) && /\b(?:both|same|there|that location|it|pick\s*up|pickup|drop\s*off|dropoff|return)\b/i.test(text)
}

function locationMatchesText(location: RentalToolLocation, text: string | null | undefined) {
  const wanted = text?.trim().toLowerCase()
  if (!wanted) return false
  const name = location.name?.trim().toLowerCase() ?? ''
  const address = location.address?.trim().toLowerCase() ?? ''
  return Boolean(
    name && (name === wanted || name.includes(wanted) || wanted.includes(name)) ||
    address && (address === wanted || address.includes(wanted) || wanted.includes(address))
  )
}

function locationOptionsReply(toolResults: AgentToolResult[]) {
  const locations = locationListFromTool(toolResults)
  if (locations.length === 1) {
    const location = locations[0]
    const label = normalizedLocationLabel(location)
    return `We currently offer pickup at ${label}. You can also return the car there. Would you like me to use that location for both pickup and drop-off?`
  }
  if (locations.length > 1) {
    const listed = locations.map(location => normalizedLocationLabel(location)).join('; ')
    return `We currently offer these pickup and drop-off locations: ${listed}. Which pickup and return location should I use?`
  }
  return 'I can help set the pickup and drop-off location. Which location should I use for pickup and return?'
}

function applyConfiguredLocationAcceptance(
  confirmed: Slots,
  userMessage: string,
  toolResults: AgentToolResult[],
  semantics: RentalSemanticInterpretation = EMPTY_RENTAL_SEMANTICS,
  references: RentalAgentReferences = {
    last_offered_locations: [],
    last_offered_vehicles: [],
    last_recommended_vehicle: null,
    last_pending_confirmation_subject: null,
  },
) {
  const locations = locationListFromTool(toolResults)
  const referencedLocations = references.last_offered_locations.map(location => ({
    id: location.id ?? null,
    name: location.name ?? location.label ?? null,
    address: location.address ?? null,
  }))
  const locationOptions = locations.length ? locations : referencedLocations
  if (!locationOptions.length) return confirmed
  const next: Slots = { ...confirmed }
  const confirmedLastLocation =
    semantics.confirmation === 'yes' &&
    references.last_pending_confirmation_subject === 'use_location_for_both'
  const acceptedBoth =
    semantics.intent === 'UPDATE_RENTAL_DETAILS' && semanticRelationInvolvesLocation(semantics) ||
    semantics.references.some(ref => ref.resolved_to === 'last_offered_location') ||
    confirmedLastLocation ||
    wantsBothLocations(userMessage) ||
    detectRentalUserIntent(userMessage, confirmed) === 'ACCEPT_LOCATION'
  const singleOffered = locationOptions.length === 1 ? locationOptions[0] : null
  const pickupMatch = locationOptions.find(location => locationMatchesText(location, next.pickup_location))
  const dropoffMatch = locationOptions.find(location => locationMatchesText(location, next.dropoff_location))
  const acceptedLocation = singleOffered && (acceptedBoth || isLocationAffirmation(userMessage)) ? singleOffered : null

  if (acceptedLocation && acceptedBoth) {
    const label = normalizedLocationLabel(acceptedLocation)
    next.pickup_location = label
    next.dropoff_location = label
    next.pickup_location_id = acceptedLocation.id ?? next.pickup_location_id
    next.dropoff_location_id = acceptedLocation.id ?? next.dropoff_location_id
    return next
  }

  if (pickupMatch && !next.pickup_location_id) next.pickup_location_id = pickupMatch.id ?? null
  if (dropoffMatch && !next.dropoff_location_id) next.dropoff_location_id = dropoffMatch.id ?? null

  const semanticDropoffSamePickup = semantics.relations.some(relation =>
    relation.type === 'SAME_AS' && relation.source === 'pickup_location' && relation.target === 'dropoff_location' ||
    relation.type === 'SAME_LOCATION' && relation.fields.includes('pickup_location') && relation.fields.includes('dropoff_location'),
  )
  const semanticPickupSameDropoff = semantics.relations.some(relation =>
    relation.type === 'SAME_AS' && relation.source === 'dropoff_location' && relation.target === 'pickup_location' ||
    relation.type === 'SAME_LOCATION' && relation.fields.includes('pickup_location') && relation.fields.includes('dropoff_location'),
  )

  if ((semanticDropoffSamePickup || dropoffSameAsPickupIntent(userMessage) || acceptedBoth) && next.pickup_location && !next.dropoff_location) {
    next.dropoff_location = next.pickup_location
    next.dropoff_location_id = next.pickup_location_id ?? pickupMatch?.id ?? null
  }
  if ((semanticPickupSameDropoff || pickupSameAsDropoffIntent(userMessage) || acceptedBoth) && next.dropoff_location && !next.pickup_location) {
    next.pickup_location = next.dropoff_location
    next.pickup_location_id = next.dropoff_location_id ?? dropoffMatch?.id ?? null
  }
  if (next.pickup_location && next.dropoff_location && next.pickup_location === next.dropoff_location) {
    const match = pickupMatch ?? dropoffMatch ?? acceptedLocation
    if (match?.id) {
      next.pickup_location_id = next.pickup_location_id ?? match.id
      next.dropoff_location_id = next.dropoff_location_id ?? match.id
    }
  }
  return next
}

function deterministicRentalNextActionReply(
  confirmed: Slots,
  missing: SlotDef[],
  toolResults: AgentToolResult[],
  businessType?: string | null,
  userMessage = '',
): string | null {
  if (normalizeBusinessType(businessType) !== 'car_rental') return null
  const intent = detectRentalUserIntent(userMessage, confirmed)
  const missingKeys = new Set(missing.map(field => field.key))

  if (intent === 'ASK_LOCATIONS') return locationOptionsReply(toolResults)

  if (intent === 'CONFIRM_BOOKING' && (missingKeys.has('pickup_location') || missingKeys.has('dropoff_location'))) {
    const prefix = confirmed.name ? `Thanks, ${confirmed.name}. ` : ''
    return `${prefix}I just need the pickup and return locations before I can create the booking. ${locationOptionsReply(toolResults)}`
  }

  if (
    (intent === 'PROVIDE_CONTACT' || intent === 'OTHER') &&
    confirmed.selected_vehicle &&
    confirmed.pickup_datetime &&
    confirmed.return_datetime &&
    confirmed.name &&
    confirmed.phone &&
    confirmed.email &&
    (missingKeys.has('pickup_location') || missingKeys.has('dropoff_location'))
  ) {
    return `Thanks, ${confirmed.name}. I just need the pickup and return locations before I can confirm the booking. ${locationOptionsReply(toolResults)}`
  }

  if (confirmed.selected_vehicle) {
    const intro = selectedVehicleIntro(confirmed)
    if (missingKeys.has('name') && intent === 'PROVIDE_CONTACT') return `${intro} What name should we put on the booking?`
    if (missingKeys.has('phone') && confirmed.name) return `Thanks, ${confirmed.name}. What's your phone number?`
    if (missingKeys.has('email') && confirmed.name && confirmed.phone) return `Thanks, ${confirmed.name}. What's your email address?`
  }

  return null
}

function isLocationAffirmation(text: string) {
  return /\b(yes|yeah|yep|ok|okay|fine|correct|that location|same location|same place|for both|both there|works|sounds good)\b/i.test(text) || sameLocationIntent(text)
}

function assistantAskedForName(history: { role: string; content: string }[]) {
  const lastAssistant = [...history].reverse().find(message => message.role === 'assistant')?.content ?? ''
  return /\b(?:your|full)\s+name\b|\bprovide your name\b|\bmay i (?:have|get) your name\b|\bcould you (?:please )?(?:provide|share|send) your name\b/i.test(lastAssistant)
}

function normalizeRentalLocationText(value: string | null | undefined, fallback?: string | null) {
  const raw = value?.trim()
  if (!raw) return null
  if (/^\d{1,2}(?::\d{2})?(?:\s*(?:am|pm))?(?:\s+(?:return|drop(?:off|-off)?|to|until)\b.*)?$/i.test(raw)) return null
  if (/\b\d{1,2}:\d{2}\b/.test(raw) && /\b(?:return|drop(?:off|-off)?)\b/i.test(raw)) return null
  if (/\b(?:same as pick\s*up|same as pickup|same pickup|same location|there|your location|the location)\b/i.test(raw)) {
    return fallback?.trim() || null
  }
  if (/\bboche[ńn]ska\s*2a\b/i.test(raw) || /\bkrak[oó]w\b/i.test(raw) && /\bboche/i.test(raw)) return 'Kraków Bocheńska 2a'
  return raw
}

function mentionsCanonicalRentalLocation(text: string) {
  return /\bboche[ńn]ska\s*2a\b/i.test(text) || /\bkrak[oó]w\b/i.test(text) && /\bboche/i.test(text)
}

function mentionsPickupAndDropoff(text: string) {
  return /\bpick\s*up\b/i.test(text) && /\b(?:drop\s*off|dropoff|return)\b/i.test(text)
}

function latestAssistantSuggestedLocation(history: { role: string; content: string }[]): string | null {
  const assistantMessages = history.filter(message => message.role === 'assistant').map(message => message.content).reverse()
  for (const content of assistantMessages) {
    const known = content.match(/\bKrak[oó]w\s+Boche[ńn]ska\s+2a\b/i)?.[0]
    if (known) return known
    if (/\bBoche[ńn]ska\s+2a\b/i.test(content)) return 'Kraków Bocheńska 2a'
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
  canonicalSlots: Partial<Slots> = {},
): Slots {
  const meta = (existingLead?.metadata ?? {}) as Record<string, unknown>
  const canonical = canonicalSlots ?? {}

  // Base: what's already persisted in the lead row
  const fromDB: Slots = {
    name:          strOrNull(canonical.name) ?? strOrNull(existingLead?.name) ?? strOrNull(meta.name),
    phone:         strOrNull(canonical.phone) ?? strOrNull(existingLead?.phone) ?? strOrNull(meta.phone),
    email:         strOrNull(canonical.email) ?? strOrNull(existingLead?.email) ?? strOrNull(meta.email),
    company:       strOrNull(canonical.company) ?? strOrNull(meta.company),
    notes:         strOrNull(canonical.notes) ?? strOrNull(meta.notes),
    service_interest: strOrNull(canonical.service_interest) ?? strOrNull(meta.service_interest),
    city:          strOrNull(canonical.city) ?? strOrNull(meta.city),
    area:          strOrNull(canonical.area) ?? strOrNull(meta.area),
    budget:        strOrNull(canonical.budget) ?? strOrNull(meta.budget),
    property_type: strOrNull(canonical.property_type) ?? strOrNull(meta.property_type),
    rooms:         strOrNull(canonical.rooms) ?? strOrNull(meta.rooms),
    deal_type:     strOrNull(canonical.deal_type) ?? strOrNull(meta.deal_type),
    viewing_time:  strOrNull(canonical.viewing_time) ?? strOrNull(meta.viewing_time),
    pickup_location: strOrNull(canonical.pickup_location) ?? strOrNull(meta.pickup_location),
    dropoff_location: strOrNull(canonical.dropoff_location) ?? strOrNull(meta.dropoff_location),
    pickup_location_id: strOrNull(canonical.pickup_location_id) ?? strOrNull(meta.pickup_location_id),
    dropoff_location_id: strOrNull(canonical.dropoff_location_id) ?? strOrNull(meta.dropoff_location_id),
    pickup_date: strOrNull(canonical.pickup_date) ?? strOrNull(meta.pickup_date),
    return_date: strOrNull(canonical.return_date) ?? strOrNull(meta.return_date),
    pickup_datetime: strOrNull(canonical.pickup_datetime) ?? strOrNull(meta.pickup_datetime),
    return_datetime: strOrNull(canonical.return_datetime) ?? strOrNull(meta.return_datetime),
    selected_vehicle: strOrNull(canonical.selected_vehicle) ?? strOrNull(meta.selected_vehicle),
    car_class: strOrNull(canonical.car_class) ?? strOrNull(meta.car_class),
    transmission: strOrNull(canonical.transmission) ?? strOrNull(meta.transmission),
    seats: strOrNull(canonical.seats) ?? strOrNull(meta.seats),
    extras: strOrNull(canonical.extras) ?? strOrNull(meta.extras),
    booking_number: strOrNull(canonical.booking_number) ?? strOrNull(meta.booking_number),
    extension_request: strOrNull(canonical.extension_request) ?? strOrNull(meta.extension_request),
  }

  const userTexts = [
    ...history.filter(m => m.role === 'user').map(m => m.content),
    currentMsg,
  ]
  const extracted = latestExtractedSlots(userTexts)
  const currentExtracted = extractFromText(currentMsg, fromDB)
  const currentWithCanonicalState = extractFromText(currentMsg, { ...fromDB, ...extracted })
  if (!extracted.pickup_datetime && currentWithCanonicalState.pickup_datetime) extracted.pickup_datetime = currentWithCanonicalState.pickup_datetime
  if (!extracted.return_datetime && currentWithCanonicalState.return_datetime) extracted.return_datetime = currentWithCanonicalState.return_datetime
  if (!extracted.pickup_date && currentWithCanonicalState.pickup_date) extracted.pickup_date = currentWithCanonicalState.pickup_date
  if (!extracted.return_date && currentWithCanonicalState.return_date) extracted.return_date = currentWithCanonicalState.return_date
  if (!extracted.name && assistantAskedForName(history)) {
    const answeredName = plainNameAnswer(currentMsg)
    if (answeredName) extracted.name = answeredName
  }
  if (!extracted.name && !fromDB.name && fromDB.selected_vehicle) {
    const answeredName = plainNameAnswer(currentMsg)
    if (answeredName) extracted.name = answeredName
  }
  if (!currentExtracted.pickup_location && isLocationAffirmation(currentMsg)) {
    const suggestedLocation = latestAssistantSuggestedLocation(history)
    if (suggestedLocation) {
      extracted.pickup_location = suggestedLocation
      if (wantsBothLocations(currentMsg)) {
        extracted.dropoff_location = suggestedLocation
        if (fromDB.pickup_location_id) {
          extracted.pickup_location_id = fromDB.pickup_location_id
          extracted.dropoff_location_id = fromDB.pickup_location_id
        }
      }
    }
  }
  if (!currentExtracted.pickup_location && mentionsCanonicalRentalLocation(currentMsg) && /\bpick\s*up\b/i.test(currentMsg)) {
    extracted.pickup_location = 'Kraków Bocheńska 2a'
  }
  if (mentionsCanonicalRentalLocation(currentMsg) && mentionsPickupAndDropoff(currentMsg)) {
    extracted.pickup_location = 'Kraków Bocheńska 2a'
    extracted.dropoff_location = 'Kraków Bocheńska 2a'
  }
  if (!currentExtracted.dropoff_location && (dropoffSameAsPickupIntent(currentMsg) || /\b(?:same as pick\s*up|same as pickup|same pickup|same location|same place|there|your location|the location)\b/i.test(currentMsg))) {
    const pickupLocation = extracted.pickup_location ?? fromDB.pickup_location
    if (pickupLocation) extracted.dropoff_location = pickupLocation
    const pickupLocationId = extracted.pickup_location_id ?? fromDB.pickup_location_id
    if (pickupLocationId) extracted.dropoff_location_id = pickupLocationId
  }
  if (!currentExtracted.pickup_location && pickupSameAsDropoffIntent(currentMsg)) {
    const dropoffLocation = extracted.dropoff_location ?? fromDB.dropoff_location
    if (dropoffLocation) extracted.pickup_location = dropoffLocation
    const dropoffLocationId = extracted.dropoff_location_id ?? fromDB.dropoff_location_id
    if (dropoffLocationId) extracted.pickup_location_id = dropoffLocationId
  }
  if (!currentExtracted.dropoff_location && /\bboche[ńn]ska\s*2a\b/i.test(currentMsg)) {
    extracted.dropoff_location = 'Kraków Bocheńska 2a'
  }
  if (extracted.pickup_location) {
    const normalized = normalizeRentalLocationText(extracted.pickup_location, fromDB.pickup_location ?? null)
    if (normalized) extracted.pickup_location = normalized
    else delete extracted.pickup_location
  }
  if (extracted.dropoff_location) {
    const normalized = normalizeRentalLocationText(extracted.dropoff_location, extracted.pickup_location ?? fromDB.pickup_location ?? null)
    if (normalized) extracted.dropoff_location = normalized
    else delete extracted.dropoff_location
  }
  if (
    (extracted.pickup_location ?? fromDB.pickup_location) &&
    (extracted.pickup_location ?? fromDB.pickup_location) === (extracted.dropoff_location ?? fromDB.dropoff_location)
  ) {
    const sharedId = extracted.pickup_location_id ?? fromDB.pickup_location_id ?? extracted.dropoff_location_id ?? fromDB.dropoff_location_id
    if (sharedId) {
      extracted.pickup_location_id = sharedId
      extracted.dropoff_location_id = sharedId
    }
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
    pickup_location_id: extracted.pickup_location_id ?? fromDB.pickup_location_id ?? null,
    dropoff_location_id: extracted.dropoff_location_id ?? fromDB.dropoff_location_id ?? null,
    pickup_date: extracted.pickup_date ?? fromDB.pickup_date ?? null,
    return_date: extracted.return_date ?? fromDB.return_date ?? null,
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
  if (confirmed.pickup_date && !confirmed.pickup_datetime) confirmedLines.push(`Pickup date: ${confirmed.pickup_date} (time not confirmed yet)`)
  if (confirmed.return_date && !confirmed.return_datetime) confirmedLines.push(`Return date: ${confirmed.return_date} (time not confirmed yet)`)
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
  { keys: ['pickup_datetime', 'return_datetime'], patterns: [/what pickup date and time/i, /what return date and time/i, /pickup date and time.*return date and time/i, /when.*pick.*up.*return/i] },
  { keys: ['pickup_location'], patterns: [/what pickup location/i, /where.*pick.*up/i, /pickup location should i use/i] },
  { keys: ['dropoff_location'], patterns: [/what drop-?off location/i, /where.*drop.*off/i, /drop-?off location should i use/i] },
  { keys: ['selected_vehicle'], patterns: [/which one would you like/i, /which vehicle would you like/i, /which car would you like/i] },
]

function guardReply(
  reply:     string,
  confirmed: Slots,
  missing:   SlotDef[],
): { reply: string; blocked: boolean } {
  reply = (confirmed.pickup_datetime || confirmed.return_datetime)
    ? replaceRentalIsoDateTimes(reply, confirmed)
    : reply
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
  id?: string | null
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

function formatRentalLocationForCustomer(location: { name?: string | null; address?: string | null }) {
  const name = location.name?.trim() ?? ''
  const address = location.address?.trim() ?? ''
  const combined = `${name} ${address}`
  if (/\bkrak[oó]w\b/i.test(combined) && /\bboche[ńn]ska\s*2a\b/i.test(combined)) {
    return 'in Kraków is Bocheńska 2a'
  }
  if (name && address && address.toLowerCase().includes(name.toLowerCase())) return `is ${address}`
  if (name && address && name.toLowerCase().includes(address.toLowerCase())) return `is ${name}`
  if (name && address) return `is ${name}, ${address}`
  return `is ${name || address || 'the configured location'}`
}

function formatCustomerDateTime(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const valueFor = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  return `${valueFor('day')} ${valueFor('month')} ${valueFor('year')} at ${valueFor('hour')}:${valueFor('minute')}`
}

function formatCustomerRentalWindow(pickupAt: string | null | undefined, returnAt: string | null | undefined) {
  const pickup = formatCustomerDateTime(pickupAt)
  const dropoff = formatCustomerDateTime(returnAt)
  if (pickup && dropoff) return `from ${pickup} to ${dropoff}`
  if (pickup) return `from ${pickup}`
  if (dropoff) return `until ${dropoff}`
  return ''
}

function replaceRentalIsoDateTimes(reply: string, confirmed: Slots) {
  let next = reply
  const replacements = [
    [confirmed.pickup_datetime, formatCustomerDateTime(confirmed.pickup_datetime)],
    [confirmed.return_datetime, formatCustomerDateTime(confirmed.return_datetime)],
  ] as const
  for (const [raw, formatted] of replacements) {
    if (raw && formatted) next = next.split(raw).join(formatted)
  }
  return next.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:[+-]\d{2}:\d{2}|Z)?\b/g, value => formatCustomerDateTime(value) ?? value)
}

function enforceRentalOperationalReplyContract(reply: string, toolResults: AgentToolResult[]) {
  let next = reply
    .replace(/\b(?:please\s+)?hold on(?: for a moment)?[.!]?\s*/gi, '')
    .replace(/\bLet me (?:just )?check (?:the )?availability[^.?!]*[.?!]\s*/gi, '')
  const create = toolResults.find(result => result.tool === 'createBooking' && result.ok)
  const status = create ? String(safeRecord(create.data).status ?? '').toLowerCase() : ''
  if (create && status === 'pending') {
    next = next
      .replace(/\bOur team will contact you shortly to confirm(?: the final details)?[.?!]?/gi, '')
      .replace(/\bYour booking is confirmed\b/gi, 'Your booking request has been created successfully')
  }
  return next.replace(/\s{2,}/g, ' ').trim()
}

function formatPln(value: unknown) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return null
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })} PLN`
}

function requestedRentalDays(text: string) {
  const match = text.match(/\b(\d{1,2})\s*(?:rental\s*)?days?\b/i)
  return match ? Number(match[1]) : null
}

function formatPriceReply(price: AgentToolResult, userMessage: string) {
  const data = price.data as {
    rentalDays?: number
    dailyPrice?: number
    rentalSubtotal?: number
    deposit?: number
  } | undefined
  const total = formatPln(data?.rentalSubtotal)
  const daily = formatPln(data?.dailyPrice)
  const deposit = formatPln(data?.deposit)
  const days = Number(data?.rentalDays ?? 0)
  if (!total || !daily || !days) return price.summary
  const pieces = [
    `Estimated rental price: ${total}.`,
    `This period is charged as ${days} rental ${days === 1 ? 'day' : 'days'} at ${daily}/day.`,
  ]
  const statedDays = requestedRentalDays(userMessage)
  if (statedDays && days > statedDays) {
    pieces.push(`Because the return time is later than the pickup time, this is charged as ${days} rental days.`)
  }
  if (deposit) pieces.push(`Deposit: ${deposit}.`)
  return pieces.join(' ')
}

function formatAvailabilityReply(availability: AgentToolResult, confirmed: Slots) {
  const data = availability.data as {
    available?: boolean
    requestedCar?: { name?: string | null } | null
    availableCars?: { name?: string | null }[]
  } | undefined
  const selected = data?.requestedCar?.name || confirmed.selected_vehicle || confirmed.car_class || 'the selected car'
  const window = formatCustomerRentalWindow(confirmed.pickup_datetime, confirmed.return_datetime)
  if (availability.ok && data?.available && data.requestedCar) {
    return `The ${selected} is available${window ? ` ${window}` : ''}.`
  }
  if (availability.ok && data?.requestedCar && data?.available === false) {
    const alternatives = (data.availableCars ?? []).map(car => car.name).filter(Boolean).join(', ')
    return alternatives
      ? `The ${selected} is not available for those dates, but these similar cars are available: ${alternatives}.`
      : `The ${selected} is not available for those dates.`
  }
  return 'I could not complete the live availability check yet. Let me verify the rental details first.'
}

function locationAcceptanceReply(confirmed: Slots, missing: SlotDef[], userMessage: string) {
  if (!confirmed.pickup_location || !confirmed.dropoff_location) return null
  if (!mentionsCanonicalRentalLocation(userMessage) && !sameLocationIntent(userMessage) && !/\b(?:same as pick\s*up|same as pickup|same location|there|your location|the location)\b/i.test(userMessage)) return null
  const missingKeys = new Set(missing.map(field => field.key))
  const sameLocation = confirmed.pickup_location === confirmed.dropoff_location
  const prefix = sameLocation
    ? `Perfect — pickup and return will both be at ${confirmed.pickup_location}.`
    : `Perfect — pickup will be at ${confirmed.pickup_location} and return will be at ${confirmed.dropoff_location}.`
  if (missingKeys.has('selected_vehicle') || missingKeys.has('car_class')) return `${prefix} What type of car would you prefer?`
  if (missingKeys.has('pickup_datetime') || missingKeys.has('return_datetime')) return `${prefix} What pickup date and time should I use, and what return date and time should I use?`
  if (missingKeys.has('name')) return `${prefix} Could you please provide your name?`
  if (missingKeys.has('phone')) return `${prefix} What is your phone number?`
  if (missingKeys.has('email')) return `${prefix} What is your email address?`
  return prefix
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
    const pickup = formatCustomerDateTime(confirmed.pickup_datetime)
    const dropoff = formatCustomerDateTime(confirmed.return_datetime)
    if (pickup) pieces.push(`Pickup: ${pickup}.`)
    if (dropoff) pieces.push(`Return: ${dropoff}.`)
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
  const acceptedLocation = locationAcceptanceReply(confirmed, missing, userMessage)

  if (fleet?.ok && !confirmed.selected_vehicle) {
    const data = fleet.data as { cars?: { name?: string | null; className?: string | null; transmission?: string | null; dailyPrice?: number | null }[]; availabilityFiltered?: boolean } | undefined
    if (data?.availabilityFiltered) {
      const cars = data.cars ?? []
      if (cars.length === 0) return confirmed.car_class
        ? `No ${confirmed.car_class} cars are available for that exact rental period.`
        : 'No matching cars are available for that exact rental period.'
      const listed = cars.slice(0, 8).map(car => {
        const details = [car.className, car.transmission, car.dailyPrice ? `${car.dailyPrice} PLN/day` : null].filter(Boolean).join(', ')
        return details ? `${car.name} (${details})` : String(car.name)
      }).join('; ')
      return `These cars are available for your rental period: ${listed}. Which one would you like?`
    }
  }

  if (create?.ok) {
    const data = create.data as { bookingNumber?: string; status?: string } | undefined
    if (!data?.bookingNumber) return 'Booking creation failed because no booking reference was returned. I can connect you with the team to finish this safely.'
    const priceLine = price?.ok ? formatPriceReply(price, userMessage) : null
    const deposit = price?.ok ? formatPln((price.data as { deposit?: number } | undefined)?.deposit) : null
    const window = formatCustomerRentalWindow(confirmed.pickup_datetime, confirmed.return_datetime)
    const status = String(data.status ?? '').toLowerCase()
    const opening = status === 'confirmed'
      ? `Your booking is confirmed. Reference: ${data.bookingNumber}.`
      : `Your booking request has been created successfully. Reference: ${data.bookingNumber}.`
    const reservationLine = status === 'confirmed'
      ? `${selected} is reserved${window ? ` ${window}` : ''}.`
      : `${selected} is requested${window ? ` ${window}` : ''}.`
    return [
      opening,
      reservationLine,
      priceLine ? priceLine.split(' Deposit:')[0] : null,
      deposit ? `Deposit: ${deposit}.` : null,
      'Payment and deposit will be handled at pickup.',
    ].filter(Boolean).join(' ')
  }

  if (create && !create.ok) {
    if (/pickup|drop-?off|location/i.test(create.summary)) {
      return locationOptionsReply(toolResults)
    }
    if (/missing required/i.test(create.summary)) {
      const missingLocation = missing.find(field => field.key === 'pickup_location' || field.key === 'dropoff_location')
      if (missingLocation) return locationOptionsReply(toolResults)
    }
    const requiredOrder = ['dropoff_location', 'pickup_location', 'pickup_datetime', 'return_datetime', 'selected_vehicle', 'car_class', 'name', 'phone', 'email']
    const nextMissing = requiredOrder
      .map(key => missing.find(field => field.key === key))
      .find(Boolean)
    if (nextMissing) return nextMissing.question
    return 'I could not create the booking safely yet. Let me verify the missing booking detail first.'
  }

  if (availability) {
    const availabilityData = availability.data as { available?: boolean; requestedCar?: { name?: string | null } | null } | undefined
    if (availability.ok && availabilityData?.requestedCar && availabilityData.available === false) {
      return formatAvailabilityReply(availability, confirmed)
    }
    const contactMissing = missing.find(field => ['name', 'phone', 'email'].includes(String(field.key)))
    if (contactMissing && confirmed.selected_vehicle) {
      if (availability.ok && availabilityData?.requestedCar && availabilityData.available === true) {
        return `${formatAvailabilityReply(availability, confirmed)} ${contactMissing.question}`
      }
      const selectedNext = selectedVehicleNextStepReply(confirmed, missing, toolResults)
      if (selectedNext) return selectedNext
    }
    if (!availability.ok) {
      const nextMissing = missing.find(field => ['dropoff_location', 'pickup_location', 'pickup_datetime', 'return_datetime', 'selected_vehicle', 'car_class'].includes(String(field.key)))
      return nextMissing ? nextMissing.question : 'I could not complete the live availability check yet. Let me verify the rental details first.'
    }
    const nextMissing = missing.find(field => ['name', 'phone', 'email', 'dropoff_location', 'pickup_location'].includes(String(field.key)))
    const pieces = [formatAvailabilityReply(availability, confirmed)]
    if (price?.ok) pieces.push(formatPriceReply(price, userMessage))
    if (nextMissing) pieces.push(nextMissing.question)
    if (!nextMissing && availabilityData?.available && price?.ok) {
      pieces.push('Would you like me to create the booking request?')
    }
    return pieces.join(' ')
  }

  const selectedNextStep = selectedVehicleNextStepReply(confirmed, missing, toolResults)
  if (selectedNextStep && confirmed.pickup_location && confirmed.dropoff_location) return selectedNextStep
  if (acceptedLocation) return acceptedLocation

  if (locations?.ok) {
    const data = locations.data as { locations?: { name?: string | null; address?: string | null }[] } | undefined
    const list = data?.locations ?? []
    if (list.length === 1) {
      const location = list[0]
      return `Our pickup location ${formatRentalLocationForCustomer(location)}.`
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

export const __testRentalChatHelpers = {
  buildConfirmedSlots,
  formatRentalLocationForCustomer,
  formatCustomerDateTime,
  formatPriceReply,
  rentalToolReplyOverride,
  deterministicRentalNextActionReply,
  detectRentalUserIntent,
  applyConfiguredLocationAcceptance,
  sameLocationIntent,
  dropoffSameAsPickupIntent,
  normalizeSemanticInterpretation,
  validateSemanticInterpretationPayload,
  extractSemanticTextFromProviderPayload,
  parseSemanticJson,
  semanticProviderForModel,
  reduceRentalState,
  semanticNeedsLocationTool,
  rentalSemanticIntentToUserIntent,
  slotsFromConversationAgentState,
  normalizeRentalLocationText,
  replaceRentalIsoDateTimes,
  plainNameAnswer,
  looksMidSentence,
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
    max_tokens: 900,
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
  correlationId: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new GeminiApiError('GEMINI_API_KEY is missing. Add it in Vercel Environment Variables and redeploy.', 500, 'MISSING_API_KEY', 'config_error', null)
  }
  const baseContents = history.map(message => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }))
  const attempts = [
    { attempt: 1, maxOutputTokens: 900, userText: userMessage },
    {
      attempt: 2,
      maxOutputTokens: 1400,
      userText: `${userMessage}\n\nWrite one concise, complete customer-facing reply. Finish the sentence. Do not include JSON.`,
    },
  ]
  let lastIncomplete: GeminiIncompleteResponseError | null = null
  for (const attempt of attempts) {
    const contents = [
      ...baseContents,
      { role: 'user', parts: [{ text: attempt.userText }] },
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
          maxOutputTokens: attempt.maxOutputTokens,
        },
      }),
    })
    const payload = await res.json().catch(() => null) as {
      error?: { message?: string; status?: string; code?: number }
      candidates?: Array<{ finishReason?: string; finishMessage?: string; safetyRatings?: unknown; content?: { parts?: Array<{ text?: string }> } }>
      promptFeedback?: unknown
      usageMetadata?: Record<string, unknown>
    } | null
    if (!res.ok) {
      throw new GeminiApiError(payload?.error?.message ?? `Gemini request failed with HTTP ${res.status}`, res.status, payload?.error?.status ?? null, payload?.error?.status ?? null, payload)
    }
    const candidate = payload?.candidates?.[0]
    const parts = candidate?.content?.parts ?? []
    const text = parts.map(part => part.text ?? '').join('').trim()
    console.log('[AI_DIAG] Gemini response', {
      correlation_id: correlationId,
      attempt: attempt.attempt,
      model,
      max_output_tokens: attempt.maxOutputTokens,
      finish_reason: candidate?.finishReason ?? null,
      finish_message: candidate?.finishMessage ?? null,
      candidates: payload?.candidates?.length ?? 0,
      content_parts: parts.length,
      output_chars: text.length,
      looks_mid_sentence: looksMidSentence(text),
      safety_ratings_present: Boolean(candidate?.safetyRatings),
      prompt_feedback_present: Boolean(payload?.promptFeedback),
      usage_metadata: payload?.usageMetadata ?? null,
    })
      const finishReason = candidate?.finishReason ?? null
      const incompleteReason = !text
        ? 'EMPTY_RESPONSE'
        : !candidate
          ? 'NO_CANDIDATE'
          : !parts.length
            ? 'NO_CONTENT_PARTS'
            : finishReason && !['STOP', 'FINISH_REASON_UNSPECIFIED'].includes(finishReason)
              ? finishReason
              : looksMidSentence(text)
                ? 'MID_SENTENCE'
                : null
      if (incompleteReason) {
        throw new GeminiIncompleteResponseError(`Gemini response did not finish cleanly (${incompleteReason}).`, incompleteReason, payload)
      }
      return stripModelReply(text)
    } catch (error) {
      if (error instanceof GeminiIncompleteResponseError) {
        lastIncomplete = error
        console.warn('[AI_DIAG] Gemini incomplete response retry decision', {
          correlation_id: correlationId,
          attempt: attempt.attempt,
          code: error.code,
          will_retry: attempt.attempt < attempts.length,
        })
        if (attempt.attempt < attempts.length) continue
        break
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
  console.error('[AI_DIAG] Gemini retry exhausted; using complete fallback', {
    correlation_id: correlationId,
    code: lastIncomplete?.code ?? null,
    message: lastIncomplete?.message ?? null,
  })
  throw lastIncomplete ?? new GeminiIncompleteResponseError('Gemini response did not finish cleanly.', 'INCOMPLETE_RESPONSE', null)
}

function semanticProviderForModel(model: string): SemanticProvider {
  if (isGeminiModel(model)) return 'gemini'
  if (model.toLowerCase().startsWith('claude')) return 'claude'
  return 'openai'
}

function stripJsonFences(text: string) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'').trim()
}

function extractSemanticTextFromProviderPayload(provider: SemanticProvider, payload: unknown): { text: string; finishReason: string | null; candidateCount: number; contentPartCount: number } {
  const record = safeRecord(payload)
  if (provider === 'gemini') {
    const candidates = Array.isArray(record.candidates) ? record.candidates : []
    const candidate = safeRecord(candidates[0])
    const content = safeRecord(candidate.content)
    const parts = Array.isArray(content.parts) ? content.parts : []
    return {
      text: parts.map(part => strOrNull(safeRecord(part).text) ?? '').join('').trim(),
      finishReason: strOrNull(candidate.finishReason),
      candidateCount: candidates.length,
      contentPartCount: parts.length,
    }
  }
  if (provider === 'openai') {
    const outputText = strOrNull(record.output_text)
    if (outputText) return { text: outputText.trim(), finishReason: strOrNull(record.status), candidateCount: 1, contentPartCount: 1 }
    const choices = Array.isArray(record.choices) ? record.choices : []
    const choice = safeRecord(choices[0])
    const message = safeRecord(choice.message)
    const content = message.content
    const text = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map(part => strOrNull(safeRecord(part).text) ?? '').join('')
        : ''
    return {
      text: text.trim(),
      finishReason: strOrNull(choice.finish_reason),
      candidateCount: choices.length,
      contentPartCount: text ? 1 : 0,
    }
  }
  const content = Array.isArray(record.content) ? record.content : []
  return {
    text: content.map(part => strOrNull(safeRecord(part).text) ?? '').join('').trim(),
    finishReason: strOrNull(record.stop_reason) ?? strOrNull(record.stopReason),
    candidateCount: content.length ? 1 : 0,
    contentPartCount: content.length,
  }
}

function cleanSemanticFinishReason(provider: SemanticProvider, finishReason: string | null) {
  if (!finishReason) return true
  const normalized = finishReason.toUpperCase()
  if (provider === 'openai') return normalized === 'STOP' || normalized === 'COMPLETED'
  if (provider === 'claude') return normalized === 'END_TURN' || normalized === 'STOP_SEQUENCE'
  return normalized === 'STOP' || normalized === 'FINISH_REASON_UNSPECIFIED'
}

function parseSemanticJson(text: string) {
  return JSON.parse(stripJsonFences(text)) as unknown
}

function semanticPrompt(input: {
  model: string
  agent: AgentRow
  currentState: Slots
  history: { role: 'user' | 'assistant'; content: string }[]
  userMessage: string
  qualificationStage: string
  missing: SlotDef[]
  correlationId: string
}) {
  const recentHistory = input.history.slice(-10)
  return [
    'You are the semantic interpreter for a car-rental operations agent.',
    'Do not write a customer-facing reply.',
    'Return only JSON matching this shape:',
    '{"intent":"...","state_patch":{},"relations":[],"references":[],"corrections":[],"question":null,"confirmation":null,"confidence":0.0}',
    `Allowed intents: ${RENTAL_SEMANTIC_INTENTS.join(', ')}`,
    'Allowed relation types: SAME_AS, SAME_LOCATION.',
    'Allowed state/reference fields: pickup_location, dropoff_location, pickup_datetime, return_datetime, pickup_date, return_date, pickup_time, return_time, selected_vehicle, car_class, transmission, name, phone, email.',
    'Let language understanding be broad and contextual. Do not require exact phrases.',
    'Use relations for contextual references, for example SAME_AS pickup_location -> dropoff_location.',
    'Use references for "first one", "cheaper one", "there", "that place", and similar contextual references.',
    'If the customer confirms the previous assistant proposal, set confirmation to "yes" and include references/relations for what was confirmed.',
    'Budget or low-cost wording should be represented as ASK_AVAILABLE_VEHICLES or SELECT_VEHICLE with a lowest_price_candidate / cheapest_offered_vehicle reference when context supports it.',
    'Never invent database IDs. Vehicle/location names are allowed; IDs are backend-only.',
    'If the message is ambiguous, set intent UNKNOWN or GENERAL_QUESTION with low confidence.',
    'Configured bot instructions for tone/context:',
    `${input.agent.persona ?? ''}\n${input.agent.objective ?? ''}\nTone: ${input.agent.tone ?? ''}`.trim(),
    `Workflow stage: ${input.qualificationStage}`,
    `Missing fields: ${input.missing.map(field => field.key).join(', ') || 'none'}`,
    `Current canonical state JSON: ${JSON.stringify(input.currentState)}`,
    `Recent history JSON: ${JSON.stringify(recentHistory)}`,
    `Latest customer message: ${input.userMessage}`,
  ].join('\n\n')
}

async function semanticOpenAiAttempt(input: { model: string; prompt: string }) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('MODEL_CONFIGURATION_ERROR:OPENAI_API_KEY')
  const client = new OpenAI({ apiKey })
  const response = await client.chat.completions.create({
    model: input.model,
    temperature: 0.1,
    messages: [
      { role: 'system', content: 'Return one valid JSON object only. No markdown.' },
      { role: 'user', content: input.prompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 700,
  })
  return extractSemanticTextFromProviderPayload('openai', response)
}

async function semanticGeminiAttempt(input: { model: string; prompt: string; signal: AbortSignal }) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('MODEL_CONFIGURATION_ERROR:GEMINI_API_KEY')
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: input.signal,
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 700,
        responseMimeType: 'application/json',
      },
    }),
  })
  const payload = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`PROVIDER_REQUEST_FAILED:${res.status}`)
  return extractSemanticTextFromProviderPayload('gemini', payload)
}

async function semanticProviderAttempt(provider: SemanticProvider, input: { model: string; prompt: string; signal: AbortSignal }) {
  if (provider === 'gemini') return semanticGeminiAttempt(input)
  if (provider === 'openai') return semanticOpenAiAttempt(input)
  throw new Error('UNSUPPORTED_STRUCTURED_OUTPUT:claude_adapter_not_configured')
}

function semanticFallbackReasonFromError(error: unknown): { reason: RentalSemanticFallbackReason; detail: string | null } {
  const message = error instanceof Error ? error.message : String(error)
  const lowerMessage = message.toLowerCase()
  if (message.startsWith('MODEL_CONFIGURATION_ERROR')) return { reason: 'MODEL_CONFIGURATION_ERROR', detail: message.split(':').slice(1).join(':') || null }
  if (message.startsWith('UNSUPPORTED_STRUCTURED_OUTPUT')) return { reason: 'UNSUPPORTED_STRUCTURED_OUTPUT', detail: message.split(':').slice(1).join(':') || null }
  if (message.startsWith('PROVIDER_REQUEST_FAILED')) return { reason: 'PROVIDER_REQUEST_FAILED', detail: message.split(':').slice(1).join(':') || null }
  if (
    lowerMessage.includes('response_format') ||
    (lowerMessage.includes('structured') && lowerMessage.includes('unsupported')) ||
    (lowerMessage.includes('json') && lowerMessage.includes('unsupported'))
  ) return { reason: 'UNSUPPORTED_STRUCTURED_OUTPUT', detail: null }
  if (error instanceof SyntaxError) return { reason: 'JSON_PARSE_FAILED', detail: null }
  if (error && typeof error === 'object' && String((error as { name?: unknown }).name ?? '').includes('AbortError')) return { reason: 'PROVIDER_TIMEOUT', detail: null }
  return { reason: 'PROVIDER_ADAPTER_ERROR', detail: null }
}

async function interpretRentalSemantics(input: {
  model: string
  agent: AgentRow
  currentState: Slots
  history: { role: 'user' | 'assistant'; content: string }[]
  userMessage: string
  qualificationStage: string
  missing: SlotDef[]
  correlationId: string
}): Promise<{ interpretation: RentalSemanticInterpretation | null; trace: RentalSemanticTraceMeta }> {
  const provider = semanticProviderForModel(input.model)
  const basePrompt = semanticPrompt(input)
  const controller = new AbortController()
  const startedAt = Date.now()
  const timeout = setTimeout(() => controller.abort(), 12_000)
  let lastReason: RentalSemanticFallbackReason | null = null
  let lastDetail: string | null = null
  let lastIssues: RentalSemanticValidationIssue[] = []
  let lastFinishReason: string | null = null
  try {
    for (const attempt of [1, 2]) {
      const prompt = attempt === 1
        ? basePrompt
        : `${basePrompt}\n\nYour previous semantic JSON was invalid or incomplete. Return only one complete JSON object matching the canonical schema.`
      try {
        const output = await semanticProviderAttempt(provider, { model: input.model, prompt, signal: controller.signal })
        lastFinishReason = output.finishReason
        const latencyMs = Date.now() - startedAt
        console.log('[SEMANTIC_DIAG] rental interpreter response', {
          correlation_id: input.correlationId,
          provider,
          model: input.model,
          attempt,
          finish_reason: output.finishReason,
          candidate_count: output.candidateCount,
          content_parts: output.contentPartCount,
          output_chars: output.text.length,
          latency_ms: latencyMs,
        })
        if (!output.text) {
          lastReason = 'PROVIDER_EMPTY_RESPONSE'
          lastDetail = null
          continue
        }
        if (!cleanSemanticFinishReason(provider, output.finishReason)) {
          lastReason = output.finishReason?.toUpperCase().includes('TOKEN') ? 'SEMANTIC_RETRY_EXHAUSTED' : 'PROVIDER_ADAPTER_ERROR'
          lastDetail = output.finishReason
          continue
        }
        let parsed: unknown
        try {
          parsed = parseSemanticJson(output.text)
        } catch {
          lastReason = 'JSON_PARSE_FAILED'
          lastDetail = null
          continue
        }
        const issues = validateSemanticInterpretationPayload(parsed)
        if (issues.length) {
          lastIssues = issues
          lastReason = issues.some(issue => issue.path === 'intent') ? 'INVALID_INTENT' :
            issues.some(issue => issue.path.includes('relations')) ? 'INVALID_RELATION' :
              issues.some(issue => issue.path.includes('references')) ? 'INVALID_REFERENCE' :
                'SCHEMA_VALIDATION_FAILED'
          lastDetail = null
          continue
        }
        return {
          interpretation: normalizeSemanticInterpretation(parsed, 'llm'),
          trace: {
            semantic_source: 'llm',
            fallback_used: false,
            fallback_reason: null,
            fallback_reason_detail: null,
            interpreter_latency_ms: latencyMs,
            semantic_parse_success: true,
            semantic_retry_used: attempt > 1,
            validation_issues: [],
            finish_reason: output.finishReason,
          },
        }
      } catch (error) {
        const classified = semanticFallbackReasonFromError(error)
        lastReason = classified.reason
        lastDetail = classified.detail
        if (classified.reason !== 'JSON_PARSE_FAILED' && classified.reason !== 'PROVIDER_EMPTY_RESPONSE') break
      }
    }
    const latencyMs = Date.now() - startedAt
    return {
      interpretation: null,
      trace: {
        semantic_source: 'legacy_fallback',
        fallback_used: true,
        fallback_reason: lastReason ?? 'UNKNOWN_SEMANTIC_FAILURE',
        fallback_reason_detail: lastDetail,
        interpreter_latency_ms: latencyMs,
        semantic_parse_success: false,
        semantic_retry_used: true,
        validation_issues: lastIssues,
        finish_reason: lastFinishReason,
      },
    }
  } catch (error) {
    const latencyMs = Date.now() - startedAt
    const classified = semanticFallbackReasonFromError(error)
    console.warn('[SEMANTIC_DIAG] rental interpreter fallback', {
      correlation_id: input.correlationId,
      provider,
      message: error instanceof Error ? error.message : String(error),
      latency_ms: latencyMs,
    })
    return {
      interpretation: null,
      trace: {
        semantic_source: 'legacy_fallback',
        fallback_used: true,
        fallback_reason: classified.reason,
        fallback_reason_detail: classified.detail,
        interpreter_latency_ms: latencyMs,
        semantic_parse_success: false,
        semantic_retry_used: false,
        validation_issues: [],
        finish_reason: null,
      },
    }
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
  correlationId: string,
) {
  if (isGeminiModel(model)) {
    return callGemini(model, temperature, systemPrompt, history, userMessage, correlationId)
  }
  return callOpenAI(client, model, temperature, systemPrompt, history, userMessage)
}

async function generateRentalNaturalReply(input: {
  agent: AgentRow
  draftReply: string
  userMessage: string
  semantics: RentalSemanticInterpretation
  confirmed: Slots
  missing: SlotDef[]
  toolResults: AgentToolResult[]
  history: { role: 'user' | 'assistant'; content: string }[]
  correlationId: string
}) {
  if (input.semantics.source !== 'llm') return {
    reply: null,
    trace: {
      generator_source: 'deterministic_fallback',
      response_latency_ms: null,
      fallback_used: true,
      fallback_reason: 'semantic_source_not_llm',
      provider_retry_used: false,
      finish_reason: null,
      output_length: input.draftReply.length,
    } satisfies RentalResponseTraceMeta,
  }
  const toolBlock = formatToolResultsForPrompt(input.toolResults)
  const systemPrompt = [
    'You generate the final customer-facing reply for a car-rental operations assistant.',
    'The backend state and tool results below are authoritative. Do not invent availability, prices, booking references, statuses, vehicle IDs, or location IDs.',
    'Use the configured bot instructions for tone and language, but safety/business facts override style.',
    'Do not expose ISO datetimes, raw tool errors, internal IDs, JSON, or backend diagnostics.',
    'Do not ask for information already present in canonical state.',
    'If the operational draft says a booking request was created, keep the same status meaning unless the tool result says confirmed.',
    `Bot instructions:\n${input.agent.persona ?? ''}\n${input.agent.objective ?? ''}\nTone: ${input.agent.tone ?? ''}`,
    `Canonical state JSON:\n${JSON.stringify(input.confirmed)}`,
    `Semantic interpretation JSON:\n${JSON.stringify(input.semantics)}`,
    `Missing fields: ${input.missing.map(field => field.key).join(', ') || 'none'}`,
    `Tool results:\n${toolBlock || '(none)'}`,
    `Operational draft to preserve factually:\n${input.draftReply}`,
  ].join('\n\n')
  const startedAt = Date.now()
  try {
    const reply = isGeminiModel(input.agent.model)
      ? await callGemini(
        input.agent.model,
        Math.min(input.agent.temperature ?? 0.3, 0.4),
        systemPrompt,
        input.history.slice(-8),
        input.userMessage,
        `${input.correlationId}:response`,
      )
      : await callOpenAI(
        new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'missing-openai-key' }),
        input.agent.model,
        Math.min(input.agent.temperature ?? 0.3, 0.4),
        systemPrompt,
        input.history.slice(-8),
        input.userMessage,
      )
    console.log('[SEMANTIC_DIAG] rental response generator accepted', {
      correlation_id: input.correlationId,
      latency_ms: Date.now() - startedAt,
      output_chars: reply.length,
    })
    return {
      reply,
      trace: {
        generator_source: 'llm',
        response_latency_ms: Date.now() - startedAt,
        fallback_used: false,
        fallback_reason: null,
        provider_retry_used: false,
        finish_reason: 'STOP',
        output_length: reply.length,
      } satisfies RentalResponseTraceMeta,
    }
  } catch (error) {
    console.warn('[SEMANTIC_DIAG] rental response generator fallback', {
      correlation_id: input.correlationId,
      message: error instanceof Error ? error.message : String(error),
      latency_ms: Date.now() - startedAt,
    })
    return {
      reply: null,
      trace: {
        generator_source: 'deterministic_fallback',
        response_latency_ms: Date.now() - startedAt,
        fallback_used: true,
        fallback_reason: error instanceof Error && error.message.toLowerCase().includes('api key') ? 'MODEL_CONFIGURATION_ERROR' : 'PROVIDER_REQUEST_FAILED',
        provider_retry_used: false,
        finish_reason: null,
        output_length: input.draftReply.length,
      } satisfies RentalResponseTraceMeta,
    }
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN ROUTE HANDLER
═══════════════════════════════════════════════════════════════════════════ */

export async function POST(req: NextRequest) {
  /* 1. Parse ─────────────────────────────────────────────────────────────── */
  let body: { business_id?: unknown; bot_id?: unknown; conversation_id?: unknown; message?: unknown; attachment?: unknown; visitor_context?: unknown; debug?: unknown; test_ai?: unknown; channel?: unknown; host?: unknown; client_message_id?: unknown; request_id?: unknown; turn_id?: unknown }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const requestedBusinessId = typeof body.business_id === 'string' ? body.business_id.trim() : null
  const requestedBotId = typeof body.bot_id === 'string' ? body.bot_id.trim() : null
  const conversation_id = typeof body.conversation_id === 'string' ? body.conversation_id.trim() : null
  const message         = typeof body.message         === 'string' ? body.message.trim()         : null
  const attachmentResult = parseAttachment(body.attachment)
  const debugMode       = body.debug === true
  const testAiMode      = body.test_ai === true
  const clientMessageId = typeof body.client_message_id === 'string' && body.client_message_id.trim() ? body.client_message_id.trim().slice(0, 120) : null
  const requestId       = typeof body.request_id === 'string' && body.request_id.trim() ? body.request_id.trim().slice(0, 120) : crypto.randomUUID()
  const turnId          = typeof body.turn_id === 'string' && body.turn_id.trim() ? body.turn_id.trim().slice(0, 120) : requestId

  if (!requestedBusinessId) return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
  if (attachmentResult && 'error' in attachmentResult) return NextResponse.json({ error: attachmentResult.error }, { status: 400 })
  if (!message && !attachmentResult?.attachment) return NextResponse.json({ error: 'message is required' }, { status: 400 })
  const business_id = resolvePublicWidgetBusinessId(req, requestedBusinessId)
  if ((message ?? '').length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `message must be ${MAX_MESSAGE_LENGTH} characters or fewer` }, { status: 413 })
  }
  const messageText = message ?? attachmentResult?.attachment?.name ?? ''
  const turnStartedAt = Date.now()
  const requestChannel = typeof body.channel === 'string' && body.channel.trim() ? body.channel.trim().slice(0, 40) : 'website'
  const requestSourceHost = typeof body.host === 'string' && body.host.trim()
    ? body.host.trim().toLowerCase().slice(0, 180)
    : requestHost(req)
  const visitorContext = body.visitor_context && typeof body.visitor_context === 'object' && !Array.isArray(body.visitor_context)
    ? body.visitor_context as Record<string, unknown>
    : null
  const customerMessageMetadata = {
    sender_type: 'customer',
    delivery_status: 'delivered',
    ...(clientMessageId && { client_message_id: clientMessageId }),
    request_id: requestId,
    turn_id: turnId,
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
  let sessionUserId: string | null = null
  try {
    const session = await getSessionBusinessId()
    if (testAiMode && session.fromSession) {
      clientId     = session.clientId
      businessId   = session.businessId ?? session.clientId
      fallbackUsed = false
      sessionUserId = session.userEmail || session.ownerName || null
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

  async function insertMessageOnce(input: {
    conversationId: string
    businessId: string
    role: 'user' | 'assistant' | 'system'
    content: string
    metadata?: Record<string, unknown> | null
    idempotency?: { key: 'client_message_id' | 'turn_id'; value: string | null; role?: string }
  }): Promise<{ message: PersistedChatMessage | null; error: string | null }> {
    const fullSelect = 'id,role,content,created_at,read_at,delivery_status,metadata'
    const legacySelect = 'id,role,content,created_at,read_at,metadata'
    const fetchExisting = async () => {
      if (!input.idempotency?.value) return null
      try {
        let existingResult: { data: unknown; error: { code?: string; message: string } | null } = await sb
          .from('messages')
          .select(fullSelect)
          .eq('conversation_id', input.conversationId)
          .eq('business_id', input.businessId)
          .eq('role', input.idempotency.role ?? input.role)
          .contains('metadata', { [input.idempotency.key]: input.idempotency.value })
          .maybeSingle()
        if (existingResult.error?.code === '42703' || existingResult.error?.code === 'PGRST204') {
          existingResult = await sb
            .from('messages')
            .select(legacySelect)
            .eq('conversation_id', input.conversationId)
            .eq('business_id', input.businessId)
            .eq('role', input.idempotency.role ?? input.role)
            .contains('metadata', { [input.idempotency.key]: input.idempotency.value })
            .maybeSingle()
        }
        const existing = existingResult.data as PersistedChatMessage | null
        return existing?.id ? existing : null
      } catch { /* older schemas may not support JSON containment through PostgREST */ }
      return null
    }
    if (input.idempotency?.value) {
      const existing = await fetchExisting()
      if (existing) return { message: existing, error: null }
    }
    let insertResult: { data: unknown; error: { code?: string; message: string } | null } = await sb
      .from('messages')
      .insert({
        conversation_id: input.conversationId,
        business_id: input.businessId,
        role: input.role,
        content: input.content,
        metadata: input.metadata ?? {},
      })
      .select(fullSelect)
      .single()
    if (insertResult.error?.code === '42703' || insertResult.error?.code === 'PGRST204') {
      insertResult = await sb
        .from('messages')
        .insert({
          conversation_id: input.conversationId,
          business_id: input.businessId,
          role: input.role,
          content: input.content,
          metadata: input.metadata ?? {},
        })
        .select(legacySelect)
        .single()
    }
    if (insertResult.error?.code === '23505') {
      const existing = await fetchExisting()
      if (existing) return { message: existing, error: null }
    }
    if (insertResult.error) return { message: null, error: insertResult.error.message }
    return { message: insertResult.data as PersistedChatMessage, error: null }
  }

  const messageResponse = (message: PersistedChatMessage | null) => message ? {
    id: message.id,
    role: message.role,
    content: message.content,
    created_at: message.created_at ?? null,
    read_at: message.read_at ?? null,
    delivery_status: message.delivery_status ?? null,
    metadata: message.metadata ?? null,
  } : null

  async function findMessageByMetadata(conversationId: string, role: 'user' | 'assistant', key: 'client_message_id' | 'turn_id', value: string | null) {
    if (!value) return null
    const fullSelect = 'id,role,content,created_at,read_at,delivery_status,metadata'
    const legacySelect = 'id,role,content,created_at,read_at,metadata'
    try {
      let result: { data: unknown; error: { code?: string; message: string } | null } = await sb
        .from('messages')
        .select(fullSelect)
        .eq('conversation_id', conversationId)
        .eq('business_id', businessId)
        .eq('role', role)
        .contains('metadata', { [key]: value })
        .maybeSingle()
      if (result.error?.code === '42703' || result.error?.code === 'PGRST204') {
        result = await sb
          .from('messages')
          .select(legacySelect)
          .eq('conversation_id', conversationId)
          .eq('business_id', businessId)
          .eq('role', role)
          .contains('metadata', { [key]: value })
          .maybeSingle()
      }
      const data = result.data as PersistedChatMessage | null
      return data?.id ? data : null
    } catch {
      return null
    }
  }

  let conversationContext: {
    id: string
    business_id: string
    status: string | null
    metadata: Record<string, unknown>
    botId: string | null
  } | null = null

  if (!testAiMode && conversation_id) {
    const { data: existingConversation, error: existingConversationError } = await sb
      .from('conversations')
      .select('id,business_id,status,metadata')
      .eq('id', conversation_id)
      .maybeSingle()

    if (existingConversationError) {
      console.warn('[WidgetResolution] conversation lookup failed', {
        host: requestHost(req),
        conversation_id,
        error: existingConversationError.message,
      })
    }

    if (existingConversation?.id) {
      const metadata = existingConversation.metadata && typeof existingConversation.metadata === 'object'
        ? existingConversation.metadata as Record<string, unknown>
        : {}
      const metadataBotId = typeof metadata.bot_id === 'string' && metadata.bot_id.trim()
        ? metadata.bot_id.trim()
        : typeof metadata.agent_id === 'string' && metadata.agent_id.trim()
          ? metadata.agent_id.trim()
          : null
      conversationContext = {
        id: existingConversation.id,
        business_id: existingConversation.business_id,
        status: typeof existingConversation.status === 'string' ? existingConversation.status : null,
        metadata,
        botId: metadataBotId,
      }
      businessId = existingConversation.business_id
      clientId = existingConversation.business_id
      fallbackUsed = true
      console.log('[WidgetResolution] existing conversation context', {
        host: requestHost(req),
        source_host: requestSourceHost,
        conversation_id,
        request_business_id: requestedBusinessId,
        request_bot_id: requestedBotId,
        conversation_business_id: conversationContext.business_id,
        conversation_bot_id: conversationContext.botId,
        resolved_business_id: businessId,
        resolution_source: conversationContext.botId ? 'conversation_metadata_bot' : 'conversation_business_default_bot',
      })
    }
  }

  const liveConversationStatus = conversationContext?.status ? normalizeConversationStatus(conversationContext.status) : null
  if (!testAiMode && conversationContext?.id && (liveConversationStatus === 'live_chat' || liveConversationStatus === 'handover_requested')) {
    const extractedPatch = extractFromText(messageText)
    const hasMeaningfulPatch = Boolean(
      extractedPatch.name ||
      extractedPatch.phone ||
      extractedPatch.email ||
      extractedPatch.company ||
      extractedPatch.notes ||
      extractedPatch.service_interest ||
      extractedPatch.city ||
      extractedPatch.area,
    )
    if (!hasMeaningfulPatch) {
      const nowIso = new Date().toISOString()
      const inserted = await insertMessageOnce({
        conversationId: conversationContext.id,
        businessId,
        role: 'user',
        content: messageText,
        metadata: customerMessageMetadata,
        idempotency: { key: 'client_message_id', value: clientMessageId, role: 'user' },
      })
      if (inserted.error) return NextResponse.json({ error: inserted.error }, { status: 500 })
      await Promise.all([
        sb
          .from('conversations')
          .update({
            last_message_at: nowIso,
            unread_count: 1,
            metadata: {
              ...(conversationContext.metadata ?? {}),
              source_host: requestSourceHost,
              widget_host: requestSourceHost,
            },
          })
          .eq('id', conversationContext.id)
          .eq('business_id', businessId),
      ]).catch(error => console.warn('[POST /api/chat] live-chat fast update failed', error))
      return NextResponse.json({
        reply: null,
        conversation_id: conversationContext.id,
        customer_id: null,
        status: liveConversationStatus,
        handover: true,
        ai_reply_skipped: true,
        waiting_for_human: true,
        user_message: messageResponse(inserted.message),
      })
    }
  }

  const liveChatSettings = await getLiveChatSettings(sb, businessId)
  console.log('[LiveChatDebug] settings resolved', {
    host: requestHost(req),
    business_id: businessId,
    ai_auto_replies_enabled: liveChatSettings.ai_auto_replies_enabled,
    live_chat_enabled: liveChatSettings.live_chat_enabled,
    human_handover_enabled: liveChatSettings.human_handover_enabled,
  })

  let resolvedConversation: { convId: string; status: string | null; isNewConv: boolean } | null = null
  let resolvedBotForConversation: {
    id: string
    name: string
    businessType: string | null
    model: string | null
    resolution: string
  } | null = null

  function nextConversationMetadata(existing?: Record<string, unknown> | null) {
    return {
      ...(existing ?? {}),
      ...(resolvedBotForConversation ? {
        bot_id: resolvedBotForConversation.id,
        agent_id: resolvedBotForConversation.id,
        bot_name: resolvedBotForConversation.name,
        business_type: resolvedBotForConversation.businessType,
        model: resolvedBotForConversation.model,
        bot_resolution_source: resolvedBotForConversation.resolution,
      } : {}),
      source_host: requestSourceHost,
      widget_host: requestSourceHost,
    }
  }

  let latestConversationMetadata: Record<string, unknown> = conversationContext?.metadata ?? {}

  function pendingActionFromMissing(missingFields: SlotDef[]) {
    const next = missingFields[0]?.key
    if (!next) return 'ready'
    if (next === 'pickup_datetime') return 'ask_pickup_time'
    if (next === 'return_datetime') return 'ask_return_time'
    if (next === 'car_class') return 'ask_car_class'
    if (next === 'selected_vehicle') return 'ask_selected_vehicle'
    if (next === 'pickup_location') return 'ask_pickup_location'
    if (next === 'dropoff_location') return 'ask_dropoff_location'
    if (next === 'name') return 'ask_customer_name'
    if (next === 'phone') return 'ask_phone'
    if (next === 'email') return 'ask_email'
    return `ask_${String(next)}`
  }

  function agentStatePayload(
    confirmedState: Slots,
    missingFields: SlotDef[],
    qualificationState: string,
    userIntent: RentalUserIntent | 'NON_RENTAL',
    toolResults: AgentToolResult[] = [],
  ) {
    const previousAgentState = safeRecord(latestConversationMetadata.agent_state)
    const previousState = safeRecord(previousAgentState.state)
    const previousReferences = agentReferencesFromState(latestConversationMetadata)
    const nextReferences = referencesFromToolResults(toolResults, previousReferences, missingFields)
    const price = toolResults.find(result => result.tool === 'calculatePrice' && result.ok)?.data as {
      rentalSubtotal?: number
      rentalDays?: number
      dailyPrice?: number
      deposit?: number
    } | undefined
    const availability = toolResults.find(result => result.tool === 'checkAvailability' && result.ok)?.data as {
      available?: boolean
      requestedCar?: { id?: string | null; name?: string | null } | null
    } | undefined
    const booking = toolResults.find(result => result.tool === 'createBooking' && result.ok)?.data as {
      bookingId?: string
      bookingNumber?: string
      status?: string
    } | undefined
    const previousAvailabilityStillApplies =
      previousState.availability_checked_pickup === confirmedState.pickup_datetime &&
      previousState.availability_checked_return === confirmedState.return_datetime &&
      (
        !previousState.availability_checked_for_vehicle_id ||
        previousState.availability_checked_for_vehicle_id === confirmedState.selected_vehicle ||
        previousState.selected_vehicle === confirmedState.selected_vehicle
      )
    return {
      version: 1,
      business_id: businessId,
      bot_id: resolvedBotForConversation?.id ?? conversationContext?.botId ?? null,
      conversation_id: resolvedConversation?.convId ?? conversationContext?.id ?? conversation_id ?? null,
      business_type: normalizeBusinessType(businessType),
      timezone: 'Europe/Warsaw',
      slots: confirmedState,
      state: {
        ...confirmedState,
        customer_name: confirmedState.name,
        quote_total: price?.rentalSubtotal ?? previousState.quote_total ?? null,
        quote_days: price?.rentalDays ?? previousState.quote_days ?? null,
        daily_rate: price?.dailyPrice ?? previousState.daily_rate ?? null,
        deposit_amount: price?.deposit ?? previousState.deposit_amount ?? null,
        availability_status: typeof availability?.available === 'boolean'
          ? (availability.available ? 'available' : 'unavailable')
          : previousAvailabilityStillApplies ? previousState.availability_status ?? null : null,
        availability_checked_for_vehicle_id: availability?.requestedCar?.id ?? (previousAvailabilityStillApplies ? previousState.availability_checked_for_vehicle_id ?? null : null),
        availability_checked_pickup: availability ? confirmedState.pickup_datetime : previousAvailabilityStillApplies ? previousState.availability_checked_pickup ?? null : null,
        availability_checked_return: availability ? confirmedState.return_datetime : previousAvailabilityStillApplies ? previousState.availability_checked_return ?? null : null,
        pending_action: pendingActionFromMissing(missingFields),
        pending_question: missingFields[0]?.question ?? null,
        last_completed_step: missingFields.length ? null : 'ready',
        booking_id: booking?.bookingId ?? previousState.booking_id ?? null,
        booking_reference: booking?.bookingNumber ?? previousState.booking_reference ?? null,
        booking_confirmation_intent: userIntent === 'CONFIRM_BOOKING',
        last_user_intent: userIntent,
        last_turn_id: turnId,
      },
      missing: missingFields.map(field => field.key),
      references: nextReferences,
      last_semantically_processed_message_id: strOrNull(previousAgentState.last_semantically_processed_message_id),
      last_semantically_processed_at: strOrNull(previousAgentState.last_semantically_processed_at),
      handover_started_at: strOrNull(previousAgentState.handover_started_at),
      handover_resumed_at: strOrNull(previousAgentState.handover_resumed_at),
      updated_at: new Date().toISOString(),
    }
  }

  async function persistConversationAgentState(
    convId: string,
    confirmedState: Slots,
    missingFields: SlotDef[],
    qualificationState: string,
    userIntent: RentalUserIntent | 'NON_RENTAL',
    toolResults: AgentToolResult[] = [],
  ) {
    const metadata = nextConversationMetadata({
      ...latestConversationMetadata,
      agent_state: agentStatePayload(confirmedState, missingFields, qualificationState, userIntent, toolResults),
    })
    latestConversationMetadata = metadata
    if (conversationContext) conversationContext.metadata = metadata
    const { error } = await sb
      .from('conversations')
      .update({ metadata })
      .eq('id', convId)
      .eq('business_id', businessId)
    if (error) console.warn('[AGENT STATE] conversation metadata persist failed', {
      conversation_id: convId,
      business_id: businessId,
      code: error.code,
      message: error.message,
    })
  }

  async function persistSemanticCheckpoint(convId: string, message: PersistedChatMessage | null | undefined) {
    if (!message?.id) return
    const previousAgentState = safeRecord(latestConversationMetadata.agent_state)
    const metadata = nextConversationMetadata({
      ...latestConversationMetadata,
      agent_state: {
        ...previousAgentState,
        last_semantically_processed_message_id: message.id,
        last_semantically_processed_at: message.created_at ?? new Date().toISOString(),
      },
    })
    latestConversationMetadata = metadata
    if (conversationContext) conversationContext.metadata = metadata
    const { error } = await sb
      .from('conversations')
      .update({ metadata })
      .eq('id', convId)
      .eq('business_id', businessId)
    if (error) console.warn('[AGENT STATE] semantic checkpoint persist failed', {
      conversation_id: convId,
      business_id: businessId,
      code: error.code,
      message: error.message,
    })
  }

  async function resolveConversation() {
    if (resolvedConversation) return resolvedConversation

    let convId: string
    let status: string | null = null

    if (conversationContext?.id) {
      convId = conversationContext.id
      status = conversationContext.status
    } else {
      convId = crypto.randomUUID()
    }

    const isNewConv = convId !== conversation_id
    if (isNewConv) {
      const metadata = nextConversationMetadata()
      const { error: ce } = await sb.from('conversations').insert({
        id:              convId,
        business_id:     businessId,
        channel:         requestChannel,
        status:          'ai_active',
        unread_count:    1,
        last_message_at: new Date().toISOString(),
        metadata,
      })
      if (ce) {
        const { error: fallbackError } = await sb.from('conversations').insert({
          id:              convId,
          business_id:     businessId,
          channel:         requestChannel,
          status:          'open',
          last_message_at: new Date().toISOString(),
          metadata,
        })
        if (fallbackError) {
          console.error('[POST /api/chat] conversation insert failed:', JSON.stringify(fallbackError))
          throw new Error(`Failed to create conversation: ${fallbackError.message}`)
        }
      }
      status = 'ai_active'
      latestConversationMetadata = metadata
    } else {
      const metadata = nextConversationMetadata(conversationContext?.metadata ?? latestConversationMetadata)
      await sb
        .from('conversations')
        .update({
          last_message_at: new Date().toISOString(),
          metadata,
        })
        .eq('id', convId)
      latestConversationMetadata = metadata
      if (conversationContext) conversationContext.metadata = metadata
    }

    resolvedConversation = { convId, status, isNewConv }
    console.log('[LiveChatDebug] conversation resolved', {
      business_id: businessId,
      conversation_id: convId,
      status,
      is_new_conversation: isNewConv,
      conversation_bot_id: resolvedBotForConversation?.id ?? conversationContext?.botId ?? null,
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
    let humanConversation: { convId: string; status: string | null; isNewConv: boolean }
    try {
      humanConversation = await resolveConversation()
      convId = humanConversation.convId
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create conversation' }, { status: 500 })
    }

    const { error: userMsgErr } = await sb.from('messages').insert({
      conversation_id: convId, business_id: businessId, role: 'user', content: messageText, metadata: customerMessageMetadata,
    })
    if (userMsgErr) console.error('[POST /api/chat] live-chat user message insert failed:', JSON.stringify(userMsgErr))
    await incrementUnread(convId)
    await markConversationStatus(sb, convId, businessId, 'handover_requested')
    if (humanConversation.isNewConv) {
      await insertStatusEvent(sb, convId, businessId, 'Waiting for a human reply.', 'handover_requested')
    }
    const { data: existingLiveLead } = await sb.from('leads').select('id, name, phone, email, interest, status, metadata')
      .eq('conversation_id', convId).maybeSingle()
    const confirmed = buildConfirmedSlots(existingLiveLead as ExistingLead | null, [], messageText)
    const missing = computeMissingSlots(confirmed, defaultSlotDefsForBusinessType(null))
    const qualificationStage = computeQualificationStage(confirmed, missing)
    const hasMeaningfulLeadState = Boolean(
      existingLiveLead ||
      confirmed.name ||
      confirmed.phone ||
      confirmed.email ||
      confirmed.company ||
      confirmed.notes ||
      confirmed.service_interest ||
      confirmed.city ||
      confirmed.area,
    )
    const liveChatPersist = hasMeaningfulLeadState
      ? await persistLead(
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
      : { lead_id: null, insert_error: null }
    console.log('[LiveChatDebug] human-only persisted', {
      business_id: businessId,
      conversation_id: convId,
      lead_id: liveChatPersist.lead_id,
      lead_insert_error: liveChatPersist.insert_error,
      message_insert_error: userMsgErr?.message ?? null,
    })
    const customerId = (hasMeaningfulLeadState || humanConversation.isNewConv)
      ? await linkCustomerIdentity(convId, confirmed, liveChatPersist.lead_id)
      : null

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

  /* 4. Load selected/default bot ──────────────────────────────────────────── */
  console.log('[LiveChatDebug] entering AI branch', {
    business_id: businessId,
    requested_business_id: requestedBusinessId,
    body_business_id: business_id,
    requested_bot_id: requestedBotId,
    conversation_bot_id: conversationContext?.botId ?? null,
    ai_auto_replies_enabled: liveChatSettings.ai_auto_replies_enabled,
    live_chat_enabled: liveChatSettings.live_chat_enabled,
    human_handover_enabled: liveChatSettings.human_handover_enabled,
    test_ai: testAiMode,
  })

  const requestType = testAiMode ? 'test_ai' : 'public_widget'
  const botIdForResolution = testAiMode
    ? requestedBotId
    : conversationContext
      ? conversationContext.botId
      : requestedBotId
  if (!testAiMode && conversationContext?.botId && requestedBotId && requestedBotId !== conversationContext.botId) {
    console.warn('[WidgetResolution] ignored request bot mismatch for existing conversation', {
      host: requestHost(req),
      conversation_id: conversationContext.id,
      request_bot_id: requestedBotId,
      conversation_bot_id: conversationContext.botId,
      conversation_business_id: conversationContext.business_id,
    })
  }
  let botContext = await resolveBotContext({
    sb,
    requestType,
    businessId,
    botId: botIdForResolution,
    userId: sessionUserId,
    createDefaultForTestAi: testAiMode,
    allowExplicitBotForExistingConversation: Boolean(!testAiMode && conversationContext?.botId),
  })
  if (!testAiMode && !conversationContext && requestedBotId && !botContext.ok) {
    const explicitFailure = botContext.resolution
    const fallbackContext = await resolveBotContext({
      sb,
      requestType,
      businessId,
      botId: null,
      userId: sessionUserId,
    })
    if (fallbackContext.ok) {
      botContext = { ...fallbackContext, resolution: `ignored_stale_explicit_bot:${explicitFailure}` }
    }
  }
  logBotResolution({ requestType, userId: sessionUserId, businessId, result: botContext })

  if (!botContext.ok) {
    console.warn('[WidgetResolution] bot resolution failed', {
      host: requestHost(req),
      source_host: requestSourceHost,
      conversation_id: conversation_id ?? null,
      request_business_id: requestedBusinessId,
      request_bot_id: requestedBotId,
      conversation_business_id: conversationContext?.business_id ?? null,
      conversation_bot_id: conversationContext?.botId ?? null,
      resolved_business_id: businessId,
      fallback_reason: botContext.resolution,
      request_type: requestType,
    })
    return NextResponse.json({
      error: testAiMode ? botContext.adminMessage : botContext.publicMessage,
      details: testAiMode ? { businessId, botId: requestedBotId, resolution: botContext.resolution } : undefined,
      reply: !testAiMode && !conversationContext ? botContext.publicMessage : undefined,
      conversation_id: conversationContext?.id ?? conversation_id ?? undefined,
    }, {
      status: botContext.status,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const agent = botContext.agent as AgentRow
  const businessType = botContext.businessType
  resolvedBotForConversation = {
    id: agent.id,
    name: agent.name,
    businessType,
    model: agent.model,
    resolution: botContext.resolution,
  }
  console.log('[WidgetResolution] bot resolved for chat turn', {
    host: requestHost(req),
    source_host: requestSourceHost,
    conversation_id: conversation_id ?? null,
    request_business_id: requestedBusinessId,
    request_bot_id: requestedBotId,
    conversation_business_id: conversationContext?.business_id ?? null,
    conversation_bot_id: conversationContext?.botId ?? null,
    resolved_business_id: businessId,
    resolved_bot_id: agent.id,
    resolved_bot_name: agent.name,
    business_type: businessType,
    model: agent.model,
    resolution_source: botContext.resolution,
    instruction_preview: `${agent.persona ?? ''} ${agent.objective ?? ''}`.trim().slice(0, 80),
  })
  const botDebug = {
    id: agent.id,
    name: agent.name,
    businessId,
    businessType,
    model: agent.model,
    resolution: botContext.resolution,
    toolsEnabled: botContext.toolsEnabled,
    instructionPreview: `${agent.persona ?? ''} ${agent.objective ?? ''}`.trim().slice(0, 80),
  }

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
    sb.from('messages').select('id, role, content, created_at, metadata')
      .eq('conversation_id', convId).order('created_at', { ascending: true }).limit(40),
    sb.from('agent_qualification_fields')
      .select('field_key, label, prompt, required, sort_order')
      .eq('business_id', businessId).eq('active', true)
      .order('sort_order', { ascending: true }),
  ])

  if (leadResult.error) console.error('[POST /api/chat] lead lookup error:', JSON.stringify(leadResult.error))
  if (historyResult.error) console.error('[POST /api/chat] history lookup error:', JSON.stringify(historyResult.error))

  const existingLead = leadResult.data as ExistingLead | null
  const historyRows = ((historyResult.data as PersistedChatMessage[] | null) ?? [])
  const history      = historyRows.map(r => ({
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
  const canonicalConversationSlots = slotsFromConversationAgentState(latestConversationMetadata)
  const stateHistoryForSlots = normalizeBusinessType(businessType) === 'car_rental'
    ? historyRows
      .filter(row => row.role === 'user' || (row.role === 'assistant' && messageSenderType(row) === 'human') || row.role === 'assistant')
      .map(row => ({
        role: row.role === 'user' || messageSenderType(row) === 'human' ? 'user' : 'assistant',
        content: row.content,
      }))
    : history
  let confirmed            = buildConfirmedSlots(existingLead, stateHistoryForSlots, messageText, canonicalConversationSlots)
  confirmed                = await hydrateSelectedRentalVehicle(sb, businessId, confirmed, businessType)
  let missing              = computeMissingSlots(confirmed, slotDefs)
  let qualificationStage   = computeQualificationStage(confirmed, missing)
  let rentalSemantics: RentalSemanticInterpretation = EMPTY_RENTAL_SEMANTICS
  let semanticTrace: RentalSemanticTraceMeta = {
    semantic_source: 'deterministic',
    fallback_used: false,
    fallback_reason: null,
    interpreter_latency_ms: null,
    semantic_parse_success: false,
    finish_reason: null,
  }
  let stateChangedFields: string[] = []
  let toolExecutionLatencyMs: number | null = null
  let responseTrace: RentalResponseTraceMeta = {
    generator_source: 'deterministic_fallback',
    response_latency_ms: null,
    fallback_used: false,
    fallback_reason: null,
    provider_retry_used: false,
    finish_reason: null,
    output_length: 0,
  }
  const pendingAgentTraces: AgentTraceInsert[] = []
  const emitRentalTrace = (eventType: string, payload: Record<string, unknown>) => {
    emitAgentTrace(eventType, payload)
    pendingAgentTraces.push(agentTraceRow({
      businessId,
      botId: agent.id,
      conversationId: convId,
      turnId,
      requestId,
      eventType,
      payload,
    }))
  }
  const flushRentalTraces = async () => {
    await persistAgentTraceRows(sb, pendingAgentTraces.splice(0))
  }
  if (normalizeBusinessType(businessType) === 'car_rental') {
    const resumeDelta = unprocessedRentalMessages(latestConversationMetadata, historyRows)
    const resumeRelevantCount = resumeDelta.messages.length
    if (resumeDelta.handoverStartedAt || resumeDelta.handoverResumedAt || resumeRelevantCount > 0) {
      emitRentalTrace('rental_resume_reconciliation_started', {
        request_id: requestId,
        turn_id: turnId,
        conversation_id: convId,
        business_id: businessId,
        bot_id: agent.id,
        handover_started_at_present: Boolean(resumeDelta.handoverStartedAt),
        handover_resumed_at_present: Boolean(resumeDelta.handoverResumedAt),
        last_semantically_processed_message_id_present: Boolean(resumeDelta.checkpointId),
        messages_considered: resumeRelevantCount,
        message_roles: resumeDelta.messages.map(message => ({
          role: message.role,
          sender_type: messageSenderType(message),
        })),
      })
    }
    const interpreted = await interpretRentalSemantics({
      model: agent.model,
      agent,
      currentState: confirmed,
      history: history.map(r => ({ role: r.role === 'assistant' ? 'assistant' : 'user', content: r.content })),
      userMessage: messageText,
      qualificationStage,
      missing,
      correlationId: turnId,
    })
    semanticTrace = interpreted.trace
    rentalSemantics = interpreted.interpretation ?? deterministicSemanticFallback(messageText, confirmed)
    if (!interpreted.interpretation) {
      semanticTrace = {
        ...semanticTrace,
        semantic_source: 'legacy_fallback',
        fallback_used: true,
        fallback_reason: semanticTrace.fallback_reason ?? 'UNKNOWN_SEMANTIC_FAILURE',
      }
    }
    emitRentalTrace('rental_semantic_interpretation', {
      request_id: requestId,
      turn_id: turnId,
      conversation_id: convId,
      business_id: businessId,
      bot_id: agent.id,
      semantic_source: semanticTrace.semantic_source,
      model: agent.model,
      intent: rentalSemantics.intent,
      relations: relationTrace(rentalSemantics.relations),
      references: referenceTrace(rentalSemantics.references),
      correction_fields: rentalSemantics.corrections.map(correction => correction.field),
      confirmation: rentalSemantics.confirmation,
      confidence: rentalSemantics.confidence,
      fallback_used: semanticTrace.fallback_used,
      fallback_reason: semanticTrace.fallback_reason,
      fallback_reason_detail: semanticTrace.fallback_reason_detail ?? null,
      interpreter_latency_ms: semanticTrace.interpreter_latency_ms,
      semantic_parse_success: semanticTrace.semantic_parse_success,
      semantic_retry_used: semanticTrace.semantic_retry_used ?? false,
      validation_issues: semanticTrace.validation_issues ?? [],
      finish_reason: semanticTrace.finish_reason ?? null,
      known_state_fields: Object.entries(redactedSlotPresence(confirmed)).filter(([, present]) => present).map(([field]) => field),
    })
    const beforeReduction = confirmed
    const reduced = reduceRentalState(confirmed, rentalSemantics, history.map(r => ({ role: r.role === 'assistant' ? 'assistant' : 'user', content: r.content })))
    confirmed = await hydrateSelectedRentalVehicle(sb, businessId, reduced, businessType)
    stateChangedFields = slotChangedFields(beforeReduction, confirmed)
    missing = computeMissingSlots(confirmed, slotDefs)
    qualificationStage = computeQualificationStage(confirmed, missing)
    emitRentalTrace('rental_state_reduction', {
      turn_id: turnId,
      intent: rentalSemantics.intent,
      changed_fields: stateChangedFields,
      known_state_fields: Object.entries(redactedSlotPresence(confirmed)).filter(([, present]) => present).map(([field]) => field),
      applied_relation_types: rentalSemantics.relations.map(relation => relation.type),
      correction_fields: rentalSemantics.corrections.map(correction => correction.field),
      preserved_field_count: countPreservedFields(beforeReduction, confirmed),
      state_version: 1,
    })
    if (resumeDelta.handoverStartedAt || resumeDelta.handoverResumedAt || resumeRelevantCount > 0) {
      emitRentalTrace('rental_resume_reconciliation_completed', {
        request_id: requestId,
        turn_id: turnId,
        conversation_id: convId,
        messages_reconciled: resumeRelevantCount,
        changed_fields: stateChangedFields,
        checkpoint_will_advance: true,
        next_action: pendingActionFromMissing(missing),
      })
    }
  }
  const rentalUserIntent: RentalUserIntent | 'NON_RENTAL' = normalizeBusinessType(businessType) === 'car_rental'
    ? rentalSemanticIntentToUserIntent(rentalSemantics.intent)
    : 'NON_RENTAL'
  await persistConversationAgentState(convId, confirmed, missing, qualificationStage, rentalUserIntent)

  /* 7a. Load lead memory (non-blocking — null if table missing or no row yet) */
  let leadMemoryStr = ''
  if (existingLead?.id) {
    try {
      const mem = await loadLeadMemory(sb, businessId, existingLead.id)
      leadMemoryStr = formatMemoryForPrompt(mem)
    } catch { /* table may not exist yet — safe to ignore */ }
  }

  console.log('[SLOTS] confirmedSlots:', JSON.stringify(redactedSlotPresence(confirmed)))
  console.log('[SLOTS] missingSlots:',  missing.map(d => d.key).join(', ') || 'none')
  console.log('[SLOTS] qualificationStage:', qualificationStage)

  if (turnId) {
    const existingAssistant = await findMessageByMetadata(convId, 'assistant', 'turn_id', turnId)
    if (existingAssistant) {
      const existingUser = await findMessageByMetadata(convId, 'user', 'client_message_id', clientMessageId)
      console.log('[POST /api/chat] duplicate completed turn resolved from persisted message', {
        conversation_id: convId,
        turn_id: turnId,
        assistant_message_id: existingAssistant.id,
      })
      return NextResponse.json({
        reply: existingAssistant.content,
        conversation_id: convId,
        intent: detectDealType(messageText) ? 'inquiry' : 'greeting',
        lead_ready: !!(confirmed.name && confirmed.phone && confirmed.email),
        user_message: messageResponse(existingUser),
        assistant_message: messageResponse(existingAssistant),
        duplicate_turn: true,
      }, { headers: { 'Cache-Control': 'no-store' } })
    }
  }

  const toolsStartedAt = Date.now()
  const operationalToolResults = await runOperationalTools(sb, {
    businessId,
    businessType,
    conversationId: convId,
    message: messageText,
    semanticIntent: rentalSemantics.intent,
    needsLocationResolution: semanticNeedsLocationTool(rentalSemantics) ||
      Boolean((confirmed.pickup_location && !confirmed.pickup_location_id) || (confirmed.dropoff_location && !confirmed.dropoff_location_id)),
    slots: confirmed,
  })
  toolExecutionLatencyMs = Date.now() - toolsStartedAt
  if (normalizeBusinessType(businessType) === 'car_rental' && !confirmed.selected_vehicle) {
    const beforeToolReferenceReduction = confirmed
    const toolReduced = reduceRentalState(
      confirmed,
      rentalSemantics,
      history.map(r => ({ role: r.role === 'assistant' ? 'assistant' : 'user', content: r.content })),
      operationalToolResults,
    )
    if (toolReduced.selected_vehicle) {
      confirmed = await hydrateSelectedRentalVehicle(sb, businessId, toolReduced, businessType)
      stateChangedFields = Array.from(new Set([...stateChangedFields, ...slotChangedFields(beforeToolReferenceReduction, confirmed)]))
      missing = computeMissingSlots(confirmed, slotDefs)
      qualificationStage = computeQualificationStage(confirmed, missing)
    }
  }
  if (normalizeBusinessType(businessType) === 'car_rental' && operationalToolResults.some(result => result.tool === 'getLocations' && result.ok)) {
    const mergedLocations = applyConfiguredLocationAcceptance(
      confirmed,
      messageText,
      operationalToolResults,
      rentalSemantics,
      agentReferencesFromState(latestConversationMetadata),
    )
    if (
      mergedLocations.pickup_location !== confirmed.pickup_location ||
      mergedLocations.dropoff_location !== confirmed.dropoff_location ||
      mergedLocations.pickup_location_id !== confirmed.pickup_location_id ||
      mergedLocations.dropoff_location_id !== confirmed.dropoff_location_id
    ) {
      const beforeLocationMerge = confirmed
      confirmed = mergedLocations
      stateChangedFields = Array.from(new Set([...stateChangedFields, ...slotChangedFields(beforeLocationMerge, mergedLocations)]))
      missing = computeMissingSlots(confirmed, slotDefs)
      qualificationStage = computeQualificationStage(confirmed, missing)
    }
  }
  if (normalizeBusinessType(businessType) === 'car_rental') {
    const bookingResult = operationalToolResults.find(result => result.tool === 'createBooking')
    emitRentalTrace('rental_tool_execution', {
      turn_id: turnId,
      tools: operationalToolResults.map(result => result.tool),
      tool_count: operationalToolResults.length,
      statuses: operationalToolResults.map(result => ({ tool: result.tool, ok: result.ok })),
      authoritative_result_category: bookingResult
        ? 'booking'
        : operationalToolResults.some(result => result.tool === 'checkAvailability') ? 'availability'
          : operationalToolResults.some(result => result.tool === 'searchFleet') ? 'fleet'
            : operationalToolResults.some(result => result.tool === 'getLocations') ? 'locations'
              : operationalToolResults.length ? 'other' : 'none',
      latency_ms: toolExecutionLatencyMs,
      booking_creation: bookingResult ? {
        success: bookingResult.ok,
        status: bookingResult.ok ? strOrNull(safeRecord(bookingResult.data).status) : null,
        idempotent_existing_returned: Boolean(safeRecord(bookingResult.data).idempotent_existing_returned),
      } : null,
    })
  }
  if (operationalToolResults.length > 0 || normalizeBusinessType(businessType) === 'car_rental') {
    await persistConversationAgentState(convId, confirmed, missing, qualificationStage, rentalUserIntent, operationalToolResults)
  }
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
    const handoverStartedMetadata = nextConversationMetadata({
      ...latestConversationMetadata,
      agent_state: {
        ...safeRecord(latestConversationMetadata.agent_state),
        handover_started_at: new Date().toISOString(),
      },
    })
    latestConversationMetadata = handoverStartedMetadata
    if (conversationContext) conversationContext.metadata = handoverStartedMetadata
    await sb.from('conversations').update({ metadata: handoverStartedMetadata }).eq('id', convId).eq('business_id', businessId)
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
        bot:            botDebug,
      }
    }
    return NextResponse.json(bookingBody)
  }

  /* 9. Persist user message ──────────────────────────────────────────────── */
  const userInsert = await insertMessageOnce({
    conversationId: convId,
    businessId,
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
    idempotency: { key: 'client_message_id', value: clientMessageId, role: 'user' },
  })
  if (userInsert.error) console.error('[POST /api/chat] user message insert failed:', userInsert.error)
  await incrementUnread(convId)
  await persistSemanticCheckpoint(convId, userInsert.message)

  const deterministicRentalReply =
    deterministicRentalNextActionReply(confirmed, missing, operationalToolResults, businessType, messageText) ??
    rentalToolReplyOverride(operationalToolResults, confirmed, missing, businessType, messageText) ??
    rentalClarificationReply(confirmed, missing, businessType, messageText)

  if (deterministicRentalReply) {
    const generatedReply = await generateRentalNaturalReply({
      agent,
      draftReply: deterministicRentalReply,
      userMessage: messageText,
      semantics: rentalSemantics,
      confirmed,
      missing,
      toolResults: operationalToolResults,
      history: history.map(r => ({ role: r.role === 'assistant' ? 'assistant' as const : 'user' as const, content: r.content })),
      correlationId: turnId,
    })
    responseTrace = generatedReply.trace
    const guardedCandidate = normalizeBusinessType(businessType) === 'car_rental'
      ? enforceRentalOperationalReplyContract(generatedReply.reply ?? deterministicRentalReply, operationalToolResults)
      : generatedReply.reply ?? deterministicRentalReply
    const { reply: finalReply, blocked } = guardReply(guardedCandidate, confirmed, missing)
    const assistantInsert = await insertMessageOnce({
      conversationId: convId,
      businessId,
      role: 'assistant',
      content: finalReply,
      metadata: { sender_type: 'ai', delivery_status: 'delivered', request_id: requestId, turn_id: turnId },
      idempotency: { key: 'turn_id', value: turnId, role: 'assistant' },
    })
    if (assistantInsert.error) console.error('[POST /api/chat] deterministic rental ai-msg insert failed:', assistantInsert.error)
    emitRentalTrace('rental_response_generation', {
      turn_id: turnId,
      generator_source: responseTrace.generator_source,
      model: agent.model,
      response_latency_ms: responseTrace.response_latency_ms,
      fallback_used: responseTrace.fallback_used,
      fallback_reason: responseTrace.fallback_reason ?? null,
      provider_retry_used: responseTrace.provider_retry_used,
      finish_reason: responseTrace.finish_reason,
      output_length: finalReply.length,
      ISO_leak_validator_passed: isoLeakValidatorPassed(finalReply),
      persisted_once: Boolean(assistantInsert.message?.id),
    })
    const bookingResult = operationalToolResults.find(result => result.tool === 'createBooking')
    emitRentalTrace('rental_agent_turn_complete', {
      request_id: requestId,
      turn_id: turnId,
      semantic_source: semanticTrace.semantic_source,
      semantic_intent: rentalSemantics.intent,
      fallback_used: semanticTrace.fallback_used || responseTrace.fallback_used,
      changed_fields: stateChangedFields,
      tools_called: operationalToolResults.map(result => result.tool),
      response_generator_source: responseTrace.generator_source,
      total_latency_ms: Date.now() - turnStartedAt,
      assistant_message_id_present: Boolean(assistantInsert.message?.id),
      booking_action_attempted: Boolean(bookingResult),
      booking_action_succeeded: Boolean(bookingResult?.ok),
    })

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
      message_insert_error:     userInsert.error,
      user_message:             messageResponse(userInsert.message),
      assistant_message:        messageResponse(assistantInsert.message),
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
        bot: botDebug,
      }
    }
    await flushRentalTraces()
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
  const providerStartedAt = Date.now()
  try {
    rawReply = await callAIProvider(openai, agent.model, agent.temperature, systemPrompt, historyForLLM, messageText, turnId)
    responseTrace = {
      generator_source: 'llm',
      response_latency_ms: Date.now() - providerStartedAt,
      fallback_used: false,
      provider_retry_used: false,
      finish_reason: 'STOP',
      output_length: rawReply.length,
    }
  } catch (err) {
    if (err instanceof GeminiIncompleteResponseError) {
      rawReply =
        deterministicRentalNextActionReply(confirmed, missing, operationalToolResults, businessType, messageText) ??
        rentalToolReplyOverride(operationalToolResults, confirmed, missing, businessType, messageText) ??
        rentalClarificationReply(confirmed, missing, businessType, messageText) ??
        (missing[0]?.question ? `Thanks. ${missing[0].question}` : 'Thanks. I have the details saved and can continue from here.')
      responseTrace = {
        generator_source: 'deterministic_fallback',
        response_latency_ms: Date.now() - providerStartedAt,
        fallback_used: true,
        provider_retry_used: true,
        finish_reason: err.code,
        output_length: rawReply.length,
      }
      console.warn('[AI_DIAG] using deterministic provider recovery reply', {
        business_id: businessId,
        conversation_id: convId,
        turn_id: turnId,
        code: err.code,
      })
    } else {
    const classified = logAiProviderError(err, { businessId, model: agent.model, provider })
    return NextResponse.json({ error: classified.adminMessage }, { status: classified.responseStatus })
    }
  }

  /* 11. Guard reply — block stale/holding answers and repeated questions ─── */
  const operationalReply = rentalToolReplyOverride(operationalToolResults, confirmed, missing, businessType, messageText)
  const guardedCandidate = normalizeBusinessType(businessType) === 'car_rental'
    ? enforceRentalOperationalReplyContract(operationalReply ?? rawReply, operationalToolResults)
    : operationalReply ?? rawReply
  const { reply: finalReply, blocked } = guardReply(guardedCandidate, confirmed, missing)
  console.log('[GUARD] blockedRepeatedQuestion:', blocked)

  if (!testAiMode && aiCannotAnswer(finalReply, liveChatSettings, agent.fallback_msg) && liveChatSettings.live_chat_enabled) {
    const assistantInsert = await insertMessageOnce({
      conversationId: convId,
      businessId,
      role: 'assistant',
      content: HANDOVER_REPLY,
      metadata: { sender_type: 'ai', delivery_status: 'delivered', request_id: requestId, turn_id: turnId, handover: true },
      idempotency: { key: 'turn_id', value: turnId, role: 'assistant' },
    })
    if (assistantInsert.error) console.error('[POST /api/chat] cannot-answer handover message insert failed:', assistantInsert.error)
    await markConversationStatus(sb, convId, businessId, 'handover_requested')
    await insertStatusEvent(sb, convId, businessId, 'AI could not answer and requested human handover.', 'ai_cannot_answer')
    return NextResponse.json({
      reply: HANDOVER_REPLY,
      conversation_id: convId,
      status: 'handover_requested',
      handover: true,
      message_insert_error: userInsert.error,
      user_message: messageResponse(userInsert.message),
      assistant_message: messageResponse(assistantInsert.message),
    })
  }

  /* 12. Persist assistant reply ──────────────────────────────────────────── */
  const assistantInsert = await insertMessageOnce({
    conversationId: convId,
    businessId,
    role: 'assistant',
    content: finalReply,
    metadata: { sender_type: 'ai', delivery_status: 'delivered', request_id: requestId, turn_id: turnId },
    idempotency: { key: 'turn_id', value: turnId, role: 'assistant' },
  })
  if (assistantInsert.error) console.error('[POST /api/chat] ai message insert failed:', assistantInsert.error)
  if (normalizeBusinessType(businessType) === 'car_rental') {
    emitRentalTrace('rental_response_generation', {
      turn_id: turnId,
      generator_source: responseTrace.generator_source,
      model: agent.model,
      response_latency_ms: responseTrace.response_latency_ms,
      fallback_used: responseTrace.fallback_used,
      fallback_reason: responseTrace.fallback_reason ?? null,
      provider_retry_used: responseTrace.provider_retry_used,
      finish_reason: responseTrace.finish_reason,
      output_length: finalReply.length,
      ISO_leak_validator_passed: isoLeakValidatorPassed(finalReply),
      persisted_once: Boolean(assistantInsert.message?.id),
    })
    const bookingResult = operationalToolResults.find(result => result.tool === 'createBooking')
    emitRentalTrace('rental_agent_turn_complete', {
      request_id: requestId,
      turn_id: turnId,
      semantic_source: semanticTrace.semantic_source,
      semantic_intent: rentalSemantics.intent,
      fallback_used: semanticTrace.fallback_used || responseTrace.fallback_used,
      changed_fields: stateChangedFields,
      tools_called: operationalToolResults.map(result => result.tool),
      response_generator_source: responseTrace.generator_source,
      total_latency_ms: Date.now() - turnStartedAt,
      assistant_message_id_present: Boolean(assistantInsert.message?.id),
      booking_action_attempted: Boolean(bookingResult),
      booking_action_succeeded: Boolean(bookingResult?.ok),
    })
  }

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
    message_insert_error:     userInsert.error,
    user_message:             messageResponse(userInsert.message),
    assistant_message:        messageResponse(assistantInsert.message),
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
      bot: botDebug,
      finalSystemPrompt: systemPrompt,
    }
  }
  await flushRentalTraces()
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
    const pickupDisplay = formatCustomerDateTime(confirmed.pickup_datetime) ?? 'pickup TBD'
    const returnDisplay = formatCustomerDateTime(confirmed.return_datetime) ?? 'return TBD'
    const datesPart = confirmed.pickup_datetime || confirmed.return_datetime
      ? `, ${pickupDisplay} to ${returnDisplay}`
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
      ...(confirmed.pickup_location_id && { pickup_location_id: confirmed.pickup_location_id }),
      ...(confirmed.dropoff_location_id && { dropoff_location_id: confirmed.dropoff_location_id }),
      ...(confirmed.pickup_date && { pickup_date: confirmed.pickup_date }),
      ...(confirmed.return_date && { return_date: confirmed.return_date }),
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
