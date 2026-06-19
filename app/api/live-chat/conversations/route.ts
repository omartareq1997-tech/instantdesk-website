import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'
import { normalizeConversationStatus } from '../../../lib/live-chat'

export const dynamic = 'force-dynamic'

interface ConversationRow {
  id: string
  business_id: string
  channel?: string | null
  status?: string | null
  last_message_at?: string | null
  unread_count?: number | null
  created_at?: string | null
}

interface MessageRow {
  conversation_id: string
  role?: string | null
  content?: string | null
  created_at?: string | null
}

interface LeadRow {
  id: string
  conversation_id?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  interest?: string | null
  score?: number | null
  score_label?: string | null
  metadata?: Record<string, unknown> | null
}

export async function GET() {
  const { businessId } = await getSessionBusinessId()
  const sb = createAdminClient()

  let conversationsResult: { data: unknown; error: { code?: string; message: string } | null } = await sb
    .from('conversations')
    .select('id,business_id,channel,status,last_message_at,unread_count,created_at')
    .eq('business_id', businessId)
    .order('last_message_at', { ascending: false })
    .limit(100)

  if (conversationsResult.error?.code === '42703') {
    conversationsResult = await sb
      .from('conversations')
      .select('id,business_id,channel,status,last_message_at,created_at')
      .eq('business_id', businessId)
      .order('last_message_at', { ascending: false })
      .limit(100)
  }

  const { data: conversations, error } = conversationsResult
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (conversations ?? []) as ConversationRow[]
  const ids = rows.map(c => c.id)

  const messagesPromise = ids.length
    ? sb.from('messages')
        .select('conversation_id,role,content,created_at')
        .in('conversation_id', ids)
        .order('created_at', { ascending: false })
    : Promise.resolve({ data: [], error: null })

  const leadsPromise = async () => {
    if (!ids.length) return { data: [], error: null }
    let result: { data: unknown; error: { code?: string; message: string } | null } = await sb
      .from('leads')
      .select('id,conversation_id,name,email,phone,interest,score,score_label,metadata')
      .in('conversation_id', ids)

    if (result.error?.code === '42703') {
      result = await sb
        .from('leads')
        .select('id,conversation_id,name,email,phone,interest,metadata')
        .in('conversation_id', ids)
    }

    return result
  }

  const [messagesResult, leadsResult] = await Promise.all([
    messagesPromise,
    leadsPromise(),
  ])

  if (messagesResult.error) return NextResponse.json({ error: messagesResult.error.message }, { status: 500 })
  if (leadsResult.error) return NextResponse.json({ error: leadsResult.error.message }, { status: 500 })

  const latestMessage = new Map<string, MessageRow>()
  for (const msg of (messagesResult.data ?? []) as MessageRow[]) {
    if (!latestMessage.has(msg.conversation_id)) latestMessage.set(msg.conversation_id, msg)
  }

  const leadByConversation = new Map<string, LeadRow>()
  for (const lead of (leadsResult.data ?? []) as LeadRow[]) {
    if (lead.conversation_id) leadByConversation.set(lead.conversation_id, lead)
  }

  const items = rows.map((conversation) => {
    const lead = leadByConversation.get(conversation.id)
    const last = latestMessage.get(conversation.id)
    return {
      id: conversation.id,
      channel: conversation.channel ?? 'website',
      status: normalizeConversationStatus(conversation.status),
      last_message_at: conversation.last_message_at ?? conversation.created_at,
      unread_count: conversation.unread_count ?? 0,
      last_message_preview: last?.content ?? '',
      last_message_role: last?.role ?? null,
      lead: lead ? {
        id: lead.id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        interest: lead.interest,
        score: lead.score,
        score_label: lead.score_label,
        metadata: lead.metadata,
      } : null,
    }
  })

  return NextResponse.json({ conversations: items })
}
