import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase-server'
import { normalizeConversationStatus } from '../../../../lib/live-chat'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const conversationId = searchParams.get('conversation_id')
  if (!conversationId) return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 })

  const sb = createAdminClient()
  const { data: conversation, error: convError } = await sb
    .from('conversations')
    .select('id,business_id,status')
    .eq('id', conversationId)
    .maybeSingle()

  if (convError) return NextResponse.json({ error: convError.message }, { status: 500 })
  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  let messagesResult: { data: unknown; error: { code?: string; message: string } | null } = await sb
    .from('messages')
    .select('id,role,content,created_at,metadata')
    .eq('conversation_id', conversationId)
    .eq('business_id', conversation.business_id)
    .order('created_at', { ascending: true })

  if (messagesResult.error?.code === '42703') {
    messagesResult = await sb
      .from('messages')
      .select('id,role,content,created_at')
      .eq('conversation_id', conversationId)
      .eq('business_id', conversation.business_id)
      .order('created_at', { ascending: true })
  }

  const { data, error } = messagesResult
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    status: normalizeConversationStatus(conversation.status),
    messages: data ?? [],
  })
}
