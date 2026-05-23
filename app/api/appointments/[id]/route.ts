/**
 * PATCH  /api/appointments/[id]  — update appointment fields (date, status, type, notes)
 * DELETE /api/appointments/[id]  — delete a single appointment
 *
 * Uses service-role client — never call from browser code.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { logEvent, ACTOR } from '../../_lib/logEvent'

type Ctx = { params: Promise<{ id: string }> }

const VALID_STATUSES = new Set(['confirmed', 'pending', 'completed', 'cancelled'])
const VALID_TYPES    = new Set(['demo_call', 'discovery_call', 'onboarding', 'follow_up'])

/* ── PATCH ────────────────────────────────────────────────────────── */

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  try {
    const body = await req.json()
    const patch: Record<string, unknown> = {}

    if (typeof body.scheduled_at === 'string') {
      if (isNaN(Date.parse(body.scheduled_at))) {
        return NextResponse.json({ error: 'scheduled_at must be a valid ISO date' }, { status: 400 })
      }
      patch.scheduled_at = body.scheduled_at
    }

    if (typeof body.status === 'string') {
      if (!VALID_STATUSES.has(body.status)) {
        return NextResponse.json({ error: `status must be one of: ${[...VALID_STATUSES].join(', ')}` }, { status: 400 })
      }
      patch.status = body.status
    }

    if (typeof body.type === 'string') {
      if (!VALID_TYPES.has(body.type)) {
        return NextResponse.json({ error: `type must be one of: ${[...VALID_TYPES].join(', ')}` }, { status: 400 })
      }
      patch.type = body.type
    }

    if (typeof body.notes        === 'string') patch.notes        = body.notes.trim()
    if (typeof body.lead_name    === 'string') patch.lead_name    = body.lead_name.trim()
    if (typeof body.lead_company === 'string') patch.lead_company = body.lead_company.trim()
    if (typeof body.lead_id      === 'string') patch.lead_id      = body.lead_id.trim() || null

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const sb = createAdminClient()

    // Read current state for logging
    const { data: before } = await sb.from('appointments').select('*').eq('id', id).single()

    const { data, error } = await sb
      .from('appointments')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      throw error
    }

    if (before) {
      const isDrag = body._drag === true
      if (isDrag) {
        void logEvent({
          type:        'appointment_moved',
          title:       `Appointment moved: ${before.lead_name ?? 'Unknown'}`,
          description: `Rescheduled to ${new Date(data.scheduled_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
          leadId:      before.lead_id ?? null,
          meta: {
            actor: ACTOR, undoable: true, entity_id: id, entity_type: 'appointment',
            entity_name: before.lead_name ?? 'Unknown',
            old_value:   { scheduled_at: before.scheduled_at },
            new_value:   { scheduled_at: data.scheduled_at },
            undo_data:   { appointment_id: id, old_scheduled_at: before.scheduled_at },
          },
        })
      } else {
        void logEvent({
          type:        'appointment_updated',
          title:       `Appointment updated: ${before.lead_name ?? 'Unknown'}`,
          description: before.type?.replace(/_/g, ' '),
          leadId:      before.lead_id ?? null,
          meta: {
            actor: ACTOR, undoable: true, entity_id: id, entity_type: 'appointment',
            entity_name: before.lead_name ?? 'Unknown',
            old_value: {
              scheduled_at: before.scheduled_at, type: before.type,
              status: before.status, notes: before.notes,
            },
            new_value: {
              scheduled_at: data.scheduled_at, type: data.type,
              status: data.status, notes: data.notes,
            },
            undo_data: {
              appointment_id:   id,
              old_scheduled_at: before.scheduled_at,
              old_type:         before.type,
              old_status:       before.status,
              old_notes:        before.notes,
            },
          },
        })
      }
    }

    return NextResponse.json({ appointment: data })
  } catch (err) {
    console.error(`[PATCH /api/appointments/${id}]`, err)
    return NextResponse.json({ error: 'Failed to update appointment' }, { status: 500 })
  }
}

/* ── DELETE ───────────────────────────────────────────────────────── */

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  try {
    const sb = createAdminClient()

    // Capture snapshot before deletion
    const { data: snap } = await sb.from('appointments').select('*').eq('id', id).single()

    const { error } = await sb
      .from('appointments')
      .delete()
      .eq('id', id)

    if (error) throw error

    if (snap) {
      void logEvent({
        type:        'appointment_deleted',
        title:       `Appointment deleted: ${snap.lead_name ?? 'Unknown'}`,
        description: `${snap.type?.replace(/_/g, ' ')} on ${new Date(snap.scheduled_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
        leadId:      null,
        meta: {
          actor: ACTOR, undoable: true, entity_id: id, entity_type: 'appointment',
          entity_name: snap.lead_name ?? 'Unknown',
          undo_data:   { appointment: snap },
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(`[DELETE /api/appointments/${id}]`, err)
    return NextResponse.json({ error: 'Failed to delete appointment' }, { status: 500 })
  }
}
