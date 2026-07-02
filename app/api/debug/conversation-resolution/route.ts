import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { resolveBotContext } from '../../../lib/bot-context'

export const dynamic = 'force-dynamic'

const INSTANTDESK_BUSINESS_ID = '59bd9987-46b9-48a3-ad14-cfe1ab733453'

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export async function GET(request: NextRequest) {
  const conversationId = request.nextUrl.searchParams.get('conversation_id')?.trim()
  if (!conversationId) {
    return NextResponse.json({ error: 'conversation_id is required' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  const sb = createAdminClient()
  const { data: conversation, error } = await sb
    .from('conversations')
    .select('id,business_id,status,channel,metadata')
    .eq('id', conversationId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }

  const metadata = metadataObject(conversation.metadata)
  const storedBotId = typeof metadata.bot_id === 'string' ? metadata.bot_id : null
  const storedAgentId = typeof metadata.agent_id === 'string' ? metadata.agent_id : null
  const resolved = await resolveBotContext({
    sb,
    requestType: 'public_widget',
    businessId: conversation.business_id,
    botId: storedBotId || storedAgentId,
    allowExplicitBotForExistingConversation: Boolean(storedBotId || storedAgentId),
  })

  return NextResponse.json({
    conversation_id: conversation.id,
    stored_business_id: conversation.business_id,
    stored_bot_id: storedBotId,
    stored_agent_id: storedAgentId,
    channel: conversation.channel,
    status: conversation.status,
    source_host: typeof metadata.source_host === 'string' ? metadata.source_host : null,
    widget_host: typeof metadata.widget_host === 'string' ? metadata.widget_host : null,
    resolved_bot_id: resolved.ok ? resolved.agent.id : null,
    resolved_bot_name: resolved.ok ? resolved.agent.name : null,
    resolved_business_type: resolved.ok ? resolved.businessType : resolved.businessType,
    resolution_source: resolved.resolution,
    belongs_to_instantdesk_business: conversation.business_id === INSTANTDESK_BUSINESS_ID,
    configured: resolved.ok,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
