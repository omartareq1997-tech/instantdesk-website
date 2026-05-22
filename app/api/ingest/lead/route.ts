/**
 * POST /api/ingest/lead
 * ══════════════════════════════════════════════════════════════════
 *
 * Secure webhook endpoint consumed by Make.com scenarios.
 * Inserts or updates a lead captured by the chatbot, then creates
 * the linked conversation, messages, appointment (if booked), and
 * activity events — all in one atomic call from Make.
 *
 * ── Authentication ────────────────────────────────────────────────
 * Every request MUST include:
 *   Authorization: Bearer <INGEST_API_KEY>
 *
 * Set INGEST_API_KEY in Vercel env vars (no NEXT_PUBLIC_ prefix).
 * In Make, add an HTTP header module before the webhook call.
 *
 * ── Make.com HTTP module settings ────────────────────────────────
 * Method : POST
 * URL    : https://your-domain.com/api/ingest/lead
 * Headers:
 *   Content-Type : application/json
 *   Authorization: Bearer {{INGEST_API_KEY}}
 *
 * ── Full JSON body example ────────────────────────────────────────
 * {
 *   "client_id":        "00000000-0000-0000-0000-000000000001",
 *   "name":             "Sarah Mitchell",
 *   "company":          "Orbit Digital",
 *   "email":            "sarah@orbitdigital.io",
 *   "phone":            "+44 7700 900001",
 *   "source":           "whatsapp",
 *   "interest":         "AI Receptionist",
 *   "message":          "Hi, I saw your ad about WhatsApp automation.",
 *   "score":            72,
 *   "score_label":      "warm",
 *   "appointment_date": "2026-06-05T14:00:00Z",
 *   "appointment_type": "demo_call",
 *   "conversation_id":  "550e8400-e29b-41d4-a716-446655440000",
 *   "messages": [
 *     { "role": "user", "content": "Hi, I saw your ad about WhatsApp automation." },
 *     {
 *       "role": "ai",
 *       "content": "Hi Sarah! We automate WhatsApp 24/7 — want to see a demo?",
 *       "response_time_ms": 2800
 *     }
 *   ]
 * }
 *
 * ── Minimal JSON body (only required fields) ──────────────────────
 * {
 *   "client_id": "00000000-0000-0000-0000-000000000001",
 *   "name":      "James Okafor"
 * }
 *
 * ── Niche-specific metadata examples ─────────────────────────────
 * Any flat key/value pairs can be sent inside "metadata" and will be
 * stored as JSONB on the leads row. The Lead Pipeline drawer renders
 * all keys under a "Custom Details" section automatically.
 *
 * Dental practice:
 * { ..., "metadata": { "practice_type": "NHS + Private", "patients_per_day": 40, "software": "Dentally" } }
 *
 * Legal firm:
 * { ..., "metadata": { "area_of_law": "Employment", "case_value": "£50k+", "urgency": "High" } }
 *
 * E-commerce:
 * { ..., "metadata": { "platform": "Shopify", "monthly_orders": 1200, "avg_basket": "£68" } }
 *
 * SaaS startup:
 * { ..., "metadata": { "mrr": "£8k", "team_size": 12, "tech_stack": "React + Node", "trial": true } }
 *
 * Metadata values can be strings, numbers, or booleans. Nested
 * objects and arrays will be JSON-serialised for display.
 *
 * ── Response (success) ────────────────────────────────────────────
 * HTTP 200
 * {
 *   "ok":              true,
 *   "request_id":      "abc123",
 *   "lead_id":         "uuid",
 *   "is_new_lead":     true,
 *   "conversation_id": "uuid",   ← only if messages were provided
 *   "appointment_id":  "uuid"    ← only if appointment_date was provided
 * }
 *
 * ── Response (error) ──────────────────────────────────────────────
 * HTTP 4xx / 5xx
 * { "ok": false, "error": "human-readable message", "request_id": "..." }
 *
 * ══════════════════════════════════════════════════════════════════
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'

/* ── Helpers ─────────────────────────────────────────────────────── */

/** Timing-safe string comparison — prevents timing attacks on the API key. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

function requestId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function err(msg: string, status: number, rid: string) {
  return NextResponse.json({ ok: false, error: msg, request_id: rid }, { status })
}

/**
 * Map a chatbot source string to the `channel` enum used in
 * the `conversations` table.
 */
function sourceToChannel(source: string | undefined): string {
  switch (source) {
    case 'whatsapp':    return 'whatsapp'
    case 'email':       return 'email'
    case 'instagram':   return 'instagram'
    case 'website_chat':
    default:            return 'website'
  }
}

/**
 * Derive a human-readable source label for activity event descriptions.
 */
function sourceLabel(source: string | undefined): string {
  switch (source) {
    case 'whatsapp':    return 'WhatsApp'
    case 'email':       return 'Email'
    case 'instagram':   return 'Instagram DM'
    case 'website_chat':return 'Website Chat'
    default:            return 'Chatbot'
  }
}

