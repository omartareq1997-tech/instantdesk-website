/**
 * POST /api/ingest/lead
 * ══════════════════════════════════════════════════════════════════
 *
 * Secure webhook endpoint consumed by Make.com scenarios.
 * Inserts or updates a lead captured by the chatbot, then creates
 * the linked conversation, messages, appointment (if booked), and
 * activity events — all in one call from Make.
 *
 * ── Authentication ────────────────────────────────────────────────
 * Every request MUST include:
 *   Authorization: Bearer <INGEST_API_KEY>
 *
 * Set INGEST_API_KEY in deployment env vars (no NEXT_PUBLIC_ prefix).
 *
 * ── Make.com HTTP module settings ────────────────────────────────
 * Method : POST
 * URL    : https://your-domain.com/api/ingest/lead
 * Headers:
 *   Content-Type : application/json
 *   Authorization: Bearer {{INGEST_API_KEY}}
 *
 * ── Field storage map ────────────────────────────────────────────
 *
 * These fields are stored as DIRECT columns on the leads table:
 *   client_id, name, company, email, phone, source, interest,
 *   score, score_label, status
 *
 * These fields are accepted at the TOP LEVEL of the JSON body AND
 * automatically stored inside leads.metadata (JSONB) so the Lead
 * Pipeline drawer can display them without any extra configuration:
 *
 *   message            → metadata.message           (conversation fallback)
 *   full_conversation  → metadata.full_conversation (full transcript)
 *   budget             → metadata.budget
 *   specification      → metadata.specification
 *   preferred_contact  → metadata.preferred_contact
 *   city_or_location   → metadata.city_or_location
 *   property_type      → metadata.property_type
 *   priority           → metadata.priority
 *   notes              → metadata.notes
 *   appointment_date   → metadata.appointment_date  (also creates appointments row)
 *
 * Any additional niche-specific fields can be sent inside "metadata":{}
 * and they will appear in the drawer's "Custom Details" section.
 * Top-level fields take precedence over same-named keys in metadata.
 *
 * ── Full JSON body example (real estate niche) ───────────────────
 * {
 *   "client_id":           "00000000-0000-0000-0000-000000000001",
 *   "name":                "Ahmed Al-Farsi",
 *   "company":             "Al-Farsi Investments",
 *   "email":               "ahmed@alfarsi.ae",
 *   "phone":               "+971 50 123 4567",
 *   "source":              "whatsapp",
 *   "interest":            "3-bed apartment",
 *   "budget":              "AED 1.2M – 1.5M",
 *   "specification":       "3 bed, sea view, parking",
 *   "preferred_contact":   "WhatsApp evenings",
 *   "city_or_location":    "Dubai Marina",
 *   "property_type":       "Apartment",
 *   "priority":            "High",
 *   "notes":               "Ready to buy within 3 months",
 *   "full_conversation":   "User: Hi, I want a 3-bed apartment\nBot: Hi Ahmed! ...",
 *   "appointment_date":    "2026-06-10T10:00:00Z",
 *   "appointment_type":    "viewing",
 *   "score":               85,
 *   "score_label":         "hot",
 *   "message":             "Hi, I want a 3-bed apartment in Dubai Marina",
 *   "messages": [
 *     { "role": "user", "content": "Hi, I want a 3-bed apartment in Dubai Marina" },
 *     { "role": "ai",   "content": "Hi Ahmed! Great choice. What's your budget range?", "response_time_ms": 2400 }
 *   ],
 *   "metadata": {
 *     "nationality": "UAE",
 *     "payment_method": "Cash",
 *     "timeline": "Q3 2026"
 *   }
 * }
 *
 * ── Minimal body (only required fields) ──────────────────────────
 * {
 *   "client_id": "00000000-0000-0000-0000-000000000001",
 *   "name":      "James Okafor"
 * }
 *
 * ── Other niche examples ──────────────────────────────────────────
 *
 * Dental:
 *   "interest": "Dental implants", "specification": "2 implants upper jaw",
 *   "budget": "£3,000–4,000", "preferred_contact": "Morning calls",
 *   "metadata": { "nhs_or_private": "Private", "postcode": "SW1A 1AA" }
 *
 * Legal:
 *   "interest": "Employment tribunal", "budget": "Fixed fee preferred",
 *   "specification": "Unfair dismissal", "priority": "Urgent",
 *   "metadata": { "case_value": "£25k", "hearing_date": "2026-07-01" }
 *
 * SaaS:
 *   "interest": "Full Suite", "budget": "£500/month",
 *   "metadata": { "mrr": "£8k", "team_size": 12, "tech_stack": "React + Node" }
 *
 * ── Response (success) ────────────────────────────────────────────
 * {
 *   "ok": true, "request_id": "abc123", "lead_id": "uuid",
 *   "is_new_lead": true,
 *   "conversation_id": "uuid",   ← only when messages were provided
 *   "appointment_id":  "uuid"    ← only when appointment_date was provided
 * }
 *
 * ══════════════════════════════════════════════════════════════════
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'

/* ── Helpers ─────────────────────────────────────────────────────── */

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

