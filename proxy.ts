import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, verifyToken } from './app/lib/auth'

export const config = {
  matcher: ['/admin/:path*', '/admin-login'],
}

export async function proxy(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  const valid = await verifyToken(token)
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin-login') && !valid) {
    return NextResponse.redirect(new URL('/admin-login', req.url))
  }

  if (pathname === '/admin-login' && valid) {
    return NextResponse.redirect(new URL('/admin', req.url))
  }

  return NextResponse.next()
}
