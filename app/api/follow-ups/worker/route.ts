/**
 * POST /api/follow-ups/worker  — AI follow-up cron worker
 *
 * Designed to be called by an external cron every 5–15 minutes.
 * Optionally accepts { business_id } to scope to one tenant; without it, processes all tenants.
 *
 * Per execution:
 *  1. Find scheduled follow_ups with scheduled_for <= now()
 *  2. Also detect missed_appointment candidates (appointments past due, status 'pending',
 *     no follow-up already exists for that lead+trigger)
 *  3. For each due follow-up:
 *     a. Load lead row (name, phone, email, metadata for confirmed slots)
 *     b. Load last 10 messages from the conversation
 *     c. Load agent config + knowledge for the business
 *     d. Load follow_up_setting for tone/custom_prompt
 *     e. Build contextual prompt + call OpenAI
 *     f. Insert assistant message into messages table
 *     g. Update conversation.last_message_at
 *     h. Insert activity_event (follow_up_sent)
 *     i. Update follow_up: status=sent, message=text, sent_at=now()
 *  4. If rule is disabled for a follow-up, mark it cancelled
 *  5. Return { processed, sent, failed, cancelled } counts
 */

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createAdminClient } from '../../../lib/supabase-server'
import { logEvent } from '../../_lib/logEvent'

interface FollowUpRow {
  id:              string
  business_id:     string
  lead_id:         string | null
  conversation_id: string | null
  trigger_type:    string
  scheduled_for:   string
  status:          string
}

interface LeadRow {
  id:       string
  name:     string | null
  phone:    string | null
  email:    string | null
  metadata: Record<string, unknown> | null
}

interface AgentRow {
  id: string
  name: string
  persona: string
  objective: string
  tone: string
  fallback_msg: string
  model: string
  temperature: number
}

interface SettingRow {
  enabled:       boolean
  delay_hours:   number
  tone:          string
  custom_prompt: string | null
}

const TRIGGER_LABELS: Record<string, string> = {
  no_reply_2h:         'No reply — 2h follow-up',
  no_reply_24h:        'No reply — 24h follow-up',
  missed_appointment:  'Missed appointment follow-up',
  viewing_tomorrow:    'Viewing reminder — tomorrow',
  hot_lead_followup:   'Hot lead follow-up',
}

function buildFollowUpPrompt(
  triggerType:   string,
  lead:          LeadRow | null,
  history:       { role: string; content: string }[],
  agent:         AgentRow | null,
  setting:       SettingRow | null,
): string {
  const meta    = (lead?.metadata ?? {}) as Record<string, unknown>
  const name    = lead?.name ?? 'there'
  const city    = (meta.city    as string | undefined) ?? null
  const budget  = (meta.budget  as string | undefined) ?? null
  const propType = (meta.property_type as string | undefined) ?? null
  const rooms   = (meta.rooms   as string | undefined) ?? null
  const dealType = (meta.deal_type as string | undefined) ?? null

  const knownInfo: string[] = []
  if (city)     knownInfo.push(`looking in ${city}`)
  if (dealType) knownInfo.push(`wants to ${dealType}`)
  if (propType) knownInfo.push(`interested in a ${propType}`)
  if (rooms)    knownInfo.push(`needs ${rooms}`)
  if (budget)   knownInfo.push(`budget ${budget}`)

  const contextSummary = knownInfo.length
    ? `What we know: ${name} is ${knownInfo.join(', ')}.`
    : `We have limited info about ${name} so far.`

  const recentHistory = history.slice(-6).map(m =>
    `${m.role === 'user' ? name : 'Agent'}: ${m.content}`
  ).join('\n')

  const tone         = setting?.tone ?? agent?.tone ?? 'friendly'
  const customPrompt = setting?.custom_prompt
  const persona      = agent?.persona ?? 'You are a helpful AI sales assistant.'

  let triggerContext = ''
  switch (triggerType) {
    case 'no_reply_2h':
      triggerContext = `The lead started a conversation 2 hours ago but has not responded to our last message. Send a warm, brief check-in.`
      break
    case 'no_reply_24h':
      triggerContext = `It has been 24 hours since the lead last replied. Send a friendly re-engagement message that adds value and invites them to continue.`
      break
    case 'missed_appointment':
      triggerContext = `The lead had a scheduled viewing/appointment that they missed or that was not confirmed. Acknowledge empathetically and offer to reschedule.`
      break
    case 'viewing_tomorrow':
      triggerContext = `The lead has a viewing scheduled for tomorrow. Send a friendly reminder confirming the appointment and asking if they need anything.`
      break
    case 'hot_lead_followup':
      triggerContext = `This lead has shown strong interest and shared their contact details. Follow up proactively to move them to the next step.`
      break
    default:
      triggerContext = `Follow up with this lead to continue the conversation.`
  }

  const instructions = customPrompt
    ? `SPECIFIC INSTRUCTIONS: ${customPrompt}`
    : `Write one short, natural follow-up message (2–3 sentences max). Be ${tone}. Reference what you know about their search. Do not ask for information they already gave. End with one soft call to action.`

  return `${persona}

CONTEXT:
${contextSummary}

RECENT CONVERSATION:
${recentHistory || '(no prior messages)'}

TRIGGER: ${triggerContext}

${instructions}

RULES:
- Write in plain conversational text only. No JSON, no lists.
- Address ${name} by name naturally.
- Keep it short — 2 to 3 sentences maximum.
- Sound human, not robotic. Avoid generic phrases like "I hope this message finds you well."
- Tone: ${tone}`
}