function requestId() { return Math.random().toString(36).slice(2, 10) }

function err(msg: string, status: number, rid: string) {
  return NextResponse.json({ ok: false, error: msg, request_id: rid }, { status })
}

function sourceToChannel(source: string | undefined): string {
  switch (source) {
    case 'whatsapp':    return 'whatsapp'
    case 'email':       return 'email'
    case 'instagram':   return 'instagram'
    default:            return 'website'
  }
}

function sourceLabel(source: string | undefined): string {
  switch (source) {
    case 'whatsapp':    return 'WhatsApp'
    case 'email':       return 'Email'
    case 'instagram':   return 'Instagram DM'
    case 'website_chat':return 'Website Chat'
    default:            return 'Chatbot'
  }
}

function defaultScore(source: string | undefined): { score: number; score_label: string } {
  switch (source) {
    case 'whatsapp':    return { score: 62, score_label: 'warm' }
    case 'instagram':   return { score: 50, score_label: 'warm' }
    case 'website_chat':return { score: 55, score_label: 'warm' }
    case 'email':       return { score: 45, score_label: 'cold' }
    default:            return { score: 40, score_label: 'cold' }
  }
}

/* ── Scalar check ────────────────────────────────────────────────── */

function isScalar(v: unknown): v is string | number | boolean {
  return ['string','number','boolean'].includes(typeof v)
}

/* ── Conversation balance check ──────────────────────────────────────
 *
 * Mirrors the role-detection logic in LeadPanel.tsx but runs server-side
 * (no DOMParser — HTML is probed with regex attribute matching instead).
 *
 * CLIENT_SIDE: Visitor, Client, User, Customer, Lead, You, Reply, Guest, Sender
 * BOT_SIDE:    Bot, AI, Assistant, Agent, System, InstantDesk, Support, Rep,
 *              Help, Chatbot, Operator, Staff
 *
 * For plain text the labels must appear at the start of a line (optionally
 * preceded by a [HH:MM] timestamp).  For HTML the CSS class attribute is
 * scanned for the canonical bubble-direction keywords.
 * ──────────────────────────────────────────────────────────────────── */

const _TS_PFX  = /^[\[(]?\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?[\])]?\s*[-–|]?\s*/i
const _CLI_RX  = /^(?:client|user|customer|human|lead|visitor|you|reply|sender|guest)\s*[:\-]/i
const _BOT_RX  = /^(?:bot|ai|assistant|agent|system|instantdesk|support|rep|help|chatbot|operator|staff)\s*[:\-]/i

