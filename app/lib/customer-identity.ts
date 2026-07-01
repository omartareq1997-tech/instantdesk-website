import type { createAdminClient } from './supabase-server'

export type CustomerChannel = 'website' | 'whatsapp' | 'messenger' | 'instagram' | 'email' | 'phone' | 'account'

export interface CustomerRow {
  id: string
  business_id: string
  display_name: string | null
  primary_email: string | null
  primary_phone: string | null
  avatar: string | null
  company: string | null
  country: string | null
  language: string | null
  timezone: string | null
  notes: string | null
  lead_score: number | null
  lifetime_value: number | null
  first_seen_at: string | null
  last_seen_at: string | null
  created_at: string | null
  updated_at: string | null
}

export interface CustomerIdentityRow {
  id: string
  customer_id: string
  channel: CustomerChannel
  external_identifier: string
  confidence_score: number
  verified: boolean
  metadata: Record<string, unknown> | null
  created_at: string | null
}

export interface CustomerTimelineItem {
  id: string
  type: string
  label: string
  channel: CustomerChannel | string
  conversation_id: string | null
  message_id?: string | null
  content?: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
}

export interface CustomerProfile {
  customer: CustomerRow
  identities: CustomerIdentityRow[]
  channels: CustomerChannel[]
  status: 'Verified' | 'Partial' | 'Unknown'
  conversation_count: number
  lifetime_messages: number
  first_seen_at: string | null
  last_active_at: string | null
  timeline: CustomerTimelineItem[]
  duplicate_suggestions: CustomerSuggestion[]
  merge_history: CustomerMergeHistoryRow[]
}

export interface CustomerSuggestion {
  id: string
  source_customer_id: string
  target_customer_id: string
  reason: string
  confidence_score: number
  status: string
  metadata: Record<string, unknown> | null
  created_at: string | null
  source_customer?: Pick<CustomerRow, 'id' | 'display_name' | 'primary_email' | 'primary_phone'> | null
  target_customer?: Pick<CustomerRow, 'id' | 'display_name' | 'primary_email' | 'primary_phone'> | null
}

export interface CustomerMergeHistoryRow {
  id: string
  source_customer_id: string
  target_customer_id: string
  merged_by: string | null
  reason: string | null
  source_snapshot?: Record<string, unknown> | null
  created_at: string | null
}

type SupabaseAdmin = ReturnType<typeof createAdminClient>

function normalizeEmail(email: string | null | undefined) {
  const value = email?.trim().toLowerCase()
  return value && value.includes('@') ? value : null
}

function normalizePhone(phone: string | null | undefined) {
  const value = phone?.replace(/[^\d+]/g, '')
  if (!value || value.replace(/\D/g, '').length < 6) return null
  return value
}

function compactName(name: string | null | undefined, fallback = 'Website visitor') {
  const value = name?.trim()
  return value && value.toLowerCase() !== 'website visitor' ? value : fallback
}

function explicitName(name: string | null | undefined) {
  const value = name?.trim()
  return value && value.toLowerCase() !== 'website visitor' ? value : null
}

function isMissingTable(error: { code?: string } | null | undefined) {
  return error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST204' || error?.code === '42703'
}

export function customerStatus(identities: CustomerIdentityRow[]): 'Verified' | 'Partial' | 'Unknown' {
  if (identities.some(identity => identity.verified)) return 'Verified'
  if (identities.length) return 'Partial'
  return 'Unknown'
}

