/**
 * PATCH /api/follow-ups/[id]  — update status (cancel, etc.)
 * DELETE /api/follow-ups/[id] — hard delete (admin only)
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let body: { status?: string; message?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { clientId } = await getSessionBusinessId()
  const sb = createAdminClient()

  const patch: Record<string, unknown> = {}
  if (body.status)  patch.status  = body.status
  if (body.message) patch.message = body.message
  if (body.status === 'sent')      patch.sent_at = new Date().toISOString()
  if (body.status === 'cancelled') patch.sent_at = null

  const { data, error } = await sb
    .from('follow_ups')
    .update(patch)
    .eq('id', id)
    .eq('business_id', clientId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ follow_up: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { clientId } = await getSessionBusinessId()
  const sb = createAdminClient()

  const { error } = await sb
    .from('follow_ups')
    .delete()
    .eq('id', id)
    .eq('business_id', clientId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
