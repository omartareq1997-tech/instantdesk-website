/**
 * GET /api/make/automation-settings
 *
 * Make.com calls this at the START of each scenario to read the current config
 * before deciding whether to proceed and how to send the message.
 *
 * ── How to call from Make.com ──────────────────────────────────────────────
 *
 *   Module : HTTP → Make a request
 *   Method : GET
 *   URL    : https://your-domain.com/api/make/automation-settings
 *            ?client_id=00000000-0000-0000-0000-000000000001
 *            &automation_type=appointment_reminder   ← omit to get all types
 *
 *   Headers:
 *     x-make-secret : {{env.MAKE_WEBHOOK_SECRET}}
 *
 *   Parse response (JSON) and map fields into your scenario:
 *     enabled          → Use as a Router filter (if false → skip all branches)
 *     channel          → Switch between WhatsApp / SMS / Email modules
 *     delay_minutes    → Feed into a Sleep module before sending
 *     message_template → Use as the message body (variables like {{lead_name}} resolved by Make)
 *     config           → Access sub-keys: ai_message, business_hours_only, assigned_agent_only
 *
 * ── Response shape ─────────────────────────────────────────────────────────
 *
 *   Single type  → { setting: { automation_type, enabled, channel, delay_minutes, message_template, config } }
 *   All types    → { settings: [ ...same shape... ] }
 *   Disabled     → { setting: { enabled: false, ... } }  — Make.com should stop the scenario
 *   401          → { error: "Unauthorized" }              — wrong or missing x-make-secret
 *   404          → { error: "Not found" }                 — unknown automation_type
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'

const VALID_TYPES = new Set([
  'missed_lead_recovery',
  'appointment_reminder',
  'no_show_recovery',
  'review_request',
  'lead_reengagement',
  'hot_lead_alert',
])

const DEFAULTS: Record<string, {
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
    message_template: "Hi {{lead_name}}, we missed you at your appointment. No worries — reply with a time that works and we'll get you rescheduled.",
    config: { ai_message: true, business_hours_only: true, assigned_agent_only: true },
  },
  review_request: {
    enabled: false, channel: 'email', delay_minutes: 1440,
    message_template: "Hi {{lead_name}}, thank you for choosing us! We'd love to hear about your experience. Could you spare 2 minutes to leave a review?",
    config: { ai_message: false, business_hours_only: true, assigned_agent_only: false },
  },
  lead_reengagement: {
    enabled: false, channel: 'whatsapp', delay_minutes: 10080,
    message_template: "Hi {{lead_name}}, we haven't heard from you in a while and wanted to check in. Is there anything we can help you with?",
    config: { ai_message: true, business_hours_only: true, assigned_agent_only: false },
  },
  hot_lead_alert: {
    enabled: false, channel: 'whatsapp', delay_minutes: 0,
    message_template: '🔥 Hot lead: {{lead_name}} from {{company}} scored {{score}}. Assign and follow up immediately.',
    config: { ai_message: false, business_hours_only: false, assigned_agent_only: false },
  },
}

function pickFields(row: Record<string, unknown>) {
  return {
    automation_type:  row.automation_type,
    enabled:          row.enabled,
    channel:          row.channel,
    delay_minutes:    row.delay_minutes,
    message_template: row.message_template,
    config:           row.config,
  }
}

function authorize(req: NextRequest): boolean {
  const secret = process.env.MAKE_WEBHOOK_SECRET
  if (!secret) return false
  return req.headers.get('x-make-secret') === secret
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const client_id      = searchParams.get('client_id')
  const automation_type = searchParams.get('automation_type')

  if (!client_id) {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 })
  }

  if (automation_type && !VALID_TYPES.has(automation_type)) {
    return NextResponse.json({ error: 'Unknown automation_type' }, { status: 404 })
  }

  try {
    const sb = createAdminClient()

    if (automation_type) {
      // Single setting lookup
      const { data, error } = await sb
        .from('automation_settings')
        .select('automation_type, enabled, channel, delay_minutes, message_template, config')
        .eq('client_id', client_id)
        .eq('automation_type', automation_type)
        .maybeSingle()

      if (error && error.code !== '42P01') throw error

      const setting = data
        ? pickFields(data as Record<string, unknown>)
        : { ...pickFields({ ...DEFAULTS[automation_type], automation_type }), enabled: false }

      return NextResponse.json({ setting })
    }

    // All settings
    const { data: rows, error } = await sb
      .from('automation_settings')
      .select('automation_type, enabled, channel, delay_minutes, message_template, config')
      .eq('client_id', client_id)

    if (error && error.code !== '42P01') throw error

    const savedMap = new Map(
      (rows ?? []).map(r => [r.automation_type as string, r as Record<string, unknown>])
    )

    const settings = Array.from(VALID_TYPES).map(type => {
      const saved = savedMap.get(type)
      return saved
        ? pickFields(saved)
        : { ...pickFields({ ...DEFAULTS[type], automation_type: type }), enabled: false }
    })

    return NextResponse.json({ settings })
  } catch (err) {
    console.error('[GET /api/make/automation-settings]', err)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}
