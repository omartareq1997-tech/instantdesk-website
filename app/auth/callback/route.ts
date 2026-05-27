/**
 * GET /auth/callback — Supabase Auth email-confirmation redirect handler.
 * Exchanges the one-time code in the URL for a session and redirects to the dashboard.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSSRClient } from '../../lib/supabase-ssr-client'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createSSRClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Something went wrong — send to login with error hint
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
