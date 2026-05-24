/**
 * PATCH  /api/team/[id]  — update role, status, or name
 * DELETE /api/team/[id]  — remove a team member
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { logEvent, ACTOR } from '../../_lib/logEvent'
import { getActorRole } from '../../../lib/getActorRole'
import { getPermissions } from '../../../lib/permissions'
import { PROTECTED_OWNER_ID } from '../route'

type Ctx = { params: Promise<{ id: string }> }

const VALID_ROLES    = new Set(['owner', 'team_leader', 'agent', 'viewer'])
const VALID_STATUSES = new Set(['active', 'invited'])

/* ── PATCH ───────────────────────────────────────────────────── */

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  try {
    if (id === PROTECTED_OWNER_ID) {
      return NextResponse.json({ error: 'Cannot modify the primary owner account' }, { status: 403 })
    }

    const { role: actorRole } = await getActorRole(req)
    const can = getPermissions(actorRole)
    if (!can.canChangeRole) {
      return NextResponse.json({ error: 'Insufficient permissions to update team members' }, { status: 403 })
    }

    const body  = await req.json()
    const patch: Record<string, unknown> = {}

    if (typeof body.role   === 'string' && VALID_ROLES.has(body.role))       patch.role   = body.role
    if (typeof body.status === 'string' && VALID_STATUSES.has(body.status))  patch.status = body.status
    if (typeof body.name   === 'string' && body.name.trim())                 patch.name   = body.name.trim()

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const sb = createAdminClient()

    // Team leaders cannot modify owner-role members
    if (actorRole === 'team_leader') {
      const { data: target } = await sb.from('team_members').select('role').eq('id', id).maybeSingle()
      if (target?.role === 'owner') {
        return NextResponse.json({ error: 'Team leaders cannot modify owner accounts' }, { status: 403 })
      }
    }

    const { data, error } = await sb
      .from('team_members')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      if (error.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 })
      throw error
    }

    return NextResponse.json({ member: data })
  } catch (err) {
    console.error(`[PATCH /api/team/${id}]`, err)
    return NextResponse.json({ error: 'Failed to update team member' }, { status: 500 })
  }
}

/* ── DELETE ──────────────────────────────────────────────────── */

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  try {
    if (id === PROTECTED_OWNER_ID) {
      return NextResponse.json({ error: 'Cannot remove the primary owner account' }, { status: 403 })
    }

    const { role: actorRole } = await getActorRole(req)
    if (!getPermissions(actorRole).canRemoveMember) {
      return NextResponse.json({ error: 'Insufficient permissions to remove team members' }, { status: 403 })
    }

    const sb = createAdminClient()

    const { data: snap } = await sb.from('team_members').select('*').eq('id', id).single()

    // Team leaders cannot remove owners
    if (actorRole === 'team_leader' && snap?.role === 'owner') {
      return NextResponse.json({ error: 'Team leaders cannot remove owner accounts' }, { status: 403 })
    }

    const { error } = await sb.from('team_members').delete().eq('id', id)
    if (error) throw error

    if (snap) {
      void logEvent({
        type:        'team_member_deleted',
        title:       `Team member removed: ${snap.name as string}`,
        description: `${(snap.role as string).replace(/_/g, ' ')} · ${snap.email as string}`,
        leadId:      null,
        meta: {
          actor:       ACTOR,
          undoable:    false,
          entity_name: snap.name as string,
          old_value:   { name: snap.name, email: snap.email, role: snap.role, status: snap.status },
          undo_data:   { member_id: id },
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(`[DELETE /api/team/${id}]`, err)
    return NextResponse.json({ error: 'Failed to remove team member' }, { status: 500 })
  }
}