export async function resolveCustomerIdentity(
  sb: SupabaseAdmin,
  input: {
    businessId: string
    conversationId?: string | null
    channel?: CustomerChannel
    externalIdentifier?: string | null
    email?: string | null
    phone?: string | null
    displayName?: string | null
    company?: string | null
    country?: string | null
    language?: string | null
    timezone?: string | null
    avatar?: string | null
    metadata?: Record<string, unknown> | null
  },
): Promise<{ customer_id: string | null; matched_by: string; confidence_score: number }> {
  const channel = input.channel ?? 'website'
  const email = normalizeEmail(input.email)
  const phone = normalizePhone(input.phone)
  const externalIdentifier = input.externalIdentifier?.trim() || (input.conversationId ? `website:${input.conversationId}` : null)
  const now = new Date().toISOString()

  async function findByVerifiedIdentity(identityChannel: CustomerChannel, identifier: string) {
    const { data, error } = await sb
      .from('customer_identities')
      .select('customer_id, customers!inner(id,business_id)')
      .eq('channel', identityChannel)
      .eq('external_identifier', identifier)
      .eq('verified', true)
      .maybeSingle()
    if (isMissingTable(error)) return null
    if (error) throw error
    const row = data as { customer_id?: string; customers?: { business_id?: string } } | null
    return row?.customers?.business_id === input.businessId ? row.customer_id ?? null : null
  }

  let customerId = email ? await findByVerifiedIdentity('email', email) : null
  let matchedBy = customerId ? 'exact_verified_email' : ''
  let confidence = customerId ? 100 : 0

  if (!customerId && phone) {
    customerId = await findByVerifiedIdentity('phone', phone)
    matchedBy = customerId ? 'exact_verified_phone' : ''
    confidence = customerId ? 100 : 0
  }

  if (!customerId && externalIdentifier) {
    const { data, error } = await sb
      .from('customer_identities')
      .select('customer_id, customers!inner(id,business_id)')
      .eq('channel', channel)
      .eq('external_identifier', externalIdentifier)
      .maybeSingle()
    if (isMissingTable(error)) return { customer_id: null, matched_by: 'identity_schema_missing', confidence_score: 0 }
    if (error) throw error
    const row = data as { customer_id?: string; customers?: { business_id?: string } } | null
    if (row?.customers?.business_id === input.businessId) {
      customerId = row.customer_id ?? null
      matchedBy = 'existing_linked_identity'
      confidence = 95
    }
  }

  if (!customerId) {
    const insert = await sb
      .from('customers')
      .insert({
        business_id: input.businessId,
        display_name: compactName(input.displayName),
        primary_email: email,
        primary_phone: phone,
        avatar: input.avatar ?? null,
        company: input.company ?? null,
        country: input.country ?? null,
        language: input.language ?? null,
        timezone: input.timezone ?? null,
        first_seen_at: now,
        last_seen_at: now,
      })
      .select('id')
      .single()
    if (isMissingTable(insert.error)) return { customer_id: null, matched_by: 'identity_schema_missing', confidence_score: 0 }
    if (insert.error) throw insert.error
    customerId = insert.data.id as string
    matchedBy = 'created_new_customer'
    confidence = 80
  } else {
    const name = explicitName(input.displayName)
    await sb
      .from('customers')
      .update({
        last_seen_at: now,
        ...(name ? { display_name: name } : {}),
        primary_email: email ?? undefined,
        primary_phone: phone ?? undefined,
        language: input.language ?? undefined,
        timezone: input.timezone ?? undefined,
        country: input.country ?? undefined,
        updated_at: now,
      })
      .eq('id', customerId)
  }

  const identities = [
    email ? { channel: 'email' as CustomerChannel, external_identifier: email, confidence_score: 100, verified: true, metadata: input.metadata ?? {} } : null,
    phone ? { channel: 'phone' as CustomerChannel, external_identifier: phone, confidence_score: 100, verified: true, metadata: input.metadata ?? {} } : null,
    externalIdentifier ? { channel, external_identifier: externalIdentifier, confidence_score: confidence, verified: channel === 'website', metadata: input.metadata ?? {} } : null,
  ].filter(Boolean) as Array<{ channel: CustomerChannel; external_identifier: string; confidence_score: number; verified: boolean; metadata: Record<string, unknown> }>

  for (const identity of identities) {
    await sb
      .from('customer_identities')
      .upsert({ customer_id: customerId, ...identity }, { onConflict: 'channel,external_identifier' })
  }

  if (input.conversationId) {
    await sb.from('conversations').update({ customer_id: customerId }).eq('id', input.conversationId)
  }

  await suggestDuplicateCustomers(sb, input.businessId, customerId)
  return { customer_id: customerId, matched_by: matchedBy, confidence_score: confidence }
}

