/**
 * POST /api/activity/[id]/undo
 * Undo a logged action by its activity event ID.
 *
 * Immutable audit architecture: undo creates a NEW undo_* row — original events are
 * never mutated or deleted. The UI detects undone state relationally by scanning for
 * undo_* events whose metadata.original_event_id matches the original event's ID.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase-server'
import { logEvent, ACTOR } from '../../../_lib/logEvent'
import { getActorRole } from '../../../../lib/getActorRole'
import { getPermissions } from '../../../../lib/permissions'
import { getSessionBusinessId } from '../../../../lib/getSessionBusinessId'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  try {
    const [{ role }, { clientId }] = await Promise.all([
      getActorRole(req),
      getSessionBusinessId(),
    ])
    if (!getPermissions(role).canUndoActions) {
      return NextResponse.json({ error: 'Insufficient permissions to undo actions' }, { status: 403 })
    }

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

    if (!meta.undoable) {
      return NextResponse.json({ error: 'This action is not undoable' }, { status: 400 })
    }

    // Check if already undone: look for an undo_* event that references this event
    const { data: existingUndo } = await sb
      .from('activity_events')
      .select('id')
      .filter('metadata->>original_event_id', 'eq', id)
      .limit(1)
      .maybeSingle()

    if (existingUndo) {
      return NextResponse.json({ error: 'Already undone' }, { status: 409 })
    }

    const undo = (meta.undo_data ?? {}) as Record<string, unknown>
    // Use _type from metadata to recover real type (handles DB CHECK constraint fallback to 'assignment')
    const type = (meta._type as string) || (event.type as string)

    // 2. Execute undo based on event type
    switch (type) {

      case 'lead_created': {
        const leadId = (undo.lead_id ?? event.lead_id) as string
        if (!leadId) return NextResponse.json({ error: 'Missing lead_id in undo_data' }, { status: 400 })
        // Nullify lead_id on audit events to preserve history (never delete audit rows)
        await sb.from('activity_events').update({ lead_id: null }).eq('lead_id', leadId)
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
        // Strip columns that don't exist on leads table before restoring
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { company: _company, client_id: _cid, score: _score, score_label: _sl, updated_at: _ua, ...leadFields } = lead
        const { error: leadErr } = await sb.from('leads').insert({ ...leadFields, business_id: clientId })
        if (leadErr) throw leadErr
        const appts = snapshot.appointments as Record<string, unknown>[] | undefined
        if (appts && appts.length > 0) {
          const { error: apptErr } = await sb.from('appointments').insert(
            appts.map(a => ({ ...a, client_id: clientId, business_id: clientId }))
          )
          if (apptErr) console.warn('[undo lead_deleted] Could not restore appointments:', apptErr.message)
        }
        break
      }

      case 'lead_edited':
      case 'lead_updated': {
        const leadId = (undo.lead_id ?? event.lead_id) as string
        const rawPatch = undo.old_fields as Record<string, unknown> | undefined
        if (!leadId || !rawPatch) return NextResponse.json({ error: 'Missing lead_id or old_fields in undo_data' }, { status: 400 })
        // Strip columns that don't exist on leads table
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { company: _c, client_id: _ci, score: _s, score_label: _sl, ...patch } = rawPatch
        const { error } = await sb.from('leads').update(patch).eq('id', leadId)
        if (error) throw error
        break
      }

      case 'score_changed': {
        // score/score_label columns do not exist on leads table — undo is a no-op
        return NextResponse.json({ error: 'Undo not supported: score column removed from leads schema' }, { status: 400 })
      }

      case 'status_changed': {
        const leadId    = (undo.lead_id ?? event.lead_id) as string
        const oldStatus = undo.old_status as string | undefined
        if (!leadId || !oldStatus) return NextResponse.json({ error: 'Missing lead_id or old_status in undo_data' }, { status: 400 })
        const { error } = await sb.from('leads').update({ status: oldStatus }).eq('id', leadId)
        if (error) throw error
        break
      }

      case 'notes_changed': {
        const leadId      = (undo.lead_id ?? event.lead_id) as string
        const oldMetadata = undo.old_metadata as Record<string, unknown> | undefined
        if (!leadId) return NextResponse.json({ error: 'Missing lead_id in undo_data' }, { status: 400 })
        const { error } = await sb.from('leads').update({ metadata: oldMetadata ?? null }).eq('id', leadId)
        if (error) throw error
        break
      }

      case 'appointment_created': {
        const apptId = undo.appointment_id as string
        if (!apptId) return NextResponse.json({ error: 'Missing appointment_id in undo_data' }, { status: 400 })
        const { error } = await sb.from('appointments').delete().eq('id', apptId)
        if (error) throw error
        break
      }

      case 'appointment_deleted': {
        const appt = undo.appointment as Record<string, unknown> | undefined
        if (!appt) return NextResponse.json({ error: 'No appointment in undo_data' }, { status: 400 })
        const { error } = await sb.from('appointments').insert({ ...appt, client_id: clientId, business_id: clientId })
        if (error) throw error
        break
      }

      case 'appointment_edited':
      case 'appointment_updated': {
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

    // 3. Create new immutable undo_* audit row — NEVER mutate or delete the original event
    void logEvent({
      type:        `undo_${type}`,
      title:       `Undone: ${event.title as string}`,
      description: (event.description as string | null) ?? undefined,
      leadId:      (event.lead_id as string | null) ?? null,
      clientId,
      meta: {
        actor:              ACTOR,
        undoable:           false,
        entity_id:          meta.entity_id   as string | undefined,
        entity_type:        meta.entity_type as 'lead' | 'appointment' | undefined,
        entity_name:        meta.entity_name as string | undefined,
        original_event_id:  id,
      },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[POST /api/activity/${id}/undo]`, msg)
    return NextResponse.json({ error: msg || 'Undo failed' }, { status: 500 })
  }
}
