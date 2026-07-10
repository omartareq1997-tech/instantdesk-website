import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-server'
import { getSessionBusinessId } from '../../lib/getSessionBusinessId'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

function unauthorized() {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers: NO_STORE_HEADERS })
}

function strParam(url: URL, key: string) {
  const value = url.searchParams.get(key)?.trim()
  return value || null
}

export async function GET(request: NextRequest) {
  const session = await getSessionBusinessId()
  if (!session.fromSession) return unauthorized()

  const sb = createAdminClient()
  const url = new URL(request.url)
  const botId = strParam(url, 'bot_id')
  const conversationId = strParam(url, 'conversation_id')
  const turnId = strParam(url, 'turn_id')
  const eventType = strParam(url, 'event_type')
  const semanticSource = strParam(url, 'semantic_source')
  const intent = strParam(url, 'intent')
  const model = strParam(url, 'model')
  const fallback = strParam(url, 'fallback')
  const success = strParam(url, 'success')
  const from = strParam(url, 'from')
  const to = strParam(url, 'to')
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 100), 1), 300)

  let botsResult: { data: Array<{ id: string; name?: string | null; model?: string | null; active?: boolean | null; is_default_website_bot?: boolean | null }> | null; error: { code?: string; message: string } | null } = await sb
    .from('agents')
    .select('id,name,model,active,is_default_website_bot')
    .eq('business_id', session.businessId)
    .order('created_at', { ascending: true })
  if (botsResult.error?.code === '42703' || botsResult.error?.code === 'PGRST204') {
    botsResult = await sb
      .from('agents')
      .select('id,name,model,active')
      .eq('business_id', session.businessId)
      .order('created_at', { ascending: true })
  }
  if (botsResult.error) return NextResponse.json({ error: botsResult.error.message }, { status: 500, headers: NO_STORE_HEADERS })
  const bots = botsResult.data ?? []
  if (botId && !bots.some(bot => bot.id === botId)) {
    return NextResponse.json({ error: 'Bot not found for this business' }, { status: 404, headers: NO_STORE_HEADERS })
  }

  let query = sb
    .from('agent_traces')
    .select('id,business_id,bot_id,conversation_id,turn_id,request_id,event_type,semantic_source,semantic_intent,model,latency_ms,fallback_used,success,trace_data,created_at')
    .eq('business_id', session.businessId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (botId) query = query.eq('bot_id', botId)
  if (conversationId) query = query.eq('conversation_id', conversationId)
  if (turnId) query = query.eq('turn_id', turnId)
  if (eventType) query = query.eq('event_type', eventType)
  if (semanticSource) query = query.eq('semantic_source', semanticSource)
  if (intent) query = query.eq('semantic_intent', intent)
  if (model) query = query.eq('model', model)
  if (fallback === 'true') query = query.eq('fallback_used', true)
  if (fallback === 'false') query = query.eq('fallback_used', false)
  if (success === 'true') query = query.eq('success', true)
  if (success === 'false') query = query.eq('success', false)
  if (from) query = query.gte('created_at', from)
  if (to) query = query.lte('created_at', to)

  const tracesResult = await query
  if (tracesResult.error) {
    if (tracesResult.error.code === '42P01' || tracesResult.error.code === 'PGRST205') {
      return NextResponse.json({ bots, traces: [], migration_required: true }, { headers: NO_STORE_HEADERS })
    }
    return NextResponse.json({ error: tracesResult.error.message }, { status: 500, headers: NO_STORE_HEADERS })
  }

  return NextResponse.json({
    bots,
    traces: tracesResult.data ?? [],
    migration_required: false,
  }, { headers: NO_STORE_HEADERS })
}
