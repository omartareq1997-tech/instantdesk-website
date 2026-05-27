/**
 * Server-only helper: write one row to activity_events.
 * Never throws — logging must never break a mutation.
 *
 * activity_events schema:
 *   client_id   UUID  NOT NULL  FK → clients(id)   (always '00000000-0000-0000-0000-000000000001')
 *   business_id UUID  NULLABLE  FK → businesses(id) (the AI business UUID)
 *   lead_id, type, title, description, metadata, undoable
 */

import { createAdminClient } from '../../lib/supabase-server'

// FK to clients table — required NOT NULL
const FIXED_CLIENT_ID = '00000000-0000-0000-0000-000000000001'

export const ACTOR = 'Alex Thompson'

export interface LogMeta {
  actor:               string
  undoable:            boolean
  entity_id?:          string
  entity_type?:        'lead' | 'appointment'
  entity_name?:        string
  _type?:              string
  old_value?:          Record<string, unknown>
  new_value?:          Record<string, unknown>
  undo_data?:          Record<string, unknown>
  undone?:             boolean
  undone_at?:          string
  original_event_id?:  string
}

export interface LogPayload {
  type:         string
  title:        string
  description?: string | null
  leadId?:      string | null
  meta:         LogMeta
}

export async function logEvent(p: LogPayload, businessId?: string): Promise<void> {
  const SAFE_TYPES = ['sms', 'appointment', 'assignment', 'email', 'call']
  const safeType   = SAFE_TYPES.includes(p.type) ? p.type : 'sms'
  const metaWithType = { ...p.meta, _type: p.type }

  try {
    const sb = createAdminClient()
    const { error } = await sb.from('activity_events').insert({
      client_id:   FIXED_CLIENT_ID,
      business_id: businessId ?? null,
      lead_id:     p.leadId ?? null,
      type:        safeType,
      title:       p.title,
      description: p.description ?? null,
      metadata:    metaWithType,
      undoable:    p.meta.undoable,
    })
    if (error) {
      console.warn('[logEvent] write failure:', error.message, `(${error.code})`)
    } else {
      console.log('[logEvent] activity_events insert ok:', p.type, p.title)
    }
  } catch (err) {
    console.warn('[logEvent] unexpected error:', err)
  }
}
