/**
 * GET  /api/automation-logs — paginated execution history (InstantDesk reads this).
 * POST /api/automation-logs — Make.com writes execution results here after each scenario run.
 *
 * automation_logs actual DB columns:
 *   id, business_id, event_type, success (bool), error_message, payload,
 *   conversation_id, lead_id, created_at
 *
 * Response maps to UI-expected shape:
 *   automation_type  ← event_type
 *   status           ← success ? 'success' : 'failure'
 *   message          ← error_message
 *   execution_result ← payload
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-server'
import { getSessionBusinessId } from '../../lib/getSessionBusinessId'

/* ── GET ─────────────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  try {
    const { clientId } = await getSessionBusinessId()
    const { searchParams } = new URL(req.url)
    const limit       = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)
    const type        = searchParams.get('type')   // filter by event_type
    const statusParam = searchParams.get('status') // 'success' | 'failure'

    const sb = createAdminClient()
    let query = sb
      .from('automation_logs')
      .select('*')
      .eq('business_id', clientId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (type)   query = query.eq('event_type', type)
    if (statusParam === 'success') query = query.eq('success', true)
    if (statusParam === 'failure') query = query.eq('success', false)

    const { data, error } = await query

    if (error) {
      console.error('[GET /api/automation-logs]', error)
      if (error.code === '42P01') return NextResponse.json({ logs: [] })
      throw error
    }

    const logs = (data ?? []).map(row => ({
      ...row,
      automation_type:  row.event_type,
      status:           row.success ? 'success' : 'failure',
      message:          row.error_message ?? null,
      execution_result: row.payload ?? null,
    }))

    return NextResponse.json({ logs })
  } catch (err) {
    console.error('[GET /api/automation-logs]', err)
    return NextResponse.json({ error: 'Failed to fetch automation logs' }, { status: 500 })
  }
}

/* ── POST (Make.com writes here) ─────────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    const { clientId } = await getSessionBusinessId()
    const body = await req.json()

    const event_type = typeof body.event_type       === 'string' ? body.event_type
      : (typeof body.automation_type === 'string' ? body.automation_type : '')

    if (!event_type) {
      return NextResponse.json({ error: 'event_type is required' }, { status: 400 })
    }

    // Accept both bool success and text status for flexibility
    const success: boolean = typeof body.success === 'boolean'
      ? body.success
      : (body.status === 'success' ? true : body.status === 'failure' ? false : !body.error_message)

    const error_message  = typeof body.error_message === 'string' ? body.error_message
      : (typeof body.message === 'string' ? body.message : null)
    const lead_id        = typeof body.lead_id          === 'string' ? body.lead_id        : null
    const conversation_id = typeof body.conversation_id === 'string' ? body.conversation_id : null
    const payload        = (body.payload && typeof body.payload === 'object') ? body.payload
      : (body.execution_result && typeof body.execution_result === 'object' ? body.execution_result : null)

    const sb = createAdminClient()
    const insertPayload: Record<string, unknown> = {
      business_id:  clientId,
      event_type,
      success,
      error_message,
      lead_id,
      payload,
    }
    if (conversation_id) insertPayload.conversation_id = conversation_id

    const { data, error } = await sb
      .from('automation_logs')
      .insert(insertPayload)
      .select('*')
      .single()

    if (error) {
      console.error('[POST /api/automation-logs]', error)
      if (error.code === '42P01') return NextResponse.json({ error: 'automation_logs table not found — check DB schema.' }, { status: 503 })
      throw error
    }

    const log = {
      ...data,
      automation_type:  data.event_type,
      status:           data.success ? 'success' : 'failure',
      message:          data.error_message ?? null,
      execution_result: data.payload ?? null,
    }

    return NextResponse.json({ log }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/automation-logs]', err)
    return NextResponse.json({ error: 'Failed to create automation log' }, { status: 500 })
  }
}