async function callOpenAI(
  apiKey:      string,
  model:       string,
  temperature: number,
  prompt:      string,
): Promise<string> {
  const openai = new OpenAI({ apiKey })
  const response = await openai.chat.completions.create({
    model,
    temperature,
    max_tokens: 200,
    messages: [{ role: 'system', content: prompt }],
  })
  const text = response.choices[0]?.message?.content?.trim() ?? ''
  if (!text) throw new Error('Empty OpenAI response')
  return text
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 })
  }

  // Optional: scope to one business for testing
  let scopeBusinessId: string | null = null
  try {
    const body = await req.json() as { business_id?: string }
    scopeBusinessId = typeof body.business_id === 'string' ? body.business_id : null
  } catch { /* no body */ }

  const sb  = createAdminClient()
  const now = new Date().toISOString()

  const counts = { processed: 0, sent: 0, failed: 0, cancelled: 0, detected: 0 }

  /* ── 1. Detect missed_appointment candidates ─────────────────────────────── */
  // Appointments past their scheduled time with status 'pending' and no existing follow-up
  {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    let apptQuery = sb
      .from('appointments')
      .select('id, business_id, lead_id, conversation_id:lead_id')
      .lt('scheduled_at', oneHourAgo)
      .eq('status', 'pending')
      .limit(50)
    if (scopeBusinessId) apptQuery = apptQuery.eq('business_id', scopeBusinessId)

    const { data: pastAppts } = await apptQuery

    for (const appt of (pastAppts ?? [])) {
      // Check if a follow-up already exists for this lead + missed_appointment
      const { data: existing } = await sb
        .from('follow_ups')
        .select('id')
        .eq('business_id', appt.business_id as string)
        .eq('lead_id', appt.lead_id as string ?? '')
        .eq('trigger_type', 'missed_appointment')
        .limit(1)
        .maybeSingle()

      if (existing) continue

      // Check if rule is enabled
      const { data: setting } = await sb
        .from('follow_up_settings')
        .select('enabled, delay_hours')
        .eq('business_id', appt.business_id as string)
        .eq('trigger_type', 'missed_appointment')
        .maybeSingle()

      if (!setting?.enabled) continue

      // Get the lead's conversation_id
      const { data: lead } = await sb
        .from('leads')
        .select('conversation_id')
        .eq('id', appt.lead_id as string)
        .maybeSingle()

      await sb.from('follow_ups').insert({
        business_id:     appt.business_id,
        lead_id:         appt.lead_id,
        conversation_id: lead?.conversation_id ?? null,
        trigger_type:    'missed_appointment',
        scheduled_for:   now,
        status:          'scheduled',
      })
      counts.detected++
    }
  }

  /* ── 2. Load all due follow-ups ──────────────────────────────────────────── */
  let dueQuery = sb
    .from('follow_ups')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_for', now)
    .order('scheduled_for', { ascending: true })
    .limit(100)

  if (scopeBusinessId) dueQuery = dueQuery.eq('business_id', scopeBusinessId)

  const { data: dueRows, error: dueErr } = await dueQuery
  if (dueErr) {
    if (dueErr.code === '42P01') return NextResponse.json({ error: 'follow_ups table not found — run sql/create_follow_ups.sql' }, { status: 503 })
    return NextResponse.json({ error: dueErr.message }, { status: 500 })
  }

  const followUps = (dueRows ?? []) as FollowUpRow[]

  /* ── 3. Process each due follow-up ──────────────────────────────────────── */
  for (const fu of followUps) {
    counts.processed++

    try {
      // Load rule setting — check enabled flag
      const { data: setting } = await sb
        .from('follow_up_settings')
        .select('enabled, delay_hours, tone, custom_prompt')
        .eq('business_id', fu.business_id)
        .eq('trigger_type', fu.trigger_type)
        .maybeSingle()

      const settingRow = setting as SettingRow | null

      // If rule is disabled, cancel this follow-up
      if (settingRow && !settingRow.enabled) {
        await sb.from('follow_ups').update({ status: 'cancelled' }).eq('id', fu.id)
        counts.cancelled++
        continue
      }

      // Load lead
      const leadRow: LeadRow | null = fu.lead_id
        ? ((await sb.from('leads').select('id, name, phone, email, metadata').eq('id', fu.lead_id).maybeSingle()).data as LeadRow | null)
        : null

      // Load conversation messages
      const convId = fu.conversation_id
      const history: { role: string; content: string }[] = convId
        ? (((await sb
          .from('messages')
          .select('role, content')
          .eq('conversation_id', convId)
          .order('created_at', { ascending: true })
          .limit(10)).data) ?? []) as { role: string; content: string }[]
        : []

      // Load agent config
      const { data: agentData } = await sb
        .from('agents')
        .select('id, name, persona, objective, tone, model, temperature')
        .eq('business_id', fu.business_id)
        .eq('active', true)
        .limit(1)
        .maybeSingle()
      const agent = agentData as AgentRow | null

      const model       = agent?.model       ?? 'gpt-4o-mini'
      const temperature = agent?.temperature ?? 0.7

      // Build prompt and call OpenAI
      const prompt = buildFollowUpPrompt(fu.trigger_type, leadRow, history, agent, settingRow)
      const message = await callOpenAI(apiKey, model, temperature, prompt)

      // Insert assistant message into messages table (if we have a conversation)
      if (convId) {
        await sb.from('messages').insert({
          conversation_id: convId,
          business_id:     fu.business_id,
          role:            'assistant',
          content:         message,
        })
        await sb.from('conversations').update({
          last_message_at: new Date().toISOString(),
        }).eq('id', convId)
      }

      // Update follow_up to sent
      await sb.from('follow_ups').update({
        status:   'sent',
        message,
        sent_at:  new Date().toISOString(),
      }).eq('id', fu.id)

      // Log to activity_events so the event appears in the Audit Log
      const leadName = leadRow?.name ?? 'Lead'
      void logEvent({
        type:        'follow_up_sent',
        title:       `Follow-up sent — ${leadName}`,
        description: TRIGGER_LABELS[fu.trigger_type] ?? fu.trigger_type,
        leadId:      fu.lead_id ?? undefined,
        clientId:    fu.business_id,
        meta:        {
          actor:       'AI Follow-up',
          undoable:    false,
          entity_type: 'appointment' as const,
          entity_id:   fu.id,
          entity_name: leadName,
        },
      }, fu.business_id)

      // Log to automation_logs for consistency with Make.com log view
      await sb.from('automation_logs').insert({
        business_id:     fu.business_id,
        event_type:      fu.trigger_type,
        success:         true,
        lead_id:         fu.lead_id ?? null,
        conversation_id: convId ?? null,
        payload:         { follow_up_id: fu.id, message_preview: message.slice(0, 120) },
      })

      counts.sent++
    } catch (err) {
      console.error('[follow-ups/worker] error processing follow-up', fu.id, err)
      await sb.from('follow_ups').update({ status: 'failed' }).eq('id', fu.id)
      await sb.from('automation_logs').insert({
        business_id:   fu.business_id,
        event_type:    fu.trigger_type,
        success:       false,
        lead_id:       fu.lead_id ?? null,
        error_message: err instanceof Error ? err.message : String(err),
      }).then(() => {})
      void logEvent({
        type:        'follow_up_failed',
        title:       `Follow-up failed — ${TRIGGER_LABELS[fu.trigger_type] ?? fu.trigger_type}`,
        description: err instanceof Error ? err.message : String(err),
        leadId:      fu.lead_id ?? undefined,
        clientId:    fu.business_id,
        meta:        { actor: 'AI Follow-up', undoable: false },
      }, fu.business_id)
      counts.failed++
    }
  }

  console.log('[follow-ups/worker] done', counts)
  return NextResponse.json({ ok: true, ...counts })
}

// GET — health check / manual trigger from browser
export async function GET() {
  return NextResponse.json({
    ok:    true,
    usage: 'POST /api/follow-ups/worker to run the follow-up worker',
    hint:  'Add ?scope=your-business-id body field to test a single tenant',
  })
}
