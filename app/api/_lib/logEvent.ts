/**
 * Server-only helper: write one row to activity_events.
 * Never throws — logging must never break a mutation.
 *
 * clientId is resolved from the auth session automatically if not supplied,
 * so callers that already have it can pass it in for efficiency.
 *
 * activity_events schema:
 *   client_id   UUID  NOT NULL  FK → clients(id)
 *   business_id UUID  NULLABLE
 *   lead_id, type, title, description, metadata, undoable
 */

import { createAdminClient } from '../../lib/supabase-server'
import { getSessionBusinessId } from '../../lib/getSessionBusinessId'

const FALLBACK_CLIENT_ID =
  process.env.DEMO_CLIENT_ID ??
  process.env.NEXT_PUBLIC_DEMO_CLIENT_ID ??
  '0616a47a-2c01-49ce-a798-385f8276b92b'

export const ACTOR = 'System'

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
  clientId?:    string
  meta:         LogMeta
}

export async function logEvent(p: LogPayload, businessId?: string): Promise<void> {
  const SAFE_TYPES = ['sms', 'appointment', 'assignment', 'email', 'call']
  const safeType   = SAFE_TYPES.includes(p.type) ? p.type : 'sms'
  const metaWithType = { ...p.meta, _type: p.type }

  // Resolve clientId: caller can supply it; otherwise derive from session
  let clientId = p.clientId
  if (!clientId) {
    try {
      const session = await getSessionBusinessId()
      clientId = session.clientId
    } catch {
      clientId = FALLBACK_CLIENT_ID
    }
  }

  try {
    const sb = createAdminClient()
    const { error } = await sb.from('activity_events').insert({
      client_id:   clientId,
      business_id: businessId ?? clientId,
      lead_id:     p.leadId ?? null,
      type:        safeType,
      title:       p.title,
      description: p.description ?? null,
      metadata:    metaWithType,
      undoable:    p.meta.undoable,
    })
    if (error) {
      console.warn('[logEvent] write failure:', error.message, `(${error.code})`)
    }
  } catch (err) {
    console.warn('[logEvent] unexpected error:', err)
  }
}
