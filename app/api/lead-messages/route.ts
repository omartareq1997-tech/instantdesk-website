/**
 * GET /api/lead-messages
 *
 * Accepts either:
 *   ?conversation_id=<uuid>   — fast path: messages for this conversation directly
 *   ?lead_id=<uuid>           — finds conversation via leads.conversation_id
 *
 * messages table uses `role` column (values: 'user' | 'ai')
 */

import { type NextRequest } from 'next/server'
import { createAdminClient } from '../../lib/supabase-server'

const EMPTY = { conversation_id: null, channel: null, messages: [] }

export async function GET(req: NextRequest) {
  const conversationId = req.nextUrl.searchParams.get('conversation_id')
  const leadId         = req.nextUrl.searchParams.get('lead_id')

  if (!conversationId && !leadId) {
    return Response.json(EMPTY)
  }

  try {
    const sb = createAdminClient()

    let convId: string
    let convChannel: string | null = null

    if (conversationId) {
      // Fast path — conversation_id already known
      const { data: conv, error: convErr } = await sb
        .from('conversations')
        .select('id, channel')
        .eq('id', conversationId)
        .maybeSingle()

      if (convErr) console.error('[lead-messages] conv lookup:', JSON.stringify(convErr))
      if (!conv) return Response.json(EMPTY)
      convId      = conv.id
      convChannel = conv.channel ?? null
    } else {
      // Legacy path — look up conversation via leads.conversation_id
      const { data: lead, error: leadErr } = await sb
        .from('leads')
        .select('conversation_id')
        .eq('id', leadId!)
        .maybeSingle()

      if (leadErr) console.error('[lead-messages] lead lookup:', JSON.stringify(leadErr))
      if (!lead?.conversation_id) return Response.json(EMPTY)

      const { data: conv, error: convErr } = await sb
        .from('conversations')
        .select('id, channel')
        .eq('id', lead.conversation_id)
        .maybeSingle()

      if (convErr) console.error('[lead-messages] conv lookup (legacy):', JSON.stringify(convErr))
      if (!conv) return Response.json(EMPTY)
      convId      = conv.id
      convChannel = conv.channel ?? null
    }

    // messages table: role (not from_role), content, created_at, business_id
    const { data: rows, error: msgErr } = await sb
      .from('messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })

    if (msgErr) {
      console.error('[lead-messages] messages fetch:', JSON.stringify(msgErr))
      return Response.json({ conversation_id: convId, channel: convChannel, messages: [] })
    }

    const messages = (rows ?? []).map(m => ({
      id:               m.id,
      from:             (m.role === 'assistant' ? 'ai' : m.role) as 'user' | 'ai' | 'agent',
      content:          m.content,
      response_time_ms: null,
      created_at:       m.created_at,
    }))

    console.log('[lead-messages] returning', messages.length, 'messages for conv', convId)
    return Response.json({ conversation_id: convId, channel: convChannel, messages })
  } catch (err) {
    console.error('[lead-messages] unexpected error:', err)
    return Response.json(EMPTY)
  }
}
