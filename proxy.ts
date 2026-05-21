import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, verifyToken } from './app/lib/auth'

export const config = {
  matcher: ['/admin/:path*', '/login'],
}

export async function proxy(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  const valid = await verifyToken(token)
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/admin') && !valid) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (pathname === '/login' && valid) {
    return NextResponse.redirect(new URL('/admin', req.url))
  }

  return NextResponse.next()
}
