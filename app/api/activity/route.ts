/**
 * GET /api/activity
 * Returns the last 200 activity events for the demo client, newest first.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-server'

const CLIENT_ID = process.env.DEMO_CLIENT_ID ?? '00000000-0000-0000-0000-000000000001'

export async function GET() {
  try {
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('activity_events')
      .select('*')
      .eq('client_id', CLIENT_ID)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) throw error

    return NextResponse.json({ events: data ?? [] })
  } catch (err) {
    console.error('[GET /api/activity]', err)
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 })
  }
}
