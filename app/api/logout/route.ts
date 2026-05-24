import { type NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, MEMBER_COOKIE_NAME } from '../../lib/auth'

export async function POST(request: NextRequest) {
  void request
  const response = NextResponse.json({ ok: true })
  response.cookies.set(COOKIE_NAME,        '', { path: '/', maxAge: 0 })
  response.cookies.set(MEMBER_COOKIE_NAME, '', { path: '/', maxAge: 0 })
  return response
}
