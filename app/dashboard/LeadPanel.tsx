'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Bot, Lightbulb, MessageCircle, Calendar, ArrowRight,
  SlidersHorizontal, Phone, Mail, FileText, Clock, Tag as TagIcon,
  CheckCircle, XCircle, Users, Zap, Send, AlertTriangle,
  TrendingUp, DollarSign, Target, Plus, Save, ChevronDown,
  MessageSquare, Flame, Snowflake, ThumbsUp, Trash2, Pencil,
  MapPin, Building2, Activity,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { TeamMember } from './types'
import type { Permissions } from '../lib/permissions'

/* ─── Types ──────────────────────────────────────────────────── */

type ScoreLabel = 'hot' | 'warm' | 'cold'
type LeadStatus = 'new' | 'contacted' | 'demo_booked' | 'won' | 'lost'
type ApptStatus = 'confirmed' | 'pending' | 'completed' | 'cancelled'
type FromRole   = 'user' | 'ai' | 'agent'
type TabId      = 'overview' | 'conversation' | 'notes' | 'timeline'

interface Lead {
  id: string; name: string; company: string
  email?: string; phone?: string
  source: string; interest: string; assignedAgent: string
  score: number; scoreLabel: ScoreLabel; status: LeadStatus; date: string
  auto: AutoState
  conversation_id?: string | null
  metadata?: Record<string, unknown>
}

interface AutoState {
  aiSms: string; emailSeq: string; nurture: string
  smartAssign: string; autoCall: string
}

interface ApptSummary {
  id: string; type: string; date: string; time: string
  status: ApptStatus; name: string; company: string
  notes?: string; leadId?: string
}

interface ChatMessage {
  id: string; from: FromRole; content: string
  response_time_ms: number | null; created_at: string
}

interface AISummary {
  intent:             string
  urgency:            'high' | 'medium' | 'low'
  urgencyReason:      string
  budget:             string | null
  location:           string | null
  propertyType:       string | null
  preferredViewing:   string | null
  missingInfo:        string[]
  sentiment:          'positive' | 'neutral' | 'negative'
  action:             string
  signals:            string[]
  firstClientMessage: string | null
  appointmentNote:    string | null
}

/* ─── Config ─────────────────────────────────────────────────── */

const STATUS_CFG: Record<LeadStatus, { label: string; color: string; bg: string; border: string }> = {
  new:         { label:'New',         color:'#a78bfa', bg:'rgba(167,139,250,0.10)', border:'rgba(167,139,250,0.25)' },
  contacted:   { label:'Contacted',   color:'#60a5fa', bg:'rgba(96,165,250,0.10)',  border:'rgba(96,165,250,0.25)'  },
  demo_booked: { label:'Demo Booked', color:'#fbbf24', bg:'rgba(251,191,36,0.10)',  border:'rgba(251,191,36,0.25)'  },
  won:         { label:'Won',         color:'#34d399', bg:'rgba(52,211,153,0.10)',  border:'rgba(52,211,153,0.25)'  },
  lost:        { label:'Lost',        color:'#f87171', bg:'rgba(248,113,113,0.10)', border:'rgba(248,113,113,0.25)' },
}

const SCORE_CFG: Record<ScoreLabel, { color: string; label: string; bg: string }> = {
  hot:  { color:'#f87171', label:'Hot',  bg:'rgba(248,113,113,0.12)' },
  warm: { color:'#fb923c', label:'Warm', bg:'rgba(251,146,60,0.12)'  },
  cold: { color:'#60a5fa', label:'Cold', bg:'rgba(96,165,250,0.12)'  },
}

const APPT_STATUS_CFG: Record<ApptStatus, { label: string; color: string; bg: string; border: string }> = {
  confirmed: { label:'Confirmed', color:'#34d399', bg:'rgba(52,211,153,0.07)',  border:'rgba(52,211,153,0.22)'  },
  pending:   { label:'Pending',   color:'#fbbf24', bg:'rgba(251,191,36,0.07)',  border:'rgba(251,191,36,0.22)'  },
  completed: { label:'Completed', color:'#60a5fa', bg:'rgba(96,165,250,0.07)',  border:'rgba(96,165,250,0.22)'  },
  cancelled: { label:'Cancelled', color:'#f87171', bg:'rgba(248,113,113,0.07)', border:'rgba(248,113,113,0.22)' },
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp:'WhatsApp', website:'Website Chat', email:'Email', instagram:'Instagram DM',
}

const AUTO_ROWS: { key: keyof AutoState; label: string }[] = [
  { key:'aiSms',       label:'AI SMS'         },
  { key:'emailSeq',    label:'Email Sequence'  },
  { key:'nurture',     label:'Nurture Flow'    },
  { key:'smartAssign', label:'Smart Assign'    },
  { key:'autoCall',    label:'Auto-call'       },
]

const AUTO_STATUS_COLOR: Record<string, string> = {
  sent:'#34d399', active:'#34d399', completed:'#34d399', assigned:'#34d399',
  scheduled:'#fbbf24', not_started:'rgba(255,255,255,0.2)',
  paused:'rgba(255,255,255,0.2)', off:'rgba(255,255,255,0.12)', unassigned:'rgba(255,255,255,0.15)',
}

const SURFACED_META_KEYS = new Set([
  'full_conversation','message','initial_message','notes','note','tags',
  'budget','specification','preferred_contact','city_or_location',
  'property_type','priority','appointment_date','ai_summary',
])

/* ─── Helpers ────────────────────────────────────────────────── */

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function fmtTime(iso: string): string {
  if (!iso) return ''
  if (/^\d{1,2}:\d{2}/.test(iso)) return iso.slice(0, 5)
  try { return new Date(iso).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }) }
  catch { return '' }
}

function fmtSpeed(ms: number | null): string | null {
  if (!ms || ms <= 0) return null
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) }
  catch { return iso }
}

function fmtApptFull(date: string): string {
  try {
    return new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', {
      weekday:'long', day:'numeric', month:'long', year:'numeric',
    })
  } catch { return date }
}

function formatMetaKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase())
}

function formatMetaValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'string')  return v
  if (typeof v === 'number')  return v.toLocaleString()
  if (Array.isArray(v))       return v.join(', ')
  return JSON.stringify(v)
}

/* ─── Conversation parsing ───────────────────────────────────── */

const CLIENT_RX = /^(?:client|user|customer|human|lead|visitor|you|reply|sender|guest)\s*[:\-]\s*/i
const BOT_RX    = /^(?:bot|ai|assistant|agent|system|instantdesk|support|rep|help|chatbot|operator|staff)\s*[:\-]\s*/i
const TS_RX     = /^[\[(]?\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?[\])]?\s*[-–|]?\s*/i

function parseHtmlConversation(html: string): ChatMessage[] {
  if (typeof document === 'undefined') return []
  const wrap = document.createElement('div')
  wrap.innerHTML = html
  const msgs: ChatMessage[] = []
  function detectRole(el: Element): FromRole | null {
    const check = (cls: string): FromRole | null => {
      if (/\b(visitor|client|user[-_]?msg|from[-_]?user|outgoing|sent|right|you|human|lead|customer|blue|own|mine)\b/.test(cls)) return 'user'
      if (/\b(bot|ai|assistant|agent|incoming|received|left|support|chatbot|white|other|operator)\b/.test(cls)) return 'ai'
      return null
    }
    const cls = (el.getAttribute('class') ?? '').toLowerCase()
    const role = check(cls)
    if (role) return role
    const style = (el.getAttribute('style') ?? '').toLowerCase()
    if (/text-align\s*:\s*right|float\s*:\s*right|margin-left\s*:\s*auto/.test(style)) return 'user'
    if (/text-align\s*:\s*left|float\s*:\s*left|margin-right\s*:\s*auto/.test(style))  return 'ai'
    if (el.parentElement) {
      const parentRole = check((el.parentElement.getAttribute('class') ?? '').toLowerCase())
      if (parentRole) return parentRole
    }
    return null
  }
  function walk(el: Element, depth: number) {
    if (depth > 10) return
    const blockKids = Array.from(el.children).filter(c =>
      /^(div|p|li|section|article|blockquote)$/i.test(c.tagName)
    )
    if (blockKids.length > 0) { blockKids.forEach(c => walk(c, depth + 1)); return }
    const text = (el.textContent ?? '').trim()
    if (!text) return
    const role = detectRole(el)
    if (role) msgs.push({ id:`h${msgs.length}`, from:role, content:text, response_time_ms:null, created_at:'' })
  }
  Array.from(wrap.children).forEach(c => walk(c, 0))
  return msgs
}

function parseRawTranscript(rawText: string): ChatMessage[] {
  const text = rawText.trim()
  if (!text) return []
  if (/<[a-z][\s\S]*?>/i.test(text)) {
    const htmlMsgs = parseHtmlConversation(text)
    if (htmlMsgs.length > 0) return htmlMsgs
    const stripped = text.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
    return parseRawTranscript(stripped)
  }
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const hasPfx = lines.some(l => {
    const stripped = l.replace(TS_RX, '')
    return CLIENT_RX.test(stripped) || BOT_RX.test(stripped)
  })
  if (hasPfx) {
    const msgs: ChatMessage[] = []
    let cur: ChatMessage | null = null
    for (let i = 0; i < lines.length; i++) {
      const raw  = lines[i]
      const tsM  = raw.match(/^[\[(]?(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)[\])]?/i)
      const time = tsM ? tsM[1].trim() : ''
      const line = raw.replace(TS_RX, '').trim()
      if (CLIENT_RX.test(line)) {
        if (cur) msgs.push(cur)
        cur = { id:`p${i}`, from:'user', content:line.replace(CLIENT_RX, '').trim(), response_time_ms:null, created_at:time }
      } else if (BOT_RX.test(line)) {
        if (cur) msgs.push(cur)
        cur = { id:`p${i}`, from:'ai', content:line.replace(BOT_RX, '').trim(), response_time_ms:null, created_at:time }
      } else if (cur) { cur.content += '\n' + line }
    }
    if (cur) msgs.push(cur)
    return msgs.filter(m => m.content.trim().length > 0)
  }
  return lines.map((line, i) => ({
    id:`p${i}`, from:(i%2===0?'user':'ai') as FromRole,
    content:line, response_time_ms:null, created_at:'',
  }))
}

/* ─── AI Summary — lead-specific extraction ──────────────────── */

/** Collect every client message line; falls back to full text if unlabeled. */
function extractAllClientText(convText: string): string {
  if (!convText.trim()) return ''
  const lines = convText.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const out: string[] = []
  for (const line of lines) {
    const stripped = line.replace(TS_RX, '').trim()
    if (CLIENT_RX.test(stripped)) out.push(stripped.replace(CLIENT_RX, '').trim())
  }
  return out.length > 0 ? out.join(' ') : convText
}

