/**
 * PATCH  /api/team/[id]  — update role, status, or name
 * DELETE /api/team/[id]  — remove a team member
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { logEvent, ACTOR } from '../../_lib/logEvent'

type Ctx = { params: Promise<{ id: string }> }

const VALID_ROLES    = new Set(['owner', 'team_leader', 'agent', 'viewer'])
const VALID_STATUSES = new Set(['active', 'invited'])

/* ── PATCH ───────────────────────────────────────────────────── */

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  try {
    const body  = await req.json()
    const patch: Record<string, unknown> = {}

    if (typeof body.role   === 'string' && VALID_ROLES.has(body.role))       patch.role   = body.role
    if (typeof body.status === 'string' && VALID_STATUSES.has(body.status))  patch.status = body.status
    if (typeof body.name   === 'string' && body.name.trim())                 patch.name   = body.name.trim()

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const sb = createAdminClient()
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

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  try {
    const sb = createAdminClient()

    const { data: snap } = await sb.from('team_members').select('*').eq('id', id).single()

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
