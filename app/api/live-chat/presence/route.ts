import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'

export const dynamic = 'force-dynamic'

const memoryPresence = new Map<string, Record<string, unknown>>()
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const conversationId = new URL(request.url).searchParams.get('conversation_id')
  if (!conversationId) return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 })
  if (!UUID_RE.test(conversationId)) return NextResponse.json({ presence: null })
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('live_chat_presence')
    .select('*')
    .eq('conversation_id', conversationId)
    .maybeSingle()
  if (error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST204') {
    return NextResponse.json({ presence: memoryPresence.get(conversationId) ?? null })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ presence: data ?? null })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as {
    conversation_id?: unknown
    business_id?: unknown
    actor_type?: unknown
    status?: unknown
    visitor_context?: unknown
  }
  const conversationId = typeof body.conversation_id === 'string' ? body.conversation_id : ''
  const actorType = body.actor_type === 'agent' ? 'agent' : 'visitor'
  const status = body.status === 'away' || body.status === 'offline' ? body.status : 'online'
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

  const now = new Date().toISOString()
  const patch = actorType === 'agent'
    ? { agent_status: status, agent_last_seen_at: now }
    : { visitor_status: status, visitor_last_seen_at: now, visitor_context: typeof body.visitor_context === 'object' && body.visitor_context ? body.visitor_context : {} }

  const row = {
    conversation_id: conversationId,
    business_id: businessId,
    visitor_status: actorType === 'visitor' ? status : 'offline',
    visitor_last_seen_at: actorType === 'visitor' ? now : null,
    agent_status: actorType === 'agent' ? status : 'offline',
    agent_last_seen_at: actorType === 'agent' ? now : null,
    visitor_context: actorType === 'visitor' && typeof body.visitor_context === 'object' && body.visitor_context ? body.visitor_context : {},
    updated_at: now,
  }
  const { error } = await sb.from('live_chat_presence').upsert({ ...row, ...patch }, { onConflict: 'conversation_id' })
  if (error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST204') {
    memoryPresence.set(conversationId, { ...(memoryPresence.get(conversationId) ?? row), ...patch, updated_at: now })
  } else if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
