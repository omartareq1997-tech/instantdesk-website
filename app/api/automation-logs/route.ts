/**
 * GET  /api/automation-logs — paginated execution history (InstantDesk reads this).
 * POST /api/automation-logs — Make.com writes execution results here after each scenario run.
 *
 * Architecture:
 *   Make.com → POST /api/automation-logs after each webhook execution.
 *   InstantDesk → GET /api/automation-logs to display run history and stats.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-server'

const CLIENT_ID = process.env.DEMO_CLIENT_ID ?? '00000000-0000-0000-0000-000000000001'

const VALID_STATUSES = new Set(['success', 'failure', 'skipped'])

/* ── GET ─────────────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const limit  = Math.min(parseInt(searchParams.get('limit')  ?? '50', 10), 200)
    const type   = searchParams.get('type')  // optional filter by automation_type
    const status = searchParams.get('status') // optional filter by status

    const sb = createAdminClient()
    let query = sb
      .from('automation_logs')
      .select('*')
      .eq('client_id', CLIENT_ID)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (type)   query = query.eq('automation_type', type)
    if (status && VALID_STATUSES.has(status)) query = query.eq('status', status)

    const { data, error } = await query

    if (error) {
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

    const automation_type = typeof body.automation_type === 'string' ? body.automation_type : ''
    const status          = typeof body.status          === 'string' && VALID_STATUSES.has(body.status) ? body.status : 'success'
    const message         = typeof body.message         === 'string' ? body.message : null
    const lead_id         = typeof body.lead_id         === 'string' ? body.lead_id : null
    const appointment_id  = typeof body.appointment_id  === 'string' ? body.appointment_id : null
    const execution_result = body.execution_result && typeof body.execution_result === 'object'
      ? body.execution_result : null

    if (!automation_type) {
      return NextResponse.json({ error: 'automation_type is required' }, { status: 400 })
    }

    const sb = createAdminClient()
    const { data, error } = await sb
      .from('automation_logs')
      .insert({
        client_id:        CLIENT_ID,
        automation_type,
        status,
        message,
        lead_id,
        appointment_id,
        execution_result,
      })
      .select('*')
      .single()

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ error: 'Run sql/create_automation_tables.sql first.' }, { status: 503 })
      throw error
    }

    return NextResponse.json({ log: data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/automation-logs]', err)
    return NextResponse.json({ error: 'Failed to create automation log' }, { status: 500 })
  }
}