/**
 * Derive default lead score from source when Make doesn't supply one.
 */
function defaultScore(source: string | undefined): { score: number; score_label: string } {
  switch (source) {
    case 'whatsapp':    return { score: 62, score_label: 'warm' }
    case 'instagram':   return { score: 50, score_label: 'warm' }
    case 'website_chat':return { score: 55, score_label: 'warm' }
    case 'email':       return { score: 45, score_label: 'cold' }
    default:            return { score: 40, score_label: 'cold' }
  }
}

/* ── Ingest types ────────────────────────────────────────────────── */

interface IngestMessage {
  role:             'user' | 'ai' | 'agent'
  content:          string
  response_time_ms?: number
  created_at?:      string
}

interface IngestLeadBody {
  client_id:         string
  name:              string
  company?:          string
  email?:            string
  phone?:            string
  source?:           string
  interest?:         string
  message?:          string
  score?:            number
  score_label?:      string
  appointment_date?: string
  appointment_type?: string
  conversation_id?:  string
  messages?:         IngestMessage[]
  /** Niche-specific custom fields. Stored as JSONB on the leads row.
   *  Scalar values only (string | number | boolean). */
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
  if (!safeEqual(token, apiKey)) {
    return err('Unauthorized', 401, rid)
  }

  /* 2. Parse body ──────────────────────────────────────────────── */
  let body: IngestLeadBody
  try {
    body = await req.json()
  } catch {
    return err('Invalid JSON body', 400, rid)
  }

  /* 3. Validate required fields ───────────────────────────────── */
  if (!body.client_id || typeof body.client_id !== 'string') {
    return err('client_id is required', 400, rid)
  }
  if (!body.name || typeof body.name !== 'string') {
    return err('name is required', 400, rid)
  }

