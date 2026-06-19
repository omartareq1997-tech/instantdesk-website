import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../../../lib/getSessionBusinessId'
import { insertStatusEvent, markConversationStatus, type ConversationStatus } from '../../../../../lib/live-chat'

export const dynamic = 'force-dynamic'

const VALID = new Set<ConversationStatus>(['ai_active', 'handover_requested', 'live_chat', 'resolved'])

export async function PATCH(request: NextRequest, context: RouteContext<'/api/live-chat/conversations/[id]/status'>) {
  const { id } = await context.params
  const { businessId, ownerName } = await getSessionBusinessId()
  const body = await request.json().catch(() => ({})) as { status?: unknown }
  const status = typeof body.status === 'string' ? body.status : ''
  if (!VALID.has(status as ConversationStatus)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const sb = createAdminClient()
  const { data: conversation, error: convError } = await sb
    .from('conversations')
    .select('id,business_id')
    .eq('id', id)
    .eq('business_id', businessId)
    .maybeSingle()

  if (convError) return NextResponse.json({ error: convError.message }, { status: 500 })
  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  await markConversationStatus(sb, id, businessId, status as ConversationStatus)

  const labels: Record<ConversationStatus, string> = {
    ai_active: `${ownerName} returned this conversation to AI.`,
    handover_requested: `${ownerName} requested human handover.`,
    live_chat: `${ownerName} took over this conversation.`,
    resolved: `${ownerName} marked this conversation resolved.`,
  }
  await insertStatusEvent(sb, id, businessId, labels[status as ConversationStatus], status)

  return NextResponse.json({ ok: true, status })
}
