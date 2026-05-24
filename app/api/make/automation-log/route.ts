/**
 * POST /api/make/automation-log
 *
 * Make.com calls this at the END of each scenario to record the execution result.
 * InstantDesk reads these logs in the Automation Control Center.
 *
 * ── How to call from Make.com ──────────────────────────────────────────────
 *
 *   Module : HTTP → Make a request
 *   Method : POST
 *   URL    : https://your-domain.com/api/make/automation-log
 *
 *   Headers:
 *     Content-Type  : application/json
 *     x-make-secret : {{env.MAKE_WEBHOOK_SECRET}}
 *
 *   Body (JSON):
 *     {
 *       "client_id":        "00000000-0000-0000-0000-000000000001",
 *       "automation_type":  "appointment_reminder",
 *       "status":           "success",          ← "success" | "failed" | "skipped"
 *       "message":          "Sent WhatsApp reminder to John Doe",
 *       "lead_id":          "{{lead.id}}",       ← optional, UUID
 *       "appointment_id":   "{{appt.id}}",       ← optional, UUID
 *       "execution_result": {                    ← optional, any JSON
 *         "channel":        "whatsapp",
 *         "sent_at":        "{{now}}",
 *         "response_code":  200
 *       }
 *     }
 *
 *   Recommended Make.com flow:
 *     1. HTTP GET /api/make/automation-settings?automation_type=X  → check enabled
 *     2. Router: if enabled=false → skip (log status "skipped")
 *     3. Sleep {{delay_minutes}} minutes
 *     4. Send message via WhatsApp / SMS / Email module
 *     5. HTTP POST /api/make/automation-log with status "success" or "failed"
 *
 * ── Response shape ──────────────────────────────────────────────────────────
 *
 *   201 → { log: { id, automation_type, status, message, created_at, ... } }
 *   400 → { error: "..." }   — missing required fields or invalid values
 *   401 → { error: "Unauthorized" }
 *   503 → { error: "Run sql/create_automation_tables.sql first." }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'

const VALID_STATUSES = new Set(['success', 'failed', 'skipped'])

function authorize(req: NextRequest): boolean {
  const secret = process.env.MAKE_WEBHOOK_SECRET
  if (!secret) return false
  return req.headers.get('x-make-secret') === secret
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()

    const client_id      = typeof body.client_id      === 'string' ? body.client_id      : null
    const automation_type = typeof body.automation_type === 'string' ? body.automation_type : null
    const status          = typeof body.status          === 'string' && VALID_STATUSES.has(body.status)
      ? body.status : null
    const message          = typeof body.message          === 'string' ? body.message          : null
    const lead_id          = typeof body.lead_id          === 'string' ? body.lead_id          : null
    const appointment_id   = typeof body.appointment_id   === 'string' ? body.appointment_id   : null
    const execution_result = body.execution_result && typeof body.execution_result === 'object'
      ? body.execution_result : null

    if (!client_id)       return NextResponse.json({ error: 'client_id is required' },       { status: 400 })
    if (!automation_type) return NextResponse.json({ error: 'automation_type is required' }, { status: 400 })
    if (!status)          return NextResponse.json({ error: 'status must be success | failed | skipped' }, { status: 400 })

    const sb = createAdminClient()
    const { data, error } = await sb
      .from('automation_logs')
      .insert({
        client_id,
        automation_type,
        status,
        message,
        lead_id,
        appointment_id,
        execution_result,
      })
      .select('*')
      .single()

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ error: 'Run sql/create_automation_tables.sql first.' }, { status: 503 })
      }
      throw error
    }

    return NextResponse.json({ log: data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/make/automation-log]', err)
    return NextResponse.json({ error: 'Failed to create automation log' }, { status: 500 })
  }
}
