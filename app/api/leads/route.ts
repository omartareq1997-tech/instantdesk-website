/**
 * GET  /api/leads          — list all leads for the authenticated session's business
 * POST /api/leads          — create a manual lead (from dashboard "Add Lead" form)
 * Uses service-role client — never call from browser code.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-server'
import { logEvent, ACTOR } from '../_lib/logEvent'
import { getActorRole } from '../../lib/getActorRole'
import { getPermissions } from '../../lib/permissions'
import { getSessionBusinessId } from '../../lib/getSessionBusinessId'

export async function GET() {
  try {
    const session = await getSessionBusinessId()
    const { clientId, businessId } = session
    const resolvedId = businessId ?? clientId
    console.log('[GET /api/leads] resolved ids', { clientId, businessId: resolvedId, fromSession: session.fromSession })

    const sb = createAdminClient()
    const { data, error } = await sb
      .from('leads')
      .select('*')
      .eq('business_id', resolvedId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[GET /api/leads] Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('[GET /api/leads] rows returned', data?.length ?? 0)
    return NextResponse.json({ leads: data ?? [] })
  } catch (err) {
    console.error('[GET /api/leads]', err)
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { role } = await getActorRole(req)
    if (!getPermissions(role).canAddLead) {
      return NextResponse.json({ error: 'Insufficient permissions to create leads' }, { status: 403 })
    }

    const session = await getSessionBusinessId()
    const { clientId, businessId } = session
    console.log('[POST /api/leads] session ids', { clientId, businessId, fromSession: session.fromSession })

    const body = await req.json()

    const name: string | undefined = typeof body.name === 'string' ? body.name.trim() : undefined
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const resolvedBusinessId = businessId ?? clientId
    console.log('[POST /api/leads] inserting with business_id:', resolvedBusinessId)

    const insertPayload: Record<string, unknown> = {
      business_id: resolvedBusinessId,
      name,
      email:       typeof body.email       === 'string' ? body.email.trim()       : null,
      phone:       typeof body.phone       === 'string' ? body.phone.trim()       : null,
      source:      typeof body.source      === 'string' ? body.source.trim()      : 'manual',
      interest:    typeof body.interest    === 'string' ? body.interest.trim()    : '',
      status:      typeof body.status      === 'string' ? body.status             : 'new',
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

    if (error) {
      console.error('[POST /api/leads] Supabase error:', error)
      return NextResponse.json(
        { error: error.message, code: error.code, hint: error.hint, details: error.details },
        { status: 500 },
      )
    }

    void logEvent({
      type:        'lead_created',
      title:       `Lead created: ${data.name}`,
      description: `via ${data.source}`,
      leadId:      data.id,
      clientId,
      meta: {
        actor:       ACTOR,
        undoable:    true,
        entity_id:   data.id,
        entity_type: 'lead',
        entity_name: data.name,
        new_value:   { name: data.name, status: data.status },
        undo_data:   { lead_id: data.id },
      },
    })

    return NextResponse.json({ lead: data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/leads]', err)
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 })
  }
}
