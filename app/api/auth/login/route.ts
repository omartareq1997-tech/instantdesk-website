import { NextRequest, NextResponse } from 'next/server'
import { createSSRClient } from '../../../lib/supabase-ssr-client'

function friendlyAuthError(message?: string) {
  const text = message ?? 'Authentication failed. Please try again.'
  const lower = text.toLowerCase()

  if (lower.includes('rate limit') || lower.includes('too many') || lower.includes('email rate limit')) {
    return 'Too many emails sent. Please wait a few minutes and try again.'
  }

  if (lower.includes('invalid login credentials')) {
    return 'Incorrect email or password.'
  }

  if (lower.includes('email not confirmed')) {
    return 'Please confirm your email before signing in.'
  }

  return text
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }

    const supabase = await createSSRClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error || !data.session || !data.user) {
      console.warn('[auth/login] signInWithPassword failed', {
        status: error?.status,
        code: error?.code,
        name: error?.name,
      })

      return NextResponse.json(
        { error: friendlyAuthError(error?.message) },
        { status: error?.status && error.status >= 400 ? error.status : 401 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.warn('[auth/login] unexpected failure', {
      name: error instanceof Error ? error.name : 'UnknownError',
    })
    return NextResponse.json({ error: 'Unable to sign in right now. Please try again.' }, { status: 500 })
  }
}
