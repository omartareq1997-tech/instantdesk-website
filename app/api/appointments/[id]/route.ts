/**
 * PATCH  /api/appointments/[id]  — update appointment fields (date, status, type, notes)
 * DELETE /api/appointments/[id]  — delete a single appointment
 *
 * Uses service-role client — never call from browser code.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'

type Ctx = { params: Promise<{ id: string }> }

const VALID_STATUSES = new Set(['confirmed', 'pending', 'completed', 'cancelled'])
const VALID_TYPES    = new Set(['demo_call', 'discovery_call', 'onboarding', 'follow_up'])

/* ── PATCH ────────────────────────────────────────────────────────── */

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  try {
    const body = await req.json()
    const patch: Record<string, unknown> = {}

    if (typeof body.scheduled_at === 'string') {
      if (isNaN(Date.parse(body.scheduled_at))) {
        return NextResponse.json({ error: 'scheduled_at must be a valid ISO date' }, { status: 400 })
      }
      patch.scheduled_at = body.scheduled_at
    }

    if (typeof body.status === 'string') {
      if (!VALID_STATUSES.has(body.status)) {
        return NextResponse.json({ error: `status must be one of: ${[...VALID_STATUSES].join(', ')}` }, { status: 400 })
      }
      patch.status = body.status
    }

    if (typeof body.type === 'string') {
      if (!VALID_TYPES.has(body.type)) {
        return NextResponse.json({ error: `type must be one of: ${[...VALID_TYPES].join(', ')}` }, { status: 400 })
      }
      patch.type = body.type
    }

    if (typeof body.notes        === 'string') patch.notes        = body.notes.trim()
    if (typeof body.lead_name    === 'string') patch.lead_name    = body.lead_name.trim()
    if (typeof body.lead_company === 'string') patch.lead_company = body.lead_company.trim()
    if (typeof body.lead_id      === 'string') patch.lead_id      = body.lead_id.trim() || null

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const sb = createAdminClient()
    const { data, error } = await sb
      .from('appointments')
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

    return NextResponse.json({ appointment: data })
  } catch (err) {
    console.error(`[PATCH /api/appointments/${id}]`, err)
    return NextResponse.json({ error: 'Failed to update appointment' }, { status: 500 })
  }
}

/* ── DELETE ───────────────────────────────────────────────────────── */

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  try {
    const sb = createAdminClient()

    const { error } = await sb
      .from('appointments')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(`[DELETE /api/appointments/${id}]`, err)
    return NextResponse.json({ error: 'Failed to delete appointment' }, { status: 500 })
  }
}