/** First meaningful client line (shown as verbatim quote in the UI). */
function extractFirstClientLine(text: string): string | null {
  if (!text.trim()) return null
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  for (const line of lines) {
    const stripped = line.replace(TS_RX, '').trim()
    if (CLIENT_RX.test(stripped)) {
      const content = stripped.replace(CLIENT_RX, '').trim()
      if (content.length >= 10) return content
    }
  }
  const first = lines[0]
  if (first && !BOT_RX.test(first.replace(TS_RX, '')) && first.length >= 10) return first
  return null
}

/** Detect room/bedroom count: "2-room", "3-bedroom", "studio". */
function detectRoomCount(text: string): string | null {
  if (/\bstudio\b/i.test(text) || /\bkawalerka\b/i.test(text)) return 'studio'
  const m = text.match(/\b(\d+)[\s-]*(bedroom|bed|br|room|pokój|pokoje|pokoi|zimmer|pièce)s?\b/i)
  if (m) {
    const n = m[1]; const u = m[2].toLowerCase()
    return /bed|br/.test(u) ? `${n}-bedroom` : `${n}-room`
  }
  const m2 = text.match(/\b(\d)\+\d\b/)     // Polish "2+1" notation
  if (m2) return `${m2[1]}-room`
  return null
}

/** Detect rent vs buy intent. */
function detectPurpose(text: string): 'rent' | 'buy' | null {
  if (/\b(rent|rental|renting|lease|wynajem|do wynajęcia|na wynajem|najmu|mieten)\b/i.test(text)) return 'rent'
  if (/\b(buy|buying|purchase|purchasing|for sale|kupno|kupić|nabyć|kaufen|na sprzedaż)\b/i.test(text)) return 'buy'
  return null
}

/** Detect property type keyword. */
function detectPropertyType(text: string): string | null {
  const m = text.match(
    /\b(apartment|flat|studio|penthouse|duplex|maisonette|loft|house|villa|townhouse|bungalow|mansion|cottage|office|coworking|warehouse|shop|retail space|mieszkanie|dom|kamienica|lokal|biuro)\b/i,
  )
  return m ? m[1].toLowerCase() : null
}

/** True when text signals a monthly budget. */
function detectMonthly(text: string): boolean {
  return /\b(per month|monthly|a month|\/month|\/mo|miesięcznie|monatlich|\bpm\b)/i.test(text)
}

// Interest values so generic they add no useful context to the AI summary
// or the Key Details table.  Both single words and common multi-word phrases
// are included so "General business enquiry" (a common chatbot default) is caught.
const GENERIC_INTERESTS = new Set([
  // single-word catch-alls
  'real estate', 'realestate', 'property', 'properties', 'housing', 'home', 'homes',
  'business', 'service', 'services', 'enquiry', 'inquiry', 'general', 'unknown',
  'other', 'help', 'information', 'info', 'question', 'support', 'consultation',
  'lead', 'new lead', 'contact', 'request', 'test', 'n/a', 'na', 'none',
  // multi-word generic phrases that chatbots often emit as defaults
  'general business enquiry', 'general business inquiry',
  'business enquiry', 'business inquiry',
  'general enquiry', 'general inquiry',
  'property enquiry', 'property inquiry',
  'real estate enquiry', 'real estate inquiry',
  'new enquiry', 'new inquiry',
  'customer enquiry', 'customer inquiry',
  'product enquiry', 'product inquiry',
  'sales enquiry', 'sales inquiry',
])

/** True when the interest string is specific enough to display or use as a noun. */
function isSpecificInterest(interest: string | undefined | null): boolean {
  if (!interest || interest.trim().length < 2) return false
  const lower = interest.trim().toLowerCase()
  if (/^unknown$/i.test(lower)) return false
  if (GENERIC_INTERESTS.has(lower)) return false
  // Also catch anything where EVERY word is individually generic
  const words = lower.split(/[\s,/]+/).filter(Boolean)
  if (words.length > 0 && words.every(w => GENERIC_INTERESTS.has(w))) return false
  return true
}

/**
 * Generate a lead-specific, data-driven AI summary.
 * @param apptDate  YYYY-MM-DD date of the nearest upcoming appointment.
 * @param liveText  All fetched message content (any role) joined as plain text.
 *                  Bot messages often restate requirements in cleaner language.
 */
function generateAISummary(lead: Lead, apptDate?: string, liveText?: string): AISummary {
  const meta      = lead.metadata ?? {}
  const firstName = lead.name.split(/\s+/)[0]

  // ── Use pre-generated AI summary from Make.com when available ────
  // If Make sends ai_summary in the webhook, display it verbatim instead of
  // running the rule-based extractor.  All other fields (signals, action,
  // urgency) are still computed from structured metadata as normal.
  const webhookSummary = typeof meta.ai_summary === 'string' && meta.ai_summary.trim()
    ? meta.ai_summary.trim()
    : null

  // ── Text pools ────────────────────────────────────────────────
  const convText = [meta.full_conversation, meta.message, meta.initial_message]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join('\n')
  // All text available for pattern matching — metadata transcript + live DB messages.
  // liveText includes bot turns which often confirm requirements clearly:
  //   "So you're looking for a 2-room apartment in Kraków, budget 4500 PLN/month?"
  const allText  = [convText, liveText ?? ''].filter(Boolean).join('\n')
  // Client-only text for the verbatim quote
  const clientText = [extractAllClientText(convText), extractAllClientText(liveText ?? '')].filter(Boolean).join(' ')
  const searchText = allText   // convenience alias

  // ── Structured metadata ───────────────────────────────────────
  const metaSpec  = typeof meta.specification     === 'string' ? meta.specification.trim()     : null
  const metaProp  = typeof meta.property_type     === 'string' ? meta.property_type.trim()     : null
  const metaCity  = typeof meta.city_or_location  === 'string' ? meta.city_or_location.trim()  : null
  const metaPref  = typeof meta.preferred_contact === 'string' ? meta.preferred_contact.trim() : null
  const metaTline = typeof meta.timeline          === 'string' ? meta.timeline.trim()          : null
  const metaPrio  = typeof meta.priority          === 'string' ? meta.priority.trim()          : null
  const metaAppt  = typeof meta.appointment_date  === 'string' ? meta.appointment_date.trim()  : null
  const metaTime  = typeof meta.appointment_time  === 'string' ? meta.appointment_time.trim()  : null

  // ── Budget ────────────────────────────────────────────────────
  let budget: string | null =
    typeof meta.budget === 'string' ? meta.budget :
    typeof meta.budget === 'number' ? String(meta.budget) : null
  if (!budget && searchText) {
    const bm = searchText.match(
      /(?:£|€|\$|AED|USD|EUR|GBP|PLN|zł)\s*[\d,]+(?:\s*(?:k|m|thousand|million))?|\d[\d,.]*\s*(?:k|m|thousand|million)?\s*(?:PLN|zł|EUR|USD|GBP|AED)/i,
    )
    if (bm) budget = bm[0].trim()
  }
  const isMonthly = budget ? detectMonthly(searchText) : false

  // ── Property extraction ─────────────────────────────────────────
  // Search client text first (higher signal), then fall back to all text
  // (which includes bot confirmations like "you want a 2-room flat in Kraków")
  const rooms    = detectRoomCount(clientText)    ?? detectRoomCount(allText)
  const purpose  = detectPurpose(clientText)      ?? detectPurpose(allText)
  const propType = metaProp ?? detectPropertyType(clientText) ?? detectPropertyType(allText)

  // ── Urgency ───────────────────────────────────────────────────
  const hasUrgencyWords = /\b(urgent|asap|as soon as possible|immediately|today|this week|right away)\b/i.test(searchText)
  let urgency: AISummary['urgency'] = 'low'
  if (lead.score >= 80 || lead.status === 'demo_booked') urgency = 'high'
  else if (lead.score >= 50 || lead.status === 'contacted') urgency = 'medium'
  if (metaPrio && /high|urgent/i.test(metaPrio)) urgency = 'high'
  if (hasUrgencyWords) urgency = 'high'
  else if (urgency === 'low' && /\b(soon|quickly|this month|next week)\b/i.test(searchText)) urgency = 'medium'

  let urgencyReason: string
  if (lead.status === 'demo_booked')        urgencyReason = 'viewing booked'
  else if (lead.status === 'won')           urgencyReason = 'deal won'
  else if (hasUrgencyWords)                 urgencyReason = 'mentioned urgency'
  else if (metaPrio && /high/i.test(metaPrio)) urgencyReason = 'priority flag'
  else if (lead.score >= 80)               urgencyReason = `score ${lead.score}`
  else if (urgency === 'medium')           urgencyReason = `score ${lead.score}`
  else                                     urgencyReason = 'new enquiry'

  // ── Appointment formatting ────────────────────────────────────
  const rawAppt = apptDate ?? metaAppt
  let fmtAppt: string | null = null
  if (rawAppt) {
    try {
      const d = new Date(rawAppt + (rawAppt.length === 10 ? 'T12:00:00Z' : ''))
        .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
      fmtAppt = metaTime ? `${d} at ${metaTime}` : d
    } catch { fmtAppt = rawAppt }
  }

  // ── Intent narrative ──────────────────────────────────────────
  // Target: "Asem is looking for a 2-bedroom villa in Dubai Marina, budget AED 3M."
  //         "Klaudia is looking to rent a 2-room apartment in Kraków, budget 4500 PLN/month."

  // Only use lead.interest when it's genuinely specific (not "real estate", "property", etc.)
  const interestClean = isSpecificInterest(lead.interest) ? (lead.interest!.trim()) : null

  // ── "what" noun phrase: [rooms] [rental] [type]
  const whatTokens: string[] = []
  if (rooms && rooms !== 'studio') whatTokens.push(rooms)
  if (purpose === 'rent') whatTokens.push('rental')
  if (purpose === 'buy')  whatTokens.push('for purchase')

  // typeWord: prefer extracted propType over lead.interest (avoids "a real estate")
  const typeWord = propType ?? interestClean ?? null
  if (typeWord) whatTokens.push(typeWord)

  const whatPhrase = rooms === 'studio'
    ? 'a studio apartment'
    : whatTokens.length > 0
      ? `a ${whatTokens.join(' ')}`
      : null   // no useful noun — use fallback path below

  const locationPhrase = metaCity ? ` in ${metaCity}` : ''

  // Spec as parenthetical — only when short and different from type/city
  const specPhrase =
    metaSpec &&
    metaSpec.length <= 55 &&
    metaSpec.toLowerCase() !== (propType ?? '').toLowerCase() &&
    !(metaCity ?? '').toLowerCase().includes(metaSpec.toLowerCase())
      ? ` (${metaSpec})`
      : ''

  const budgetPhrase = budget ? `, budget ${budget}${isMonthly ? '/month' : ''}` : ''

  // We have enough to write a specific sentence
  const hasStructuredData = whatPhrase || metaCity || budget || metaSpec
  let intent: string

  if (webhookSummary) {
    // ── Webhook-provided summary (highest priority) ───────────────
    // Make.com already ran a real AI — use its output verbatim.
    intent = webhookSummary
  } else if (hasStructuredData) {
    const lookingFor = whatPhrase ?? 'a property'
    intent = `${firstName} is looking for ${lookingFor}${locationPhrase}${specPhrase}${budgetPhrase}.`

    if (fmtAppt) {
      intent += ` Viewing booked for ${fmtAppt}.`
    } else if (lead.status === 'demo_booked') {
      intent += ' Viewing/demo booked — see Timeline tab for date.'
    }
    if (metaPref) intent += ` Preferred contact: ${metaPref}.`
    if (metaTline && !intent.includes(metaTline)) intent += ` Timeline: ${metaTline}.`
  } else {
    // No structured data — fall back to raw conversation text
    const said =
      extractFirstClientLine(clientText) ??
      extractFirstClientLine(allText)
    if (said) {
      intent = `${firstName} enquired: "${said.length > 130 ? said.slice(0, 128) + '…' : said}"`
      if (fmtAppt) intent += ` Viewing booked for ${fmtAppt}.`
      if (metaPref) intent += ` Preferred contact: ${metaPref}.`
    } else {
      const sourceStr = lead.source && !/^unknown$/i.test(lead.source) ? ` via ${lead.source}` : ''
      const scoreStr  = ` (score ${lead.score})`
      intent = `${firstName} submitted an enquiry${sourceStr}${scoreStr}. No conversation details captured — open the Chat tab to review.`
    }
  }

  // ── Verbatim quote (only if it adds context beyond the narrative) ──
  // Prefer meta.message → meta.initial_message → first client line in any text
  const rawMsg =
    (typeof meta.message         === 'string' && meta.message.trim().length >= 15         ? meta.message.trim()         : null) ??
    (typeof meta.initial_message === 'string' && meta.initial_message.trim().length >= 15 ? meta.initial_message.trim() : null) ??
    extractFirstClientLine(clientText) ??   // from live DB messages
    extractFirstClientLine(convText)        // from metadata transcript
  let firstClientMessage: string | null = null
  // Suppress the quote when Make already provided a full ai_summary — no duplication needed
  if (rawMsg && !webhookSummary) {
    const capped = rawMsg.length > 210 ? rawMsg.slice(0, 208) + '…' : rawMsg
    const alreadyCovered = intent.toLowerCase().includes(rawMsg.slice(0, 22).toLowerCase())
    firstClientMessage = alreadyCovered ? null : capped
  }

  // ── Appointment note (amber row in the card) ──────────────────
  const appointmentNote: string | null = fmtAppt
    ? `Viewing / appointment: ${fmtAppt}`
    : lead.status === 'demo_booked' ? 'Demo booked — check Timeline tab for exact time' : null

  // ── Signals chips ─────────────────────────────────────────────
  const signals: string[] = []
  if (budget)                               signals.push(`Budget: ${budget}${isMonthly ? '/mo' : ''}`)
  if (metaCity)                             signals.push(`Location: ${metaCity}`)
  if (propType)                             signals.push(`Type: ${propType}`)
  if (rooms)                                signals.push(`Size: ${rooms}`)
  if (metaSpec && metaSpec.length <= 40)    signals.push(`Spec: ${metaSpec}`)
  if (metaPref)                             signals.push(`Contact: ${metaPref}`)
  if (metaTline)                            signals.push(`Timeline: ${metaTline}`)
  if (lead.source && !/^unknown$/i.test(lead.source)) signals.push(`Via: ${lead.source}`)

  // ── Sentiment ─────────────────────────────────────────────────
  let sentiment: AISummary['sentiment'] = 'neutral'
  if (lead.status === 'won'  || lead.scoreLabel === 'hot')  sentiment = 'positive'
  if (lead.status === 'lost')                                sentiment = 'negative'
  if (lead.scoreLabel === 'warm' && lead.status !== 'lost') sentiment = 'positive'
  if (/\b(great|perfect|love|excellent|amazing|interested|definitely|yes please|sounds good)\b/i.test(searchText)) sentiment = 'positive'
  if (/\b(not interested|no thanks|too expensive|cancel|stop|unsubscribe)\b/i.test(searchText))                     sentiment = 'negative'

  // ── Recommended next action (real-estate specific) ────────────
  let action: string
  if (lead.status === 'lost') {
    action = `Re-engage ${firstName} in 30 days — monitor new listings matching their criteria and send a curated shortlist.`
  } else if (lead.status === 'won') {
    action = `Send ${firstName} the tenancy agreement or purchase contract. Confirm move-in date and arrange key handover.`
  } else if (fmtAppt || lead.status === 'demo_booked') {
    action = `Prepare 2–3 matching listings for ${firstName}'s viewing. Confirm the appointment 24 h before and send property previews.`
  } else if (lead.status === 'contacted') {
    action = `Follow up with ${firstName} on listings sent. Offer a viewing slot this week — re-confirm budget and location preferences.`
  } else {
    // new lead — tell agent exactly what is missing
    const missing: string[] = []
    if (!budget)   missing.push('budget')
    if (!metaCity) missing.push('preferred area')
    if (!rooms)    missing.push('size requirements')
    const qualify = missing.length > 0 ? ` Qualify: ${missing.join(', ')}.` : ''
    action = `Call ${firstName} within 2 hours.${qualify} Send 2–3 matching listings immediately.`
  }

  // ── Missing info (globally, for all lead states) ─────────────
  const missingInfo: string[] = []
  if (!budget)                        missingInfo.push('budget')
  if (!metaCity)                      missingInfo.push('preferred area')
  if (!rooms && !propType)            missingInfo.push('size requirements')
  if (!lead.phone && !lead.email)     missingInfo.push('contact details')

  return {
    intent, urgency, urgencyReason, budget, sentiment,
    action, signals, firstClientMessage, appointmentNote,
    location:         metaCity,
    propertyType:     propType,
    preferredViewing: metaPref,
    missingInfo,
  }
}

