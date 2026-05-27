/**
 * Server-only: resolve the requesting actor's name and role.
 *
 * Priority:
 *   1. Supabase Auth session  → owner (the logged-in account holder)
 *   2. X-Actor-Name header    → look up in team_members (member_session flow)
 *   3. "Alex Thompson" header → owner (demo backward-compat sentinel)
 *   4. Unknown / missing      → viewer
 */

import type { NextRequest } from 'next/server'
import { createAdminClient } from './supabase-server'
import { createSSRClient } from './supabase-ssr-client'
import { getSessionBusinessId } from './getSessionBusinessId'
import type { Role } from './permissions'

export async function getActorRole(req: NextRequest): Promise<{ name: string; role: Role }> {
  // ── 1. Supabase Auth (owner login) ──────────────────────────────────────
  try {
    const sb = await createSSRClient()
    const { data: { user } } = await sb.auth.getUser()
    if (user) {
      const name =
        (user.user_metadata?.name as string | undefined) ??
        user.email?.split('@')[0] ??
        'Owner'
      return { name, role: 'owner' }
    }
  } catch { /* supabase not configured or no session */ }

  // ── 2. X-Actor-Name header (member_session flow) ────────────────────────
  const name = req.headers.get('x-actor-name')?.trim() ?? ''
  if (!name) return { name: '', role: 'viewer' }

  // Demo sentinel — always owner (backward compat for unauthenticated demo mode)
  if (name === 'Alex Thompson') return { name, role: 'owner' }

  // Look up team member scoped to the session's clientId
  try {
    const { clientId } = await getSessionBusinessId()
    const sb = createAdminClient()
    const { data } = await sb
      .from('team_members')
      .select('role')
      .eq('client_id', clientId)
      .eq('name', name)
      .maybeSingle()
    return { name, role: (data?.role as Role | null) ?? 'viewer' }
  } catch {
    return { name, role: 'viewer' }
  }
}
