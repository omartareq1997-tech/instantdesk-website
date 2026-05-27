import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase-server'

const CLIENT_ID = '0616a47a-2c01-49ce-a798-385f8276b92b'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = createAdminClient()
  const { error } = await sb.from('knowledge_sources').delete()
    .eq('id', id).eq('business_id', CLIENT_ID)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: { is_active?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const sb = createAdminClient()
  const { data, error } = await sb.from('knowledge_sources').update({ is_active: body.is_active })
    .eq('id', id).eq('business_id', CLIENT_ID).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ source: data })
}
