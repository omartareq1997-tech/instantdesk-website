/**
 * POST /api/ingest/activity
 * ══════════════════════════════════════════════════════════════════
 *
 * Secure webhook endpoint consumed by Make.com scenarios.
 * Inserts a single activity event into the `activity_events` table.
 * Use this for automation milestones that don't involve a new lead —
 * e.g. AI SMS sent, smart assignment, nurture sequence started.
 *
 * ── Authentication ────────────────────────────────────────────────
 * Every request MUST include:
 *   Authorization: Bearer <INGEST_API_KEY>
 *
 * Same key as /api/ingest/lead. Set INGEST_API_KEY in deployment env
 * vars (no NEXT_PUBLIC_ prefix so it is never bundled to the browser).
 *
 * ── Make.com HTTP module settings ────────────────────────────────
 * Method : POST
 * URL    : https://your-domain.com/api/ingest/activity
 * Headers:
 *   Content-Type : application/json
 *   Authorization: Bearer {{INGEST_API_KEY}}
 *
 * ── JSON body — all event types with examples ─────────────────────
 *
 * SMS / WhatsApp reply:
 * {
 *   "client_id":   "00000000-0000-0000-0000-000000000001",
 *   "type":        "sms",
 *   "title":       "AI replied to James Okafor in 3s",
 *   "description": "WhatsApp · auto-triggered",
 *   "lead_id":     "uuid-of-lead"
 * }
 *
 * Appointment booked (standalone, not via /ingest/lead):
 * {
 *   "client_id":   "00000000-0000-0000-0000-000000000001",
 *   "type":        "appointment",
 *   "title":       "Demo booked — Sarah Mitchell",
 *   "description": "Thu 22 May · 3:00 PM",
 *   "lead_id":     "uuid-of-lead"
 * }
 *
 * Smart assignment:
 * {
 *   "client_id":   "00000000-0000-0000-0000-000000000001",
 *   "type":        "assignment",
 *   "title":       "Lead assigned to Priya S.",
 *   "description": "Chen Wei · smart assignment",
 *   "lead_id":     "uuid-of-lead"
 * }
 *
 * Email sequence:
 * {
 *   "client_id":   "00000000-0000-0000-0000-000000000001",
 *   "type":        "email",
 *   "title":       "Email sequence triggered — Tom Reynolds",
 *   "description": "Follow-up sequence day 1",
 *   "lead_id":     "uuid-of-lead"
 * }
 *
 * Auto-call:
 * {
 *   "client_id":   "00000000-0000-0000-0000-000000000001",
 *   "type":        "call",
 *   "title":       "Auto-call completed — Daniel Lee",
 *   "description": "Duration: 4 min 32 sec",
 *   "lead_id":     "uuid-of-lead"
 * }
 *
 * With optional metadata blob (stored for future use):
 * {
 *   "client_id":   "00000000-0000-0000-0000-000000000001",
 *   "type":        "sms",
 *   "title":       "AI replied to Nina Kowalski in 8s",
 *   "description": "WhatsApp reply sent in 8s",
 *   "lead_id":     "uuid-of-lead",
 *   "metadata": {
 *     "channel":          "whatsapp",
 *     "response_time_ms": 8200,
 *     "scenario_id":      "make-scenario-42"
 *   }
 * }
 *
 * ── Response (success) ────────────────────────────────────────────
 * HTTP 200
 * {
 *   "ok":          true,
 *   "request_id":  "abc123",
 *   "activity_id": "uuid"
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

const VALID_TYPES = ['sms', 'appointment', 'assignment', 'email', 'call'] as const
type ActivityType = typeof VALID_TYPES[number]

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

/* ── Ingest type ─────────────────────────────────────────────────── */

interface IngestActivityBody {
  client_id:    string
  type:         string
  title:        string
  description?: string
  lead_id?:     string
  metadata?:    Record<string, unknown>
}

/* ── Route handler ───────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  const rid = requestId()

  /* 1. Auth ────────────────────────────────────────────────────── */
  const apiKey = process.env.INGEST_API_KEY
  if (!apiKey) {
    console.error(`[ingest/activity][${rid}] INGEST_API_KEY env var not set`)
    return err('Server misconfiguration', 500, rid)
  }

  const authHeader = req.headers.get('authorization') ?? ''
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!safeEqual(token, apiKey)) {
    return err('Unauthorized', 401, rid)
  }

  /* 2. Parse body ──────────────────────────────────────────────── */
  let body: IngestActivityBody
  try {
    body = await req.json()
  } catch {
    return err('Invalid JSON body', 400, rid)
  }

  /* 3. Validate ────────────────────────────────────────────────── */
  if (!body.client_id || typeof body.client_id !== 'string') {
    return err('client_id is required', 400, rid)
  }
  if (!body.title || typeof body.title !== 'string') {
    return err('title is required', 400, rid)
  }
  if (!body.type || !VALID_TYPES.includes(body.type as ActivityType)) {
    return err(
      `type must be one of: ${VALID_TYPES.join(', ')}`,
      400,
      rid,
    )
  }

  /* 4. Normalise ───────────────────────────────────────────────── */
  const clientId   = body.client_id.trim()
  const type       = body.type as ActivityType
  const title      = body.title.trim()
  const description = body.description?.trim() || null
  const leadId     = body.lead_id?.trim()       || null
  // metadata is stored for future use (not displayed on dashboard yet)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _metadata  = body.metadata              ?? null

  /* 5. Insert ──────────────────────────────────────────────────── */
  const sb = createAdminClient()

  let activityId: string

  try {
    const { data, error } = await sb
      .from('activity_events')
      .insert({
        client_id:   clientId,
        lead_id:     leadId,
        type,
        title,
        description,
        created_at:  new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) throw error
    activityId = data.id
  } catch (e) {
    console.error(`[ingest/activity][${rid}] Insert failed:`, e)
    return err('Failed to save activity event', 500, rid)
  }

  /* 6. Return ──────────────────────────────────────────────────── */
  return NextResponse.json({
    ok:          true,
    request_id:  rid,
    activity_id: activityId,
  })
}
