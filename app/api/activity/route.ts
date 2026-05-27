/**
 * GET /api/activity
 * Returns the last 200 activity events for the authenticated client, newest first.
 * Scoped to the session's clientId — authenticated users see only their own events.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-server'
import { getSessionBusinessId } from '../../lib/getSessionBusinessId'

export async function GET() {
  try {
    const { clientId } = await getSessionBusinessId()

    const sb = createAdminClient()
    const { data, error } = await sb
      .from('activity_events')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) throw error

    return NextResponse.json({ events: data ?? [] })
  } catch (err) {
    console.error('[GET /api/activity]', err)
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 })
  }
}
