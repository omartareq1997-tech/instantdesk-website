/**
 * POST /api/chat
 *
 * InstantDesk AI Agent endpoint. Receives a visitor message, runs it through
 * the configured OpenAI agent, and returns a structured reply.
 *
 * ── Request body ────────────────────────────────────────────────────────────
 * {
 *   "business_id":      "uuid",         required
 *   "conversation_id":  "uuid",         optional — created if absent
 *   "message":          "Hello"         required
 * }
 *
 * ── Response ────────────────────────────────────────────────────────────────
 * {
 *   "reply":           "Hi! How can I help you today?",
 *   "conversation_id": "uuid",
 *   "intent":          "greeting",
 *   "lead_ready":      false
 * }
 *
 * When lead_ready is true the response also contains the lead that was created:
 * {
 *   "reply":           "Perfect, I've noted your details...",
 *   "conversation_id": "uuid",
 *   "intent":          "booking",
 *   "lead_ready":      true,
 *   "lead_id":         "uuid"
 * }
 *
 * ── Architecture ────────────────────────────────────────────────────────────
 * 1. Load the active agent row for business_id from Supabase (persona, objective, model…)
 * 2. Load active knowledge_sources for business_id (FAQs, pricing, policies…)
 * 3. Build a system prompt: agent fields + knowledge blocks
 * 4. Load the last 20 messages from the conversation (if conversation_id supplied)
 * 5. Append the new user message and call OpenAI with JSON mode forced
 * 6. Parse the structured reply: { reply, intent, lead_ready, lead }
 * 7. Persist user + assistant messages to the messages table
 * 8. If lead_ready: upsert into leads
 * 9. If MAKE_WEBHOOK_URL env var exists: fire-and-forget POST with lead data
 * 10. Return reply, conversation_id, intent, lead_ready (and lead_id when created)
 *
 * ── Environment variables ────────────────────────────────────────────────────
 *   OPENAI_API_KEY       required
 *   NEXT_PUBLIC_SUPABASE_URL   required
 *   SUPABASE_SERVICE_ROLE_KEY  required (service role — never exposed to browser)
 *   MAKE_WEBHOOK_URL     optional — when set, lead data is POSTed here on lead_ready
 *
 * ── Supabase tables required ─────────────────────────────────────────────────
 *   Run sql/create_agent_tables.sql to create agents and knowledge_sources.
 *   conversations and messages tables are created by the existing ingest schema.
 */

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createAdminClient } from '../../lib/supabase-server'

/* ── Types ───────────────────────────────────────────────────────────────── */

interface AgentRow {
  id:          string
  name:        string
  persona:     string
  objective:   string
  tone:        string
  fallback_msg: string
  model:       string
  temperature: number
}

interface KnowledgeRow {
  title:   string
  content: string
}

interface OpenAIReply {
  reply:      string
  intent:     string
  lead_ready: boolean
  lead: {
    name:     string
    phone:    string
    email:    string
    interest: string
  }
}

/* ── System prompt builder ───────────────────────────────────────────────── */

function buildSystemPrompt(agent: AgentRow, knowledge: KnowledgeRow[]): string {
  const knowledgeBlock = knowledge.length > 0
    ? knowledge.map(k => `### ${k.title}\n${k.content}`).join('\n\n')
    : 'No additional knowledge configured.'

  return `You are ${agent.name}, an AI agent for this business.

PERSONA:
${agent.persona}

OBJECTIVE:
${agent.objective}

TONE: ${agent.tone}

KNOWLEDGE BASE:
${knowledgeBlock}

INSTRUCTIONS:
- Converse naturally to qualify the lead.
- Collect name, phone, email, and what they are interested in (all four fields).
- Set lead_ready to true only when you have collected ALL of: name, phone, email, interest.
- Until lead_ready is true, keep lead fields as empty strings.
- Use intent to describe what the visitor is doing: greeting, inquiry, pricing, booking, objection, off_topic, qualified.
- If asked something outside your knowledge base reply with: ${agent.fallback_msg}
- Keep replies concise (2–4 sentences max).

RESPONSE FORMAT:
You MUST respond with valid JSON only. No markdown, no code fences. Exactly this shape:
{
  "reply":      "<your message to the visitor>",
  "intent":     "<one of: greeting | inquiry | pricing | booking | objection | off_topic | qualified>",
  "lead_ready": <true|false>,
  "lead": {
    "name":     "<full name or empty string>",
    "phone":    "<phone number or empty string>",
    "email":    "<email address or empty string>",
    "interest": "<what they want or empty string>"
  }
}`
}

