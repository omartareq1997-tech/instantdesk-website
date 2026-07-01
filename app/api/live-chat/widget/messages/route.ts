import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase-server'
import { normalizeConversationStatus } from '../../../../lib/live-chat'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const conversationId = searchParams.get('conversation_id')
  const since = searchParams.get('since')
  if (!conversationId) return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 })

  const sb = createAdminClient()
  const { data: conversation, error: convError } = await sb
    .from('conversations')
    .select('id,business_id,status')
    .eq('id', conversationId)
    .maybeSingle()

  if (convError) return NextResponse.json({ error: convError.message }, { status: 500 })
  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  await sb
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('business_id', conversation.business_id)
    .in('role', ['assistant', 'human'])
    .is('read_at', null)

  let query = sb
    .from('messages')
    .select('id,role,content,created_at,read_at,delivery_status,delivered_at,external_message_id,attachment_metadata,metadata')
    .eq('conversation_id', conversationId)
    .eq('business_id', conversation.business_id)
  if (since) query = query.gt('created_at', since)
  let messagesResult: { data: unknown; error: { code?: string; message: string } | null } = await query.order('created_at', { ascending: true })

  if (messagesResult.error?.code === '42703' || messagesResult.error?.code === 'PGRST204') {
    let fallbackQuery = sb
      .from('messages')
      .select('id,role,content,created_at,read_at,metadata')
      .eq('conversation_id', conversationId)
      .eq('business_id', conversation.business_id)
    if (since) fallbackQuery = fallbackQuery.gt('created_at', since)
    messagesResult = await fallbackQuery.order('created_at', { ascending: true })
  }

  const { data, error } = messagesResult
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    status: normalizeConversationStatus(conversation.status),
    messages: ((data ?? []) as { metadata?: { internal_note?: boolean } | null }[])
      .filter(message => !message.metadata?.internal_note),
  })
}
