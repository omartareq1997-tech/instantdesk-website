/**
 * GET  /api/team  — list all team members for the authenticated client
 * POST /api/team  — invite a new team member
 *
 * Scoped to the session's clientId — authenticated users see only their own team.
 * Gracefully returns [] if the team_members table does not yet exist (42P01).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-server'
import { logEvent, ACTOR } from '../_lib/logEvent'
import { getActorRole } from '../../lib/getActorRole'
import { getPermissions } from '../../lib/permissions'
import { getSessionBusinessId } from '../../lib/getSessionBusinessId'

const VALID_ROLES = new Set(['owner', 'team_leader', 'agent', 'viewer'])

/** Sentinel ID for the always-present owner seed row (never stored in the DB). */
export const PROTECTED_OWNER_ID = '00000000-0000-0000-0000-000000000000'

/* ── GET ─────────────────────────────────────────────────────── */

export async function GET() {
  try {
    const { clientId, ownerName, userEmail, fromSession } = await getSessionBusinessId()

    const seedOwner = {
      id:           PROTECTED_OWNER_ID,
      client_id:    clientId,
      name:         ownerName,
      email:        userEmail || (fromSession ? '' : 'contact@instantdesk.pl'),
      role:         'owner',
      status:       'active',
      invited_by:   null,
      invite_token: null,
      created_at:   '2024-01-01T00:00:00.000Z',
    }

    const sb = createAdminClient()
    const { data, error } = await sb
      .from('team_members')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true })

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ members: [seedOwner] })
      throw error
    }

    const rows = data ?? []
    // Prepend the owner seed row if no real owner row exists yet
    const hasOwnerRow = rows.some(m => m.role === 'owner')
    const members = hasOwnerRow ? rows : [seedOwner, ...rows]

    return NextResponse.json({ members })
  } catch (err) {
    console.error('[GET /api/team]', err)
    return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 500 })
  }
}

/* ── POST ────────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    const { role: actorRole, name: actorName } = await getActorRole(req)
    if (!getPermissions(actorRole).canInviteMember) {
      return NextResponse.json({ error: 'Insufficient permissions to invite team members' }, { status: 403 })
    }

    const { clientId } = await getSessionBusinessId()
    const body = await req.json()

    const name       = typeof body.name  === 'string' ? body.name.trim()  : ''
    const email      = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const inviteRole = typeof body.role  === 'string' && VALID_ROLES.has(body.role) ? body.role : 'agent'

    if (actorRole === 'team_leader' && (inviteRole === 'owner' || inviteRole === 'team_leader')) {
      return NextResponse.json({ error: 'Team leaders can only invite agents and viewers' }, { status: 403 })
    }

    if (!name)  return NextResponse.json({ error: 'name is required' },  { status: 400 })
    if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })
    if (!email.includes('@')) return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })

    const sb = createAdminClient()
    const { data, error } = await sb
      .from('team_members')
      .insert({
        client_id:  clientId,
        name,
        email,
        role:       inviteRole,
        status:     'invited',
        invited_by: typeof body.invited_by === 'string' ? body.invited_by : actorName,
      })
      .select('*')
      .single()

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'This email is already in the team' }, { status: 409 })
      if (error.code === '42P01') return NextResponse.json({ error: 'Run the team_members SQL migration first.' }, { status: 503 })
      throw error
    }

    void logEvent({
      type:        'team_member_invited',
      title:       `Team member invited: ${data.name}`,
      description: `${data.role.replace(/_/g, ' ')} · ${data.email}`,
      leadId:      null,
      clientId,
      meta: {
        actor:       ACTOR,
        undoable:    false,
        entity_name: data.name,
        new_value:   { name: data.name, email: data.email, role: data.role, status: data.status },
        undo_data:   { member_id: data.id, email: data.email },
      },
    })

    return NextResponse.json({ member: data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/team]', err)
    return NextResponse.json({ error: 'Failed to invite team member' }, { status: 500 })
  }
}