  /* 4. Normalise inputs ────────────────────────────────────────── */
  const clientId    = body.client_id.trim()
  const name        = body.name.trim()
  const company     = body.company?.trim()  ?? ''
  const email       = body.email?.trim()    || null
  const phone       = body.phone?.trim()    || null
  const source      = body.source?.trim()   || 'website_chat'
  const interest    = body.interest?.trim() || null
  const scoreData   = defaultScore(source)
  const score       = typeof body.score === 'number'  ? body.score       : scoreData.score
  const scoreLabel  = typeof body.score_label === 'string' ? body.score_label : scoreData.score_label
  const messages    = Array.isArray(body.messages) ? body.messages : []
  const firstMsg    = body.message?.trim() || messages.find(m => m.role === 'user')?.content || null
  // Sanitise metadata: keep only scalar values, drop nulls
  const metadata: Record<string, unknown> | null = (() => {
    if (!body.metadata || typeof body.metadata !== 'object' || Array.isArray(body.metadata)) return null
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body.metadata)) {
      if (v !== null && v !== undefined && ['string','number','boolean'].includes(typeof v)) {
        clean[k] = v
      } else if (Array.isArray(v) || (typeof v === 'object' && v !== null)) {
        // Allow nested JSON — rendered as serialised string in the UI
        clean[k] = v
      }
    }
    return Object.keys(clean).length > 0 ? clean : null
  })()

  /* 5. Supabase (service role — bypasses RLS) ──────────────────── */
  const sb = createAdminClient()

  /* ── 5a. Upsert lead ─────────────────────────────────────────── */
  let leadId: string
  let isNewLead = false

  try {
    // Idempotent: match on (client_id, email) when email is provided.
    // This prevents duplicate leads when Make retries after a partial failure.
    if (email) {
      const { data: existing } = await sb
        .from('leads')
        .select('id')
        .eq('client_id', clientId)
        .eq('email', email)
        .maybeSingle()

      if (existing?.id) {
        // Update fields that may have changed; merge metadata (new keys win)
        const updatePayload: Record<string, unknown> = {
          name, company, phone,
          source, interest: interest ?? undefined,
          score, score_label: scoreLabel,
          updated_at: new Date().toISOString(),
        }
        if (metadata) updatePayload.metadata = metadata
        await sb.from('leads').update(updatePayload).eq('id', existing.id)
        leadId = existing.id
      } else {
        const { data, error } = await sb
          .from('leads')
          .insert({
            client_id: clientId,
            name, company, email, phone,
            source, interest: interest ?? undefined,
            score, score_label: scoreLabel,
            status: 'new',
            ...(metadata && { metadata }),
          })
          .select('id')
          .single()
        if (error) throw error
        leadId    = data.id
        isNewLead = true
      }
    } else {
      // No email — always insert (no dedup key available)
      const { data, error } = await sb
        .from('leads')
        .insert({
          client_id: clientId,
          name, company, phone,
          source, interest: interest ?? undefined,
          score, score_label: scoreLabel,
          status: 'new',
          ...(metadata && { metadata }),
        })
        .select('id')
        .single()
      if (error) throw error
      leadId    = data.id
      isNewLead = true
    }
  } catch (e) {
    console.error(`[ingest/lead][${rid}] Lead upsert failed:`, e)
    return err('Failed to save lead', 500, rid)
  }

  /* ── 5b. Conversation + messages (optional) ──────────────────── */
  let convId: string | undefined

  if (messages.length > 0 || body.conversation_id) {
    try {
      convId = body.conversation_id?.trim() || crypto.randomUUID()

      // Upsert conversation: on conflict (id) update last_message_at
      await sb.from('conversations').upsert(
        {
          id:              convId,
          client_id:       clientId,
          lead_id:         leadId,
          channel:         sourceToChannel(source),
          status:          'open',
          last_message_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )

      // Insert messages in chronological order if any provided
      if (messages.length > 0) {
        const msgRows = messages.map((m, idx) => ({
          conversation_id: convId!,
          client_id:       clientId,
          from_role:       m.role,
          content:         m.content,
          response_time_ms: m.response_time_ms ?? null,
          // Preserve original timestamp if provided; otherwise space by 1s
          created_at: m.created_at ?? new Date(Date.now() + idx * 1000).toISOString(),
        }))
        await sb.from('messages').insert(msgRows)
      }
    } catch (e) {
      // Non-critical — lead is already saved; log and continue
      console.warn(`[ingest/lead][${rid}] Conversation/messages insert failed:`, e)
    }
  } else if (firstMsg) {
    // Single message field provided without messages array — store as a note
    // (no conversation row needed, but record first message as activity context)
  }

  /* ── 5c. Appointment (optional) ──────────────────────────────── */
  let appointmentId: string | undefined

  if (body.appointment_date) {
    try {
      const apptType = body.appointment_type?.trim() || 'demo_call'

      const { data: appt, error: apptErr } = await sb
        .from('appointments')
        .insert({
          client_id:    clientId,
          lead_id:      leadId,
          lead_name:    name,
          lead_company: company,
          type:         apptType,
          scheduled_at: body.appointment_date,
          status:       'pending',
        })
        .select('id')
        .single()

      if (apptErr) throw apptErr
      appointmentId = appt.id
    } catch (e) {
      console.warn(`[ingest/lead][${rid}] Appointment insert failed:`, e)
    }
  }

  /* ── 5d. Activity events (best-effort) ───────────────────────── */
  const activityRows: object[] = []
  const now = new Date().toISOString()

  // Lead captured / updated
  activityRows.push({
    client_id:   clientId,
    lead_id:     leadId,
    type:        source === 'email' ? 'email' : 'sms',
    title:       isNewLead ? `New lead captured — ${name}` : `Lead updated — ${name}`,
    description: `${sourceLabel(source)} · ${isNewLead ? 'auto-triggered' : 'webhook update'}`,
    created_at:  now,
  })

  // First message received (if there is a user message)
  if (firstMsg) {
    activityRows.push({
      client_id:   clientId,
      lead_id:     leadId,
      type:        source === 'email' ? 'email' : 'sms',
      title:       `Message received — ${name}`,
      description: firstMsg.length > 100 ? firstMsg.slice(0, 97) + '…' : firstMsg,
      created_at:  new Date(Date.now() + 100).toISOString(),
    })
  }

  // Appointment booked
  if (appointmentId && body.appointment_date) {
    const apptLabel = new Date(body.appointment_date).toLocaleString('en-GB', {
      weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit',
    })
    activityRows.push({
      client_id:   clientId,
      lead_id:     leadId,
      type:        'appointment',
      title:       `Demo booked — ${name}`,
      description: apptLabel,
      created_at:  new Date(Date.now() + 200).toISOString(),
    })
  }

  try {
    await sb.from('activity_events').insert(activityRows)
  } catch (e) {
    console.warn(`[ingest/lead][${rid}] Activity events insert failed:`, e)
  }

  /* ── 5e. Increment analytics_daily (best-effort) ─────────────── */
  try {
    const today = new Date().toISOString().split('T')[0]
    await sb.rpc('increment_analytics_daily', {
      p_client_id:       clientId,
      p_date:            today,
      p_new_leads:       isNewLead ? 1 : 0,
      p_messages_count:  messages.length,
      p_demos_booked:    appointmentId ? 1 : 0,
    })
  } catch {
    // RPC may not exist yet — silently skip
  }

  /* 6. Return ──────────────────────────────────────────────────── */
  return NextResponse.json({
    ok:              true,
    request_id:      rid,
    lead_id:         leadId,
    is_new_lead:     isNewLead,
    ...(convId        && { conversation_id: convId        }),
    ...(appointmentId && { appointment_id:  appointmentId }),
  })
}
