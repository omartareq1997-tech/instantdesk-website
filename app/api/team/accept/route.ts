/**
 * POST /api/team/accept
 * Accept an invite and set a member session cookie.
 * body: { token: string, password: string }
 *
 * Prerequisites: run sql/add_member_password_hash.sql first.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { hashPassword, signMemberToken, MEMBER_COOKIE_NAME } from '../../../lib/auth'
import { logEvent } from '../../_lib/logEvent'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const token    = typeof body.token    === 'string' ? body.token.trim()    : ''
    const password = typeof body.password === 'string' ? body.password.trim() : ''

    if (!token)                  return NextResponse.json({ error: 'Missing invite token' },    { status: 400 })
    if (password.length < 8)     return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })

    const sb = createAdminClient()

    // Find the invited member
    const { data: member, error: fetchErr } = await sb
      .from('team_members')
      .select('id, name, email, role, status, invited_by')
      .eq('invite_token', token)
      .maybeSingle()

    if (fetchErr) throw fetchErr
    if (!member) {
      return NextResponse.json({ error: 'Invalid or expired invite link' }, { status: 404 })
    }
    if (member.status === 'active') {
      return NextResponse.json({ error: 'This invite has already been accepted' }, { status: 409 })
    }

    // Hash password and activate member
    const password_hash = await hashPassword(password)

    const { error: updateErr } = await sb
      .from('team_members')
      .update({
        status:        'active',
        password_hash,
        invite_token:  null,  // consume the token (single-use)
      })
      .eq('id', member.id)

    if (updateErr) throw updateErr

    // Issue a signed member session token
    const sessionToken = await signMemberToken({
      id:   member.id as string,
      name: member.name as string,
      role: member.role as string,
    })

    void logEvent({
      type:        'team_member_joined',
      title:       `Team member joined: ${member.name as string}`,
      description: `${(member.role as string).replace(/_/g, ' ')} · ${member.email as string}`,
      leadId:      null,
      meta: {
        actor:       member.name as string,
        undoable:    false,
        entity_name: member.name as string,
        new_value:   { name: member.name, email: member.email, role: member.role, status: 'active' },
      },
    })

    const response = NextResponse.json({
      success: true,
      member:  { id: member.id, name: member.name, role: member.role },
    })

    response.cookies.set(MEMBER_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path:     '/',
      maxAge:   30 * 24 * 60 * 60, // 30 days
    })

    return response
  } catch (err) {
    console.error('[POST /api/team/accept]', err)
    return NextResponse.json({ error: 'Failed to accept invite' }, { status: 500 })
  }
}
