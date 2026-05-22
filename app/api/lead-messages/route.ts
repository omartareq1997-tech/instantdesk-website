/**
 * GET /api/lead-messages?lead_id=<uuid>
 *
 * Returns the most recent conversation and all its messages for a
 * given lead. Used by the Lead Pipeline drawer (LeadPanel.tsx) to
 * display real chatbot transcripts instead of placeholder text.
 *
 * No auth required — the client dashboard is already behind mock
 * login, and RLS is disabled on these tables while Make inserts data.
 *
 * Response shape:
 * {
 *   conversation_id: string | null
 *   channel:         string | null   // 'whatsapp' | 'website' | 'email' | 'instagram'
 *   messages: Array<{
 *     id:              string
 *     from:            'user' | 'ai' | 'agent'
 *     content:         string
 *     response_time_ms: number | null
 *     created_at:      string        // ISO timestamp
 *   }>
 * }
 */

import { type NextRequest } from 'next/server'
import { createServerClient } from '../../lib/supabase-server'

export async function GET(req: NextRequest) {
  const leadId = req.nextUrl.searchParams.get('lead_id')

  if (!leadId) {
    return Response.json({ conversation_id: null, channel: null, messages: [] })
  }

  try {
    const sb = createServerClient()

    // Find the most recent conversation for this lead
    const { data: conv, error: convErr } = await sb
      .from('conversations')
      .select('id, channel')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (convErr || !conv) {
      return Response.json({ conversation_id: null, channel: null, messages: [] })
    }

    // Fetch messages for that conversation, oldest first
    const { data: rows, error: msgErr } = await sb
      .from('messages')
      .select('id, from_role, content, response_time_ms, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })

    if (msgErr) {
      return Response.json({ conversation_id: conv.id, channel: conv.channel, messages: [] })
    }

    const messages = (rows ?? []).map(m => ({
      id:              m.id,
      from:            m.from_role as 'user' | 'ai' | 'agent',
      content:         m.content,
      response_time_ms: m.response_time_ms ?? null,
      created_at:      m.created_at,
    }))

    return Response.json({
      conversation_id: conv.id,
      channel:         conv.channel,
      messages,
    })
  } catch {
    return Response.json({ conversation_id: null, channel: null, messages: [] })
  }
}
