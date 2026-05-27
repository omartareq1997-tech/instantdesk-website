/**
 * GET  /api/automations — list all automation settings for the business,
 *                         with aggregated last_run / success / failure counts.
 *                         Returns defaults for any presets not yet saved.
 * POST /api/automations — upsert a full automation setting row.
 *
 * automation_logs real columns:
 *   id, business_id, conversation_id, lead_id, event_type (NOT NULL),
 *   payload, success (bool), error_message, created_at
 *
 * automation_settings: may or may not exist — handled gracefully (42P01).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-server'

const BUSINESS_ID = process.env.BUSINESS_ID ?? '0616a47a-2c01-49ce-a798-385f8276b92b'

export type AutomationType =
  | 'missed_lead_recovery'
  | 'appointment_reminder'
  | 'no_show_recovery'
  | 'review_request'
  | 'lead_reengagement'
  | 'hot_lead_alert'

const ALL_TYPES: AutomationType[] = [
  'missed_lead_recovery',
  'appointment_reminder',
  'no_show_recovery',
  'review_request',
  'lead_reengagement',
  'hot_lead_alert',
]

/** Default config for each preset — used when no DB row exists yet. */
const DEFAULTS: Record<AutomationType, {
  enabled: boolean; channel: string; delay_minutes: number;
  message_template: string; config: Record<string, unknown>
}> = {
  missed_lead_recovery: {
    enabled: false, channel: 'whatsapp', delay_minutes: 60,
    message_template: 'Hi {{lead_name}}, we noticed you reached out and wanted to follow up. Are you still interested in {{service}}? Reply to book a quick call.',
    config: { ai_message: true, business_hours_only: true, assigned_agent_only: false },
  },
  appointment_reminder: {
    enabled: false, channel: 'whatsapp', delay_minutes: 1440,
    message_template: 'Hi {{lead_name}}, just a reminder about your appointment tomorrow at {{time}}. Reply CONFIRM to confirm or RESCHEDULE to change the time.',
    config: { ai_message: false, business_hours_only: false, assigned_agent_only: false },
  },
  no_show_recovery: {
    enabled: false, channel: 'sms', delay_minutes: 30,
    message_template: 'Hi {{lead_name}}, we missed you at your appointment. No worries — reply with a time that works and we\'ll get you rescheduled.',
    config: { ai_message: true, business_hours_only: true, assigned_agent_only: true },
  },
  review_request: {
    enabled: false, channel: 'email', delay_minutes: 1440,
    message_template: 'Hi {{lead_name}}, thank you for choosing us! We\'d love to hear about your experience. Could you spare 2 minutes to leave a review?',
    config: { ai_message: false, business_hours_only: true, assigned_agent_only: false },
  },
  lead_reengagement: {
    enabled: false, channel: 'whatsapp', delay_minutes: 10080,
    message_template: 'Hi {{lead_name}}, we haven\'t heard from you in a while and wanted to check in. Is there anything we can help you with?',
    config: { ai_message: true, business_hours_only: true, assigned_agent_only: false },
  },
  hot_lead_alert: {
    enabled: false, channel: 'whatsapp', delay_minutes: 0,
    message_template: '🔥 Hot lead: {{lead_name}} from {{company}} scored {{score}}. Assign and follow up immediately.',
    config: { ai_message: false, business_hours_only: false, assigned_agent_only: false },
  },
}

/* ── GET ─────────────────────────────────────────────────────── */

export async function GET() {
  try {
    const sb = createAdminClient()

    // Fetch saved settings (table may not exist yet)
    const { data: rows, error: settingsErr } = await sb
      .from('automation_settings')
      .select('*')
      .eq('business_id', BUSINESS_ID)

    if (settingsErr && settingsErr.code !== '42P01') throw settingsErr

    const savedMap = new Map<string, Record<string, unknown>>(
      (rows ?? []).map(r => [r.automation_type as string, r as Record<string, unknown>])
    )

    // Fetch aggregated log stats per event_type (real columns: event_type, success)
    const { data: logRows, error: logErr } = await sb
      .from('automation_logs')
      .select('event_type, success, created_at')
      .eq('business_id', BUSINESS_ID)
      .order('created_at', { ascending: false })
      .limit(1000)

    if (logErr && logErr.code !== '42P01') throw logErr

    // Aggregate stats per event_type
    type Stats = { last_run: string | null; success_count: number; failure_count: number }
    const statsMap = new Map<string, Stats>()
    for (const log of (logRows ?? [])) {
      const t = log.event_type as string
      const s = statsMap.get(t) ?? { last_run: null, success_count: 0, failure_count: 0 }
      if (!s.last_run) s.last_run = log.created_at as string
      if (log.success === true)  s.success_count++
      if (log.success === false) s.failure_count++
      statsMap.set(t, s)
    }

    // Merge: DB row ?? default + runtime stats
    const settings = ALL_TYPES.map(type => {
      const saved = savedMap.get(type)
      const def   = DEFAULTS[type]
      const stats = statsMap.get(type) ?? { last_run: null, success_count: 0, failure_count: 0 }
      return {
        id:               (saved?.id as string | undefined) ?? null,
        business_id:      BUSINESS_ID,
        automation_type:  type,
        enabled:          saved ? (saved.enabled as boolean) : def.enabled,
        channel:          (saved?.channel as string | undefined) ?? def.channel,
        delay_minutes:    (saved?.delay_minutes as number | undefined) ?? def.delay_minutes,
        config:           (saved?.config as Record<string, unknown> | undefined) ?? def.config,
        message_template: (saved?.message_template as string | undefined) ?? def.message_template,
        created_at:       (saved?.created_at as string | undefined) ?? null,
        updated_at:       (saved?.updated_at as string | undefined) ?? null,
        ...stats,
      }
    })

    return NextResponse.json({ settings })
  } catch (err) {
    console.error('[GET /api/automations]', err)
    return NextResponse.json({ error: 'Failed to fetch automation settings' }, { status: 500 })
  }
}

/* ── POST (upsert) ───────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const type = body.automation_type as string
    if (!ALL_TYPES.includes(type as AutomationType)) {
      return NextResponse.json({ error: 'Invalid automation_type' }, { status: 400 })
    }

    const sb = createAdminClient()
    const upsertPayload = {
      business_id:      BUSINESS_ID,
      automation_type:  type,
      enabled:          typeof body.enabled          === 'boolean' ? body.enabled          : false,
      channel:          typeof body.channel          === 'string'  ? body.channel          : 'whatsapp',
      delay_minutes:    typeof body.delay_minutes    === 'number'  ? body.delay_minutes    : 0,
      config:           typeof body.config           === 'object'  ? body.config           : {},
      message_template: typeof body.message_template === 'string'  ? body.message_template : '',
      updated_at:       new Date().toISOString(),
    }

    const { data, error } = await sb
      .from('automation_settings')
      .upsert(upsertPayload, { onConflict: 'business_id,automation_type' })
      .select('*')
      .single()

    if (error) {
      console.error('[POST /api/automations]', error)
      if (error.code === '42P01') return NextResponse.json({ error: 'automation_settings table not found.' }, { status: 503 })
      throw error
    }

    return NextResponse.json({ setting: data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/automations]', err)
    return NextResponse.json({ error: 'Failed to save automation setting' }, { status: 500 })
  }
}
