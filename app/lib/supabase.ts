import { createClient } from '@supabase/supabase-js'

/* ── Browser singleton ──────────────────────────────────────
   Safe to import in Client Components.
   Uses NEXT_PUBLIC_ keys which are intentionally exposed.
   Empty strings let the build succeed; Supabase will surface
   a clear error at query time if the vars are unset.
   ────────────────────────────────────────────────────────── */

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
)
