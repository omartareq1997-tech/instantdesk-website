import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'

export const dynamic = 'force-dynamic'

type TypingActor = 'visitor' | 'agent'

const memoryTyping = new Map<string, { actor_type: TypingActor; actor_name: string | null; is_typing: boolean; updated_at: string }[]>()
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function key(conversationId: string) {
  return conversationId
}

function activeTyping(rows: { actor_type: TypingActor; actor_name: string | null; is_typing: boolean; updated_at: string }[]) {
  const cutoff = Date.now() - 8_000
  return rows.filter(row => row.is_typing && new Date(row.updated_at).getTime() >= cutoff)
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const conversationId = url.searchParams.get('conversation_id')
  const conversationIds = (url.searchParams.get('conversation_ids') ?? '')
    .split(',')
    .map(id => id.trim())
    .filter(id => UUID_RE.test(id))
    .slice(0, 50)
  if (!conversationId && conversationIds.length === 0) return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 })
  if (!conversationId && conversationIds.length > 0) {
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('live_chat_typing')
      .select('conversation_id,actor_type,actor_name,is_typing,updated_at')
      .in('conversation_id', conversationIds)

    if (error?.code !== '42P01' && error?.code !== 'PGRST205' && error?.code !== 'PGRST204' && error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const grouped: Record<string, { actor_type: TypingActor; actor_name: string | null; is_typing: boolean; updated_at: string }[]> = {}
    for (const id of conversationIds) grouped[id] = error ? memoryTyping.get(key(id)) ?? [] : []
    if (!error) {
      for (const row of (data ?? []) as Array<{ conversation_id?: string | null; actor_type: TypingActor; actor_name: string | null; is_typing: boolean; updated_at: string }>) {
        if (!row.conversation_id || !grouped[row.conversation_id]) continue
        grouped[row.conversation_id].push(row)
      }
    }

    return NextResponse.json({
      typing_by_conversation: Object.fromEntries(
        Object.entries(grouped).map(([id, rows]) => [id, activeTyping(rows)]),
      ),
    })
  }
  if (!conversationId) return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 })
  if (!UUID_RE.test(conversationId)) return NextResponse.json({ typing: [] })
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('live_chat_typing')
    .select('actor_type,actor_name,is_typing,updated_at')
    .eq('conversation_id', conversationId)

  if (error?.code !== '42P01' && error?.code !== 'PGRST205' && error?.code !== 'PGRST204' && error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = error ? memoryTyping.get(key(conversationId)) ?? [] : data ?? []
  return NextResponse.json({ typing: activeTyping(rows as { actor_type: TypingActor; actor_name: string | null; is_typing: boolean; updated_at: string }[]) })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as {
    conversation_id?: unknown
    business_id?: unknown
    actor_type?: unknown
  actor_name?: unknown
    is_typing?: unknown
  }
  const conversationId = typeof body.conversation_id === 'string' ? body.conversation_id : ''
  const actorType = body.actor_type === 'agent' ? 'agent' : 'visitor'
  const actorName = typeof body.actor_name === 'string' ? body.actor_name.slice(0, 80) : ''
  const isTyping = body.is_typing !== false
  if (!conversationId) return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 })
  if (!UUID_RE.test(conversationId)) return NextResponse.json({ ok: true, ignored: true })

  const sb = createAdminClient()
  let businessId = typeof body.business_id === 'string' ? body.business_id : ''
  if (actorType === 'agent') {
    const session = await getSessionBusinessId()
    if (!session.fromSession) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    businessId = session.businessId
  }
  if (!businessId) {
    const { data: conversation } = await sb.from('conversations').select('business_id').eq('id', conversationId).maybeSingle()
    businessId = typeof conversation?.business_id === 'string' ? conversation.business_id : ''
  }
  if (!businessId) return NextResponse.json({ error: 'business_id is required' }, { status: 400 })

  const row = {
    conversation_id: conversationId,
    business_id: businessId,
    actor_type: actorType,
    actor_name: actorName,
    is_typing: isTyping,
    updated_at: new Date().toISOString(),
  }
  const { error } = await sb.from('live_chat_typing').upsert(row, { onConflict: 'conversation_id,actor_type,actor_name' })
  if (error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST204') {
    const current = memoryTyping.get(key(conversationId)) ?? []
    const next = current.filter(item => !(item.actor_type === actorType && item.actor_name === actorName))
    next.push({ actor_type: actorType, actor_name: actorName, is_typing: isTyping, updated_at: row.updated_at })
    memoryTyping.set(key(conversationId), next)
  } else if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