/* ─── Sub-components ─────────────────────────────────────────── */

function ConvSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-1">
      {[85, 65, 75, 55, 70].map((w, i) => (
        <div key={i} className={`flex ${i%2===0?'justify-end':'justify-start'}`}>
          <div className="rounded-2xl animate-pulse"
            style={{ width:`${w}%`, height:36,
              background: i%2===0 ? 'rgba(255,255,255,0.05)' : 'rgba(139,92,246,0.08)' }} />
        </div>
      ))}
    </div>
  )
}

function ChatBubbles({ messages, endRef }: { messages: ChatMessage[]; endRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div className="flex flex-col gap-3">
      {messages.map((msg, i) => (
        <motion.div key={msg.id}
          initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.03 }}
          className={`flex ${msg.from==='user'?'justify-end':'justify-start'}`}
        >
          <div className="max-w-[85%]">
            {msg.from !== 'user' && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-4 h-4 rounded flex items-center justify-center"
                  style={{ background:'rgba(139,92,246,0.25)' }}>
                  <Bot className="w-2.5 h-2.5 text-violet-400" />
                </div>
                <span className="text-[9px] font-bold text-violet-400/60 uppercase tracking-wider">
                  {msg.from==='agent'?'Agent':'InstantDesk AI'}
                </span>
                {fmtSpeed(msg.response_time_ms) && (
                  <span className="text-[9px] text-white/20">· {fmtSpeed(msg.response_time_ms)}</span>
                )}
              </div>
            )}
            <div className="rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap"
              style={msg.from!=='user' ? {
                background:'rgba(139,92,246,0.12)', border:'1px solid rgba(139,92,246,0.2)',
                color:'rgba(255,255,255,0.78)', borderTopLeftRadius:4,
              } : {
                background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)',
                color:'rgba(255,255,255,0.68)', borderTopRightRadius:4,
              }}>
              {msg.content}
            </div>
            {msg.created_at && (
              <div className={`text-[9px] text-white/20 mt-1 ${msg.from==='user'?'text-right':'text-left'}`}>
                {fmtTime(msg.created_at)}
              </div>
            )}
          </div>
        </motion.div>
      ))}
      <div ref={endRef} />
    </div>
  )
}

