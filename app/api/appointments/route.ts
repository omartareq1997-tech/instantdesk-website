/**
 * GET  /api/appointments?lead_id=<uuid>  — fetch all appointments for a lead
 * POST /api/appointments                 — create a manual appointment
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-server'
import { logEvent, ACTOR } from '../_lib/logEvent'
import { getActorRole } from '../../lib/getActorRole'
import { getPermissions } from '../../lib/permissions'
import { getSessionBusinessId } from '../../lib/getSessionBusinessId'

const VALID_STATUSES  = new Set(['confirmed', 'pending', 'completed', 'cancelled'])
const VALID_TYPES     = new Set(['demo_call', 'discovery_call', 'onboarding', 'follow_up'])

/* ── GET ──────────────────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  const leadId = req.nextUrl.searchParams.get('lead_id')
  if (!leadId) return NextResponse.json({ appointments: [] })

  try {
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('appointments')
      .select('id, lead_id, lead_name, lead_company, type, scheduled_at, status, notes')
      .eq('lead_id', leadId)
      .order('scheduled_at', { ascending: true })

    if (error) {
      console.error('[GET /api/appointments] error:', error.message, '| lead_id:', leadId)
      return NextResponse.json({ appointments: [] })
    }

    return NextResponse.json({ appointments: data ?? [] })
  } catch (err) {
    console.error('[GET /api/appointments] unexpected error:', err)
    return NextResponse.json({ appointments: [] })
  }
}

/* ── POST ─────────────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    const { role } = await getActorRole(req)
    if (!getPermissions(role).canAddAppt) {
      return NextResponse.json({ error: 'Insufficient permissions to create appointments' }, { status: 403 })
    }

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

    const { clientId: sessionClientId } = await getSessionBusinessId()

    const insertPayload: Record<string, unknown> = {
      client_id:    sessionClientId,
      business_id:  sessionClientId,
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

    void logEvent({
      type:        'appointment_created',
      title:       `Appointment scheduled: ${data.lead_name ?? 'Unknown'}`,
      description: `${data.type?.replace(/_/g, ' ')} on ${new Date(data.scheduled_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
      leadId:      data.lead_id ?? null,
      clientId:    sessionClientId,
      meta: {
        actor: ACTOR, undoable: true, entity_id: data.id, entity_type: 'appointment',
        entity_name: data.lead_name ?? 'Unknown',
        new_value:   { type: data.type, scheduled_at: data.scheduled_at, status: data.status },
        undo_data:   { appointment_id: data.id },
      },
    })

    return NextResponse.json({ appointment: data }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/appointments] Unexpected error:', msg)
    return NextResponse.json({ error: msg || 'Failed to create appointment' }, { status: 500 })
  }
}
