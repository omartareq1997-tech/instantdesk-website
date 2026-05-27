/**
 * scheduleFollowUps — called from the chat route after lead / appointment creation.
 *
 * When the user sends a new message we cancel pending no_reply_* follow-ups
 * for that conversation (they replied — reset the clock).
 *
 * On lead creation / new reply, schedule no_reply_2h and no_reply_24h.
 * On appointment creation, schedule viewing_tomorrow.
 * When lead has name + contact, optionally schedule hot_lead_followup.
 *
 * Every follow_up row created here also writes an activity_events row so the
 * event appears in the Audit Log under the Automation filter.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logEvent } from '../api/_lib/logEvent'

const TRIGGER_LABELS: Record<string, string> = {
  no_reply_2h:        'No-reply (2h)',
  no_reply_24h:       'No-reply (24h)',
  missed_appointment: 'Missed appointment',
  viewing_tomorrow:   'Viewing reminder',
  hot_lead_followup:  'Hot lead follow-up',
}

interface ScheduleOpts {
  businessId:       string
  /** Pass the resolved clientId if known; defaults to businessId */
  clientId?:        string
  leadId:           string | null
  /** Lead's display name for audit log entries */
  leadName?:        string | null
  conversationId:   string
  appointmentId?:   string | null
  /** ISO string of appointment's scheduled_at, used for viewing_tomorrow */
  appointmentTime?: string | null
  /** Whether this lead has name + phone/email (triggers hot_lead_followup) */
  isHotLead?:       boolean
}

type SettingRow = {
  trigger_type: string
  enabled:      boolean
  delay_hours:  number
}

/** Insert a follow_up row and write the matching audit log entry. */
async function insertFollowUp(
  sb:          SupabaseClient,
  payload:     Record<string, unknown>,
  businessId:  string,
  clientId:    string,
  leadId:      string | null,
  leadName:    string,
): Promise<void> {
  const { error, data } = await sb
    .from('follow_ups')
    .insert(payload)
    .select('id')
    .single()

  if (error) {
    if (error.code !== '42P01') {
      console.error(`[scheduleFollowUps] ${payload.trigger_type} insert:`, error.message)
    }
    return
  }

  const label = TRIGGER_LABELS[payload.trigger_type as string] ?? String(payload.trigger_type)
  void logEvent({
    type:        'follow_up_scheduled',
    title:       `Follow-up scheduled — ${leadName}`,
    description: label,
    leadId:      leadId ?? undefined,
    clientId,
    meta: {
      actor:       'AI Follow-up',
      undoable:    false,
      entity_type: 'appointment' as const,
      entity_id:   data?.id ?? undefined,
      entity_name: leadName,
    },
  }, businessId)
}

export async function scheduleFollowUps(
  sb:   SupabaseClient,
  opts: ScheduleOpts,
): Promise<void> {
  const {
    businessId,
    clientId = businessId,
    leadId,
    leadName,
    conversationId,
    appointmentId,
    appointmentTime,
    isHotLead,
  } = opts

  const displayName = leadName?.trim() || 'Lead'

  // Load enabled settings for this business (gracefully handle missing table)
  const { data: settingsData, error: settingsErr } = await sb
    .from('follow_up_settings')
    .select('trigger_type, enabled, delay_hours')
    .eq('business_id', businessId)

  if (settingsErr?.code === '42P01') return // table doesn't exist yet
  if (settingsErr) {
    console.error('[scheduleFollowUps] settings error:', settingsErr.message)
    return
  }

  const settings = (settingsData ?? []) as SettingRow[]
  const byType   = new Map(settings.map(s => [s.trigger_type, s]))

  // Cancel pending no_reply follow-ups for this conversation — user just replied
  if (conversationId) {
    const { error: cancelErr } = await sb
      .from('follow_ups')
      .update({ status: 'cancelled' })
      .eq('conversation_id', conversationId)
      .eq('status', 'scheduled')
      .in('trigger_type', ['no_reply_2h', 'no_reply_24h'])
    if (cancelErr && cancelErr.code !== '42P01') {
      console.error('[scheduleFollowUps] cancel error:', cancelErr.message)
    }
  }

  if (!leadId) return

  const now = Date.now()

  // ── no_reply_2h ────────────────────────────────────────────────────────────
  const s2h = byType.get('no_reply_2h')
  if (s2h?.enabled) {
    const delayMs = (s2h.delay_hours ?? 2) * 60 * 60 * 1000
    await insertFollowUp(sb, {
      business_id:     businessId,
      lead_id:         leadId,
      conversation_id: conversationId,
      trigger_type:    'no_reply_2h',
      scheduled_for:   new Date(now + delayMs).toISOString(),
      status:          'scheduled',
    }, businessId, clientId, leadId, displayName)
  }

  // ── no_reply_24h ───────────────────────────────────────────────────────────
  const s24h = byType.get('no_reply_24h')
  if (s24h?.enabled) {
    const delayMs = (s24h.delay_hours ?? 24) * 60 * 60 * 1000
    await insertFollowUp(sb, {
      business_id:     businessId,
      lead_id:         leadId,
      conversation_id: conversationId,
      trigger_type:    'no_reply_24h',
      scheduled_for:   new Date(now + delayMs).toISOString(),
      status:          'scheduled',
    }, businessId, clientId, leadId, displayName)
  }

  // ── viewing_tomorrow — X hours before the appointment ─────────────────────
  if (appointmentId && appointmentTime) {
    const sVT = byType.get('viewing_tomorrow')
    if (sVT?.enabled !== false) { // default enabled = true
      const hoursBeforeAppt = sVT?.delay_hours ?? 24
      const apptMs          = new Date(appointmentTime).getTime()
      const remindAt        = apptMs - hoursBeforeAppt * 60 * 60 * 1000

      if (remindAt > now) {
        // Guard duplicate: don't schedule if one already exists for this lead
        const { data: existing } = await sb
          .from('follow_ups')
          .select('id')
          .eq('lead_id', leadId)
          .eq('trigger_type', 'viewing_tomorrow')
          .eq('status', 'scheduled')
          .maybeSingle()

        if (!existing) {
          await insertFollowUp(sb, {
            business_id:     businessId,
            lead_id:         leadId,
            conversation_id: conversationId,
            trigger_type:    'viewing_tomorrow',
            scheduled_for:   new Date(remindAt).toISOString(),
            status:          'scheduled',
          }, businessId, clientId, leadId, displayName)
        }
      }
    }
  }

  // ── hot_lead_followup — lead has name + phone/email ────────────────────────
  if (isHotLead) {
    const sHL = byType.get('hot_lead_followup')
    if (sHL?.enabled) {
      const { data: existingHL } = await sb
        .from('follow_ups')
        .select('id')
        .eq('lead_id', leadId)
        .eq('trigger_type', 'hot_lead_followup')
        .in('status', ['scheduled', 'sent'])
        .maybeSingle()

      if (!existingHL) {
        const delayMs = (sHL.delay_hours ?? 0.5) * 60 * 60 * 1000
        await insertFollowUp(sb, {
          business_id:     businessId,
          lead_id:         leadId,
          conversation_id: conversationId,
          trigger_type:    'hot_lead_followup',
          scheduled_for:   new Date(now + delayMs).toISOString(),
          status:          'scheduled',
        }, businessId, clientId, leadId, displayName)
      }
    }
  }
}
