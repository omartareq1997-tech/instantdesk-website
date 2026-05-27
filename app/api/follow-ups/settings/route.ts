/**
 * GET  /api/follow-ups/settings  — list all 5 rule settings for the session business
 * PUT  /api/follow-ups/settings  — upsert one rule setting
 *
 * Trigger types:
 *   no_reply_2h          — lead created, no user reply after delay_hours
 *   no_reply_24h         — same lead, 24h follow-up
 *   missed_appointment   — appointment passed with status 'pending'
 *   viewing_tomorrow     — reminder sent delay_hours before a scheduled appointment
 *   hot_lead_followup    — lead has all required slots (name + phone/email)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'

export type FollowUpTrigger =
  | 'no_reply_2h'
  | 'no_reply_24h'
  | 'missed_appointment'
  | 'viewing_tomorrow'
  | 'hot_lead_followup'

export const ALL_TRIGGERS: FollowUpTrigger[] = [
  'no_reply_2h',
  'no_reply_24h',
  'missed_appointment',
  'viewing_tomorrow',
  'hot_lead_followup',
]

const DEFAULTS: Record<FollowUpTrigger, {
  enabled: boolean
  delay_hours: number
  tone: string
  custom_prompt: string | null
}> = {
  no_reply_2h: {
    enabled:       false,
    delay_hours:   2,
    tone:          'friendly',
    custom_prompt: null,
  },
  no_reply_24h: {
    enabled:       false,
    delay_hours:   24,
    tone:          'friendly',
    custom_prompt: null,
  },
  missed_appointment: {
    enabled:       false,
    delay_hours:   1,
    tone:          'professional',
    custom_prompt: null,
  },
  viewing_tomorrow: {
    enabled:       true,
    delay_hours:   24,
    tone:          'friendly',
    custom_prompt: null,
  },
  hot_lead_followup: {
    enabled:       false,
    delay_hours:   0.5,
    tone:          'professional',
    custom_prompt: null,
  },
}

export async function GET() {
  const { clientId } = await getSessionBusinessId()
  const sb = createAdminClient()

  const { data, error } = await sb
    .from('follow_up_settings')
    .select('*')
    .eq('business_id', clientId)

  if (error && error.code !== '42P01') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const savedMap = new Map((data ?? []).map(r => [r.trigger_type as string, r]))

  const settings = ALL_TRIGGERS.map(trigger => {
    const saved = savedMap.get(trigger)
    const def   = DEFAULTS[trigger]
    return {
      id:            (saved?.id as string | undefined) ?? null,
      business_id:   clientId,
      trigger_type:  trigger,
      enabled:       saved ? (saved.enabled as boolean) : def.enabled,
      delay_hours:   saved ? (saved.delay_hours as number) : def.delay_hours,
      tone:          (saved?.tone as string | undefined) ?? def.tone,
      custom_prompt: (saved?.custom_prompt as string | null | undefined) ?? def.custom_prompt,
      updated_at:    (saved?.updated_at as string | undefined) ?? null,
    }
  })

  return NextResponse.json({ settings })
}

export async function PUT(req: NextRequest) {
  let body: {
    trigger_type?: string
    enabled?: boolean
    delay_hours?: number
    tone?: string
    custom_prompt?: string | null
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.trigger_type || !ALL_TRIGGERS.includes(body.trigger_type as FollowUpTrigger)) {
    return NextResponse.json({ error: 'Invalid trigger_type' }, { status: 400 })
  }

  const { clientId } = await getSessionBusinessId()
  const sb = createAdminClient()
  const now = new Date().toISOString()

  const payload: Record<string, unknown> = {
    business_id:   clientId,
    trigger_type:  body.trigger_type,
    updated_at:    now,
  }
  if (typeof body.enabled      === 'boolean') payload.enabled      = body.enabled
  if (typeof body.delay_hours  === 'number')  payload.delay_hours  = body.delay_hours
  if (typeof body.tone         === 'string')  payload.tone         = body.tone
  if ('custom_prompt' in body)                payload.custom_prompt = body.custom_prompt ?? null

  const { data, error } = await sb
    .from('follow_up_settings')
    .upsert(payload, { onConflict: 'business_id,trigger_type' })
    .select('*')
    .single()

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({ error: 'follow_up_settings table not found — run sql/create_follow_ups.sql' }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ setting: data })
}
