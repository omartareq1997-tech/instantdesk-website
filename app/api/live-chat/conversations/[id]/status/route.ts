import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../../../lib/getSessionBusinessId'
import { insertStatusEvent, markConversationStatus, type ConversationStatus } from '../../../../../lib/live-chat'

export const dynamic = 'force-dynamic'

const VALID = new Set<ConversationStatus>(['ai_active', 'handover_requested', 'live_chat', 'resolved'])

function unauthorized() {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
}

export async function PATCH(request: NextRequest, context: RouteContext<'/api/live-chat/conversations/[id]/status'>) {
  const { id } = await context.params
  const session = await getSessionBusinessId()
  if (!session.fromSession) return unauthorized()
  const { businessId, ownerName } = session
  const body = await request.json().catch(() => ({})) as { status?: unknown; assigned_to?: unknown }
  const status = typeof body.status === 'string' ? body.status : ''
  const assignedTo = typeof body.assigned_to === 'string'
    ? body.assigned_to.trim()
    : body.assigned_to === null
      ? null
      : undefined
  if (!VALID.has(status as ConversationStatus)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const sb = createAdminClient()
  const { data: conversation, error: convError } = await sb
    .from('conversations')
    .select('id,business_id,status,assigned_to,metadata')
    .eq('id', id)
    .eq('business_id', businessId)
    .maybeSingle()

  if (convError) return NextResponse.json({ error: convError.message }, { status: 500 })
  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  const nextAssignedTo = status === 'resolved' || status === 'ai_active'
    ? null
    : assignedTo === undefined && status === 'live_chat'
      ? ownerName
      : assignedTo
  await markConversationStatus(sb, id, businessId, status as ConversationStatus, nextAssignedTo)
  const existingMetadata = (conversation.metadata && typeof conversation.metadata === 'object')
    ? conversation.metadata as Record<string, unknown>
    : {}
  const existingAgentState = (existingMetadata.agent_state && typeof existingMetadata.agent_state === 'object')
    ? existingMetadata.agent_state as Record<string, unknown>
    : {}
  const now = new Date().toISOString()
  const agentStatePatch = status === 'live_chat' || status === 'handover_requested'
    ? { handover_started_at: now }
    : status === 'ai_active'
      ? { handover_resumed_at: now }
      : {}
  if (Object.keys(agentStatePatch).length) {
    await sb
      .from('conversations')
      .update({
        metadata: {
          ...existingMetadata,
          agent_state: {
            ...existingAgentState,
            ...agentStatePatch,
          },
        },
      })
      .eq('id', id)
      .eq('business_id', businessId)
  }

  const labels: Record<ConversationStatus, string> = {
    ai_active: `${ownerName} returned this conversation to AI.`,
    handover_requested: `${ownerName} requested human handover.`,
    live_chat: `${assignedTo || ownerName} took over this conversation.`,
    resolved: `${ownerName} marked this conversation resolved.`,
  }

  if (status === 'live_chat') {
    const alreadyLive = conversation.status === 'live_chat' && conversation.assigned_to === (assignedTo || ownerName)
    const { data: existingTakeover } = await sb
      .from('messages')
      .select('id')
      .eq('conversation_id', id)
      .eq('business_id', businessId)
      .eq('role', 'system')
      .eq('metadata->>event_type', 'human_takeover')
      .limit(1)
    if (!alreadyLive && !existingTakeover?.length) {
      await insertStatusEvent(sb, id, businessId, labels.live_chat, 'human_takeover')
    }
  } else {
    await insertStatusEvent(sb, id, businessId, labels[status as ConversationStatus], status)
  }

  return NextResponse.json({
    ok: true,
    status,
    assigned_to: nextAssignedTo,
  })
}