function ApptCard({
  appt, onEdit, onDelete, deleting,
}: {
  appt: ApptSummary
  onEdit?: () => void
  onDelete?: () => void
  deleting?: boolean
}) {
  const sc = APPT_STATUS_CFG[appt.status]
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ background:sc.bg, border:`1px solid ${sc.border}`, opacity: deleting ? 0.5 : 1, transition:'opacity 0.2s' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background:`${sc.color}20` }}>
            <Calendar className="w-3.5 h-3.5" style={{ color:sc.color }} />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color:`${sc.color}90` }}>
            Appointment
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ color:sc.color, background:`${sc.color}18`, border:`1px solid ${sc.color}30` }}>
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background:sc.color }} />
          {sc.label}
        </span>
      </div>
      <div className="text-sm font-bold text-white/85">{appt.type}</div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs text-white/55">
          <Calendar className="w-3 h-3 text-white/25 flex-shrink-0" />
          <span>{fmtApptFull(appt.date)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/45">
          <Clock className="w-3 h-3 text-white/20 flex-shrink-0" />
          <span>{appt.time}</span>
        </div>
      </div>
      {appt.notes && (
        <div className="flex items-start gap-2 pt-2" style={{ borderTop:`1px solid ${sc.color}18` }}>
          <TagIcon className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color:`${sc.color}60` }} />
          <p className="text-[11px] leading-relaxed" style={{ color:'rgba(255,255,255,0.45)' }}>{appt.notes}</p>
        </div>
      )}
      {(onEdit || onDelete) && (
        <div className="flex gap-2 pt-1" style={{ borderTop:`1px solid ${sc.color}12` }}>
          {onEdit && (
            <button type="button" onClick={onEdit} disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all flex-1 justify-center disabled:opacity-40"
              style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.45)' }}>
              <Pencil className="w-3 h-3" /> Edit
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={onDelete} disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all flex-1 justify-center disabled:opacity-40"
              style={{ background:'rgba(248,113,113,0.06)', border:'1px solid rgba(248,113,113,0.18)', color:'rgba(248,113,113,0.65)' }}>
              {deleting
                ? <motion.span className="w-3 h-3 rounded-full border border-red-400/30 border-t-red-400"
                    animate={{ rotate:360 }} transition={{ duration:0.7, repeat:Infinity, ease:'linear' }} />
                : <><Trash2 className="w-3 h-3" />Delete</>}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Lead Intelligence Grid ─────────────────────────────────── */

function LeadIntelligenceGrid({ ai, lead }: { ai: AISummary; lead: Lead }) {
  const urgencyColor = ai.urgency === 'high' ? '#f87171' : ai.urgency === 'medium' ? '#fbbf24' : '#60a5fa'

  const rows: { icon: React.ElementType; label: string; value: string; color?: string }[] = [
    ai.budget         ? { icon: DollarSign, label: 'Budget',    value: ai.budget,          color: '#34d399' } : null,
    ai.location       ? { icon: MapPin,     label: 'Location',  value: ai.location                          } : null,
    ai.propertyType   ? { icon: Building2,  label: 'Property',  value: ai.propertyType                      } : null,
    ai.preferredViewing ? { icon: Clock,    label: 'Viewing',   value: ai.preferredViewing                  } : null,
    { icon: Zap, label: 'Urgency', value: `${ai.urgency} — ${ai.urgencyReason}`, color: urgencyColor },
    isSpecificInterest(lead.interest)
      ? { icon: Target, label: 'Interest', value: lead.interest }
      : null,
  ].filter((r): r is NonNullable<typeof r> => r !== null)

  if (rows.length === 0 && ai.missingInfo.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Activity className="w-3.5 h-3.5 text-white/25" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Lead Intelligence</span>
      </div>
      <div className="rounded-2xl overflow-hidden" style={{ border:'1px solid rgba(255,255,255,0.07)' }}>
        {rows.map((row, i) => (
          <div key={row.label} className="flex items-start gap-3 px-4 py-2.5"
            style={{ background: i%2===0 ? 'rgba(255,255,255,0.02)' : 'transparent', borderBottom: i < rows.length - 1 || ai.missingInfo.length > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
            <row.icon className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: row.color ?? 'rgba(255,255,255,0.2)' }} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/25 w-14 flex-shrink-0">{row.label}</span>
            <span className="text-[11px] font-medium ml-auto text-right break-words leading-relaxed" style={{ color: row.color ?? 'rgba(255,255,255,0.65)' }}>{row.value}</span>
          </div>
        ))}
        {ai.missingInfo.length > 0 && (
          <div className="flex items-start gap-3 px-4 py-2.5"
            style={{ background: rows.length%2===0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
            <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-amber-400/50" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/25 w-14 flex-shrink-0">Missing</span>
            <span className="text-[11px] font-medium text-amber-400/55 ml-auto text-right">{ai.missingInfo.join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Timeline helpers ────────────────────────────────────────── */

interface TimelineEvent {
  id:    string
  label: string
  sub?:  string
  time:  string
  color: string
  Icon:  React.ElementType
}

function buildTimelineEvents(
  lead: Lead,
  messages: ChatMessage[],
  appts: ApptSummary[],
): TimelineEvent[] {
  const events: TimelineEvent[] = []

  events.push({
    id:    'lead-created',
    label: 'Lead created',
    sub:   lead.source && !/^unknown$/i.test(lead.source) ? `via ${lead.source}` : undefined,
    time:  lead.date,
    color: '#a78bfa',
    Icon:  Users,
  })

  if (messages.length > 0) {
    events.push({
      id:    'conv-started',
      label: 'Conversation started',
      time:  messages[0].created_at || lead.date,
      color: '#60a5fa',
      Icon:  MessageCircle,
    })
  }

  messages.forEach(msg => {
    if (msg.from === 'user') {
      events.push({
        id:    `u-${msg.id}`,
        label: 'User message',
        sub:   msg.content.length > 80 ? msg.content.slice(0, 78) + '…' : msg.content,
        time:  msg.created_at,
        color: 'rgba(255,255,255,0.35)',
        Icon:  MessageSquare,
      })
    } else {
      events.push({
        id:    `ai-${msg.id}`,
        label: 'AI replied',
        sub:   msg.content.length > 80 ? msg.content.slice(0, 78) + '…' : msg.content,
        time:  msg.created_at,
        color: '#818cf8',
        Icon:  Bot,
      })
    }
  })

  appts.forEach(a => {
    events.push({
      id:    `appt-${a.id}`,
      label: a.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      sub:   `${fmtApptFull(a.date)} at ${a.time}`,
      time:  `${a.date}T${a.time}`,
      color: '#fbbf24',
      Icon:  Calendar,
    })
  })

  try {
    events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
  } catch { /* leave unsorted if dates are malformed */ }

  return events
}

function TimelineView({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return null
  return (
    <div className="flex flex-col">
      {events.map((ev, i) => (
        <div key={ev.id} className="flex gap-3">
          <div className="flex flex-col items-center flex-shrink-0" style={{ width:24 }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background:`${ev.color}18`, border:`1.5px solid ${ev.color}40` }}>
              <ev.Icon className="w-3 h-3" style={{ color:ev.color }} />
            </div>
            {i < events.length - 1 && (
              <div className="w-px flex-1 mt-1 mb-1" style={{ background:'rgba(255,255,255,0.06)', minHeight:14 }} />
            )}
          </div>
          <div className="flex-1 pb-2.5" style={{ minWidth:0 }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold" style={{ color:'rgba(255,255,255,0.70)' }}>{ev.label}</span>
              {ev.time && <span className="text-[9px] text-white/25 flex-shrink-0">{fmtTime(ev.time)}</span>}
            </div>
            {ev.sub && (
              <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color:'rgba(255,255,255,0.32)' }}>{ev.sub}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── Main panel ─────────────────────────────────────────────── */

export default function LeadPanel({
  lead, appointments, onClose,
  onLeadDeleted, onLeadUpdated, onApptDeleted, onApptUpdated, onAddAppointment,
  teamMembers = [], can, actorName = 'Alex Thompson',
}: {
  lead:          Lead
  appointments?: ApptSummary[]
  onClose:       () => void
  onLeadDeleted?:    (id: string) => void
  onLeadUpdated?:    (patch: { id:string; name:string; company:string; email?:string; phone?:string; source:string; score:number }) => void
  onApptDeleted?:    (apptId: string) => void
  onApptUpdated?:    (patch: { id:string; type:string; date:string; time:string; status:ApptStatus; notes?:string; leadId?:string }) => void
  onAddAppointment?: (leadId: string) => void
  teamMembers?:      TeamMember[]
  can?:              Permissions
  actorName?:        string
}) {
  const canEdit   = can?.canEditLead   ?? true
  const canDelete = can?.canDeleteLead ?? true
  const canAddAppt  = can?.canAddAppt  ?? true
  const canEditAppt = can?.canEditAppt ?? true
  const canDelAppt  = can?.canDeleteAppt ?? true
  const statusCfg = STATUS_CFG[lead.status]
  const scoreCfg  = SCORE_CFG[lead.scoreLabel]
  const meta      = lead.metadata ?? {}

  // Fresh appointments fetched directly from the DB for this lead.
  // null = not yet fetched; [] = fetched with no results.
  const [freshAppts, setFreshAppts] = useState<ApptSummary[] | null>(null)

  const fetchFreshAppts = useCallback(() => {
    fetch(`/api/appointments?lead_id=${encodeURIComponent(lead.id)}`)
      .then(r => r.json())
      .then((d: { appointments?: { id:string; lead_id?:string|null; lead_name?:string|null; lead_company?:string|null; type?:string; scheduled_at:string; status:string; notes?:string|null }[] }) => {
        setFreshAppts((d.appointments ?? []).map(a => {
          const dt = new Date(a.scheduled_at)
          return {
            id:      a.id,
            type:    (a.type ?? 'viewing').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            date:    dt.toISOString().split('T')[0],
            time:    dt.toTimeString().slice(0, 5),
            status:  a.status as ApptStatus,
            name:    a.lead_name ?? '',
            company: a.lead_company ?? '',
            notes:   a.notes ?? undefined,
            leadId:  lead.id,
          }
        }))
      })
      .catch(() => {})
  }, [lead.id])

  // Filter, deduplicate, then sort appointments linked to this lead.
  // Merges freshly fetched rows (primary) with the parent prop (fallback / realtime).
  const leadAppts = useMemo(() => {
    const fromProp = (appointments ?? []).filter(a => a.leadId === lead.id)
    const combined = freshAppts ? [...freshAppts, ...fromProp] : fromProp
    const seen = new Set<string>()
    return combined
      .filter(a => {
        const key = a.id || `${a.date}|${a.time}|${a.type}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => {
        const aA = a.status !== 'completed' && a.status !== 'cancelled'
        const bA = b.status !== 'completed' && b.status !== 'cancelled'
        if (aA && !bA) return -1; if (!aA && bA) return 1
        return `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`)
      })
  }, [freshAppts, appointments, lead.id])

  /* ── Tab ───────────────────────────────────────────────────── */
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  /* ── Conversation ──────────────────────────────────────────── */
  const [messages,    setMessages]    = useState<ChatMessage[]>([])
  const [convLoading, setConvLoading] = useState(true)
  const [channelLabel,setChannelLabel]= useState<string | null>(null)
  const [convId,      setConvId]      = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // Fetch messages on mount — use conversation_id directly when available (fast path),
  // fall back to lead_id lookup (legacy path for older leads without conversation_id).
  useEffect(() => {
    setConvLoading(true); setMessages([]); setChannelLabel(null); setConvId(null)

    const url = lead.conversation_id
      ? `/api/lead-messages?conversation_id=${encodeURIComponent(lead.conversation_id)}`
      : `/api/lead-messages?lead_id=${encodeURIComponent(lead.id)}`

    fetch(url)
      .then(r => r.json())
      .then((d: { messages?: ChatMessage[]; channel?: string | null; conversation_id?: string | null }) => {
        setMessages(d.messages ?? [])
        setChannelLabel(d.channel ?? null)
        setConvId(d.conversation_id ?? null)
      })
      .catch(() => {})
      .finally(() => setConvLoading(false))
  }, [lead.id, lead.conversation_id])

  // Derive transcript from metadata — memoised pure computation, zero side-effects
  const rawText = useMemo<string | null>(() => {
    if (typeof meta.full_conversation === 'string' && meta.full_conversation.trim())
      return meta.full_conversation
    if (typeof meta.message === 'string' && meta.message.trim())
      return `Client: ${meta.message}`
    if (typeof meta.initial_message === 'string' && meta.initial_message.trim())
      return `Client: ${meta.initial_message}`
    return null
  }, [meta])

  const parsedTranscript = useMemo(
    () => (rawText ? parseRawTranscript(rawText) : []),
    [rawText],
  )

  // DB messages take priority; fall back to parsed metadata transcript.
  // Always sort ascending by created_at so oldest appears at top, newest at bottom.
  const fromMetadata    = messages.length === 0 && parsedTranscript.length > 0
  const displayMessages = useMemo(() => {
    const base = messages.length > 0 ? messages : parsedTranscript
    // Sort rules (strictly ascending):
    //   1. No created_at on both  → preserve original array position (keeps transcript order)
    //   2. One missing            → missing floats to top
    //   3. Different timestamps   → earlier first (ASC)
    //   4. Same timestamp         → 'user' before 'ai'/'agent', then original position
    return base
      .map((msg, idx) => ({ msg, idx }))
      .sort(({ msg: a, idx: ia }, { msg: b, idx: ib }) => {
        const noA = !a.created_at
        const noB = !b.created_at
        if (noA && noB) return ia - ib
        if (noA) return -1
        if (noB) return 1
        const cmp = a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
        if (cmp !== 0) return cmp
        if (a.from === 'user' && b.from !== 'user') return -1
        if (b.from === 'user' && a.from !== 'user') return 1
        return ia - ib
      })
      .map(({ msg }) => msg)
  }, [messages, parsedTranscript])

  // Auto-scroll to newest message when the conversation tab is open
  useEffect(() => {
    if (activeTab === 'conversation') {
      messagesEndRef.current?.scrollIntoView({ behavior:'smooth' })
    }
  }, [displayMessages.length, activeTab])

  // Realtime: subscribe to new messages for this conversation
  useEffect(() => {
    if (!convId) return
    const ch = supabase
      .channel(`lead-msgs-${convId}`)
      .on('postgres_changes',
        { event:'INSERT', schema:'public', table:'messages', filter:`conversation_id=eq.${convId}` },
        (payload) => {
          const r = payload.new as { id:string; role:string; content:string; created_at:string }
          setMessages(prev => [...prev, {
            id: r.id, from: (r.role === 'assistant' ? 'ai' : r.role) as FromRole,
            content: r.content, response_time_ms: null, created_at: r.created_at,
          }])
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [convId])

  /* ── Notes + Tags ──────────────────────────────────────────── */
  const [notesText,   setNotesText]   = useState(() =>
    typeof meta.notes === 'string' ? meta.notes :
    typeof meta.note  === 'string' ? meta.note  : ''
  )
  const [notesDirty,  setNotesDirty]  = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved,  setNotesSaved]  = useState(false)

  const [tags,    setTags]    = useState<string[]>(() => Array.isArray(meta.tags) ? meta.tags as string[] : [])
  const [newTag,  setNewTag]  = useState('')
  const [savingTags, setSavingTags] = useState(false)

  const saveNotesAndTags = useCallback(async () => {
    setSavingNotes(true)
    try {
      const merged = { ...meta, notes: notesText, tags }
      await fetch(`/api/leads/${lead.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Actor-Name': actorName },
        body:    JSON.stringify({ metadata: merged }),
      })
      setNotesDirty(false)
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2500)
    } catch { /* silently ignore */ }
    setSavingNotes(false)
  }, [lead.id, meta, notesText, tags])

  const addTag = useCallback(() => {
    const t = newTag.trim().toLowerCase()
    if (t && !tags.includes(t)) { setTags(prev => [...prev, t]); setNotesDirty(true) }
    setNewTag('')
  }, [newTag, tags])

  const removeTag = useCallback((t: string) => {
    setTags(prev => prev.filter(x => x !== t))
    setNotesDirty(true)
  }, [])

  /* ── Status actions ────────────────────────────────────────── */
  const [localStatus,    setLocalStatus]    = useState<LeadStatus>(lead.status)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  const markStatus = useCallback(async (status: LeadStatus) => {
    setLocalStatus(status)
    setUpdatingStatus(true)
    try {
      await fetch(`/api/leads/${lead.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Actor-Name': actorName },
        body:    JSON.stringify({ status }),
      })
    } catch { /* optimistic update already applied */ }
    setUpdatingStatus(false)
  }, [lead.id])

  /* ── Create appointment form ───────────────────────────────── */
  const [showApptForm, setShowApptForm] = useState(false)
  const [apptDate,     setApptDate]     = useState('')
  const [apptTime,     setApptTime]     = useState('10:00')
  const [apptType,     setApptType]     = useState('demo_call')
  const [savingAppt,   setSavingAppt]   = useState(false)
  const [apptSaved,    setApptSaved]    = useState(false)

  /* ── Delete lead ───────────────────────────────────────────── */
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deletingLead,  setDeletingLead]  = useState(false)

  /* ── Agent assignment ─────────────────────────────────────── */
  const [localAgent,   setLocalAgent]   = useState(lead.assignedAgent)
  const [assigningAgent, setAssigningAgent] = useState(false)

  const handleAssignAgent = useCallback(async (agentName: string) => {
    const prev = localAgent
    setLocalAgent(agentName)
    try {
      await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Actor-Name': actorName },
        body: JSON.stringify({ assigned_agent: agentName === 'Unassigned' ? '' : agentName }),
      })
    } catch {
      setLocalAgent(prev)
    }
    setAssigningAgent(false)
  }, [lead.id, localAgent])

  /* ── Lead edit mode ────────────────────────────────────────── */
  const [editMode,    setEditMode]    = useState(false)
  const [editName,    setEditName]    = useState(lead.name)
  const [editCompany, setEditCompany] = useState(lead.company)
  const [editEmail,   setEditEmail]   = useState(lead.email ?? '')
  const [editPhone,   setEditPhone]   = useState(lead.phone ?? '')
  const [editSource,  setEditSource]  = useState(lead.source)
  const [editScore,   setEditScore]   = useState(String(lead.score))
  const [savingEdit,  setSavingEdit]  = useState(false)
  const [editSaved,   setEditSaved]   = useState(false)

  /* ── Appointment edit / delete ─────────────────────────────── */
  const [editingApptId,  setEditingApptId]  = useState<string | null>(null)
  const [apptEditDate,   setApptEditDate]   = useState('')
  const [apptEditTime,   setApptEditTime]   = useState('')
  const [apptEditType,   setApptEditType]   = useState('demo_call')
  const [apptEditStatus, setApptEditStatus] = useState<ApptStatus>('pending')
  const [apptEditNotes,  setApptEditNotes]  = useState('')
  const [savingApptEdit, setSavingApptEdit] = useState(false)
  const [deletingApptId, setDeletingApptId] = useState<string | null>(null)

  const createAppointment = useCallback(async () => {
    if (!apptDate || !apptTime) return
    setSavingAppt(true)
    try {
      const scheduled_at = new Date(`${apptDate}T${apptTime}:00`).toISOString()
      const CLIENT_ID = process.env.NEXT_PUBLIC_DEMO_CLIENT_ID ?? '00000000-0000-0000-0000-000000000001'
      await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Actor-Name': actorName },
        body: JSON.stringify({
          client_id: CLIENT_ID, lead_id: lead.id,
          lead_name: lead.name, lead_company: lead.company,
          type: apptType, scheduled_at, status: 'pending',
        }),
      })
      fetchFreshAppts()
      setApptSaved(true)
      setTimeout(() => { setApptSaved(false); setShowApptForm(false) }, 2000)
    } catch { /* no-op */ }
    setSavingAppt(false)
  }, [apptDate, apptTime, apptType, lead, fetchFreshAppts])

  /* ── Delete lead ───────────────────────────────────────────── */
  const deleteLead = useCallback(async () => {
    setDeletingLead(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: 'DELETE', headers: { 'X-Actor-Name': actorName } })
      if (!res.ok) throw new Error('delete failed')
      onLeadDeleted?.(lead.id)
      onClose()
    } catch { /* stay open on error */ }
    setDeletingLead(false)
  }, [lead.id, onLeadDeleted, onClose])

  /* ── Save lead edits ───────────────────────────────────────── */
  const saveLeadEdit = useCallback(async () => {
    setSavingEdit(true)
    try {
      const patch = {
        name:    editName.trim()    || lead.name,
        company: editCompany.trim(),
        email:   editEmail.trim()   || null,
        phone:   editPhone.trim()   || null,
        source:  editSource.trim()  || lead.source,
        score:   Number(editScore)  || 0,
      }
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Actor-Name': actorName },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error('update failed')
      onLeadUpdated?.({ id: lead.id, ...patch, email: patch.email ?? undefined, phone: patch.phone ?? undefined })
      setEditSaved(true)
      setTimeout(() => { setEditSaved(false); setEditMode(false) }, 1800)
    } catch { /* stay in edit mode */ }
    setSavingEdit(false)
  }, [lead, editName, editCompany, editEmail, editPhone, editSource, editScore, onLeadUpdated])

  /* ── Appointment edit helpers ──────────────────────────────── */
  const startEditAppt = useCallback((appt: ApptSummary) => {
    setEditingApptId(appt.id)
    setApptEditDate(appt.date)
    setApptEditTime(appt.time)
    setApptEditType(appt.type.toLowerCase().replace(/ /g, '_'))
    setApptEditStatus(appt.status)
    setApptEditNotes(appt.notes ?? '')
  }, [])

  const saveApptEdit = useCallback(async () => {
    if (!editingApptId || !apptEditDate || !apptEditTime) return
    setSavingApptEdit(true)
    try {
      const scheduled_at = new Date(`${apptEditDate}T${apptEditTime}:00`).toISOString()
      const res = await fetch(`/api/appointments/${editingApptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Actor-Name': actorName },
        body: JSON.stringify({
          scheduled_at, type: apptEditType,
          status: apptEditStatus, notes: apptEditNotes || null,
        }),
      })
      if (!res.ok) throw new Error('update failed')
      const { appointment: a } = await res.json()
      onApptUpdated?.({
        id:     a.id,
        type:   a.type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
        date:   new Date(a.scheduled_at).toISOString().split('T')[0],
        time:   new Date(a.scheduled_at).toTimeString().slice(0, 5),
        status: a.status as ApptStatus,
        notes:  a.notes  ?? undefined,
        leadId: a.lead_id ?? lead.id,
      })
      fetchFreshAppts()
      setEditingApptId(null)
    } catch { /* stay in edit mode */ }
    setSavingApptEdit(false)
  }, [editingApptId, apptEditDate, apptEditTime, apptEditType, apptEditStatus, apptEditNotes, lead, onApptUpdated, fetchFreshAppts])

  const deleteAppt = useCallback(async (apptId: string) => {
    setDeletingApptId(apptId)
    try {
      const res = await fetch(`/api/appointments/${apptId}`, { method: 'DELETE', headers: { 'X-Actor-Name': actorName } })
      if (!res.ok) throw new Error('delete failed')
      onApptDeleted?.(apptId)
      fetchFreshAppts()
    } catch { /* no-op */ }
    setDeletingApptId(null)
  }, [onApptDeleted, fetchFreshAppts])

  // Fetch fresh appointments for this lead on mount.
  useEffect(() => { fetchFreshAppts() }, [fetchFreshAppts])

  /* ── Scroll + ESC ──────────────────────────────────────────── */
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  /* ── AI Summary — recomputes whenever messages load or lead updates ── */
  const firstUpcomingAppt = leadAppts.find(a => a.status === 'confirmed' || a.status === 'pending')
  const aiSummary = typeof meta.ai_summary === 'string' && meta.ai_summary.trim()
    ? meta.ai_summary.trim()
    : null
  const ai = useMemo(() => {
    const liveText = displayMessages.map(m => m.content).join('\n')
    return generateAISummary(
      { ...lead, status: localStatus },
      firstUpcomingAppt?.date,
      liveText || undefined,
    )
  }, [lead, localStatus, firstUpcomingAppt?.date, displayMessages])
  const urgencyColor = ai.urgency === 'high' ? '#f87171' : ai.urgency === 'medium' ? '#fbbf24' : '#60a5fa'

  /* ── Custom metadata table (excludes surfaced keys) ────────── */
  const metaEntries = Object.entries(meta).filter(([k]) => !SURFACED_META_KEYS.has(k))

  /* ── Surfaced metadata rows (budget, city, spec, etc.) ─────── */
  const surfacedRows: { label: string; value: string }[] = [
    { label:'Budget',    value: typeof meta.budget === 'string'             ? meta.budget             : '' },
    { label:'Location',  value: typeof meta.city_or_location === 'string'   ? meta.city_or_location   : '' },
    { label:'Property',  value: typeof meta.property_type === 'string'      ? meta.property_type      : '' },
    { label:'Spec',      value: typeof meta.specification === 'string'      ? meta.specification      : '' },
    { label:'Contact',   value: typeof meta.preferred_contact === 'string'  ? meta.preferred_contact  : '' },
    { label:'Priority',  value: typeof meta.priority === 'string'           ? meta.priority           : '' },
  ].filter(r => r.value)

  const currentStatusCfg = STATUS_CFG[localStatus]

  /* ── Tab definitions ───────────────────────────────────────── */
  const TABS: { id: TabId; label: string }[] = [
    { id:'overview',     label:'Overview'     },
    { id:'conversation', label:'Chat'         },
    { id:'notes',        label:'Notes'        },
    { id:'timeline',     label:'Timeline'     },
  ]

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div key="backdrop"
        initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
        className="fixed inset-0 z-40"
        style={{ background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <motion.aside key="panel"
        initial={{ x:'100%', opacity:0 }} animate={{ x:0, opacity:1 }} exit={{ x:'100%', opacity:0 }}
        transition={{ type:'spring', stiffness:300, damping:30 }}
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg overflow-y-auto"
        style={{
          background:'rgba(7,7,25,0.98)', backdropFilter:'blur(24px)',
          borderLeft:'1px solid rgba(139,92,246,0.18)',
          boxShadow:'-32px 0 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* ── Sticky header block ─────────────────────────────── */}
        <div className="sticky top-0 z-10"
          style={{ background:'rgba(7,7,25,0.98)', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>

          {/* Identity row */}
          <div className="flex items-start gap-4 px-4 sm:px-6 py-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black text-white flex-shrink-0"
              style={{ background:'linear-gradient(135deg,#7c3aed,#2563eb)' }}>
              {initials(lead.name)}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-black text-white leading-tight truncate">{lead.name}</h2>
              {lead.company && <p className="text-xs text-white/40 mt-0.5 truncate">{lead.company}</p>}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {/* Status badge */}
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ color:currentStatusCfg.color, background:currentStatusCfg.bg, border:`1px solid ${currentStatusCfg.border}` }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background:currentStatusCfg.color }} />
                  {currentStatusCfg.label}
                </span>
                {/* Score */}
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ color:scoreCfg.color, background:scoreCfg.bg }}>
                  {scoreCfg.label === 'Hot' ? <Flame className="w-3 h-3" /> : scoreCfg.label === 'Cold' ? <Snowflake className="w-3 h-3" /> : null}
                  {lead.score} · {scoreCfg.label}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {canDelete && (
                <button type="button" onClick={() => setDeleteConfirm(true)} title="Delete lead"
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
                  style={{ color:'rgba(248,113,113,0.4)' }}
                  onMouseEnter={e => { e.currentTarget.style.background='rgba(248,113,113,0.08)'; e.currentTarget.style.color='rgba(248,113,113,0.85)' }}
                  onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='rgba(248,113,113,0.4)' }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={onClose}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/80 transition-all"
                onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.background='transparent' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick actions */}
          <div className="px-4 sm:px-6 pb-3 flex flex-col gap-2">
            {/* Communication — buttons only, never <a href>, never navigates */}
            <div className="flex gap-2">
              {lead.phone && (
                <button type="button"
                  onClick={e => { e.stopPropagation(); window.open(`tel:${lead.phone}`) }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-all hover:opacity-90"
                  style={{ background:'rgba(52,211,153,0.10)', border:'1px solid rgba(52,211,153,0.2)', color:'#34d399' }}>
                  <Phone className="w-3.5 h-3.5" /> Call
                </button>
              )}
              {lead.email && (
                <button type="button"
                  onClick={e => { e.stopPropagation(); window.open(`mailto:${lead.email}`) }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-all hover:opacity-90"
                  style={{ background:'rgba(96,165,250,0.10)', border:'1px solid rgba(96,165,250,0.2)', color:'#60a5fa' }}>
                  <Mail className="w-3.5 h-3.5" /> Email
                </button>
              )}
              {lead.phone && (
                <button type="button"
                  onClick={e => { e.stopPropagation(); window.open(`https://wa.me/${lead.phone!.replace(/\D/g,'')}`, '_blank', 'noopener,noreferrer') }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-all hover:opacity-90"
                  style={{ background:'rgba(52,211,153,0.10)', border:'1px solid rgba(52,211,153,0.2)', color:'#34d399' }}>
                  <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
                </button>
              )}
              {!lead.phone && !lead.email && (
                <span className="text-xs text-white/25 py-2 px-3">No contact info</span>
              )}
            </div>
            {/* Status actions */}
            <div className="flex gap-2">
              <button type="button" onClick={e => { e.stopPropagation(); markStatus('won') }} disabled={!canEdit || updatingStatus || localStatus === 'won'}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-all disabled:opacity-40"
                style={{ background: localStatus==='won' ? 'rgba(52,211,153,0.20)' : 'rgba(52,211,153,0.08)', border:'1px solid rgba(52,211,153,0.25)', color:'#34d399' }}>
                <CheckCircle className="w-3.5 h-3.5" /> Won
              </button>
              <button type="button" onClick={e => { e.stopPropagation(); markStatus('lost') }} disabled={!canEdit || updatingStatus || localStatus === 'lost'}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-all disabled:opacity-40"
                style={{ background: localStatus==='lost' ? 'rgba(248,113,113,0.20)' : 'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.25)', color:'#f87171' }}>
                <XCircle className="w-3.5 h-3.5" /> Lost
              </button>
              <button type="button" onClick={e => { e.stopPropagation(); markStatus('demo_booked') }} disabled={!canEdit || updatingStatus || localStatus === 'demo_booked'}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-all disabled:opacity-40"
                style={{ background: localStatus==='demo_booked' ? 'rgba(251,191,36,0.20)' : 'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.25)', color:'#fbbf24' }}>
                <Calendar className="w-3.5 h-3.5" /> Demo
              </button>
              {canAddAppt && (
              <button type="button"
                onClick={e => {
                  e.stopPropagation()
                  if (onAddAppointment) {
                    onAddAppointment(lead.id)
                  } else {
                    setActiveTab('timeline')
                    setShowApptForm(v => !v)
                  }
                }}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold transition-all"
                style={{ background:'rgba(52,211,153,0.08)', border:'1px solid rgba(52,211,153,0.22)', color:'#34d399' }}>
                <Plus className="w-3.5 h-3.5" />
              </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex px-4 sm:px-6">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className="flex-1 py-2.5 text-xs font-bold transition-all relative"
                style={{ color: activeTab===t.id ? '#c4b5fd' : 'rgba(255,255,255,0.30)' }}>
                {t.label}
                {activeTab===t.id && (
                  <motion.div layoutId="tab-line"
                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                    style={{ background:'linear-gradient(90deg,#7c3aed,#2563eb)' }} />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab content ─────────────────────────────────────── */}
        <div className="px-4 sm:px-6 py-5 flex flex-col gap-5">

          {/* ═══ OVERVIEW TAB ═══ */}
          {activeTab === 'overview' && (
            <>
              {/* AI Summary */}
              <div className="rounded-2xl p-4 flex flex-col gap-3"
                style={{ background:'rgba(139,92,246,0.07)', border:'1px solid rgba(139,92,246,0.18)' }}>

                {/* Header */}
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background:'rgba(139,92,246,0.2)' }}>
                    <Bot className="w-3.5 h-3.5 text-violet-400" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-violet-400/70">AI Analysis</span>
                  <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full capitalize"
                    style={{ background:`${urgencyColor}20`, color:urgencyColor, border:`1px solid ${urgencyColor}30` }}>
                    {ai.urgency} · {ai.urgencyReason}
                  </span>
                </div>

                {/* Main summary — webhook ai_summary shown verbatim; fallback to rule-based intent */}
                <div className="text-xs text-white/75 leading-relaxed font-medium">
                  {aiSummary ?? ai.intent}
                </div>

                {/* First client message — verbatim quote; suppressed when ai_summary is present */}
                {!aiSummary && ai.firstClientMessage && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-xl"
                    style={{ background:'rgba(255,255,255,0.03)', borderLeft:'2px solid rgba(139,92,246,0.35)' }}>
                    <MessageCircle className="w-3 h-3 text-violet-400/40 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-white/50 leading-relaxed italic">
                      &ldquo;{ai.firstClientMessage}&rdquo;
                    </p>
                  </div>
                )}

                {/* Appointment note */}
                {ai.appointmentNote && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                    style={{ background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.15)' }}>
                    <Calendar className="w-3 h-3 text-amber-400/60 flex-shrink-0" />
                    <span className="text-[11px] text-amber-400/70 font-medium">{ai.appointmentNote}</span>
                  </div>
                )}

                {/* Signals chips */}
                {ai.signals.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {ai.signals.map(s => (
                      <span key={s} className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{ background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.50)', border:'1px solid rgba(255,255,255,0.08)' }}>
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                {/* Recommended action */}
                <div className="flex items-start gap-2 pt-2" style={{ borderTop:'1px solid rgba(139,92,246,0.15)' }}>
                  <Lightbulb className="w-3.5 h-3.5 text-amber-400/70 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-400/80 leading-relaxed">{ai.action}</p>
                </div>
              </div>

              {/* Lead intelligence grid */}
              <LeadIntelligenceGrid ai={ai} lead={lead} />

              {/* Contact info — buttons only */}
              {(lead.phone || lead.email) && (
                <div className="flex flex-col gap-2">
                  {lead.phone && (
                    <button type="button"
                      onClick={e => { e.stopPropagation(); window.open(`tel:${lead.phone}`) }}
                      className="flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors hover:bg-white/5 w-full text-left"
                      style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
                      <Phone className="w-3.5 h-3.5 text-emerald-400/70 flex-shrink-0" />
                      <span className="text-xs font-medium text-white/65">{lead.phone}</span>
                    </button>
                  )}
                  {lead.email && (
                    <button type="button"
                      onClick={e => { e.stopPropagation(); window.open(`mailto:${lead.email}`) }}
                      className="flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors hover:bg-white/5 w-full text-left"
                      style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
                      <Mail className="w-3.5 h-3.5 text-blue-400/70 flex-shrink-0" />
                      <span className="text-xs font-medium text-white/65 truncate">{lead.email}</span>
                    </button>
                  )}
                </div>
              )}

              {/* Key details grid / edit form */}
              {editMode ? (
                <div className="rounded-2xl p-4 flex flex-col gap-3"
                  style={{ background:'rgba(139,92,246,0.04)', border:'1px solid rgba(139,92,246,0.18)' }}>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-violet-400/60">Edit Details</div>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { label:'Name',    val:editName,    set:setEditName,    type:'text'  },
                      { label:'Company', val:editCompany, set:setEditCompany, type:'text'  },
                      { label:'Email',   val:editEmail,   set:setEditEmail,   type:'email' },
                      { label:'Phone',   val:editPhone,   set:setEditPhone,   type:'tel'   },
                      { label:'Source',  val:editSource,  set:setEditSource,  type:'text'  },
                      { label:'Score',   val:editScore,   set:setEditScore,   type:'number'},
                    ] as { label:string; val:string; set:(v:string)=>void; type:string }[]).map(f => (
                      <div key={f.label}>
                        <div className="text-[10px] text-white/30 mb-1">{f.label}</div>
                        <input type={f.type} value={f.val} onChange={e => f.set(e.target.value)}
                          min={f.type==='number'?0:undefined} max={f.type==='number'?100:undefined}
                          className="w-full px-3 py-2 rounded-lg text-xs text-white/80 outline-none"
                          style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)' }}
                          onFocus={e=>{e.currentTarget.style.border='1px solid rgba(139,92,246,0.4)'}}
                          onBlur={e=>{e.currentTarget.style.border='1px solid rgba(255,255,255,0.1)'}} />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveLeadEdit} disabled={savingEdit}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
                      style={editSaved
                        ? { background:'rgba(52,211,153,0.12)', border:'1px solid rgba(52,211,153,0.3)', color:'#34d399' }
                        : { background:'rgba(139,92,246,0.15)', border:'1px solid rgba(139,92,246,0.3)', color:'#c4b5fd' }}>
                      {savingEdit
                        ? <motion.span className="w-3.5 h-3.5 rounded-full border-2 border-violet-400/30 border-t-violet-400"
                            animate={{rotate:360}} transition={{duration:0.7,repeat:Infinity,ease:'linear'}} />
                        : editSaved
                          ? <><CheckCircle className="w-3.5 h-3.5" />Saved</>
                          : <><Save className="w-3.5 h-3.5" />Save changes</>}
                    </button>
                    <button onClick={()=>setEditMode(false)} disabled={savingEdit}
                      className="px-4 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
                      style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.35)' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-2xl overflow-hidden" style={{ border:'1px solid rgba(255,255,255,0.07)' }}>
                    {[
                      { label:'Source',   value: lead.source },
                      { label:'Interest', value: isSpecificInterest(lead.interest) ? lead.interest : '' },
                      { label:'Added',    value: fmtDate(lead.date) },
                    ].filter(r => r.value).map((row, i, arr) => (
                      <div key={row.label} className="flex items-center gap-3 px-4 py-2.5"
                        style={{ background: i%2===0 ? 'rgba(255,255,255,0.02)' : 'transparent', borderBottom: i<arr.length-1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/25 w-16 flex-shrink-0">{row.label}</span>
                        <span className="text-xs text-white/65 font-medium">{row.value}</span>
                      </div>
                    ))}
                    {/* Agent row — interactive if team members are available */}
                    <div className="flex items-center gap-3 px-4 py-2.5"
                      style={{ background:'rgba(255,255,255,0.02)' }}>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white/25 w-16 flex-shrink-0">Agent</span>
                      {teamMembers.length > 0 ? (
                        assigningAgent ? (
                          <select autoFocus
                            defaultValue={localAgent}
                            onChange={e => void handleAssignAgent(e.target.value)}
                            onBlur={() => setAssigningAgent(false)}
                            className="text-xs outline-none appearance-none rounded-lg px-2 py-0.5 -ml-2"
                            style={{ background:'rgba(139,92,246,0.12)', border:'1px solid rgba(139,92,246,0.3)', color:'#c4b5fd', colorScheme:'dark' }}>
                            <option value="Unassigned">Unassigned</option>
                            {teamMembers.map(m => (
                              <option key={m.id} value={m.name}>{m.name}</option>
                            ))}
                          </select>
                        ) : (
                          <button type="button" onClick={() => setAssigningAgent(true)}
                            className="flex items-center gap-1.5 text-xs text-white/65 font-medium hover:text-violet-300 transition-colors group"
                            title="Click to reassign">
                            <span>{localAgent}</span>
                            <ChevronDown className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                          </button>
                        )
                      ) : (
                        <span className="text-xs text-white/65 font-medium">{localAgent}</span>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <button type="button" onClick={()=>setEditMode(true)}
                      className="flex items-center gap-1.5 self-start text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all"
                      style={{ background:'rgba(139,92,246,0.08)', border:'1px solid rgba(139,92,246,0.18)', color:'rgba(167,139,250,0.7)' }}>
                      <Pencil className="w-3 h-3" /> Edit details
                    </button>
                  )}
                </>
              )}

              {/* Surfaced niche metadata */}
              {surfacedRows.length > 0 && (
                <div className="rounded-2xl overflow-hidden" style={{ border:'1px solid rgba(255,255,255,0.07)' }}>
                  {surfacedRows.map((row, i) => (
                    <div key={row.label} className="flex items-start justify-between gap-4 px-4 py-2.5"
                      style={{ background: i%2===0 ? 'rgba(255,255,255,0.02)' : 'transparent', borderBottom: i<surfacedRows.length-1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white/25 flex-shrink-0 w-16">{row.label}</span>
                      <span className="text-[11px] font-medium text-white/65 text-right break-words">{row.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Extra metadata */}
              {metaEntries.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3 h-3 text-white/25" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Custom Details</span>
                  </div>
                  <div className="rounded-2xl overflow-hidden" style={{ border:'1px solid rgba(255,255,255,0.07)' }}>
                    {metaEntries.map(([key, value], i) => (
                      <div key={key} className="flex items-start justify-between gap-4 px-4 py-2.5"
                        style={{ background: i%2===0 ? 'rgba(255,255,255,0.015)' : 'transparent', borderBottom: i<metaEntries.length-1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                        <span className="text-[11px] font-semibold text-white/35 flex-shrink-0">{formatMetaKey(key)}</span>
                        <span className="text-[11px] font-medium text-white/65 text-right break-all">{formatMetaValue(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ═══ CONVERSATION TAB ═══ */}
          {activeTab === 'conversation' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5 text-white/25" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">
                    Conversation
                  </span>
                  {displayMessages.length > 0 && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background:'rgba(139,92,246,0.14)', color:'rgba(167,139,250,0.7)' }}>
                      {displayMessages.length} msg{displayMessages.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {channelLabel && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.35)' }}>
                      {CHANNEL_LABEL[channelLabel] ?? channelLabel}
                    </span>
                  )}
                  {fromMetadata && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background:'rgba(251,191,36,0.08)', color:'rgba(251,191,36,0.6)' }}>
                      transcript
                    </span>
                  )}
                  {convId && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background:'rgba(52,211,153,0.08)', color:'#34d399' }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live
                    </span>
                  )}
                </div>
              </div>

              {convLoading ? (
                <ConvSkeleton />
              ) : displayMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 rounded-2xl"
                  style={{ background:'rgba(255,255,255,0.02)', border:'1px dashed rgba(255,255,255,0.07)' }}>
                  <MessageCircle className="w-7 h-7 text-white/10" />
                  <p className="text-sm text-white/25 font-medium">No messages saved for this conversation</p>
                </div>
              ) : (
                <ChatBubbles messages={displayMessages} endRef={messagesEndRef} />
              )}
            </div>
          )}

          {/* ═══ NOTES TAB ═══ */}
          {activeTab === 'notes' && (
            <div className="flex flex-col gap-5">
              {/* Internal notes */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-white/25" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Internal Notes</span>
                  {notesDirty
                    ? <span className="ml-auto text-[10px] text-amber-400/60">unsaved changes</span>
                    : <span className="ml-auto text-[9px] text-white/20 flex items-center gap-1">
                        <CheckCircle className="w-2.5 h-2.5" /> Saved to Supabase
                      </span>
                  }
                </div>
                <textarea
                  value={notesText}
                  onChange={e => { setNotesText(e.target.value); setNotesDirty(true); setNotesSaved(false) }}
                  placeholder="Add private notes about this lead — visible only to your team..."
                  rows={6}
                  className="w-full rounded-xl px-4 py-3 text-xs text-white/70 placeholder-white/20 outline-none resize-none leading-relaxed"
                  style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)' }}
                  onFocus={e => { e.currentTarget.style.border='1px solid rgba(139,92,246,0.35)' }}
                  onBlur={e  => { e.currentTarget.style.border='1px solid rgba(255,255,255,0.08)' }}
                />
                <button onClick={saveNotesAndTags} disabled={savingNotes || (!notesDirty && !savingNotes)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all self-end disabled:opacity-40"
                  style={notesSaved
                    ? { background:'rgba(52,211,153,0.12)', border:'1px solid rgba(52,211,153,0.25)', color:'#34d399' }
                    : { background:'rgba(139,92,246,0.12)', border:'1px solid rgba(139,92,246,0.25)', color:'#c4b5fd' }}>
                  {savingNotes ? (
                    <motion.span className="w-3.5 h-3.5 rounded-full border-2 border-violet-400/30 border-t-violet-400"
                      animate={{ rotate:360 }} transition={{ duration:0.7, repeat:Infinity, ease:'linear' }} />
                  ) : notesSaved ? (
                    <><CheckCircle className="w-3.5 h-3.5" />Saved</>
                  ) : (
                    <><Save className="w-3.5 h-3.5" />Save notes</>
                  )}
                </button>
              </div>

              {/* Tags */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-1.5">
                  <TagIcon className="w-3.5 h-3.5 text-white/25" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Tags</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tags.map(t => (
                    <motion.span key={t} layout
                      initial={{ scale:0 }} animate={{ scale:1 }}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer group"
                      style={{ background:'rgba(139,92,246,0.12)', border:'1px solid rgba(139,92,246,0.22)', color:'#c4b5fd' }}
                      onClick={() => removeTag(t)}>
                      {t}
                      <X className="w-2.5 h-2.5 opacity-50 group-hover:opacity-100 transition-opacity" />
                    </motion.span>
                  ))}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newTag}
                      onChange={e => setNewTag(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                      placeholder="Add tag…"
                      className="px-2.5 py-1 rounded-full text-[11px] outline-none w-24"
                      style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.5)' }}
                    />
                    <button onClick={addTag}
                      className="w-6 h-6 rounded-full flex items-center justify-center transition-all"
                      style={{ background:'rgba(139,92,246,0.12)', border:'1px solid rgba(139,92,246,0.22)', color:'#c4b5fd' }}>
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                {(tags.length > 0 || notesDirty) && (
                  <button onClick={saveNotesAndTags} disabled={savingNotes}
                    className="flex items-center gap-1.5 text-[10px] font-semibold self-start"
                    style={{ color: savingTags ? '#34d399' : 'rgba(139,92,246,0.7)' }}>
                    {savingNotes ? <><CheckCircle className="w-3 h-3" />Saved</> : <><Save className="w-3 h-3" />Save tags</>}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ═══ TIMELINE TAB ═══ */}
          {activeTab === 'timeline' && (
            <div className="flex flex-col gap-5">

              {/* Event timeline from messages */}
              {(() => {
                const events = buildTimelineEvents(lead, displayMessages, leadAppts)
                return events.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-white/25" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Event Timeline</span>
                    </div>
                    <div className="rounded-2xl p-4"
                      style={{ background:'rgba(255,255,255,0.015)', border:'1px solid rgba(255,255,255,0.07)' }}>
                      <TimelineView events={events} />
                    </div>
                  </div>
                ) : null
              })()}

              {/* Appointments */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-white/25" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Appointments</span>
                  </div>
                  <button onClick={() => setShowApptForm(v => !v)}
                    className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-all"
                    style={{ background:'rgba(167,139,250,0.08)', border:'1px solid rgba(167,139,250,0.2)', color:'#a78bfa' }}>
                    <Plus className="w-3 h-3" /> New
                  </button>
                </div>

                {/* Create appointment form */}
                <AnimatePresence>
                  {showApptForm && (
                    <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}
                      className="overflow-hidden">
                      <div className="rounded-2xl p-4 flex flex-col gap-3"
                        style={{ background:'rgba(167,139,250,0.05)', border:'1px solid rgba(167,139,250,0.18)' }}>
                        <div className="text-xs font-bold text-violet-400/70">Create Appointment</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-[10px] text-white/35 mb-1">Date</div>
                            <input type="date" value={apptDate} onChange={e => setApptDate(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl text-xs text-white/70 outline-none"
                              style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)' }} />
                          </div>
                          <div>
                            <div className="text-[10px] text-white/35 mb-1">Time</div>
                            <input type="time" value={apptTime} onChange={e => setApptTime(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl text-xs text-white/70 outline-none"
                              style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)' }} />
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-white/35 mb-1">Type</div>
                          <select value={apptType} onChange={e => setApptType(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl text-xs text-white/70 outline-none"
                            style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)' }}>
                            <option value="demo_call">Demo Call</option>
                            <option value="discovery_call">Discovery Call</option>
                            <option value="onboarding">Onboarding</option>
                            <option value="follow_up">Follow-up</option>
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={createAppointment} disabled={savingAppt || !apptDate}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold disabled:opacity-40 transition-all"
                            style={{ background:'rgba(167,139,250,0.15)', border:'1px solid rgba(167,139,250,0.3)', color:'#c4b5fd' }}>
                            {savingAppt ? (
                              <motion.span className="w-3.5 h-3.5 rounded-full border-2 border-violet-400/30 border-t-violet-400"
                                animate={{ rotate:360 }} transition={{ duration:0.7, repeat:Infinity, ease:'linear' }} />
                            ) : apptSaved ? (
                              <><CheckCircle className="w-3.5 h-3.5" />Booked!</>
                            ) : (
                              <><Send className="w-3.5 h-3.5" />Book</>
                            )}
                          </button>
                          <button onClick={() => setShowApptForm(false)}
                            className="px-4 py-2 rounded-xl text-xs font-semibold transition-all"
                            style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.35)' }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {leadAppts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 rounded-2xl"
                    style={{ background:'rgba(255,255,255,0.02)', border:'1px dashed rgba(255,255,255,0.07)' }}>
                    <Calendar className="w-6 h-6 text-white/10" />
                    <p className="text-xs text-white/25 font-medium">No appointments yet</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {leadAppts.map(appt => (
                      <div key={appt.id}>
                        {editingApptId === appt.id ? (
                          /* ── Inline edit form ── */
                          <div className="rounded-2xl p-4 flex flex-col gap-3"
                            style={{ background:'rgba(167,139,250,0.05)', border:'1px solid rgba(167,139,250,0.2)' }}>
                            <div className="text-xs font-bold text-violet-400/70">Edit Appointment</div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-[10px] text-white/35 mb-1">Date</div>
                                <input type="date" value={apptEditDate} onChange={e=>setApptEditDate(e.target.value)}
                                  className="w-full px-3 py-2 rounded-xl text-xs text-white/70 outline-none"
                                  style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', colorScheme:'dark' }} />
                              </div>
                              <div>
                                <div className="text-[10px] text-white/35 mb-1">Time</div>
                                <input type="time" value={apptEditTime} onChange={e=>setApptEditTime(e.target.value)}
                                  className="w-full px-3 py-2 rounded-xl text-xs text-white/70 outline-none"
                                  style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)' }} />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-[10px] text-white/35 mb-1">Type</div>
                                <select value={apptEditType} onChange={e=>setApptEditType(e.target.value)}
                                  className="w-full px-3 py-2 rounded-xl text-xs text-white/70 outline-none"
                                  style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)' }}>
                                  <option value="demo_call">Demo Call</option>
                                  <option value="discovery_call">Discovery Call</option>
                                  <option value="onboarding">Onboarding</option>
                                  <option value="follow_up">Follow-up</option>
                                </select>
                              </div>
                              <div>
                                <div className="text-[10px] text-white/35 mb-1">Status</div>
                                <select value={apptEditStatus} onChange={e=>setApptEditStatus(e.target.value as ApptStatus)}
                                  className="w-full px-3 py-2 rounded-xl text-xs text-white/70 outline-none"
                                  style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)' }}>
                                  <option value="pending">Pending</option>
                                  <option value="confirmed">Confirmed</option>
                                  <option value="completed">Completed</option>
                                  <option value="cancelled">Cancelled</option>
                                </select>
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-white/35 mb-1">Notes (optional)</div>
                              <input type="text" value={apptEditNotes} onChange={e=>setApptEditNotes(e.target.value)}
                                placeholder="Add a note…"
                                className="w-full px-3 py-2 rounded-xl text-xs text-white/70 outline-none"
                                style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)' }} />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={saveApptEdit} disabled={savingApptEdit || !apptEditDate}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold disabled:opacity-40 transition-all"
                                style={{ background:'rgba(167,139,250,0.15)', border:'1px solid rgba(167,139,250,0.3)', color:'#c4b5fd' }}>
                                {savingApptEdit
                                  ? <motion.span className="w-3.5 h-3.5 rounded-full border-2 border-violet-400/30 border-t-violet-400"
                                      animate={{rotate:360}} transition={{duration:0.7,repeat:Infinity,ease:'linear'}} />
                                  : <><Save className="w-3.5 h-3.5" />Save</>}
                              </button>
                              <button onClick={()=>setEditingApptId(null)}
                                className="px-4 py-2 rounded-xl text-xs font-semibold transition-all"
                                style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.35)' }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <ApptCard
                            appt={appt}
                            onEdit={canEditAppt ? () => startEditAppt(appt) : undefined}
                            onDelete={canDelAppt ? () => deleteAppt(appt.id) : undefined}
                            deleting={deletingApptId === appt.id}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Follow-up automation status */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-white/25" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Automation Status</span>
                </div>
                <div className="rounded-2xl overflow-hidden" style={{ border:'1px solid rgba(255,255,255,0.07)' }}>
                  {AUTO_ROWS.map(({ key, label }, i) => {
                    const status = lead.auto?.[key] ?? 'off'
                    const color  = AUTO_STATUS_COLOR[status] ?? 'rgba(255,255,255,0.15)'
                    const isActive = ['sent','active','completed','assigned'].includes(status)
                    return (
                      <div key={key} className="flex items-center justify-between px-4 py-3"
                        style={{ background: i%2===0 ? 'rgba(255,255,255,0.02)' : 'transparent', borderBottom: i<AUTO_ROWS.length-1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                        <span className="text-xs text-white/55">{label}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full capitalize"
                          style={{ background:`${color}18`, color, border:`1px solid ${color}30` }}>
                          {status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

        </div>
      </motion.aside>

      {/* ── Delete confirmation modal ────────────────────────── */}
      <AnimatePresence>
        {deleteConfirm && (
          <>
            <motion.div key="del-bd"
              initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
              className="fixed inset-0 z-[60]"
              style={{ background:'rgba(0,0,0,0.72)' }}
              onClick={() => !deletingLead && setDeleteConfirm(false)} />
            <motion.div key="del-modal"
              initial={{ opacity:0, scale:0.95, y:16 }}
              animate={{ opacity:1, scale:1,    y:0   }}
              exit={{   opacity:0, scale:0.95, y:16  }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-[min(360px,calc(100vw-2rem))] rounded-2xl p-6 flex flex-col gap-4"
              style={{ background:'rgba(10,10,30,0.99)', border:'1px solid rgba(248,113,113,0.3)', boxShadow:'0 32px 80px rgba(0,0,0,0.8)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background:'rgba(248,113,113,0.12)', border:'1px solid rgba(248,113,113,0.25)' }}>
                  <Trash2 className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Delete {lead.name}?</div>
                  <div className="text-xs text-white/35 mt-0.5">This cannot be undone.</div>
                </div>
              </div>
              <p className="text-xs text-white/45 leading-relaxed">
                Permanently deletes this lead and all related appointments, conversations, messages, and activity logs.
              </p>
              <div className="flex gap-2">
                <button onClick={deleteLead} disabled={deletingLead}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                  style={{ background:'rgba(248,113,113,0.15)', border:'1px solid rgba(248,113,113,0.3)', color:'#f87171' }}>
                  {deletingLead
                    ? <motion.span className="w-4 h-4 rounded-full border-2 border-red-400/30 border-t-red-400"
                        animate={{rotate:360}} transition={{duration:0.7,repeat:Infinity,ease:'linear'}} />
                    : <><Trash2 className="w-3.5 h-3.5" />Delete permanently</>}
                </button>
                <button onClick={() => setDeleteConfirm(false)} disabled={deletingLead}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
                  style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.45)' }}>
                  Cancel
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </AnimatePresence>
  )
}
