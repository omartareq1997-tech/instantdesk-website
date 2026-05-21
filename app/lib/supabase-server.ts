import { createClient } from '@supabase/supabase-js'

/* ── Anon client (respects RLS) ─────────────────────────────
   Use for operations that should run under Row-Level Security.
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

/* ── Admin client (bypasses RLS) ────────────────────────────
   Uses the service role key — NEVER import this in a Client
   Component or any file that contains 'use client'.
   SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_ prefix so
   Next.js guarantees it is never bundled into browser code.
   ────────────────────────────────────────────────────────── */

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.'
    )
  }

  return createClient(url, key, {
    auth: {
      /* Prevent the service-role client from persisting any session
         or auto-refreshing tokens — it should be stateless. */
      persistSession:     false,
      autoRefreshToken:   false,
      detectSessionInUrl: false,
    },
  })
}
