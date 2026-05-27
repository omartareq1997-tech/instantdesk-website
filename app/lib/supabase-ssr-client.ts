/**
 * Cookie-aware Supabase clients for App Router server contexts.
 * Use createSSRClient() in Server Components, Route Handlers, and middleware.
 * Use createSSRClientForMiddleware() in middleware only (needs NextRequest/NextResponse).
 *
 * These clients read/write the sb-auth-token cookie so Supabase Auth sessions
 * persist across requests. Never use the admin client (service role) for auth checks.
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { NextRequest, NextResponse } from 'next/server'

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  return { url, key }
}

/** For Server Components and Route Handlers (uses next/headers cookies). */
export async function createSSRClient() {
  const { url, key } = supabaseConfig()
  const cookieStore = await cookies()
  return createServerClient(url, key, {
    cookies: {
      getAll()           { return cookieStore.getAll() },
      setAll(toSet)      {
        try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) }
        catch { /* ignore — read-only context (Server Component) */ }
      },
    },
  })
}

/** For middleware — takes request/response so cookies can be forwarded. */
export function createSSRClientForMiddleware(request: NextRequest, response: NextResponse) {
  const { url, key } = supabaseConfig()
  return createServerClient(url, key, {
    cookies: {
      getAll()      { return request.cookies.getAll() },
      setAll(toSet) {
        toSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value)
          response.cookies.set(name, value, options)
        })
      },
    },
  })
}
