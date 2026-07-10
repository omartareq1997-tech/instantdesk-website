import type { SupabaseClient } from '@supabase/supabase-js'

export type AgentTraceInsert = {
  business_id: string
  bot_id: string
  conversation_id?: string | null
  turn_id?: string | null
  request_id?: string | null
  event_type: string
  semantic_source?: string | null
  semantic_intent?: string | null
  model?: string | null
  latency_ms?: number | null
  fallback_used?: boolean | null
  success?: boolean | null
  trace_data: Record<string, unknown>
}

export function compactTraceData(payload: Record<string, unknown>) {
  const blocked = new Set(['message', 'userMessage', 'customer_message', 'prompt', 'raw', 'payload', 'content'])
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !blocked.has(key))
  )
}

export function agentTraceRow(input: {
  businessId: string
  botId: string
  conversationId?: string | null
  turnId?: string | null
  requestId?: string | null
  eventType: string
  payload: Record<string, unknown>
}): AgentTraceInsert {
  const latency =
    typeof input.payload.latency_ms === 'number' ? input.payload.latency_ms
      : typeof input.payload.total_latency_ms === 'number' ? input.payload.total_latency_ms
        : typeof input.payload.interpreter_latency_ms === 'number' ? input.payload.interpreter_latency_ms
          : typeof input.payload.response_latency_ms === 'number' ? input.payload.response_latency_ms
            : null
  return {
    business_id: input.businessId,
    bot_id: input.botId,
    conversation_id: input.conversationId ?? null,
    turn_id: input.turnId ?? null,
    request_id: input.requestId ?? null,
    event_type: input.eventType,
    semantic_source: typeof input.payload.semantic_source === 'string' ? input.payload.semantic_source : null,
    semantic_intent: typeof input.payload.semantic_intent === 'string'
      ? input.payload.semantic_intent
      : typeof input.payload.intent === 'string' ? input.payload.intent : null,
    model: typeof input.payload.model === 'string' ? input.payload.model : null,
    latency_ms: latency,
    fallback_used: typeof input.payload.fallback_used === 'boolean' ? input.payload.fallback_used : null,
    success: typeof input.payload.success === 'boolean'
      ? input.payload.success
      : typeof input.payload.assistant_message_id_present === 'boolean' ? input.payload.assistant_message_id_present
        : typeof input.payload.semantic_parse_success === 'boolean' ? input.payload.semantic_parse_success
          : null,
    trace_data: compactTraceData(input.payload),
  }
}

export async function persistAgentTraceRows(sb: SupabaseClient, rows: AgentTraceInsert[]) {
  if (!rows.length) return { ok: true, count: 0 }
  try {
    const { error } = await sb.from('agent_traces').insert(rows)
    if (error) {
      console.warn('[AgentTraces] persist failed', { code: error.code ?? null, message: error.message ?? 'unknown' })
      return { ok: false, count: 0 }
    }
    return { ok: true, count: rows.length }
  } catch (error) {
    console.warn('[AgentTraces] persist unexpected failure', {
      message: error instanceof Error ? error.message : 'unknown',
    })
    return { ok: false, count: 0 }
  }
}
