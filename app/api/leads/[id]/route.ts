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
import { getActorRole } from '../../../lib/getActorRole'
import { getPermissions } from '../../../lib/permissions'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'

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
  'name', 'email', 'phone', 'source', 'interest',
  'status', 'metadata',
  'ai_sms', 'email_seq', 'nurture', 'smart_assign', 'auto_call',
  'assigned_agent',
])

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  try {
    const [{ name: actorName, role }, { clientId }] = await Promise.all([
      getActorRole(req),
      getSessionBusinessId(),
    ])
    const can = getPermissions(role)
    if (!can.canEditLead) {
      return NextResponse.json({ error: 'Insufficient permissions to edit leads' }, { status: 403 })
    }

    const body = await req.json()

    const patch: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body)) {
      if (ALLOWED_LEAD_FIELDS.has(k)) patch[k] = v
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const sb = createAdminClient()

    // Read current state before applying the patch (for logging + agent scope check)
    const { data: before } = await sb.from('leads').select('*').eq('id', id).single()

    // Agents may only edit leads assigned to them
    if (can.scopedToOwnLeads && before?.assigned_agent !== actorName) {
      return NextResponse.json({ error: 'Agents can only edit their own assigned leads' }, { status: 403 })
    }

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
      const changedPatchKeys  = Object.keys(patch)
      const isStatusChange    = 'status' in patch && patch.status !== before.status
      const isAssignment      = 'assigned_agent' in patch && patch.assigned_agent !== before.assigned_agent
      const isMetadataChange  = 'metadata' in patch && !('status' in patch) &&
        !('name' in patch) && !('email' in patch) &&
        !('phone' in patch) && !('source' in patch) && !('score' in patch) &&
        !('assigned_agent' in patch)
      const isScoreChange     = !isStatusChange && !isMetadataChange && !isAssignment &&
        changedPatchKeys.every(k => k === 'score' || k === 'score_label') &&
        (patch.score !== before.score || patch.score_label !== before.score_label)
      const isCoreEdit        = !isStatusChange && !isMetadataChange && !isScoreChange && !isAssignment

      if (isAssignment) {
        const oldAgent = (before.assigned_agent as string | null) ?? 'Unassigned'
        const newAgent = ((patch.assigned_agent as string | null) || 'Unassigned')
        void logEvent({
          type:        'lead_assigned',
          title:       `Lead assigned: ${before.name}`,
          description: `${oldAgent} → ${newAgent}`,
          leadId:      id,
          clientId,
          meta: {
            actor: actorName, undoable: true, entity_id: id, entity_type: 'lead',
            entity_name: before.name,
            old_value:   { assigned_agent: oldAgent },
            new_value:   { assigned_agent: newAgent },
            undo_data:   { lead_id: id, old_fields: { assigned_agent: before.assigned_agent } },
          },
        })
      } else if (isStatusChange) {
        void logEvent({
          type:        'status_changed',
          title:       `Status changed: ${before.name}`,
          description: `${before.status} → ${patch.status as string}`,
          leadId:      id,
          clientId,
          meta: {
            actor: actorName, undoable: true, entity_id: id, entity_type: 'lead',
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
          clientId,
          meta: {
            actor: actorName, undoable: true, entity_id: id, entity_type: 'lead',
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
          clientId,
          meta: {
            actor: actorName, undoable: true, entity_id: id, entity_type: 'lead',
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
          clientId,
          meta: {
            actor: actorName, undoable: true, entity_id: id, entity_type: 'lead',
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

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  console.log(`[deleteLead] deleting lead id: ${id}`)

  try {
    const [{ role }, { clientId }] = await Promise.all([
      getActorRole(req),
      getSessionBusinessId(),
    ])
    if (!getPermissions(role).canDeleteLead) {
      return NextResponse.json({ error: 'Insufficient permissions to delete leads' }, { status: 403 })
    }

    const sb = createAdminClient()

    // 1. Fetch the lead to get conversation_id and business_id.
    //    The live schema stores the link on leads.conversation_id, not conversations.lead_id.
    const { data: lead, error: fetchErr } = await sb
      .from('leads')
      .select('id, name, conversation_id, business_id')
      .eq('id', id)
      .maybeSingle()

    if (fetchErr) {
      console.error(`[deleteLead] fetch lead error:`, fetchErr)
      return NextResponse.json({ error: fetchErr.message, code: fetchErr.code, step: 'fetch_lead' }, { status: 500 })
    }
    if (!lead) {
      console.warn(`[deleteLead] lead not found: ${id}`)
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }
    console.log(`[deleteLead] lead found: "${lead.name}" | conversation_id: ${lead.conversation_id ?? 'none'} | business_id: ${lead.business_id ?? 'none'}`)

    const convId: string | null = (lead.conversation_id as string | null) ?? null

    // Snapshot appointments for the undo log (best-effort, non-blocking)
    const { data: apptSnaps } = await sb.from('appointments').select('*').eq('lead_id', id)

    // 2. Nullify lead_id on activity_events (audit history is permanent — never delete it).
    //    The FK is ON DELETE SET NULL so the DB handles this automatically, but we do it
    //    explicitly first so the log row is already clean before the lead row is gone.
    const aeUpd = await sb.from('activity_events').update({ lead_id: null }).eq('lead_id', id)
    if (aeUpd.error) {
      console.warn(`[deleteLead] activity_events nullify error (non-fatal):`, aeUpd.error.message)
    }

    // 3. Delete appointments linked to this lead
    const { error: apptErr } = await sb.from('appointments').delete().eq('lead_id', id)
    if (apptErr) {
      console.error(`[deleteLead] delete appointments error:`, apptErr.message, apptErr.code)
      return NextResponse.json({ error: apptErr.message, code: apptErr.code, step: 'delete_appointments' }, { status: 500 })
    }
    console.log(`[deleteLead] delete appointments ok`)

    // 4. Delete messages then conversation, using leads.conversation_id (not conversations.lead_id)
    if (convId) {
      const { error: msgErr } = await sb.from('messages').delete().eq('conversation_id', convId)
      if (msgErr) {
        console.error(`[deleteLead] delete messages error:`, msgErr.message, msgErr.code)
        return NextResponse.json({ error: msgErr.message, code: msgErr.code, step: 'delete_messages' }, { status: 500 })
      }
      console.log(`[deleteLead] delete messages ok`)

      const { error: convErr } = await sb.from('conversations').delete().eq('id', convId)
      if (convErr) {
        console.error(`[deleteLead] delete conversation error:`, convErr.message, convErr.code)
        return NextResponse.json({ error: convErr.message, code: convErr.code, step: 'delete_conversation' }, { status: 500 })
      }
      console.log(`[deleteLead] delete conversation ok`)
    } else {
      console.log(`[deleteLead] no conversation_id — skipping messages + conversation delete`)
    }

    // 5. Delete the lead itself
    const { error: leadErr } = await sb.from('leads').delete().eq('id', id)
    if (leadErr) {
      console.error(`[deleteLead] delete lead error:`, leadErr.message, leadErr.code)
      return NextResponse.json({ error: leadErr.message, code: leadErr.code, step: 'delete_lead' }, { status: 500 })
    }
    console.log(`[deleteLead] delete lead ok`)

    void logEvent({
      type:        'lead_deleted',
      title:       `Lead deleted: ${lead.name}`,
      description: undefined,
      leadId:      null,
      clientId,
      meta: {
        actor: ACTOR, undoable: true, entity_id: id, entity_type: 'lead',
        entity_name: lead.name as string,
        undo_data: { snapshot: { lead, appointments: apptSnaps ?? [] } },
      },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[deleteLead] unexpected error:`, err)
    return NextResponse.json({ error: msg, step: 'unexpected' }, { status: 500 })
  }
}
