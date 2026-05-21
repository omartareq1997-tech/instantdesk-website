'use server'

import { revalidatePath } from 'next/cache'
import { createServerClient } from '../lib/supabase-server'

const VALID_STATUSES = ['new', 'contacted', 'demo_booked', 'won', 'lost'] as const
type Status = typeof VALID_STATUSES[number]

/* ── Update lead status ─────────────────────────────────────
   Called from the client via the Server Action boundary.
   Validates the status before writing to Supabase, then
   revalidates the /admin route so the Server Component
   re-fetches fresh data on the next navigation.
   ────────────────────────────────────────────────────────── */

export async function updateLeadStatus(id: string, status: Status): Promise<void> {
  if (!id) throw new Error('Lead id is required')
  if (!VALID_STATUSES.includes(status)) throw new Error(`Invalid status: ${status}`)

  const supabase = createServerClient()

  const { error } = await supabase
    .from('leads')
    .update({ status })
    .eq('id', id)

  if (error) {
    console.error('[updateLeadStatus]', error)
    throw new Error(error.message)
  }

  revalidatePath('/admin')
}
