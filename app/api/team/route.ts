/**
 * GET  /api/team  — list all team members
 * POST /api/team  — invite a new team member
 *
 * Gracefully returns [] if the team_members table does not yet exist (42P01),
 * so the dashboard renders without errors before the SQL migration is run.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-server'
import { logEvent, ACTOR } from '../_lib/logEvent'

const CLIENT_ID   = process.env.DEMO_CLIENT_ID ?? '00000000-0000-0000-0000-000000000001'
const VALID_ROLES = new Set(['owner', 'team_leader', 'agent', 'viewer'])

/* ── GET ─────────────────────────────────────────────────────── */

export async function GET() {
  try {
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('team_members')
      .select('*')
      .eq('client_id', CLIENT_ID)
      .order('created_at', { ascending: true })

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ members: [] })
      throw error
    }

    return NextResponse.json({ members: data ?? [] })
  } catch (err) {
    console.error('[GET /api/team]', err)
    return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 500 })
  }
}

/* ── POST ────────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const name  = typeof body.name  === 'string' ? body.name.trim()  : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const role  = typeof body.role  === 'string' && VALID_ROLES.has(body.role) ? body.role : 'agent'

    if (!name)  return NextResponse.json({ error: 'name is required' },  { status: 400 })
    if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })
    if (!email.includes('@')) return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })

    const sb = createAdminClient()
    const { data, error } = await sb
      .from('team_members')
      .insert({
        client_id:  CLIENT_ID,
        name,
        email,
        role,
        status:     'invited',
        invited_by: typeof body.invited_by === 'string' ? body.invited_by : 'Alex Thompson',
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
