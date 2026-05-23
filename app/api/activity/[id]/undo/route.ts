/**
 * POST /api/activity/[id]/undo
 * Undo a logged action by its activity event ID.
 *
 * Undo logic per event type:
 *   lead_created        → DELETE the lead (cascade)
 *   lead_deleted        → re-insert lead + appointments from snapshot
 *   lead_edited         → PATCH lead with old field values
 *   status_changed      → PATCH lead status back to old_status
 *   notes_changed       → PATCH lead metadata back to old_metadata
 *   appointment_created → DELETE the appointment
 *   appointment_deleted → re-insert appointment from snapshot
 *   appointment_edited  → PATCH appointment with old values
 *   appointment_moved   → PATCH appointment with old scheduled_at
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase-server'

type Ctx = { params: Promise<{ id: string }> }

const CLIENT_ID = process.env.DEMO_CLIENT_ID ?? '00000000-0000-0000-0000-000000000001'

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  try {
    const sb = createAdminClient()

    // 1. Fetch the event
    const { data: event, error: fetchErr } = await sb
      .from('activity_events')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchErr || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const meta = (event.metadata ?? {}) as Record<string, unknown>

    if (meta.undone) {
      return NextResponse.json({ error: 'Already undone' }, { status: 409 })
    }

    if (!meta.undoable) {
      return NextResponse.json({ error: 'This action is not undoable' }, { status: 400 })
    }

    const undo = (meta.undo_data ?? {}) as Record<string, unknown>
    const type = event.type as string

    // 2. Execute undo based on event type
    switch (type) {

      case 'lead_created': {
        const leadId = (undo.lead_id ?? event.lead_id) as string
        if (!leadId) return NextResponse.json({ error: 'Missing lead_id in undo_data' }, { status: 400 })
        // Delete activity events for this lead first
        await sb.from('activity_events').delete().eq('lead_id', leadId)
        await sb.from('appointments').delete().eq('lead_id', leadId)
        const { error } = await sb.from('leads').delete().eq('id', leadId)
        if (error) throw error
        break
      }

      case 'lead_deleted': {
        const snapshot = undo.snapshot as Record<string, unknown> | undefined
        if (!snapshot) return NextResponse.json({ error: 'No snapshot in undo_data' }, { status: 400 })

        const lead = snapshot.lead as Record<string, unknown>
        if (!lead) return NextResponse.json({ error: 'No lead in snapshot' }, { status: 400 })

        const { error: leadErr } = await sb.from('leads').insert({
          ...lead,
          client_id: CLIENT_ID,
        })
        if (leadErr) throw leadErr

        const appts = snapshot.appointments as Record<string, unknown>[] | undefined
        if (appts && appts.length > 0) {
          const { error: apptErr } = await sb.from('appointments').insert(
            appts.map(a => ({ ...a, client_id: CLIENT_ID }))
          )
          if (apptErr) console.warn('[undo lead_deleted] Could not restore appointments:', apptErr.message)
        }
        break
      }

      case 'lead_edited': {
        const leadId = (undo.lead_id ?? event.lead_id) as string
        const patch  = undo.old_fields as Record<string, unknown> | undefined
        if (!leadId || !patch) return NextResponse.json({ error: 'Missing lead_id or old_fields in undo_data' }, { status: 400 })
        const { error } = await sb.from('leads').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', leadId)
        if (error) throw error
        break
      }

      case 'status_changed': {
        const leadId    = (undo.lead_id ?? event.lead_id) as string
        const oldStatus = undo.old_status as string | undefined
        if (!leadId || !oldStatus) return NextResponse.json({ error: 'Missing lead_id or old_status in undo_data' }, { status: 400 })
        const { error } = await sb.from('leads').update({ status: oldStatus, updated_at: new Date().toISOString() }).eq('id', leadId)
        if (error) throw error
        break
      }

      case 'notes_changed': {
        const leadId      = (undo.lead_id ?? event.lead_id) as string
        const oldMetadata = undo.old_metadata as Record<string, unknown> | undefined
        if (!leadId) return NextResponse.json({ error: 'Missing lead_id in undo_data' }, { status: 400 })
        const { error } = await sb.from('leads').update({ metadata: oldMetadata ?? null, updated_at: new Date().toISOString() }).eq('id', leadId)
        if (error) throw error
        break
      }

      case 'appointment_created': {
        const apptId = (undo.appointment_id) as string
        if (!apptId) return NextResponse.json({ error: 'Missing appointment_id in undo_data' }, { status: 400 })
        const { error } = await sb.from('appointments').delete().eq('id', apptId)
        if (error) throw error
        break
      }

      case 'appointment_deleted': {
        const appt = undo.appointment as Record<string, unknown> | undefined
        if (!appt) return NextResponse.json({ error: 'No appointment in undo_data' }, { status: 400 })
        const { error } = await sb.from('appointments').insert({ ...appt, client_id: CLIENT_ID })
        if (error) throw error
        break
      }

      case 'appointment_edited': {
        const apptId = undo.appointment_id as string
        if (!apptId) return NextResponse.json({ error: 'Missing appointment_id in undo_data' }, { status: 400 })
        const patch: Record<string, unknown> = {}
        if (undo.old_scheduled_at) patch.scheduled_at = undo.old_scheduled_at
        if (undo.old_type)         patch.type          = undo.old_type
        if (undo.old_status)       patch.status        = undo.old_status
        if ('old_notes' in undo)   patch.notes         = undo.old_notes
        if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No fields to restore' }, { status: 400 })
        const { error } = await sb.from('appointments').update(patch).eq('id', apptId)
        if (error) throw error
        break
      }

      case 'appointment_moved': {
        const apptId       = undo.appointment_id as string
        const oldScheduled = undo.old_scheduled_at as string | undefined
        if (!apptId || !oldScheduled) return NextResponse.json({ error: 'Missing appointment_id or old_scheduled_at in undo_data' }, { status: 400 })
        const { error } = await sb.from('appointments').update({ scheduled_at: oldScheduled }).eq('id', apptId)
        if (error) throw error
        break
      }

      default:
        return NextResponse.json({ error: `Undo not supported for event type: ${type}` }, { status: 400 })
    }

    // 3. Mark the event as undone
    const updatedMeta = { ...meta, undone: true, undone_at: new Date().toISOString() }
    await sb.from('activity_events').update({ metadata: updatedMeta }).eq('id', id)

    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[POST /api/activity/${id}/undo]`, msg)
    return NextResponse.json({ error: msg || 'Undo failed' }, { status: 500 })
  }
}
