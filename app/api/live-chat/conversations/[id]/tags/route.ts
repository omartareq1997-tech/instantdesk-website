import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../../../lib/getSessionBusinessId'

export const dynamic = 'force-dynamic'

const memoryTags = new Map<string, string[]>()

function unauthorized() {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
}

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, context: RouteParams) {
  const { id } = await context.params
  const session = await getSessionBusinessId()
  if (!session.fromSession) return unauthorized()
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('conversation_tags')
    .select('tag')
    .eq('conversation_id', id)
    .eq('business_id', session.businessId)
    .order('created_at', { ascending: true })
  if (error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST204') {
    return NextResponse.json({ tags: memoryTags.get(id) ?? [] })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tags: (data ?? []).map(row => row.tag) })
}

export async function POST(request: NextRequest, context: RouteParams) {
  const { id } = await context.params
  const session = await getSessionBusinessId()
  if (!session.fromSession) return unauthorized()
  const body = await request.json().catch(() => ({})) as { tag?: unknown }
  const tag = typeof body.tag === 'string' ? body.tag.trim().slice(0, 32) : ''
  if (!tag) return NextResponse.json({ error: 'tag is required' }, { status: 400 })
  const sb = createAdminClient()
  const { error } = await sb.from('conversation_tags').upsert({
    business_id: session.businessId,
    conversation_id: id,
    tag,
    created_by: session.ownerName,
  }, { onConflict: 'conversation_id,tag' })
  if (error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST204') {
    const next = Array.from(new Set([...(memoryTags.get(id) ?? []), tag]))
    memoryTags.set(id, next)
    return NextResponse.json({ tags: next })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data } = await sb.from('conversation_tags').select('tag').eq('conversation_id', id).eq('business_id', session.businessId)
  return NextResponse.json({ tags: (data ?? []).map(row => row.tag) })
}

export async function DELETE(request: NextRequest, context: RouteParams) {
  const { id } = await context.params
  const session = await getSessionBusinessId()
  if (!session.fromSession) return unauthorized()
  const body = await request.json().catch(() => ({})) as { tag?: unknown }
  const tag = typeof body.tag === 'string' ? body.tag.trim() : ''
  if (!tag) return NextResponse.json({ error: 'tag is required' }, { status: 400 })
  const sb = createAdminClient()
  const { error } = await sb.from('conversation_tags').delete().eq('conversation_id', id).eq('business_id', session.businessId).ilike('tag', tag)
  if (error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST204') {
    const next = (memoryTags.get(id) ?? []).filter(item => item.toLowerCase() !== tag.toLowerCase())
    memoryTags.set(id, next)
    return NextResponse.json({ tags: next })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data } = await sb.from('conversation_tags').select('tag').eq('conversation_id', id).eq('business_id', session.businessId)
  return NextResponse.json({ tags: (data ?? []).map(row => row.tag) })
}
