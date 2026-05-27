import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, verifyToken } from './app/lib/auth'
import { createSSRClientForMiddleware } from './app/lib/supabase-ssr-client'

export const config = {
  matcher: ['/admin/:path*', '/admin-login', '/dashboard/:path*', '/login'],
}

export async function proxy(req: NextRequest) {
  const response = NextResponse.next({ request: req })
  const { pathname } = req.nextUrl

  // ── Admin routes (unchanged) ───────────────────────────────────────────
  const adminToken = req.cookies.get(COOKIE_NAME)?.value
  const adminValid = await verifyToken(adminToken)

  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin-login') && !adminValid) {
    return NextResponse.redirect(new URL('/admin-login', req.url))
  }
  if (pathname === '/admin-login' && adminValid) {
    return NextResponse.redirect(new URL('/admin', req.url))
  }

  // ── Supabase Auth session refresh (runs on /dashboard + /login) ────────
  let supabaseUser: { id: string } | null = null
  try {
    const supabase = createSSRClientForMiddleware(req, response)
    const { data: { user } } = await supabase.auth.getUser()
    supabaseUser = user
  } catch { /* supabase not configured — skip session refresh */ }

  // ── /login — redirect to dashboard if already authenticated ───────────
  if (pathname === '/login' && supabaseUser) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  // ── /dashboard — require Supabase Auth OR a legacy session cookie ──────
  if (pathname.startsWith('/dashboard')) {
    const hasMemberSession = req.cookies.has('member_session')
    const hasAdminSession  = req.cookies.has('admin_session')

    if (!supabaseUser && !hasMemberSession && !hasAdminSession) {
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return response
}
