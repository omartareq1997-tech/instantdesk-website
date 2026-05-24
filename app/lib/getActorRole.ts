/**
 * Server-only: resolve the requesting actor's role from the X-Actor-Name header.
 * Alex Thompson is hardcoded as owner (demo account). All others are looked up
 * in the team_members table. Falls back to 'viewer' for unknown names.
 */

import type { NextRequest } from 'next/server'
import { createAdminClient } from './supabase-server'
import type { Role } from './permissions'

const DEMO_CLIENT_ID = process.env.DEMO_CLIENT_ID ?? '00000000-0000-0000-0000-000000000001'
const OWNER_NAME     = 'Alex Thompson'

export async function getActorRole(req: NextRequest): Promise<{ name: string; role: Role }> {
  const name = req.headers.get('x-actor-name')?.trim() ?? ''
  if (!name)            return { name: '',   role: 'viewer' }
  if (name === OWNER_NAME) return { name, role: 'owner'  }

  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('team_members')
      .select('role')
      .eq('client_id', DEMO_CLIENT_ID)
      .eq('name', name)
      .maybeSingle()
    return { name, role: (data?.role as Role | null) ?? 'viewer' }
  } catch {
    return { name, role: 'viewer' }
  }
}
