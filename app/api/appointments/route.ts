/**
 * POST /api/appointments
 * Create a manual appointment (from dashboard "New Appointment" form).
 * Uses service-role client — never call from browser code.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-server'

const DEMO_CLIENT_ID = process.env.DEMO_CLIENT_ID ?? '00000000-0000-0000-0000-000000000001'

const VALID_STATUSES  = new Set(['confirmed', 'pending', 'completed', 'cancelled'])
const VALID_TYPES     = new Set(['demo_call', 'discovery_call', 'onboarding', 'follow_up'])

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const scheduledAt: string | undefined =
      typeof body.scheduled_at === 'string' ? body.scheduled_at : undefined
    if (!scheduledAt) {
      return NextResponse.json({ error: 'scheduled_at is required' }, { status: 400 })
    }

    if (isNaN(Date.parse(scheduledAt))) {
      return NextResponse.json({ error: 'scheduled_at must be a valid ISO date' }, { status: 400 })
    }

    const type: string =
      typeof body.type === 'string' && VALID_TYPES.has(body.type)
        ? body.type
        : 'demo_call'

    const status: string =
      typeof body.status === 'string' && VALID_STATUSES.has(body.status)
        ? body.status
        : 'pending'

    const clientId: string =
      typeof body.client_id === 'string' ? body.client_id : DEMO_CLIENT_ID

    const insertPayload: Record<string, unknown> = {
      client_id:    clientId,
      type,
      scheduled_at: scheduledAt,
      status,
      lead_name:    typeof body.lead_name    === 'string' ? body.lead_name.trim()    : null,
      lead_company: typeof body.lead_company === 'string' ? body.lead_company.trim() : null,
    }

    // Only include lead_id when present — FK constraint requires a real UUID
    if (typeof body.lead_id === 'string' && body.lead_id.trim()) {
      insertPayload.lead_id = body.lead_id.trim()
    }

    // Only include notes when the column exists and the value is non-empty.
    // The notes column is added via: ALTER TABLE appointments ADD COLUMN notes TEXT;
    // Omitting it when empty avoids a "column does not exist" error on older schemas.
    if (typeof body.notes === 'string' && body.notes.trim()) {
      insertPayload.notes = body.notes.trim()
    }

    const sb = createAdminClient()
    const { data, error } = await sb
      .from('appointments')
      .insert(insertPayload)
      .select('*')
      .single()

    if (error) {
      console.error('[POST /api/appointments] Supabase error:', {
        message: error.message,
        code:    error.code,
        details: error.details,
        hint:    error.hint,
        payload: insertPayload,
      })
      return NextResponse.json(
        { error: error.message || 'Failed to create appointment', code: error.code, hint: error.hint },
        { status: 500 },
      )
    }

    return NextResponse.json({ appointment: data }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/appointments] Unexpected error:', msg)
    return NextResponse.json({ error: msg || 'Failed to create appointment' }, { status: 500 })
  }
}