// HTML class-name patterns (scanned directly on the raw HTML string)
const _HTML_CLI_CLS = /class=["'][^"']*\b(visitor|client|user[-_]?msg|from[-_]?user|outgoing|sent|right|you|human|lead|customer|blue|own|mine)\b/i
const _HTML_BOT_CLS = /class=["'][^"']*\b(bot|ai|assistant|agent|incoming|received|left|support|chatbot|white|other|operator)\b/i

function conversationSides(text: string): { hasClient: boolean; hasBot: boolean; labeled: boolean } {
  const isHtml = /<[a-z][\s\S]{0,200}?>/i.test(text)

  if (isHtml) {
    const hasClient = _HTML_CLI_CLS.test(text)
    const hasBot    = _HTML_BOT_CLS.test(text)
    return { hasClient, hasBot, labeled: hasClient || hasBot }
  }

  // Plain text — strip timestamp prefix from each line before label check
  const lines = text.split(/\r?\n/).map(l => l.trim().replace(_TS_PFX, '')).filter(Boolean)
  const hasClient = lines.some(l => _CLI_RX.test(l))
  const hasBot    = lines.some(l => _BOT_RX.test(l))
  return { hasClient, hasBot, labeled: hasClient || hasBot }
}

/* ── Conversation normaliser ─────────────────────────────────────────
 *
 * Problem: AI extraction tools (OpenAI, Claude via Make.com, etc.) often
 * return full_conversation as one long inline string:
 *
 *   "Client: Hi, I need a flat. Bot: Sure! Client: Near the city centre."
 *
 * The balance check above splits by \n before testing each line, so an
 * inline string only presents ONE line — meaning the Bot label in the
 * middle of that line is invisible and the check falsely rejects the body.
 *
 * This function inserts a \n before every speaker label that follows
 * non-newline content, turning the inline string into:
 *
 *   "Client: Hi, I need a flat.\nBot: Sure!\nClient: Near the city centre."
 *
 * HTML transcripts are left untouched — class-based detection handles those.
 * Already-formatted text (has newline before a label) is returned as-is.
 * ──────────────────────────────────────────────────────────────────── */

const _ALL_SPEAKERS = /client|bot|user|visitor|assistant|ai|human|lead|customer|sender|reply|support|rep|operator|staff|agent/i

function normalizeConversation(raw: string): string {
  const text = raw.trim()
  if (!text) return text

  // HTML — don't reformat; class-based detection in LeadPanel handles it
  if (/<[a-z][\s\S]{0,200}?>/i.test(text)) return text

  // Already newline-separated — at least one label starts after a newline
  if (/\n[ \t]*(?:client|bot|user|visitor|assistant|ai|human|lead|customer|sender|reply|support|rep|operator|staff|agent)\s*:/i.test(text)) {
    return text
  }

  // Inline: insert \n before every speaker label that follows non-newline content.
  // Matches: (word/punct char)(whitespace)(SpeakerLabel:) → $1\n$2
  const normalized = text.replace(
    /(\S)\s+((?:client|bot|user|visitor|assistant|ai|human|lead|customer|sender|reply|support|rep|operator|staff|agent)\s*:)/gi,
    '$1\n$2',
  )

  return normalized
}

/* ── Ingest types ────────────────────────────────────────────────── */

interface IngestMessage {
  role:             'user' | 'ai' | 'agent'
  content:          string
  response_time_ms?: number
  created_at?:      string
}

interface IngestLeadBody {
  // ── Required ──────────────────────────────────────────────────
  client_id: string
  name:      string

  // ── Core lead columns ─────────────────────────────────────────
  company?:          string
  email?:            string
  phone?:            string
  source?:           string
  interest?:         string
  score?:            number
  score_label?:      string

  // ── Conversation / messages ───────────────────────────────────
  message?:          string          // single first message — stored in metadata.message
  full_conversation?: string         // raw transcript    — stored in metadata.full_conversation
  conversation_id?:  string
  messages?:         IngestMessage[]

  // ── Appointment ───────────────────────────────────────────────
  appointment_date?: string          // ISO datetime — also mirrored into metadata
  appointment_type?: string

  // ── Niche-specific top-level shortcuts ────────────────────────
  // All of these are stored in leads.metadata so the drawer displays them.
  // They can also be sent inside "metadata": {} — top-level wins on conflict.
  budget?:            string | number
  specification?:     string
  preferred_contact?: string
  city_or_location?:  string
  property_type?:     string
  priority?:          string
  notes?:             string
  ai_summary?:        string   // Pre-generated AI summary from Make.com — shown verbatim in the drawer

  // ── Catch-all niche fields ────────────────────────────────────
  metadata?:         Record<string, unknown>
}

/* ── Route handler ───────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  const rid = requestId()

  /* 1. Auth ────────────────────────────────────────────────────── */
  const apiKey = process.env.INGEST_API_KEY
  if (!apiKey) {
    console.error(`[ingest/lead][${rid}] INGEST_API_KEY env var not set`)
    return err('Server misconfiguration', 500, rid)
  }
  const authHeader = req.headers.get('authorization') ?? ''
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!safeEqual(token, apiKey)) return err('Unauthorized', 401, rid)

  /* 2. Parse body ──────────────────────────────────────────────── */
  let body: IngestLeadBody
  try { body = await req.json() }
  catch { return err('Invalid JSON body', 400, rid) }

  /* 3. Validate ────────────────────────────────────────────────── */
  if (!body.client_id || typeof body.client_id !== 'string') return err('client_id is required', 400, rid)
  if (!body.name      || typeof body.name      !== 'string') return err('name is required', 400, rid)

  /* 3a. Normalise full_conversation ───────────────────────────────
   *
   * AI tools often produce inline transcripts:
   *   "Client: Hi Bot: Hello Client: Bye"
   * Split every speaker label onto its own line before any further
   * processing so the balance check and the drawer parser both work.
   * ─────────────────────────────────────────────────────────────── */
  if (body.full_conversation?.trim()) {
    const raw        = body.full_conversation.trim()
    const normalized = normalizeConversation(raw)

    if (normalized !== raw) {
      const beforeLines = raw.split('\n').filter(l => l.trim()).length
      const afterLines  = normalized.split('\n').filter(l => l.trim()).length
      console.log(
        `[ingest/lead][${rid}] full_conversation normalised: ` +
        `${beforeLines} line(s) → ${afterLines} line(s) (inline turns split to newlines)`
      )
      body.full_conversation = normalized
    }

    // Verify structure: check that both Client and Bot labels are present
    // on their own lines after normalisation.
    const normLines   = body.full_conversation.split(/\r?\n/).filter(l => l.trim())
    const stripped    = normLines.map(l => l.trim().replace(_TS_PFX, ''))
    const hasClient   = stripped.some(l => _CLI_RX.test(l))
    const hasBot      = stripped.some(l => _BOT_RX.test(l))
    const looksLabeled = stripped.some(l => _ALL_SPEAKERS.test(l.split(':')[0] ?? ''))

    if (hasClient && hasBot) {
      console.log(
        `[ingest/lead][${rid}] full_conversation OK — ` +
        `${normLines.length} lines, both Client and Bot messages detected`
      )
    } else if (looksLabeled) {
      console.warn(
        `[ingest/lead][${rid}] full_conversation has speaker labels but missing ` +
        `${!hasClient ? 'Client' : 'Bot'} messages after normalisation`
      )
    } else {
      console.log(
        `[ingest/lead][${rid}] full_conversation — no speaker labels detected ` +
        `(unlabelled transcript, ${normLines.length} lines)`
      )
    }
  }

  /* 3b. Conversation balance check ────────────────────────────────
   *
   * When full_conversation is provided and contains labeled messages,
   * both a Client side and a Bot side must be present.  Unlabeled
   * transcripts (no role prefixes, no HTML class clues) are allowed
   * through — we can't verify those without context.
   *
   * This runs AFTER normalisation (3a) so inline transcripts that have
   * been split now pass correctly instead of being falsely rejected.
   * ─────────────────────────────────────────────────────────────── */
  if (body.full_conversation?.trim()) {
    const { hasClient, hasBot, labeled } = conversationSides(body.full_conversation)
    if (labeled && (!hasClient || !hasBot)) {
      const missing = !hasClient ? 'Client' : 'Bot'
      const found   = !hasClient ? 'Bot'    : 'Client'
      console.warn(`[ingest/lead][${rid}] full_conversation missing ${missing} messages (only ${found} detected)`)
      return err(
        `full_conversation must contain at least one Client message and one Bot message. ` +
        `Only ${found} messages were detected. ` +
        `Label client messages with "Client:", "User:", or "Visitor:" and ` +
        `bot messages with "Bot:", "AI:", or "Assistant:".`,
        400, rid
      )
    }
  }

  /* 4. Normalise direct columns ───────────────────────────────── */
  const clientId   = body.client_id.trim()
  const name       = body.name.trim()
  const company    = body.company?.trim()  ?? ''
  const email      = body.email?.trim()    || null
  const phone      = body.phone?.trim()    || null
  const source     = body.source?.trim()   || 'website_chat'
  const interest   = body.interest?.trim() || null
  const scoreData  = defaultScore(source)
  const score      = typeof body.score === 'number' ? body.score : scoreData.score
  const scoreLabel = typeof body.score_label === 'string' ? body.score_label : scoreData.score_label
  const messages   = Array.isArray(body.messages) ? body.messages : []
  const firstMsg   = body.message?.trim() || messages.find(m => m.role === 'user')?.content || null

  /* 5. Build enriched metadata ────────────────────────────────────
   *
   * Priority order (highest → lowest):
   *   a) Top-level niche shortcuts (budget, spec, city, etc.)
   *   b) top-level message / full_conversation / appointment_date
   *   c) body.metadata object (catch-all from Make)
   *
   * This guarantees that whatever Make sends — whether at the top
   * level or nested in metadata — ends up in leads.metadata and is
   * visible in the Lead Pipeline drawer.
   * ─────────────────────────────────────────────────────────────── */
  const enriched: Record<string, unknown> = {}

  // (c) Start with body.metadata as the base
  if (body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)) {
    for (const [k, v] of Object.entries(body.metadata)) {
      if (v !== null && v !== undefined) enriched[k] = v
    }
  }

  // (b) Overlay top-level conversation fields.
  // appointment_date is intentionally NOT mirrored here — it goes only into
  // appointments.scheduled_at so it can never influence leads.created_at.
  if (body.full_conversation?.trim()) {
    enriched.full_conversation = body.full_conversation.trim()
  }
  if (body.message?.trim()) {
    enriched.message = body.message.trim()
  }

  // (a) Top-level niche shortcuts — these WIN over any same-named key in metadata
  const SHORTCUT_FIELDS = [
    'budget', 'specification', 'preferred_contact',
    'city_or_location', 'property_type', 'priority', 'notes',
    'ai_summary',
  ] as const
  for (const field of SHORTCUT_FIELDS) {
    const val = body[field]
    if (val !== undefined && val !== null && val !== '') {
      enriched[field] = val
    }
  }

  // Strip every date/timestamp key from enriched — none of these must reach
  // leads.created_at via the metadata JSONB (a DB trigger could read them).
  const STRIPPED_META_KEYS = [
    'created_at', 'createdAt', 'date', 'updated_at', 'updatedAt',
    'appointment_date', 'machine_date', 'timestamp',
  ]
  for (const k of STRIPPED_META_KEYS) delete enriched[k]

  const finalMetadata = Object.keys(enriched).length > 0 ? enriched : null

  /* 6. Supabase (service role — bypasses RLS) ──────────────────── */
  const sb = createAdminClient()

  /* ── 6a. Upsert lead ─────────────────────────────────────────── */
  let leadId: string
  let isNewLead = false

  // Capture the request-handling time once for updated_at on updates and
  // activity events. INSERT payloads generate their own inline new Date() calls.
  const nowIso = new Date().toISOString()

  try {
    if (email) {
      const { data: existing } = await sb
        .from('leads').select('id, metadata')
        .eq('business_id', clientId).eq('email', email).maybeSingle()

      if (existing?.id) {
        // Merge: preserve keys that weren't sent in this call.
        // Strip server-managed timestamp keys from prevMeta first — they must
        // never re-enter metadata where a trigger could read them back.
        const rawPrev = (existing.metadata as Record<string, unknown> | null) ?? {}
        const prevMeta: Record<string, unknown> = { ...rawPrev }
        for (const k of STRIPPED_META_KEYS) delete prevMeta[k]
        const mergedMeta = finalMetadata
          ? { ...prevMeta, ...finalMetadata }   // new keys win
          : prevMeta

        const updatePayload: Record<string, unknown> = {
          name, phone,
          source, interest: interest ?? undefined,
        }
        if (Object.keys(mergedMeta).length > 0) updatePayload.metadata = mergedMeta
        await sb.from('leads').update(updatePayload).eq('id', existing.id)
        console.log(`[INGEST] updated lead id = ${existing.id} updated_at = ${nowIso}`)
        leadId = existing.id
      } else {
        const insertPayload = {
          business_id: clientId, name, email, phone,
          source, interest: interest ?? undefined,
          status: 'new',
          ...(finalMetadata && { metadata: finalMetadata }),
        }
        console.log('[INGEST] lead INSERT', name)
        const { data, error } = await sb.from('leads').insert(insertPayload).select('id').single()
        if (error) throw error
        leadId = data.id; isNewLead = true
      }
    } else {
      const insertPayload = {
        business_id: clientId, name, phone,
        source, interest: interest ?? undefined,
        status: 'new',
        ...(finalMetadata && { metadata: finalMetadata }),
      }
      console.log('[INGEST] lead INSERT', name)
      const { data, error } = await sb.from('leads').insert(insertPayload).select('id').single()
      if (error) throw error
      leadId = data.id; isNewLead = true
    }
  } catch (e) {
    console.error(`[ingest/lead][${rid}] Lead upsert failed:`, e)
    return err('Failed to save lead', 500, rid)
  }

  /* ── 6b. Conversation + messages ────────────────────────────── */
  let convId: string | undefined

  if (messages.length > 0 || body.conversation_id) {
    try {
      convId = body.conversation_id?.trim() || crypto.randomUUID()
      await sb.from('conversations').upsert({
        id: convId, client_id: clientId, lead_id: leadId,
        channel: sourceToChannel(source), status: 'open',
        last_message_at: new Date().toISOString(),
      }, { onConflict: 'id' })

      if (messages.length > 0) {
        const baseMs = Date.now()
        await sb.from('messages').insert(
          messages.map((m, idx) => ({
            conversation_id:  convId!,
            client_id:        clientId,
            from_role:        m.role,
            content:          m.content,
            response_time_ms: m.response_time_ms ?? null,
            created_at:       new Date(baseMs + idx * 1000).toISOString(),
          }))
        )
      }
    } catch (e) {
      console.warn(`[ingest/lead][${rid}] Conversation/messages insert failed:`, e)
    }
  }

  /* ── 6c. Appointment ─────────────────────────────────────────── */
  let appointmentId: string | undefined
  let isNewAppt    = false

  if (body.appointment_date) {
    try {
      const apptType = body.appointment_type?.trim() || 'demo_call'

      // Check for an existing appointment for this lead with the same slot + type.
      // Use .limit(1) instead of .maybeSingle() — if duplicates already exist in
      // the DB, .maybeSingle() returns an error (caught below) and we'd insert
      // yet another duplicate. .limit(1) always succeeds and returns the first row.
      const scheduledMinute = new Date(body.appointment_date).toISOString().slice(0, 16)
      const { data: apptRows } = await sb
        .from('appointments')
        .select('id')
        .eq('lead_id', leadId)
        .eq('type', apptType)
        .gte('scheduled_at', scheduledMinute + ':00Z')
        .lt('scheduled_at',  scheduledMinute + ':59Z')
        .limit(1)

      const existingAppt = Array.isArray(apptRows) && apptRows.length > 0 ? apptRows[0] : null

      if (existingAppt?.id) {
        // Same slot already booked — update in place, never duplicate.
        await sb.from('appointments').update({
          lead_name:    name,
          lead_company: company,
          scheduled_at: body.appointment_date,
          status:       'pending',
        }).eq('id', existingAppt.id)
        appointmentId = existingAppt.id
        isNewAppt     = false
      } else {
        const { data: appt, error: apptErr } = await sb.from('appointments').insert({
          client_id:    clientId,
          lead_id:      leadId,
          lead_name:    name,
          lead_company: company,
          type:         apptType,
          scheduled_at: body.appointment_date,
          status:       'pending',
        }).select('id').single()
        if (apptErr) throw apptErr
        appointmentId = appt.id
        isNewAppt     = true
      }
    } catch (e) {
      console.warn(`[ingest/lead][${rid}] Appointment upsert failed:`, e)
    }
  }

  /* ── 6d. Activity events ─────────────────────────────────────── */
  const now = nowIso
  const activityRows: object[] = []

  activityRows.push({
    client_id:   clientId, lead_id: leadId,
    type:        source === 'email' ? 'email' : 'sms',
    title:       isNewLead ? `New lead captured — ${name}` : `Lead updated — ${name}`,
    description: `${sourceLabel(source)} · ${isNewLead ? 'auto-triggered' : 'webhook update'}`,
    created_at:  now,
  })

  if (firstMsg) {
    activityRows.push({
      client_id:   clientId, lead_id: leadId,
      type:        source === 'email' ? 'email' : 'sms',
      title:       `Message received — ${name}`,
      description: firstMsg.length > 100 ? firstMsg.slice(0, 97) + '…' : firstMsg,
      created_at:  new Date(Date.now() + 100).toISOString(),
    })
  }

  if (isNewAppt && appointmentId && body.appointment_date) {
    const apptLabel = new Date(body.appointment_date).toLocaleString('en-GB', {
      weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit',
    })
    activityRows.push({
      client_id:   clientId, lead_id: leadId,
      type:        'appointment',
      title:       `Demo booked — ${name}`,
      description: apptLabel,
      created_at:  new Date(Date.now() + 200).toISOString(),
    })
  }

  try { await sb.from('activity_events').insert(activityRows) }
  catch (e) { console.warn(`[ingest/lead][${rid}] Activity events insert failed:`, e) }

  /* ── 6e. Analytics (best-effort) ────────────────────────────── */
  try {
    await sb.rpc('increment_analytics_daily', {
      p_client_id:      clientId,
      p_date:           new Date().toISOString().split('T')[0],
      p_new_leads:      isNewLead ? 1 : 0,
      p_messages_count: messages.length,
      p_demos_booked:   appointmentId ? 1 : 0,
    })
  } catch { /* RPC not deployed yet */ }

  /* 7. Return ──────────────────────────────────────────────────── */
  return NextResponse.json({
    ok:          true,
    request_id:  rid,
    lead_id:     leadId,
    is_new_lead: isNewLead,
    ...(convId        && { conversation_id: convId        }),
    ...(appointmentId && { appointment_id:  appointmentId }),
  })
}
