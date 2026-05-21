import { type NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME } from '../../lib/auth'

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/admin-login', request.url))
  response.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 })
  return response
}
