/**
 * GET    /api/leads/[id]  — fetch a single lead
 * PATCH  /api/leads/[id]  — update lead fields
 * DELETE /api/leads/[id]  — cascade-delete lead + all related records
 *
 * Uses service-role client — never call from browser code.
 * FK constraints on child tables use ON DELETE SET NULL, so cascade
 * is handled manually here before deleting the lead row itself.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'

type Ctx = { params: Promise<{ id: string }> }

/* ── GET ──────────────────────────────────────────────────────────── */

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  try {
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('leads')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ lead: data })
  } catch (err) {
    console.error(`[GET /api/leads/${id}]`, err)
    return NextResponse.json({ error: 'Failed to fetch lead' }, { status: 500 })
  }
}

/* ── PATCH ────────────────────────────────────────────────────────── */

const ALLOWED_LEAD_FIELDS = new Set([
  'name', 'company', 'email', 'phone', 'source', 'interest',
  'score', 'score_label', 'status', 'metadata',
  'ai_sms', 'email_seq', 'nurture', 'smart_assign', 'auto_call',
  'assigned_agent',
])

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  try {
    const body = await req.json()

    const patch: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body)) {
      if (ALLOWED_LEAD_FIELDS.has(k)) patch[k] = v
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    patch.updated_at = new Date().toISOString()

    const sb = createAdminClient()
    const { data, error } = await sb
      .from('leads')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ lead: data })
  } catch (err) {
    console.error(`[PATCH /api/leads/${id}]`, err)
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
  }
}

/* ── DELETE ───────────────────────────────────────────────────────── */

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  try {
    const sb = createAdminClient()

    // 1. Delete activity events linked to this lead
    const { error: actErr } = await sb
      .from('activity_events')
      .delete()
      .eq('lead_id', id)
    if (actErr) throw actErr

    // 2. Delete appointments linked to this lead
    const { error: apptErr } = await sb
      .from('appointments')
      .delete()
      .eq('lead_id', id)
    if (apptErr) throw apptErr

    // 3. Get conversation IDs for this lead, then delete their messages
    const { data: convos, error: convoFetchErr } = await sb
      .from('conversations')
      .select('id')
      .eq('lead_id', id)
    if (convoFetchErr) throw convoFetchErr

    if (convos && convos.length > 0) {
      const convoIds = convos.map((c: { id: string }) => c.id)
      const { error: msgErr } = await sb
        .from('messages')
        .delete()
        .in('conversation_id', convoIds)
      if (msgErr) throw msgErr

      const { error: convoDelErr } = await sb
        .from('conversations')
        .delete()
        .in('id', convoIds)
      if (convoDelErr) throw convoDelErr
    }

    // 4. Delete the lead itself
    const { error: leadErr } = await sb
      .from('leads')
      .delete()
      .eq('id', id)
    if (leadErr) throw leadErr

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(`[DELETE /api/leads/${id}]`, err)
    return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 })
  }
}
