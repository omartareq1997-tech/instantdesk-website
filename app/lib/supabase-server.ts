import { createClient } from '@supabase/supabase-js'

/* ── Server-only client factory ─────────────────────────────
   Call createServerClient() inside Server Components and
   Server Actions. Each call returns a fresh client — safe
   for concurrent requests.

   Using anon key with NEXT_PUBLIC_ vars is fine here; swap
   to a server-only SUPABASE_SERVICE_ROLE_KEY if you need to
   bypass Row-Level Security in the future.
   ────────────────────────────────────────────────────────── */

export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    )
  }

  return createClient(url, key)
}
