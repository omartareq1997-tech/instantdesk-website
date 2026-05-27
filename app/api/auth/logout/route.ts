/**
 * POST /api/auth/logout — signs out from Supabase Auth and clears all session cookies.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSSRClient } from '../../../lib/supabase-ssr-client'

export async function POST(_req: NextRequest) {
  const supabase = await createSSRClient()
  await supabase.auth.signOut()

  const response = NextResponse.redirect(new URL('/login', _req.url))
  // Clear legacy session cookies as well
  response.cookies.delete('member_session')
  response.cookies.delete('admin_session')
  return response
}
