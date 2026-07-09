import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'
import { normalizeConversationChannel, normalizeConversationStatus } from '../../../lib/live-chat'

export const dynamic = 'force-dynamic'
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

function unauthorized() {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers: NO_STORE_HEADERS })
}

interface ConversationRow {
  id: string
  business_id: string
  customer_id?: string | null
  contact_id?: string | null
  channel_id?: string | null
  channel?: string | null
  external_thread_id?: string | null
  status?: string | null
  assigned_to?: string | null
  last_message_at?: string | null
  unread_count?: number | null
  created_at?: string | null
}

interface MessageRow {
  id: string
  conversation_id: string
  business_id?: string | null
  role?: string | null
  content?: string | null
  created_at?: string | null
  read_at?: string | null
  metadata?: Record<string, unknown> | null
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

interface CustomerRow {
  id: string
  display_name?: string | null
  primary_email?: string | null
  primary_phone?: string | null
  avatar?: string | null
  company?: string | null
  country?: string | null
  language?: string | null
  timezone?: string | null
  lead_score?: number | null
  lifetime_value?: number | null
  first_seen_at?: string | null
  last_seen_at?: string | null
}

export async function GET() {
  const session = await getSessionBusinessId()
  if (!session.fromSession) return unauthorized()
  const { businessId } = session
  const sb = createAdminClient()
  console.log('[LiveChatDebug] dashboard conversations query', {
    business_id: businessId,
    from_session: session.fromSession,
    user_email: session.userEmail || null,
  })

  let conversationsResult: { data: unknown; error: { code?: string; message: string } | null } = await sb
    .from('conversations')
    .select('id,business_id,customer_id,contact_id,channel_id,channel,external_thread_id,status,assigned_to,last_message_at,unread_count,created_at')
    .eq('business_id', businessId)
    .order('last_message_at', { ascending: false })
    .limit(100)

  if (conversationsResult.error?.code === '42703' || conversationsResult.error?.code === 'PGRST204') {
    conversationsResult = await sb
      .from('conversations')
      .select('id,business_id,customer_id,channel,status,assigned_to,last_message_at,unread_count,created_at')
      .eq('business_id', businessId)
      .order('last_message_at', { ascending: false })
      .limit(100)
  }

  const { data: conversations, error } = conversationsResult
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS })

  const rows = (conversations ?? []) as ConversationRow[]
  const ids = rows.map(c => c.id)
  const customerIds = Array.from(new Set(rows.map(c => c.customer_id).filter(Boolean))) as string[]

  const messagesPromise = async () => {
    if (!ids.length) return { data: [], error: null }
    let result: { data: unknown; error: { code?: string; message: string } | null } = await sb.from('messages')
      .select('id,conversation_id,business_id,role,content,created_at,read_at,metadata')
      .in('conversation_id', ids)
      .order('created_at', { ascending: false })
      .limit(1000)
    if (result.error?.code === '42703' || result.error?.code === 'PGRST204') {
      result = await sb.from('messages')
        .select('id,conversation_id,role,content,created_at,metadata')
        .in('conversation_id', ids)
        .order('created_at', { ascending: false })
        .limit(1000)
    }
    return result
  }

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
    messagesPromise(),
    leadsPromise(),
  ])

  if (messagesResult.error) return NextResponse.json({ error: messagesResult.error.message }, { status: 500, headers: NO_STORE_HEADERS })
  if (leadsResult.error) return NextResponse.json({ error: leadsResult.error.message }, { status: 500, headers: NO_STORE_HEADERS })

  const latestMessage = new Map<string, MessageRow>()
  const latestNonSystemMessage = new Map<string, MessageRow>()
  const latestVisitorContext = new Map<string, Record<string, unknown>>()
  const messagesByConversation = new Map<string, MessageRow[]>()
  for (const msg of (messagesResult.data ?? []) as MessageRow[]) {
    const grouped = messagesByConversation.get(msg.conversation_id) ?? []
    grouped.push(msg)
    messagesByConversation.set(msg.conversation_id, grouped)
    if (!latestMessage.has(msg.conversation_id)) latestMessage.set(msg.conversation_id, msg)
    if (msg.role !== 'system' && !latestNonSystemMessage.has(msg.conversation_id)) {
      latestNonSystemMessage.set(msg.conversation_id, msg)
    }
    if (
      msg.role === 'user' &&
      !latestVisitorContext.has(msg.conversation_id) &&
      msg.metadata &&
      typeof msg.metadata.visitor_context === 'object' &&
      msg.metadata.visitor_context
    ) {
      latestVisitorContext.set(msg.conversation_id, msg.metadata.visitor_context as Record<string, unknown>)
    }
  }

  const leadByConversation = new Map<string, LeadRow>()
  for (const lead of (leadsResult.data ?? []) as LeadRow[]) {
    if (lead.conversation_id) leadByConversation.set(lead.conversation_id, lead)
  }

  const customersById = new Map<string, CustomerRow>()
  const customerConversationStats = new Map<string, { conversation_count: number; channels: Set<string> }>()
  if (customerIds.length) {
    const [customersResult, customerConversationsResult] = await Promise.all([
      sb.from('customers')
        .select('id,display_name,primary_email,primary_phone,avatar,company,country,language,timezone,lead_score,lifetime_value,first_seen_at,last_seen_at')
        .eq('business_id', businessId)
        .in('id', customerIds),
      sb.from('conversations')
        .select('customer_id,channel')
        .eq('business_id', businessId)
        .in('customer_id', customerIds),
    ])
    if (!customersResult.error) {
      for (const customer of (customersResult.data ?? []) as CustomerRow[]) customersById.set(customer.id, customer)
    }
    if (!customerConversationsResult.error) {
      for (const row of (customerConversationsResult.data ?? []) as Array<{ customer_id?: string | null; channel?: string | null }>) {
        if (!row.customer_id) continue
        const current = customerConversationStats.get(row.customer_id) ?? { conversation_count: 0, channels: new Set<string>() }
        current.conversation_count += 1
        current.channels.add(normalizeConversationChannel(row.channel))
        customerConversationStats.set(row.customer_id, current)
      }
    }
  }

  const items = rows.map((conversation) => {
    const lead = leadByConversation.get(conversation.id)
    const last = latestNonSystemMessage.get(conversation.id) ?? latestMessage.get(conversation.id)
    const visitorContext = latestVisitorContext.get(conversation.id) ?? null
    return {
      id: conversation.id,
      business_id: conversation.business_id,
      customer_id: conversation.customer_id ?? null,
      contact_id: conversation.contact_id ?? null,
      channel_id: conversation.channel_id ?? null,
      channel: normalizeConversationChannel(conversation.channel),
      external_thread_id: conversation.external_thread_id ?? null,
      status: normalizeConversationStatus(conversation.status),
      assigned_to: conversation.assigned_to ?? null,
      last_message_at: conversation.last_message_at ?? conversation.created_at,
      unread_count: conversation.unread_count ?? 0,
      last_message_preview: last?.content ?? '',
      last_message_role: last?.role ?? null,
      visitor_context: visitorContext,
      customer: conversation.customer_id && customersById.has(conversation.customer_id) ? (() => {
        const customer = customersById.get(conversation.customer_id!)!
        const stats = customerConversationStats.get(conversation.customer_id!) ?? { conversation_count: 1, channels: new Set([normalizeConversationChannel(conversation.channel)]) }
        return {
          id: customer.id,
          display_name: customer.display_name,
          primary_email: customer.primary_email,
          primary_phone: customer.primary_phone,
          avatar: customer.avatar,
          company: customer.company,
          country: customer.country,
          language: customer.language,
          timezone: customer.timezone,
          lead_score: customer.lead_score,
          lifetime_value: customer.lifetime_value,
          first_seen_at: customer.first_seen_at,
          last_seen_at: customer.last_seen_at,
          conversation_count: stats.conversation_count,
          channel_count: stats.channels.size,
          channels: Array.from(stats.channels),
        }
      })() : null,
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

  const recentMessagesByConversation = Object.fromEntries(
    Array.from(messagesByConversation.entries()).map(([conversationId, messages]) => [
      conversationId,
      messages
        .slice()
        .sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime())
        .slice(-100),
    ]),
  )

  return NextResponse.json({ conversations: items, messages_by_conversation: recentMessagesByConversation }, { headers: NO_STORE_HEADERS })
}
