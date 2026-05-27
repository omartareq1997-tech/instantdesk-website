/**
 * GET  /api/automation-logs — paginated execution history (InstantDesk reads this).
 * POST /api/automation-logs — Make.com writes execution results here after each scenario run.
 *
 * Real automation_logs columns:
 *   id, business_id, conversation_id, lead_id, event_type (NOT NULL),
 *   payload, success (bool), error_message, created_at
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-server'

const BUSINESS_ID = process.env.BUSINESS_ID ?? '0616a47a-2c01-49ce-a798-385f8276b92b'

/* ── GET ─────────────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const limit      = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)
    const type       = searchParams.get('type')   // filter by event_type
    const statusParam = searchParams.get('status') // 'success' | 'failure'

    const sb = createAdminClient()
    let query = sb
      .from('automation_logs')
      .select('*')
      .eq('business_id', BUSINESS_ID)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (type) query = query.eq('event_type', type)
    if (statusParam === 'success')  query = query.eq('success', true)
    if (statusParam === 'failure')  query = query.eq('success', false)

    const { data, error } = await query

    if (error) {
      console.error('[GET /api/automation-logs]', error)
      if (error.code === '42P01') return NextResponse.json({ logs: [] })
      throw error
    }

    return NextResponse.json({ logs: data ?? [] })
  } catch (err) {
    console.error('[GET /api/automation-logs]', err)
    return NextResponse.json({ error: 'Failed to fetch automation logs' }, { status: 500 })
  }
}

/* ── POST (Make.com writes here) ─────────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const event_type      = typeof body.event_type === 'string' ? body.event_type : (typeof body.automation_type === 'string' ? body.automation_type : '')
    const success         = typeof body.success === 'boolean' ? body.success : body.status !== 'failure'
    const error_message   = typeof body.error_message === 'string' ? body.error_message : (typeof body.message === 'string' ? body.message : null)
    const lead_id         = typeof body.lead_id === 'string' ? body.lead_id : null
    const conversation_id = typeof body.conversation_id === 'string' ? body.conversation_id : null
    const payload         = body.payload && typeof body.payload === 'object'
      ? body.payload
      : (body.execution_result && typeof body.execution_result === 'object' ? body.execution_result : null)

    if (!event_type) {
      return NextResponse.json({ error: 'event_type is required' }, { status: 400 })
    }

    const sb = createAdminClient()
    const { data, error } = await sb
      .from('automation_logs')
      .insert({
        business_id:     BUSINESS_ID,
        event_type,
        success,
        error_message,
        lead_id,
        conversation_id,
        payload,
      })
      .select('*')
      .single()

    if (error) {
      console.error('[POST /api/automation-logs]', error)
      if (error.code === '42P01') return NextResponse.json({ error: 'automation_logs table not found.' }, { status: 503 })
      throw error
    }

    return NextResponse.json({ log: data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/automation-logs]', err)
    return NextResponse.json({ error: 'Failed to create automation log' }, { status: 500 })
  }
}
