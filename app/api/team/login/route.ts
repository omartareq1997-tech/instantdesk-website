/**
 * POST /api/team/login
 * Authenticate a team member and set a member session cookie.
 * body: { email: string, password: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { verifyPassword, signMemberToken, MEMBER_COOKIE_NAME } from '../../../lib/auth'

export async function POST(req: NextRequest) {
  try {
    const body     = await req.json()
    const email    = typeof body.email    === 'string' ? body.email.trim().toLowerCase()    : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const sb = createAdminClient()

    const { data: members, error: fetchErr } = await sb
      .from('team_members')
      .select('id, name, email, role, status, password_hash')
      .eq('email', email)
      .limit(2)

    if (fetchErr) throw fetchErr

    const member = members?.[0] ?? null
    if (!member) {
      return NextResponse.json({ error: 'No account found for this email address' }, { status: 404 })
    }

    if ((members?.length ?? 0) > 1) {
      return NextResponse.json({ error: 'Multiple team accounts use this email. Please contact support.' }, { status: 409 })
    }

    if (member.status === 'invited') {
      return NextResponse.json({ error: 'Please accept your invite link before logging in' }, { status: 403 })
    }

    if (!member.password_hash) {
      return NextResponse.json({ error: 'Account not fully set up — please contact your team administrator' }, { status: 403 })
    }

    const valid = await verifyPassword(password, member.password_hash as string)
    if (!valid) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
    }

    const sessionToken = await signMemberToken({
      id:   member.id as string,
      name: member.name as string,
      role: member.role as string,
    })

    const response = NextResponse.json({
      success: true,
      name:    member.name,
      role:    member.role,
    })

    response.cookies.set(MEMBER_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path:     '/',
      maxAge:   30 * 24 * 60 * 60,
    })

    return response
  } catch (err) {
    console.warn('[team/login] unexpected failure', {
      name: err instanceof Error ? err.name : 'UnknownError',
    })
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
