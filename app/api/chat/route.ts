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
import { createAdminClient } from '../../lib/supabase-server'
import { logEvent } from '../_lib/logEvent'
import { getSessionBusinessId } from '../../lib/getSessionBusinessId'

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
  city:          string | null
  area:          string | null   // district / neighbourhood within city
  budget:        string | null
  property_type: string | null
  rooms:         string | null
  deal_type:     string | null
  viewing_time:  string | null
}

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

/* ════════════════════════════════════════════════════════════════════════════
   GENERIC HELPERS
═══════════════════════════════════════════════════════════════════════════ */

function strOrNull(v: unknown): string | null {
  if (typeof v === 'string' && v.trim() && v.toLowerCase() !== 'null') return v.trim()
  return null
}

function hasAnySlot(s: Slots): boolean {
  return Object.values(s).some(v => v !== null)
}

function hasMeaningfulSlot(s: Slots): boolean {
  return !!(s.name || s.phone || s.email || s.city || s.deal_type || s.property_type || s.budget || s.rooms || s.viewing_time)
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
  const isMonthly = /\b(per month|\/month|\/mo|monthly|\bpm\b|miesięcznie)\b/i.test(text)
  const suffix    = isMonthly ? '/month' : ''
  // Symbol before number: £2500, €3000, $2000, AED 5000
  let m = text.match(/(£|€|\$|AED|USD|EUR|GBP|PLN|zł)\s*([\d,]{2,7}(?:\.\d{1,2})?)/i)
  if (m) return `${m[1]}${m[2].replace(/,/g,'')}${suffix}`
  // Number before currency: 3000 PLN, 3500 zł
  m = text.match(/([\d,]{3,7})\s*(PLN|zł|EUR|GBP|USD|AED)/i)
  if (m) return `${m[1].replace(/,/g,'')} ${m[2]}${suffix}`
  // Bare number ≥500 with month context, or "around 3000", "up to 4000"
  m = text.match(/(?:around|about|up to|max(?:imum)?|upto|approx\.?)?\s*([\d,]{3,6})\b/i)
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
//
// Two-step extraction — finds the phrase case-insensitively, then matches
// TitleCase words WITHOUT the /i flag so lowercase words (like "phone",
// "email", "number") naturally stop the match.
//
// Guards against:
//   "my name is Sally phone number 123…"  → "Sally"
//   "my name is Omar, phone is 123…"       → "Omar"
//   "I'm Anna, email anna@test.com"         → "Anna"

const VERB_GUARD = /^(?:looking|searching|interested|ready|available|trying|want|hoping|here|calling|writing|just|also|currently|from|based|a|an|the)\b/i
const TITLE_CASE_RE = /^([A-ZÀÁÂÃÄÅ][a-zà-ž]+(?:\s+[A-ZÀÁÂÃÄÅ][a-zà-ž]+)?)/

function extractName(text: string): string | null {
  let ph: RegExpMatchArray | null

  // "my name is Sally" / "my name is Sally Smith"
  ph = text.match(/\bmy name is\s+/i)
  if (ph?.index !== undefined) {
    const after = text.slice(ph.index + ph[0].length)
    const m = TITLE_CASE_RE.exec(after)
    if (m) return m[1]
  }

  // "I'm Anna" / "I'm John Smith" — guard against "I'm looking for…"
  ph = text.match(/\bI(?:'m| am)\s+/i)
  if (ph?.index !== undefined) {
    const after = text.slice(ph.index + ph[0].length)
    if (!VERB_GUARD.test(after)) {
      // Prefer two TitleCase words (first + last); accept one if followed by comma/end
      const two = after.match(/^([A-ZÀÁÂÃÄÅ][a-zà-ž]+\s+[A-ZÀÁÂÃÄÅ][a-zà-ž]+)/)
      if (two) return two[1]
      const one = after.match(/^([A-ZÀÁÂÃÄÅ][a-zà-ž]+)(?=[,.\s]|$)/)
      if (one) return one[1]
    }
  }

  // "call me Sally"
  ph = text.match(/\bcall me\s+/i)
  if (ph?.index !== undefined) {
    const after = text.slice(ph.index + ph[0].length)
    const m = TITLE_CASE_RE.exec(after)
    if (m) return m[1]
  }

  // "name is X" / "name's X" / "this is X"
  ph = text.match(/\b(?:name(?:'s| is)|this is)\s+/i)
  if (ph?.index !== undefined) {
    const after = text.slice(ph.index + ph[0].length)
    if (!VERB_GUARD.test(after)) {
      const m = TITLE_CASE_RE.exec(after)
      if (m) return m[1]
    }
  }

  return null
}

/* ── Phone ─────────────────────────────────────────────────────────────── */

function extractPhone(text: string): string | null {
  // International or national with separators
  const m = text.match(/(\+?\d[\d\s\-().]{8,18}\d)/)
  if (m) {
    const digits = m[1].replace(/\D/g, '')
    if (digits.length >= 9 && digits.length <= 15) return m[1].trim()
  }
  // Bare digit run
  const bare = text.match(/\b(\d{9,12})\b/)
  if (bare) return bare[1]
  return null
}

/* ── Email ─────────────────────────────────────────────────────────────── */

function extractEmail(text: string): string | null {
  const m = text.match(/\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/)
  return m ? m[0] : null
}

/* ── Combined extractor ────────────────────────────────────────────────── */

function extractFromText(text: string): Partial<Slots> {
  return {
    name:          extractName(text)         ?? undefined,
    phone:         extractPhone(text)        ?? undefined,
    email:         extractEmail(text)        ?? undefined,
    city:          extractCity(text)         ?? undefined,
    area:          undefined,   // derived later from context if needed
    budget:        extractBudget(text)       ?? undefined,
    property_type: extractPropertyType(text) ?? undefined,
    rooms:         extractRooms(text)        ?? undefined,
    deal_type:     extractDealType(text)     ?? undefined,
    viewing_time:  extractViewingTime(text)  ?? undefined,
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   CONFIRMED SLOTS  —  single source of truth
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Merge existing lead row + ALL user messages + current message into one
 * authoritative Slots object.
 * Lead DB data always wins over extracted values (it was already verified).
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
    city:          strOrNull(meta.city),
    area:          strOrNull(meta.area),
    budget:        strOrNull(meta.budget),
    property_type: strOrNull(meta.property_type),
    rooms:         strOrNull(meta.rooms),
    deal_type:     strOrNull(meta.deal_type),
    viewing_time:  strOrNull(meta.viewing_time),
  }

  // Extract from all user messages + current (concatenated for pattern matching)
  const userTexts = [
    ...history.filter(m => m.role === 'user').map(m => m.content),
    currentMsg,
  ]
  const allUserText = userTexts.join('\n')
  const extracted   = extractFromText(allUserText)

  // Merge: DB wins over extracted, extracted fills in nulls
  return {
    name:          fromDB.name          ?? extracted.name          ?? null,
    phone:         fromDB.phone         ?? extracted.phone         ?? null,
    email:         fromDB.email         ?? extracted.email         ?? null,
    city:          fromDB.city          ?? extracted.city          ?? null,
    area:          fromDB.area          ?? null,
    budget:        fromDB.budget        ?? extracted.budget        ?? null,
    property_type: fromDB.property_type ?? extracted.property_type ?? null,
    rooms:         fromDB.rooms         ?? extracted.rooms         ?? null,
    deal_type:     fromDB.deal_type     ?? extracted.deal_type     ?? null,
    viewing_time:  fromDB.viewing_time  ?? extracted.viewing_time  ?? null,
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   MISSING SLOTS  — computed by code, never by AI
═══════════════════════════════════════════════════════════════════════════ */

const DEFAULT_SLOT_DEFS: SlotDef[] = [
  { key:'city',          label:'City / location',          required:true,
    question:"Which city or area are you looking in?"  },
  { key:'deal_type',     label:'Rent or buy',              required:true,
    question:"Are you looking to rent or buy?"  },
  { key:'property_type', label:'Property type',            required:true,
    question:"What type of property are you looking for — apartment, house, studio, or something else?"  },
  { key:'rooms',         label:'Number of rooms',          required:true,
    question:"How many rooms or bedrooms do you need?"  },
  { key:'budget',        label:'Budget',                   required:true,
    question:"What is your budget? Please include the currency (e.g. 3000 PLN/month)."  },
  { key:'name',          label:'Full name',                required:true,
    question:"May I have your full name?"  },
  { key:'phone',         label:'Phone number',             required:false,
    question:"What is the best phone number to reach you on?"  },
  { key:'email',         label:'Email address',            required:false,
    question:"And your email address?"  },
  { key:'viewing_time',  label:'Preferred viewing time',   required:false,
    question:"When would you prefer to schedule a viewing?"  },
]

function computeMissingSlots(confirmed: Slots, slotDefs: SlotDef[]): SlotDef[] {
  return slotDefs.filter(def => !confirmed[def.key])
}

/* ════════════════════════════════════════════════════════════════════════════
   BOOKING INTENT DETECTION
═══════════════════════════════════════════════════════════════════════════ */

function detectBookingIntent(text: string): boolean {
  return /\b(book|schedule|arrange|set up|make)\s+(?:a\s+|the\s+|me\s+a\s+)?(?:viewing|visit|appointment|meeting|call|tour)\b/i.test(text)
    || /\bwhen\s+can\s+(?:i|we)\s+(?:view|visit|see|come|meet)\b/i.test(text)
    || /\bi(?:'m|\s+am)\s+(?:ready|interested|available)\s+to\s+(?:view|visit|see|meet)\b/i.test(text)
}

function hasEnoughForBooking(confirmed: Slots): boolean {
  const hasLocation = !!(confirmed.city)
  const hasProperty = !!(confirmed.property_type || confirmed.deal_type)
  const hasContact  = !!(confirmed.name || confirmed.phone || confirmed.email)
  return hasLocation && hasProperty && hasContact
}

/* ════════════════════════════════════════════════════════════════════════════
   SYSTEM PROMPT BUILDER
═══════════════════════════════════════════════════════════════════════════ */

function buildSystemPrompt(
  agent:    AgentRow,
  knowledge: KnowledgeRow[],
  confirmed: Slots,
  missing:   SlotDef[],
): string {
  const knowledgeBlock = knowledge.length > 0
    ? knowledge.map(k => `### ${k.title}\n${k.content}`).join('\n\n')
    : 'No additional knowledge configured.'

  const confirmedLines: string[] = []
  if (confirmed.name)          confirmedLines.push(`  ✓ Name: ${confirmed.name}`)
  if (confirmed.phone)         confirmedLines.push(`  ✓ Phone: ${confirmed.phone}`)
  if (confirmed.email)         confirmedLines.push(`  ✓ Email: ${confirmed.email}`)
  if (confirmed.city)          confirmedLines.push(`  ✓ City/Location: ${confirmed.city}`)
  if (confirmed.area)          confirmedLines.push(`  ✓ Area/District: ${confirmed.area}`)
  if (confirmed.budget)        confirmedLines.push(`  ✓ Budget: ${confirmed.budget}`)
  if (confirmed.property_type) confirmedLines.push(`  ✓ Property type: ${confirmed.property_type}`)
  if (confirmed.rooms)         confirmedLines.push(`  ✓ Rooms: ${confirmed.rooms}`)
  if (confirmed.deal_type)     confirmedLines.push(`  ✓ Deal type: ${confirmed.deal_type}`)
  if (confirmed.viewing_time)  confirmedLines.push(`  ✓ Preferred viewing time: ${confirmed.viewing_time}`)

  const confirmedBlock = confirmedLines.length > 0
    ? `CONFIRMED INFORMATION (DO NOT ask about any of these):\n${confirmedLines.join('\n')}`
    : `CONFIRMED INFORMATION: Nothing yet — greet and begin qualifying.`

  const missingBlock = missing.length > 0
    ? `MISSING INFORMATION (ask for these ONE AT A TIME, in this priority order):\n${missing.map(d => `  ○ ${d.label}`).join('\n')}`
    : `MISSING INFORMATION: None — all key information collected. Confirm and offer to book.`

  return `You are ${agent.name}, a professional real estate sales assistant.

PERSONA: ${agent.persona}
OBJECTIVE: ${agent.objective}
TONE: ${agent.tone}

KNOWLEDGE BASE:
${knowledgeBlock}

${confirmedBlock}

${missingBlock}

STRICT RULES — MUST FOLLOW:
1. ABSOLUTE: Never ask for any item in CONFIRMED INFORMATION. This is non-negotiable.
2. Ask for ONE item from MISSING INFORMATION per message.
3. Acknowledge what the visitor just said, then ask the next question.
4. Keep replies short: 2–4 sentences.
5. Be warm and natural — like a professional sales rep.
6. If the visitor mentions city/area/budget/rooms in their message, acknowledge it and move on.
7. NEVER repeat a question from the previous assistant message.
8. If asked something outside your knowledge base: ${agent.fallback_msg}

Your reply is plain conversational text only. No JSON, no lists.`
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

    // Blocked: replace with next deterministic question
    if (missing.length === 0) {
      return {
        reply:   "I have all the information I need. Our team will be in touch shortly to confirm the details and arrange your viewing.",
        blocked: true,
      }
    }
    return { reply: missing[0].question, blocked: true }
  }
  return { reply, blocked: false }
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

/* ════════════════════════════════════════════════════════════════════════════
   MAIN ROUTE HANDLER
═══════════════════════════════════════════════════════════════════════════ */

export async function POST(req: NextRequest) {
  /* 1. Parse ─────────────────────────────────────────────────────────────── */
  let body: { business_id?: unknown; conversation_id?: unknown; message?: unknown; debug?: unknown }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const business_id     = typeof body.business_id     === 'string' ? body.business_id.trim()     : null
  const conversation_id = typeof body.conversation_id === 'string' ? body.conversation_id.trim() : null
  const message         = typeof body.message         === 'string' ? body.message.trim()         : null
  const debugMode       = body.debug === true

  if (!business_id) return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
  if (!message)     return NextResponse.json({ error: 'message is required' },     { status: 400 })

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
  console.log('CHAT SESSION IDS', { clientId, businessId, fallbackUsed })

  /* 3. Supabase ───────────────────────────────────────────────────────────── */
  const sb = createAdminClient()

  /* 4. Load active agent ──────────────────────────────────────────────────── */
  const { data: agentRow, error: agentErr } = await sb
    .from('agents').select('*')
    .eq('business_id', businessId).eq('active', true)
    .limit(1).maybeSingle()

  if (agentErr) {
    console.error('[POST /api/chat] agent error:', JSON.stringify(agentErr))
    return NextResponse.json({ error: 'Failed to load agent', details: agentErr }, { status: 500 })
  }
  if (!agentRow) {
    return NextResponse.json({ error: 'No active agent found', details: { business_id } }, { status: 404 })
  }
  const agent = agentRow as AgentRow

  /* 4. Load knowledge ─────────────────────────────────────────────────────── */
  const { data: knowledgeRows } = await sb
    .from('knowledge_sources').select('title, content')
    .eq('business_id', businessId).eq('is_active', true)
    .order('created_at', { ascending: true })
  const knowledge = (knowledgeRows ?? []) as KnowledgeRow[]

  /* 5. Resolve / create conversation ─────────────────────────────────────── */
  let convId: string

  if (conversation_id) {
    const { data: existing } = await sb
      .from('conversations').select('id').eq('id', conversation_id).maybeSingle()
    convId = existing?.id ?? crypto.randomUUID()
  } else {
    convId = crypto.randomUUID()
  }

  const isNewConv = convId !== conversation_id
  if (isNewConv) {
    const { error: ce } = await sb.from('conversations').insert({
      id:              convId,
      business_id:     businessId,
      channel:         'website',
      status:          'open',
      last_message_at: new Date().toISOString(),
    })
    if (ce) {
      console.error('[POST /api/chat] conversation insert failed:', JSON.stringify(ce))
      return NextResponse.json({ error: 'Failed to create conversation', details: ce.message }, { status: 500 })
    }
  } else {
    await sb.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', convId)
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
    : DEFAULT_SLOT_DEFS

  /* 7. Build confirmedSlots deterministically ─────────────────────────────── */
  const confirmed = buildConfirmedSlots(existingLead, history, message)
  const missing   = computeMissingSlots(confirmed, slotDefs)

  console.log('[SLOTS] confirmedSlots:', JSON.stringify(confirmed))
  console.log('[SLOTS] missingSlots:',  missing.map(d => d.key).join(', ') || 'none')

  /* 8. Check booking intent → short-circuit if ready ─────────────────────── */
  if (detectBookingIntent(message) && hasEnoughForBooking(confirmed)) {
    const stillNeedContact = !confirmed.phone && !confirmed.email
    const bookingReply = stillNeedContact
      ? `I'd love to arrange a viewing! Could I get your phone number or email so our team can confirm the available times?`
      : `Perfect! I have everything I need to request your viewing. Our team will review the details and contact you shortly to confirm a time that works. 🏠`

    // Persist user message first, then assistant — sequential so user always gets an earlier
    // created_at timestamp (parallel inserts can produce same or reversed timestamps).
    const uMsgR = await sb.from('messages').insert({ conversation_id: convId, business_id: businessId, role: 'user', content: message })
    if (uMsgR.error) console.error('[POST /api/chat] booking user-msg insert:', JSON.stringify(uMsgR.error))
    const aMsgR = await sb.from('messages').insert({ conversation_id: convId, business_id: businessId, role: 'assistant', content: bookingReply })
    if (aMsgR.error) console.error('[POST /api/chat] booking ai-msg insert:', JSON.stringify(aMsgR.error))

    console.log('[GUARD] blockedRepeatedQuestion: false (booking short-circuit)')
    const bResult = await persistLead(sb, existingLead, convId, clientId, businessId, confirmed, missing, 'qualified', bookingReply, message)

    return NextResponse.json({
      reply:                    bookingReply,
      conversation_id:          convId,
      intent:                   'booking',
      lead_ready:               true,
      lead_id:                  bResult.lead_id,
      lead_insert_error:        bResult.insert_error,
      appointment_id:           bResult.appointment_id,
      appointment_insert_error: bResult.appointment_insert_error,
    })
  }

  /* 9. Persist user message ──────────────────────────────────────────────── */
  const { error: userMsgErr } = await sb.from('messages').insert({
    conversation_id: convId, business_id: businessId, role: 'user', content: message,
  })
  if (userMsgErr) console.error('[POST /api/chat] user message insert failed:', JSON.stringify(userMsgErr))

  /* 10. Build prompt + call OpenAI ───────────────────────────────────────── */
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) return NextResponse.json({ error: 'OPENAI_API_KEY is not configured' }, { status: 500 })

  const openai      = new OpenAI({ apiKey: openaiKey })
  const systemPrompt = buildSystemPrompt(agent, knowledge, confirmed, missing)
  const historyForLLM = history.map(r => ({
    role:    r.role === 'assistant' ? 'assistant' as const : 'user' as const,
    content: r.content,
  }))

  let rawReply: string
  try {
    rawReply = await callOpenAI(openai, agent.model, agent.temperature, systemPrompt, historyForLLM, message)
  } catch (err) {
    console.error('[POST /api/chat] OpenAI error:', err)
    return NextResponse.json({ error: 'Failed to get AI response' }, { status: 502 })
  }

  /* 11. Guard reply — block any answer that re-asks confirmed slots ───────── */
  const { reply: finalReply, blocked } = guardReply(rawReply, confirmed, missing)
  console.log('[GUARD] blockedRepeatedQuestion:', blocked)

  /* 12. Persist assistant reply ──────────────────────────────────────────── */
  const { error: aiMsgErr } = await sb.from('messages').insert({
    conversation_id: convId, business_id: businessId, role: 'assistant', content: finalReply,
  })
  if (aiMsgErr) console.error('[POST /api/chat] ai message insert failed:', JSON.stringify(aiMsgErr))

  /* 13. Update / create lead ─────────────────────────────────────────────── */
  const isQualified = !!(confirmed.name && confirmed.phone && confirmed.email)
  const intent      = detectDealType(message) ? 'inquiry' : 'greeting'
  const persist = await persistLead(sb, existingLead, convId, clientId, businessId, confirmed, missing, isQualified ? 'contacted' : 'new', finalReply, message)

  /* 14. Fire webhook if fully qualified ──────────────────────────────────── */
  const webhookUrl    = process.env.MAKE_WEBHOOK_URL
  const resolvedLeadId = persist.lead_id ?? existingLead?.id
  if (webhookUrl && isQualified && resolvedLeadId) {
    fetch(webhookUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'lead_qualified', lead_id: resolvedLeadId, business_id: businessId, conversation_id: convId, slots: confirmed }),
    }).catch(e => console.warn('[POST /api/chat] webhook error:', e))
  }

  /* 15. Return ─────────────────────────────────────────────────────────────── */
  const response: Record<string, unknown> = {
    reply:                    finalReply,
    conversation_id:          convId,
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
    }
  }
  return NextResponse.json(response)
}

/* ════════════════════════════════════════════════════════════════════════════
   VIEWING TIME → DATE PARSER
═══════════════════════════════════════════════════════════════════════════ */

function parseViewingTime(text: string | null): Date {
  const d = new Date()
  const t = (text ?? '').toLowerCase()

  // Extract clock time if present
  function applyClock(base: Date): void {
    const c = (text ?? '').match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i)
    if (c) {
      let h = parseInt(c[1])
      const m = parseInt(c[2] ?? '0')
      if (/pm/i.test(c[3] ?? '') && h < 12) h += 12
      base.setHours(h, m, 0, 0)
    } else {
      base.setHours(12, 0, 0, 0)
    }
  }

  if (/\btoday\b/.test(t)) { applyClock(d); return d }

  if (/\btomorrow\b/.test(t)) {
    d.setDate(d.getDate() + 1); applyClock(d); return d
  }

  const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
  for (let i = 0; i < DAYS.length; i++) {
    if (t.includes(DAYS[i])) {
      const diff = ((i - d.getDay()) + 7) % 7 || 7
      d.setDate(d.getDate() + diff); applyClock(d); return d
    }
  }

  if (/\bmorning\b/.test(t))   { d.setDate(d.getDate()+1); d.setHours(10,0,0,0); return d }
  if (/\bafternoon\b/.test(t)) { d.setDate(d.getDate()+1); d.setHours(14,0,0,0); return d }
  if (/\bevening\b/.test(t))   { d.setDate(d.getDate()+1); d.setHours(18,0,0,0); return d }

  // Default: tomorrow noon
  d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0); return d
}

/* ════════════════════════════════════════════════════════════════════════════
   LEAD PERSISTENCE HELPER
═══════════════════════════════════════════════════════════════════════════ */

function detectDealType(text: string): boolean {
  return extractDealType(text) !== null
}

async function persistLead(
  sb:           ReturnType<typeof createAdminClient>,
  existing:     ExistingLead | null,
  convId:       string,
  clientId:     string,
  businessId:   string,
  confirmed:    Slots,
  missing:      SlotDef[],
  status:       string,
  lastReply:    string,
  message:      string,
): Promise<{
  lead_id:                  string | null
  insert_error:             string | null
  appointment_id:           string | null
  appointment_insert_error: string | null
}> {
  // Build AI summary from confirmed slots
  const namePart   = confirmed.name         ? confirmed.name                      : null
  const actionPart = confirmed.deal_type    ? `looking to ${confirmed.deal_type}` : 'enquiring about'
  const roomsPart  = confirmed.rooms        ? `${confirmed.rooms} `               : ''
  const propPart   = confirmed.property_type ?? 'property'
  const cityPart   = confirmed.city         ? ` in ${confirmed.city}`             : ''
  const areaPart   = confirmed.area         ? `, ${confirmed.area}`               : ''
  const budgetPart = confirmed.budget       ? `, budget ${confirmed.budget}`       : ''
  const viewPart   = confirmed.viewing_time ? ` — prefers viewing ${confirmed.viewing_time}` : ''
  const summary    = namePart
    ? `${namePart} is ${actionPart} a ${roomsPart}${propPart}${cityPart}${areaPart}${budgetPart}.${viewPart}`
    : ''

  const nextAction  = missing[0]?.question ?? 'Follow up and confirm booking.'
  const missingKeys = missing.map(d => d.label).join(', ')

  // Lead payload uses both direct columns and metadata for full compatibility
  const leadPayload = {
    name:          confirmed.name  ?? existing?.name  ?? null,
    phone:         confirmed.phone ?? existing?.phone ?? null,
    email:         confirmed.email ?? existing?.email ?? null,
    interest:      confirmed.property_type ?? confirmed.deal_type ?? existing?.interest ?? null,
    // Direct columns on leads table
    ai_summary:    summary || null,
    intent:        confirmed.deal_type ?? null,
    budget:        confirmed.budget ?? null,
    location:      confirmed.city ?? null,
    property_type: confirmed.property_type ?? null,
    preferred_time: confirmed.viewing_time ?? null,
    missing_info:  missingKeys || null,
    next_action:   nextAction || null,
    // Keep metadata for backwards compat (legacy reads)
    metadata:      {
      ...(existing?.metadata as Record<string, unknown> ?? {}),
      ...(confirmed.city          && { city:          confirmed.city          }),
      ...(confirmed.area          && { area:          confirmed.area          }),
      ...(confirmed.budget        && { budget:        confirmed.budget        }),
      ...(confirmed.property_type && { property_type: confirmed.property_type }),
      ...(confirmed.rooms         && { rooms:         confirmed.rooms         }),
      ...(confirmed.deal_type     && { deal_type:     confirmed.deal_type     }),
      ...(confirmed.viewing_time  && { viewing_time:  confirmed.viewing_time  }),
    },
    ...(status === 'contacted' && { status }),
  }

  // ── Resolve lead_id ────────────────────────────────────────────────────────
  let resolvedLeadId: string | null = null
  let insertError:    string | null = null

  if (existing) {
    // UPDATE existing lead (conversation_id already set on it)
    const upd = await sb.from('leads').update({ ...leadPayload, conversation_id: convId }).eq('id', existing.id)
    console.log('[persistLead] lead UPDATE:', existing.id, upd.error ? JSON.stringify(upd.error) : 'ok')
    resolvedLeadId = existing.id

  } else if (hasMeaningfulSlot(confirmed)) {
    // INSERT new lead with conversation_id so the link is set immediately
    const ins = await sb.from('leads').insert({
      ...leadPayload,
      name:            confirmed.name ?? 'Website Visitor',
      business_id:     businessId,
      source:          'website_chat',
      status:          'new',
      conversation_id: convId,
    }).select('id').single()

    console.log('[persistLead] lead INSERT:', ins.error ? JSON.stringify(ins.error) : ins.data?.id)

    if (ins.error) {
      insertError = ins.error.message
    } else if (ins.data?.id) {
      resolvedLeadId = ins.data.id
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
        description: confirmed.city ? `Looking in ${confirmed.city}` : 'Website chat',
        leadId:      resolvedLeadId,
        meta:        { actor: 'AI Agent', undoable: false, entity_type: 'lead' as const, entity_id: resolvedLeadId ?? undefined, entity_name: confirmed.name ?? 'Website Visitor' },
      }, businessId)
    } else {
      insertError = 'insert returned no row'
    }
  }

  // ── Create appointment if booking intent or viewing_time captured ──────────
  let appointmentId:           string | null = null
  let appointmentInsertError:  string | null = null

  const shouldBook = !!(confirmed.viewing_time || (detectBookingIntent(message) && hasEnoughForBooking(confirmed)))

  if (shouldBook && resolvedLeadId) {
    // Guard against duplicate appointments for the same lead
    const { data: existingAppt } = await sb
      .from('appointments').select('id')
      .eq('lead_id', resolvedLeadId).eq('business_id', businessId)
      .limit(1).maybeSingle()

    if (existingAppt) {
      appointmentId = existingAppt.id as string
    } else {
      const scheduledAt  = parseViewingTime(confirmed.viewing_time)
      const leadFullName = confirmed.name ?? 'Website Visitor'
      // Match exact schema used by the manual Add Appointment modal (appointments/route.ts).
      // Do NOT include `notes` — the column is optional and may not exist on older schemas.
      // Use the same business_id as the manual appointment route so the row
      // is found by getClientAppointments and the dashboard realtime filter.
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
      console.log('[persistLead] appt payload:', JSON.stringify(apptPayload))
      const apptInsert = await sb.from('appointments').insert(apptPayload).select('*').single()

      if (apptInsert.error) {
        console.error('[persistLead] APPOINTMENT INSERT FAILED:', JSON.stringify({
          message: apptInsert.error.message,
          code:    apptInsert.error.code,
          details: apptInsert.error.details,
          hint:    apptInsert.error.hint,
          payload: apptPayload,
        }))
        appointmentInsertError = apptInsert.error.message
      } else if (apptInsert.data?.id) {
        console.log('[persistLead] APPOINTMENT INSERT OK:', JSON.stringify(apptInsert.data))
        appointmentId = apptInsert.data.id as string
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
    appointment_insert_error: appointmentInsertError,
  }
}
