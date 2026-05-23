/**
 * GET    /api/leads/[id]  — fetch a single lead
 * PATCH  /api/leads/[id]  — update lead fields
 * DELETE /api/leads/[id]  — cascade-delete lead + all related records
 *
 * Uses service-role client — never call from browser code.
 * FK constraints on child tables use ON DELETE SET NULL, so cascade
 * is handled manually here before deleting the lead row itself.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { logEvent, ACTOR } from '../../_lib/logEvent'

type Ctx = { params: Promise<{ id: string }> }

/* ── GET ──────────────────────────────────────────────────────────── */

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  try {
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('leads')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ lead: data })
  } catch (err) {
    console.error(`[GET /api/leads/${id}]`, err)
    return NextResponse.json({ error: 'Failed to fetch lead' }, { status: 500 })
  }
}

/* ── PATCH ────────────────────────────────────────────────────────── */

const ALLOWED_LEAD_FIELDS = new Set([
  'name', 'company', 'email', 'phone', 'source', 'interest',
  'score', 'score_label', 'status', 'metadata',
  'ai_sms', 'email_seq', 'nurture', 'smart_assign', 'auto_call',
  'assigned_agent',
])

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  try {
    const body = await req.json()

    const patch: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body)) {
      if (ALLOWED_LEAD_FIELDS.has(k)) patch[k] = v
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    patch.updated_at = new Date().toISOString()

    const sb = createAdminClient()

    // Read current state before applying the patch (for logging)
    const { data: before } = await sb.from('leads').select('*').eq('id', id).single()

    const { data, error } = await sb
      .from('leads')
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

    // Determine which log event to emit
    if (before) {
      const changedPatchKeys  = Object.keys(patch).filter(k => k !== 'updated_at')
      const isStatusChange    = 'status' in patch && patch.status !== before.status
      const isMetadataChange  = 'metadata' in patch && !('status' in patch) &&
        !('name' in patch) && !('company' in patch) && !('email' in patch) &&
        !('phone' in patch) && !('source' in patch) && !('score' in patch)
      const isScoreChange     = !isStatusChange && !isMetadataChange &&
        changedPatchKeys.every(k => k === 'score' || k === 'score_label') &&
        (patch.score !== before.score || patch.score_label !== before.score_label)
      const isCoreEdit        = !isStatusChange && !isMetadataChange && !isScoreChange

      if (isStatusChange) {
        void logEvent({
          type:        'status_changed',
          title:       `Status changed: ${before.name}`,
          description: `${before.status} → ${patch.status as string}`,
          leadId:      id,
          meta: {
            actor: ACTOR, undoable: true, entity_id: id, entity_type: 'lead',
            entity_name: before.name,
            old_value:  { status: before.status },
            new_value:  { status: patch.status },
            undo_data:  { lead_id: id, old_status: before.status },
          },
        })
      } else if (isScoreChange) {
        void logEvent({
          type:        'score_changed',
          title:       `Score changed: ${before.name}`,
          description: `${before.score_label ?? ''} → ${(patch.score_label ?? '') as string}`,
          leadId:      id,
          meta: {
            actor: ACTOR, undoable: true, entity_id: id, entity_type: 'lead',
            entity_name: before.name,
            old_value:  { score: before.score, score_label: before.score_label },
            new_value:  { score: patch.score,  score_label: patch.score_label  },
            undo_data:  {
              lead_id:    id,
              old_fields: { score: before.score, score_label: before.score_label },
            },
          },
        })
      } else if (isMetadataChange) {
        void logEvent({
          type:        'notes_changed',
          title:       `Notes updated: ${before.name}`,
          leadId:      id,
          meta: {
            actor: ACTOR, undoable: true, entity_id: id, entity_type: 'lead',
            entity_name: before.name,
            undo_data: { lead_id: id, old_metadata: before.metadata },
          },
        })
      } else if (isCoreEdit) {
        void logEvent({
          type:        'lead_updated',
          title:       `Lead updated: ${data.name}`,
          description: `Changed: ${changedPatchKeys.join(', ')}`,
          leadId:      id,
          meta: {
            actor: ACTOR, undoable: true, entity_id: id, entity_type: 'lead',
            entity_name: data.name,
            old_value: changedPatchKeys.reduce<Record<string, unknown>>((acc, k) => {
              acc[k] = (before as Record<string, unknown>)[k]; return acc
            }, {}),
            new_value: changedPatchKeys.reduce<Record<string, unknown>>((acc, k) => {
              acc[k] = patch[k]; return acc
            }, {}),
            undo_data: {
              lead_id:    id,
              old_fields: changedPatchKeys.reduce<Record<string, unknown>>((acc, k) => {
                acc[k] = (before as Record<string, unknown>)[k]; return acc
              }, {}),
            },
          },
        })
      }
    }

    return NextResponse.json({ lead: data })
  } catch (err) {
    console.error(`[PATCH /api/leads/${id}]`, err)
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
  }
}

/* ── DELETE ───────────────────────────────────────────────────────── */

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  try {
    const sb = createAdminClient()

    // Capture full snapshot before any deletions
    const { data: leadSnap }  = await sb.from('leads').select('*').eq('id', id).single()
    const { data: apptSnaps } = await sb.from('appointments').select('*').eq('lead_id', id)

    // 1. Nullify lead_id on activity_events so they survive the lead deletion
    //    (audit history is permanent — NEVER delete it)
    await sb.from('activity_events').update({ lead_id: null }).eq('lead_id', id)

    // 2. Delete appointments linked to this lead
    const { error: apptErr } = await sb
      .from('appointments')
      .delete()
      .eq('lead_id', id)
    if (apptErr) throw apptErr

    // 3. Get conversation IDs for this lead, then delete their messages
    const { data: convos, error: convoFetchErr } = await sb
      .from('conversations')
      .select('id')
      .eq('lead_id', id)
    if (convoFetchErr) throw convoFetchErr

    if (convos && convos.length > 0) {
      const convoIds = convos.map((c: { id: string }) => c.id)
      const { error: msgErr } = await sb
        .from('messages')
        .delete()
        .in('conversation_id', convoIds)
      if (msgErr) throw msgErr

      const { error: convoDelErr } = await sb
        .from('conversations')
        .delete()
        .in('id', convoIds)
      if (convoDelErr) throw convoDelErr
    }

    // 4. Delete the lead itself
    const { error: leadErr } = await sb
      .from('leads')
      .delete()
      .eq('id', id)
    if (leadErr) throw leadErr

    if (leadSnap) {
      void logEvent({
        type:        'lead_deleted',
        title:       `Lead deleted: ${leadSnap.name}`,
        description: leadSnap.company || undefined,
        leadId:      null,
        meta: {
          actor: ACTOR, undoable: true, entity_id: id, entity_type: 'lead',
          entity_name: leadSnap.name,
          undo_data: {
            snapshot: {
              lead:         leadSnap,
              appointments: apptSnaps ?? [],
            },
          },
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(`[DELETE /api/leads/${id}]`, err)
    return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 })
  }
}
