/**
 * GET  /api/follow-ups  — list follow-up queue for the session business
 *   ?status=scheduled|sent|cancelled|failed
 *   ?trigger_type=no_reply_2h|...
 *   ?limit=50
 *
 * POST /api/follow-ups  — manually schedule a follow-up
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-server'
import { getSessionBusinessId } from '../../lib/getSessionBusinessId'

export async function GET(req: NextRequest) {
  const { clientId } = await getSessionBusinessId()
  const { searchParams } = new URL(req.url)
  const status       = searchParams.get('status')
  const triggerType  = searchParams.get('trigger_type')
  const limit        = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 500)

  const sb = createAdminClient()
  let query = sb
    .from('follow_ups')
    .select('*')
    .eq('business_id', clientId)
    .order('scheduled_for', { ascending: false })
    .limit(limit)

  if (status)      query = query.eq('status', status)
  if (triggerType) query = query.eq('trigger_type', triggerType)

  const { data, error } = await query

  if (error) {
    if (error.code === '42P01') return NextResponse.json({ follow_ups: [] })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ follow_ups: data ?? [] })
}

export async function POST(req: NextRequest) {
  let body: {
    lead_id?:         string
    conversation_id?: string
    trigger_type?:    string
    scheduled_for?:   string
    message?:         string
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.trigger_type)  return NextResponse.json({ error: 'trigger_type is required' }, { status: 400 })
  if (!body.scheduled_for) return NextResponse.json({ error: 'scheduled_for is required' }, { status: 400 })

  const { clientId } = await getSessionBusinessId()
  const sb = createAdminClient()

  const { data, error } = await sb
    .from('follow_ups')
    .insert({
      business_id:     clientId,
      lead_id:         body.lead_id         ?? null,
      conversation_id: body.conversation_id ?? null,
      trigger_type:    body.trigger_type,
      scheduled_for:   body.scheduled_for,
      status:          'scheduled',
      message:         body.message ?? null,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({ error: 'follow_ups table not found — run sql/create_follow_ups.sql' }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ follow_up: data }, { status: 201 })
}
