/**
 * POST /api/leads
 * Create a manual lead (from dashboard "Add Lead" form).
 * Uses service-role client — never call from browser code.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-server'

const DEMO_CLIENT_ID = process.env.DEMO_CLIENT_ID ?? '00000000-0000-0000-0000-000000000001'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const name: string | undefined = typeof body.name === 'string' ? body.name.trim() : undefined
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const clientId: string = typeof body.client_id === 'string' ? body.client_id : DEMO_CLIENT_ID

    const now = new Date().toISOString()

    const insertPayload: Record<string, unknown> = {
      client_id:   clientId,
      name,
      company:     typeof body.company    === 'string' ? body.company.trim()    : '',
      email:       typeof body.email      === 'string' ? body.email.trim()      : null,
      phone:       typeof body.phone      === 'string' ? body.phone.trim()      : null,
      source:      typeof body.source     === 'string' ? body.source.trim()     : 'manual',
      interest:    typeof body.interest   === 'string' ? body.interest.trim()   : '',
      score:       typeof body.score      === 'number' ? body.score             : 0,
      score_label: typeof body.score_label === 'string' ? body.score_label      : 'cold',
      status:      typeof body.status     === 'string' ? body.status            : 'new',
      created_at:  now,
      updated_at:  now,
    }

    if (body.metadata && typeof body.metadata === 'object') {
      insertPayload.metadata = body.metadata
    }

    const sb = createAdminClient()
    const { data, error } = await sb
      .from('leads')
      .insert(insertPayload)
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ lead: data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/leads]', err)
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 })
  }
}
