/**
 * Server-only helper: write one row to activity_events.
 *
 * Never throws — logging must never break a mutation.
 *
 * Prerequisites (run once in Supabase SQL editor):
 *   ALTER TABLE activity_events DROP CONSTRAINT IF EXISTS activity_events_type_check;
 *   ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS metadata JSONB;
 */

import { createAdminClient } from '../../lib/supabase-server'

const CLIENT_ID = process.env.DEMO_CLIENT_ID ?? '00000000-0000-0000-0000-000000000001'

export const ACTOR = 'Alex Thompson'

export interface LogMeta {
  actor:        string
  undoable:     boolean
  entity_id?:   string              // ID of affected lead or appointment (preserved even after deletion)
  entity_type?: 'lead' | 'appointment'
  entity_name?: string              // lead name / appt lead name — kept for display after deletion
  _type?:       string              // original event type, preserved when DB type is mapped to fallback
  old_value?:   Record<string, unknown>
  new_value?:   Record<string, unknown>
  undo_data?:   Record<string, unknown>
  undone?:      boolean
  undone_at?:   string
}

export interface LogPayload {
  type:         string
  title:        string
  description?: string | null
  leadId?:      string | null      // FK — set to null for delete events so we don't rely on it post-deletion
  meta:         LogMeta
}

export async function logEvent(p: LogPayload): Promise<void> {
  const SAFE_TYPES = ['sms', 'appointment', 'assignment', 'email', 'call']
  // Always embed the intended event type inside metadata so the UI can recover it
  // even when the DB row is forced to use a fallback type.
  const metaWithType = { ...p.meta, _type: p.type }

  try {
    const sb = createAdminClient()
    const { error } = await sb.from('activity_events').insert({
      client_id:   CLIENT_ID,
      lead_id:     p.leadId ?? null,
      type:        p.type,
      title:       p.title,
      description: p.description ?? null,
      metadata:    metaWithType,
    })
    if (error) {
      if (error.code === '42703') {
        // metadata column does not exist — insert without it (title/description still land)
        console.warn('[logEvent] metadata column missing (42703). Run prerequisites.')
        await sb.from('activity_events').insert({
          client_id:   CLIENT_ID,
          lead_id:     p.leadId ?? null,
          type:        SAFE_TYPES.includes(p.type) ? p.type : 'assignment',
          title:       p.title,
          description: p.description ?? null,
        })
      } else if (error.code === '23514') {
        // type CHECK constraint still active — map type but KEEP metadata (column exists)
        console.warn('[logEvent] type CHECK constraint (23514): using mapped type. Run prerequisites.')
        await sb.from('activity_events').insert({
          client_id:   CLIENT_ID,
          lead_id:     p.leadId ?? null,
          type:        SAFE_TYPES.includes(p.type) ? p.type : 'assignment',
          title:       p.title,
          description: p.description ?? null,
          metadata:    metaWithType,
        })
      } else {
        console.warn('[logEvent] Non-fatal write failure:', error.message, `(${error.code})`)
      }
    }
  } catch (err) {
    console.warn('[logEvent] Unexpected non-fatal error:', err)
  }
}