/* ── OpenAI call ─────────────────────────────────────────────────────────── */

async function callOpenAI(
  client: OpenAI,
  model: string,
  temperature: number,
  systemPrompt: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  userMessage: string,
): Promise<OpenAIReply> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
  ]

  const response = await client.chat.completions.create({
    model,
    temperature,
    response_format: { type: 'json_object' },
    messages,
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw) as Partial<OpenAIReply>

  // Normalise — ensure all required fields are present with safe defaults
  return {
    reply:      typeof parsed.reply      === 'string'  ? parsed.reply      : 'I had trouble generating a reply. Please try again.',
    intent:     typeof parsed.intent     === 'string'  ? parsed.intent     : 'unknown',
    lead_ready: typeof parsed.lead_ready === 'boolean' ? parsed.lead_ready : false,
    lead: {
      name:     typeof parsed.lead?.name     === 'string' ? parsed.lead.name     : '',
      phone:    typeof parsed.lead?.phone    === 'string' ? parsed.lead.phone    : '',
      email:    typeof parsed.lead?.email    === 'string' ? parsed.lead.email    : '',
      interest: typeof parsed.lead?.interest === 'string' ? parsed.lead.interest : '',
    },
  }
}

/* ── Route handler ───────────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  /* 1. Parse and validate body ──────────────────────────────────────────── */
  let body: { business_id?: unknown; conversation_id?: unknown; message?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const business_id     = typeof body.business_id     === 'string' ? body.business_id.trim()     : null
  const conversation_id = typeof body.conversation_id === 'string' ? body.conversation_id.trim() : null
  const message         = typeof body.message         === 'string' ? body.message.trim()         : null

  if (!business_id) return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
  if (!message)     return NextResponse.json({ error: 'message is required' },     { status: 400 })

  /* 2. Supabase admin client (service role, never exposed to browser) ──── */
  const sb = createAdminClient()

  /* 3. Load active agent for this business ─────────────────────────────── */
  const { data: agentRow, error: agentErr } = await sb
    .from('agents')
    .select('*')
    .eq('business_id', business_id)
    .eq('active', true)
    .limit(1)
    .maybeSingle()

  if (agentErr) {
    console.error('[POST /api/chat] agent load error:', JSON.stringify(agentErr))
    return NextResponse.json({
      error:   'Failed to load agent',
      details: { code: agentErr.code, message: agentErr.message, hint: agentErr.hint },
    }, { status: 500 })
  }

  if (!agentRow) {
    return NextResponse.json({
      error:   'No active agent found for this business',
      details: { business_id },
    }, { status: 404 })
  }

  const agent = agentRow as AgentRow

  /* 4. Load knowledge sources ──────────────────────────────────────────── */
  const { data: knowledgeRows } = await sb
    .from('knowledge_sources')
    .select('title, content')
    .eq('business_id', business_id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  const knowledge = (knowledgeRows ?? []) as KnowledgeRow[]

  /* 5. Resolve conversation ────────────────────────────────────────────── */
  // If conversation_id was supplied, verify the row actually exists.
  // An invalid/stale ID must not be used — it would cause a FK violation
  // when the lead is inserted (leads_conversation_id_fkey).
  let convId: string

  if (conversation_id) {
    const { data: existingConv } = await sb
      .from('conversations')
      .select('id')
      .eq('id', conversation_id)
      .maybeSingle()

    convId = existingConv?.id ?? crypto.randomUUID()
  } else {
    convId = crypto.randomUUID()
  }

  // Create a new row whenever we generated a fresh UUID
  const needsInsert = convId !== conversation_id
  if (needsInsert) {
    const { error: convErr } = await sb.from('conversations').insert({
      id:              convId,
      client_id:       business_id,
      channel:         'website',
      status:          'open',
      last_message_at: new Date().toISOString(),
    })
    if (convErr) console.warn('[POST /api/chat] conversation insert failed:', JSON.stringify(convErr))
  } else {
    await sb
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', convId)
  }

  /* 6. Load recent conversation history (last 20 messages) ─────────────── */
  const { data: historyRows } = await sb
    .from('messages')
    .select('from_role, content')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })
    .limit(20)

  const history = (historyRows ?? []).map(row => ({
    role:    row.from_role === 'ai' ? 'assistant' as const : 'user' as const,
    content: row.content as string,
  }))

  /* 7. Save the user message ───────────────────────────────────────────── */
  const userMsgAt = new Date().toISOString()
  await sb.from('messages').insert({
    conversation_id: convId,
    client_id:       business_id,
    from_role:       'user',
    content:         message,
    created_at:      userMsgAt,
  })

  /* 8. Call OpenAI ─────────────────────────────────────────────────────── */
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY is not configured' }, { status: 500 })
  }

  const openai = new OpenAI({ apiKey: openaiKey })
  const systemPrompt = buildSystemPrompt(agent, knowledge)

  let aiReply: OpenAIReply
  try {
    aiReply = await callOpenAI(openai, agent.model, agent.temperature, systemPrompt, history, message)
  } catch (err) {
    console.error('[POST /api/chat] OpenAI error:', err)
    return NextResponse.json({ error: 'Failed to get AI response' }, { status: 502 })
  }

  /* 9. Save assistant reply ────────────────────────────────────────────── */
  // Offset by 1ms so ordering is deterministic — user message always sorts first
  const aiBotAt = new Date(Date.now() + 1).toISOString()
  await sb.from('messages').insert({
    conversation_id: convId,
    client_id:       business_id,
    from_role:       'ai',
    content:         aiReply.reply,
    created_at:      aiBotAt,
  })

  /* 10. Create lead if ready ───────────────────────────────────────────── */
  let leadId: string | null = null
  let leadInsertError: Record<string, unknown> | null = null

  if (aiReply.lead_ready) {
    const { data: newLead, error: leadErr } = await sb
      .from('leads')
      .insert({
        business_id,
        name:            aiReply.lead?.name     || null,
        phone:           aiReply.lead?.phone    || null,
        email:           aiReply.lead?.email    || null,
        interest:        aiReply.lead?.interest || aiReply.intent || null,
        source:          'website_chat',
        status:          'new',
      })
      .select('id')
      .single()

    if (leadErr) {
      console.error('[POST /api/chat] lead insert error:', JSON.stringify(leadErr))
      leadInsertError = { code: leadErr.code, message: leadErr.message, hint: leadErr.hint }
    } else {
      leadId = newLead.id
    }
  }

  /* 11. Fire Make.com webhook if configured ────────────────────────────── */
  const webhookUrl = process.env.MAKE_WEBHOOK_URL
  if (webhookUrl && aiReply.lead_ready && leadId) {
    // Fire-and-forget — don't block the response
    fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event:           'lead_captured',
        lead_id:         leadId,
        business_id,
        conversation_id: convId,
        intent:          aiReply.intent,
        lead:            aiReply.lead,
        captured_at:     new Date().toISOString(),
      }),
    }).catch(err => console.warn('[POST /api/chat] Make.com webhook error:', err))
  }

  /* 12. Return ─────────────────────────────────────────────────────────── */
  return NextResponse.json({
    reply:           aiReply.reply,
    conversation_id: convId,
    intent:          aiReply.intent,
    lead_ready:      aiReply.lead_ready,
    ...(leadId          && { lead_id:           leadId }),
    ...(leadInsertError && { lead_insert_error: leadInsertError }),
  })
}