export async function suggestDuplicateCustomers(sb: SupabaseAdmin, businessId: string, customerId: string) {
  const { data: customer, error } = await sb
    .from('customers')
    .select('id,display_name,primary_email,primary_phone')
    .eq('id', customerId)
    .eq('business_id', businessId)
    .maybeSingle()
  if (isMissingTable(error) || error || !customer) return

  const filters: string[] = []
  if (customer.primary_email) filters.push(`primary_email.ilike.${customer.primary_email}`)
  if (customer.primary_phone) filters.push(`primary_phone.eq.${customer.primary_phone}`)
  if (!filters.length) return

  const { data: candidates } = await sb
    .from('customers')
    .select('id,display_name,primary_email,primary_phone')
    .eq('business_id', businessId)
    .neq('id', customerId)
    .or(filters.join(','))
    .limit(5)

  for (const candidate of candidates ?? []) {
    const confidence = customer.primary_email && customer.primary_email === candidate.primary_email ? 98 : 92
    await sb.from('customer_identity_suggestions').upsert({
      business_id: businessId,
      source_customer_id: customerId,
      target_customer_id: candidate.id,
      reason: 'Possible duplicate',
      confidence_score: confidence,
      status: 'pending',
      metadata: { matched_email: customer.primary_email === candidate.primary_email, matched_phone: customer.primary_phone === candidate.primary_phone },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id,source_customer_id,target_customer_id' })
  }
}

export async function getCustomerProfile(sb: SupabaseAdmin, businessId: string, customerId: string): Promise<CustomerProfile | null> {
  const { data: customer, error } = await sb.from('customers').select('*').eq('id', customerId).eq('business_id', businessId).maybeSingle()
  if (isMissingTable(error)) return null
  if (error) throw error
  if (!customer) return null

  const [identities, conversations, messages, suggestions, mergeHistory] = await Promise.all([
    sb.from('customer_identities').select('*').eq('customer_id', customerId).order('created_at', { ascending: true }),
    sb.from('conversations').select('id,channel,status,created_at,last_message_at').eq('business_id', businessId).eq('customer_id', customerId).order('created_at', { ascending: true }),
    sb.from('messages').select('id,conversation_id,role,content,created_at,metadata').eq('business_id', businessId).order('created_at', { ascending: true }).limit(500),
    sb.from('customer_identity_suggestions').select('*').eq('business_id', businessId).or(`source_customer_id.eq.${customerId},target_customer_id.eq.${customerId}`).order('confidence_score', { ascending: false }),
    sb.from('customer_merge_history').select('*').eq('target_customer_id', customerId).order('created_at', { ascending: false }).limit(10),
  ])

  const conversationRows = conversations.data ?? []
  const conversationIds = new Set(conversationRows.map(row => row.id as string))
  const messageRows = (messages.data ?? []).filter(row => conversationIds.has(row.conversation_id as string))
  const timeline = buildCustomerTimeline(conversationRows, messageRows)
  const channels = Array.from(new Set((identities.data ?? []).map(row => row.channel as CustomerChannel).filter(channel => ['website', 'whatsapp', 'messenger', 'instagram', 'email'].includes(channel))))

  return {
    customer: customer as CustomerRow,
    identities: (identities.data ?? []) as CustomerIdentityRow[],
    channels,
    status: customerStatus((identities.data ?? []) as CustomerIdentityRow[]),
    conversation_count: conversationRows.length,
    lifetime_messages: messageRows.length,
    first_seen_at: (customer as CustomerRow).first_seen_at,
    last_active_at: (customer as CustomerRow).last_seen_at,
    timeline,
    duplicate_suggestions: (suggestions.data ?? []) as CustomerSuggestion[],
    merge_history: (mergeHistory.data ?? []) as CustomerMergeHistoryRow[],
  }
}

export function buildCustomerTimeline(
  conversations: Array<{ id: string; channel?: string | null; status?: string | null; created_at?: string | null; last_message_at?: string | null }>,
  messages: Array<{ id: string; conversation_id: string; role?: string | null; content?: string | null; created_at?: string | null; metadata?: Record<string, unknown> | null }>,
): CustomerTimelineItem[] {
  const channelByConversation = new Map(conversations.map(conversation => [conversation.id, conversation.channel ?? 'website']))
  const items: CustomerTimelineItem[] = []
  for (const conversation of conversations) {
    if (conversation.created_at) {
      items.push({
        id: `conversation-${conversation.id}`,
        type: 'conversation_created',
        label: 'Conversation created',
        channel: conversation.channel ?? 'website',
        conversation_id: conversation.id,
        created_at: conversation.created_at,
      })
    }
  }
  for (const message of messages) {
    const eventType = typeof message.metadata?.event_type === 'string' ? message.metadata.event_type : null
    const internalNote = message.metadata?.internal_note === true
    const attachment = message.metadata?.attachment ? 'Attachment' : null
    const type = internalNote
      ? 'internal_note'
      : attachment
        ? 'attachment'
        : eventType === 'human_takeover'
          ? 'takeover'
          : eventType === 'resolved'
            ? 'resolved'
            : eventType === 'conversation_reopened'
              ? 'reopened'
              : message.role === 'user'
                ? 'customer_message'
                : message.metadata?.sender_type === 'human'
                  ? 'human_reply'
                : message.role === 'assistant'
                  ? 'ai_reply'
                  : 'system_event'
    const label = type.split('_').map(part => part[0]?.toUpperCase() + part.slice(1)).join(' ')
    items.push({
      id: `message-${message.id}`,
      type,
      label,
      channel: channelByConversation.get(message.conversation_id) ?? 'website',
      conversation_id: message.conversation_id,
      message_id: message.id,
      content: message.content,
      metadata: message.metadata,
      created_at: message.created_at ?? new Date().toISOString(),
    })
  }
  return items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}

export async function mergeCustomers(
  sb: SupabaseAdmin,
  input: { businessId: string; sourceCustomerId: string; targetCustomerId: string; mergedBy: string; reason?: string | null },
) {
  if (input.sourceCustomerId === input.targetCustomerId) throw new Error('Choose two different customers to merge.')
  const [sourceRes, targetRes] = await Promise.all([
    sb.from('customers').select('*').eq('id', input.sourceCustomerId).eq('business_id', input.businessId).maybeSingle(),
    sb.from('customers').select('*').eq('id', input.targetCustomerId).eq('business_id', input.businessId).maybeSingle(),
  ])
  if (!sourceRes.data || !targetRes.data) throw new Error('Customer not found.')

  const [sourceIdentities, sourceConversations] = await Promise.all([
    sb.from('customer_identities').select('id').eq('customer_id', input.sourceCustomerId),
    sb.from('conversations').select('id').eq('business_id', input.businessId).eq('customer_id', input.sourceCustomerId),
  ])

  const { data: historyRow, error: historyError } = await sb.from('customer_merge_history').insert({
    source_customer_id: input.sourceCustomerId,
    target_customer_id: input.targetCustomerId,
    merged_by: input.mergedBy,
    reason: input.reason ?? 'Manual merge',
    source_snapshot: {
      customer: sourceRes.data,
      identity_ids: (sourceIdentities.data ?? []).map(row => row.id),
      conversation_ids: (sourceConversations.data ?? []).map(row => row.id),
    },
  }).select('id').single()
  if (historyError) throw historyError

  await Promise.all([
    sb.from('customer_identities').update({ customer_id: input.targetCustomerId }).eq('customer_id', input.sourceCustomerId),
    sb.from('conversations').update({ customer_id: input.targetCustomerId }).eq('business_id', input.businessId).eq('customer_id', input.sourceCustomerId),
    sb.from('customer_identity_suggestions').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('business_id', input.businessId).eq('source_customer_id', input.sourceCustomerId).eq('target_customer_id', input.targetCustomerId),
  ])

  const source = sourceRes.data as CustomerRow
  const target = targetRes.data as CustomerRow
  await sb.from('customers').update({
    display_name: target.display_name ?? source.display_name,
    primary_email: target.primary_email ?? source.primary_email,
    primary_phone: target.primary_phone ?? source.primary_phone,
    company: target.company ?? source.company,
    country: target.country ?? source.country,
    language: target.language ?? source.language,
    timezone: target.timezone ?? source.timezone,
    lead_score: Math.max(target.lead_score ?? 0, source.lead_score ?? 0),
    lifetime_value: Number(target.lifetime_value ?? 0) + Number(source.lifetime_value ?? 0),
    first_seen_at: [target.first_seen_at, source.first_seen_at].filter(Boolean).sort()[0] ?? target.first_seen_at,
    last_seen_at: [target.last_seen_at, source.last_seen_at].filter(Boolean).sort().at(-1) ?? target.last_seen_at,
    updated_at: new Date().toISOString(),
  }).eq('id', input.targetCustomerId)

  await sb.from('customers').delete().eq('id', input.sourceCustomerId)
  return { merged: true, target_customer_id: input.targetCustomerId, merge_id: historyRow?.id ?? null }
}

export async function undoCustomerMerge(
  sb: SupabaseAdmin,
  input: { businessId: string; mergeId: string; actor: string },
) {
  const { data: history, error } = await sb
    .from('customer_merge_history')
    .select('*')
    .eq('id', input.mergeId)
    .maybeSingle()
  if (isMissingTable(error)) throw new Error('Customer identity migration is required.')
  if (error) throw error
  if (!history) throw new Error('Merge record not found.')

  const snapshot = history.source_snapshot as { customer?: CustomerRow; identity_ids?: string[]; conversation_ids?: string[] } | null
  const source = snapshot?.customer
  if (!source || source.business_id !== input.businessId) throw new Error('Merge cannot be undone for this business.')

  const { error: restoreError } = await sb.from('customers').upsert(source, { onConflict: 'id' })
  if (restoreError) throw restoreError

  const identityIds = Array.isArray(snapshot?.identity_ids) ? snapshot.identity_ids.filter(Boolean) : []
  const conversationIds = Array.isArray(snapshot?.conversation_ids) ? snapshot.conversation_ids.filter(Boolean) : []

  await Promise.all([
    identityIds.length
      ? sb.from('customer_identities').update({ customer_id: source.id }).in('id', identityIds)
      : Promise.resolve({ error: null }),
    conversationIds.length
      ? sb.from('conversations').update({ customer_id: source.id }).eq('business_id', input.businessId).in('id', conversationIds)
      : Promise.resolve({ error: null }),
  ])

  await sb.from('customer_merge_history').insert({
    source_customer_id: history.target_customer_id,
    target_customer_id: source.id,
    merged_by: input.actor,
    reason: `Undo merge ${input.mergeId}`,
    source_snapshot: { undo_of: input.mergeId },
  })

  return { undone: true, restored_customer_id: source.id }
}
