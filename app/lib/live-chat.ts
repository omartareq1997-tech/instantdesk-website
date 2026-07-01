import type { SupabaseClient } from '@supabase/supabase-js'

export type ConversationStatus = 'ai_active' | 'handover_requested' | 'live_chat' | 'resolved'
export type ConversationChannel = 'website' | 'whatsapp' | 'messenger' | 'instagram' | 'email'
export type MessageDeliveryStatus = 'sent' | 'delivered' | 'seen' | 'failed'

export const CONVERSATION_CHANNELS: ConversationChannel[] = [
  'website',
  'whatsapp',
  'messenger',
  'instagram',
  'email',
]

export const MESSAGE_DELIVERY_STATUSES: MessageDeliveryStatus[] = [
  'sent',
  'delivered',
  'seen',
  'failed',
]

export interface LiveChatSettings {
  business_id: string
  ai_auto_replies_enabled: boolean
  live_chat_enabled: boolean
  human_handover_enabled: boolean
  trigger_ai_cannot_answer: boolean
  trigger_customer_asks_human: boolean
  trigger_phrases: string[]
  availability_enabled: boolean
  availability_timezone: string
  availability_start: string
  availability_end: string
}

export const DEFAULT_HANDOVER_PHRASES = [
  'human',
  'agent',
  'support',
  'talk to someone',
  'real person',
]

export function defaultLiveChatSettings(businessId: string): LiveChatSettings {
  return {
    business_id: businessId,
    ai_auto_replies_enabled: true,
    live_chat_enabled: false,
    human_handover_enabled: true,
    trigger_ai_cannot_answer: true,
    trigger_customer_asks_human: true,
    trigger_phrases: DEFAULT_HANDOVER_PHRASES,
    availability_enabled: false,
    availability_timezone: 'Europe/Warsaw',
    availability_start: '09:00',
    availability_end: '17:00',
  }
}

export function normalizeLiveChatSettings(settings: LiveChatSettings): LiveChatSettings {
  if (settings.ai_auto_replies_enabled) return settings
  return {
    ...settings,
    trigger_ai_cannot_answer: false,
    trigger_customer_asks_human: false,
  }
}

export function normalizeConversationStatus(status?: string | null): ConversationStatus {
  if (status === 'handover_requested' || status === 'live_chat' || status === 'resolved') return status
  return 'ai_active'
}

export function normalizeConversationChannel(channel?: string | null): ConversationChannel {
  if (channel === 'whatsapp' || channel === 'messenger' || channel === 'instagram' || channel === 'email') return channel
  return 'website'
}

export function conversationChannelLabel(channel?: string | null): string {
  switch (normalizeConversationChannel(channel)) {
    case 'whatsapp': return 'WhatsApp'
    case 'messenger': return 'Messenger'
    case 'instagram': return 'Instagram'
    case 'email': return 'Email'
    default: return 'Website'
  }
}

export function normalizeMessageDeliveryStatus(status?: string | null): MessageDeliveryStatus {
  if (status === 'sent' || status === 'seen' || status === 'failed') return status
  return 'delivered'
}

export function liveChatStatusLabel(status?: string | null): string {
  switch (normalizeConversationStatus(status)) {
    case 'handover_requested': return 'Handover Requested'
    case 'live_chat': return 'Live Chat'
    case 'resolved': return 'Resolved'
    default: return 'AI Active'
  }
}

export function customerRequestedHuman(message: string, settings: LiveChatSettings): boolean {
  if (!settings.human_handover_enabled || !settings.trigger_customer_asks_human) return false
  const lower = message.toLowerCase()
  return settings.trigger_phrases.some((phrase) => lower.includes(phrase.toLowerCase()))
}

export function aiCannotAnswer(reply: string, settings: LiveChatSettings, fallbackMessage?: string | null): boolean {
  if (!settings.human_handover_enabled || !settings.trigger_ai_cannot_answer) return false
  const lower = reply.toLowerCase()
  const fallback = fallbackMessage?.trim().toLowerCase()
  if (fallback && lower === fallback) return true
  return [
    "i don't know",
    "i do not know",
    "i can't answer",
    'i cannot answer',
    "i'm not sure",
    'not sure',
    "don't have that information",
    'do not have that information',
  ].some((phrase) => lower.includes(phrase))
}

export async function getLiveChatSettings(
  sb: SupabaseClient,
  businessId: string,
): Promise<LiveChatSettings> {
  const defaults = defaultLiveChatSettings(businessId)

  try {
    const { data, error } = await sb
      .from('live_chat_settings')
      .select('*')
      .eq('business_id', businessId)
      .maybeSingle()

    if (error || !data) return defaults

    const row = data as Partial<LiveChatSettings>
    const merged = normalizeLiveChatSettings({
      ...defaults,
      ...row,
      business_id: businessId,
      trigger_phrases: Array.isArray(row.trigger_phrases) && row.trigger_phrases.length
        ? row.trigger_phrases
        : defaults.trigger_phrases,
    })

    if (
      !merged.ai_auto_replies_enabled &&
      (row.trigger_ai_cannot_answer || row.trigger_customer_asks_human)
    ) {
      await sb
        .from('live_chat_settings')
        .update({
          trigger_ai_cannot_answer: false,
          trigger_customer_asks_human: false,
          updated_at: new Date().toISOString(),
        })
        .eq('business_id', businessId)
    }

    return merged
  } catch {
    return defaults
  }
}

export async function markConversationStatus(
  sb: SupabaseClient,
  conversationId: string,
  businessId: string,
  status: ConversationStatus,
  assignedTo?: string | null,
): Promise<void> {
  const patch = {
    status,
    ...(assignedTo !== undefined ? { assigned_to: assignedTo } : {}),
    handover_requested_at: status === 'handover_requested' ? new Date().toISOString() : null,
    human_takeover_at: status === 'live_chat' ? new Date().toISOString() : null,
    resolved_at: status === 'resolved' ? new Date().toISOString() : null,
    last_message_at: new Date().toISOString(),
  }
  try {
    await sb
      .from('conversations')
      .update(patch)
      .eq('id', conversationId)
      .eq('business_id', businessId)
  } catch {
    await sb
      .from('conversations')
      .update({
        status,
        ...(assignedTo !== undefined ? { assigned_to: assignedTo } : {}),
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('business_id', businessId)
  }
}

export async function insertStatusEvent(
  sb: SupabaseClient,
  conversationId: string,
  businessId: string,
  content: string,
  eventType: string,
): Promise<void> {
  try {
    await sb.from('messages').insert({
      conversation_id: conversationId,
      business_id: businessId,
      role: 'system',
      content,
      metadata: { event_type: eventType },
    })
  } catch {
    await sb.from('messages').insert({
      conversation_id: conversationId,
      business_id: businessId,
      role: 'system',
      content,
    })
  }

  try {
    await sb.from('handover_events').insert({
      conversation_id: conversationId,
      business_id: businessId,
      event_type: eventType,
      note: content,
    })
  } catch {
    // Older deployments may not have the optional audit table yet.
  }
}

export const HANDOVER_REPLY =
  'I am handing this over to our team. Someone will reply as soon as possible.'
