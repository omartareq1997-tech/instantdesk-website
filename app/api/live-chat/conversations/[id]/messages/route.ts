import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../../../lib/getSessionBusinessId'
import { insertStatusEvent, markConversationStatus } from '../../../../../lib/live-chat'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, context: RouteContext<'/api/live-chat/conversations/[id]/messages'>) {
  const { id } = await context.params
  const { businessId } = await getSessionBusinessId()
  const sb = createAdminClient()

  const { data: conversation, error: convError } = await sb
    .from('conversations')
    .select('id,business_id,status')
    .eq('id', id)
    .eq('business_id', businessId)
    .maybeSingle()

  if (convError) return NextResponse.json({ error: convError.message }, { status: 500 })
  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  await sb.from('conversations').update({ unread_count: 0 }).eq('id', id).eq('business_id', businessId)

  let messagesResult: { data: unknown; error: { code?: string; message: string } | null } = await sb
    .from('messages')
    .select('id,conversation_id,business_id,role,content,created_at,metadata')
    .eq('conversation_id', id)
    .eq('business_id', businessId)
    .order('created_at', { ascending: true })

  if (messagesResult.error?.code === '42703') {
    messagesResult = await sb
      .from('messages')
      .select('id,conversation_id,business_id,role,content,created_at')
      .eq('conversation_id', id)
      .eq('business_id', businessId)
      .order('created_at', { ascending: true })
  }

  const { data, error } = messagesResult
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ messages: data ?? [], conversation })
}

export async function POST(request: NextRequest, context: RouteContext<'/api/live-chat/conversations/[id]/messages'>) {
  const { id } = await context.params
  const { businessId, ownerName } = await getSessionBusinessId()
  const sb = createAdminClient()
  const body = await request.json().catch(() => ({})) as { message?: unknown }
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 })

  const { data: conversation, error: convError } = await sb
    .from('conversations')
    .select('id,business_id')
    .eq('id', id)
    .eq('business_id', businessId)
    .maybeSingle()

  if (convError) return NextResponse.json({ error: convError.message }, { status: 500 })
  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  let insertResult: { data: unknown; error: { code?: string; message: string } | null } = await sb
    .from('messages')
    .insert({
      conversation_id: id,
      business_id: businessId,
      role: 'assistant',
      content: message,
      metadata: { sender_type: 'human', sender_name: ownerName },
    })
    .select('id,conversation_id,business_id,role,content,created_at,metadata')
    .single()

  if (insertResult.error?.code === '42703') {
    insertResult = await sb
      .from('messages')
      .insert({
        conversation_id: id,
        business_id: businessId,
        role: 'assistant',
        content: message,
      })
      .select('id,conversation_id,business_id,role,content,created_at')
      .single()
  }

  const { data, error } = insertResult
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await markConversationStatus(sb, id, businessId, 'live_chat')
  await insertStatusEvent(sb, id, businessId, `${ownerName} took over the conversation.`, 'human_takeover')

  return NextResponse.json({ message: data })
}
