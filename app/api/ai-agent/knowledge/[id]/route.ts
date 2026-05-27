import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../../lib/getSessionBusinessId'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { clientId } = await getSessionBusinessId()
  const sb = createAdminClient()

  const { error } = await sb.from('knowledge_sources').delete()
    .eq('id', id).eq('business_id', clientId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: { is_active?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { clientId } = await getSessionBusinessId()
  const sb = createAdminClient()

  const { data, error } = await sb.from('knowledge_sources')
    .update({ is_active: body.is_active })
    .eq('id', id).eq('business_id', clientId)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ source: data })
}
