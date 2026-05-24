/**
 * PATCH /api/automations/[id] — partial update an automation setting.
 *
 * If no DB row exists yet (id === 'new' or the row is absent),
 * the caller should POST to /api/automations instead.
 * This route handles updates after the row is persisted.
 *
 * Make.com reads automation_settings before each scenario run.
 * Changes here take effect on the next Make.com execution.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'

type Ctx = { params: Promise<{ id: string }> }

const VALID_CHANNELS = new Set(['whatsapp', 'sms', 'email'])

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  try {
    const body  = await req.json()
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (typeof body.enabled          === 'boolean') patch.enabled          = body.enabled
    if (typeof body.channel          === 'string' && VALID_CHANNELS.has(body.channel)) patch.channel = body.channel
    if (typeof body.delay_minutes    === 'number')  patch.delay_minutes    = body.delay_minutes
    if (typeof body.message_template === 'string')  patch.message_template = body.message_template
    if (typeof body.config           === 'object' && body.config !== null) patch.config = body.config

    const sb = createAdminClient()
    const { data, error } = await sb
      .from('automation_settings')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      if (error.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (error.code === '42P01')    return NextResponse.json({ error: 'Run sql/create_automation_tables.sql first.' }, { status: 503 })
      throw error
    }

    return NextResponse.json({ setting: data })
  } catch (err) {
    console.error(`[PATCH /api/automations/${id}]`, err)
    return NextResponse.json({ error: 'Failed to update automation setting' }, { status: 500 })
  }
}
