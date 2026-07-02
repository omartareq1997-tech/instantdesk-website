import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'
import { resolveBotContext } from '../../../lib/bot-context'

export async function GET(req: NextRequest) {
  const { clientId } = await getSessionBusinessId()
  const sb = createAdminClient()
  const botId = req.nextUrl.searchParams.get('bot_id')?.trim() || null

  const resolved = await resolveBotContext({ sb, requestType: 'dashboard', businessId: clientId, botId })
  if (!resolved.ok) return NextResponse.json({ agent: null, error: resolved.adminMessage }, { status: resolved.status })
  return NextResponse.json({ agent: resolved.agent })
}

export async function PUT(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { clientId } = await getSessionBusinessId()
  const sb = createAdminClient()

  const patch: Record<string, unknown> = {}
  if (body.persona      !== undefined) patch.persona      = body.persona
  if (body.objective    !== undefined) patch.objective    = body.objective
  if (body.tone         !== undefined) patch.tone         = body.tone
  if (body.fallback_msg !== undefined) patch.fallback_msg = body.fallback_msg
  if (body.model        !== undefined) patch.model        = body.model
  if (body.temperature  !== undefined) patch.temperature  = body.temperature
  if (body.name         !== undefined) patch.name         = body.name
  if (body.active       !== undefined) patch.active       = body.active

  const requestedBotId = typeof body.bot_id === 'string' ? body.bot_id.trim() : null
  const makeDefault = body.default_website_bot === true

  const resolved = await resolveBotContext({ sb, requestType: 'dashboard', businessId: clientId, botId: requestedBotId })
  if (resolved.ok) {
    const { data, error } = await sb
      .from('agents').update(patch)
      .eq('business_id', clientId)
      .eq('id', resolved.agent.id)
      .select().maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (makeDefault) {
      const clear = await sb.from('agents').update({ is_default_website_bot: false }).eq('business_id', clientId)
      if (clear.error && clear.error.code !== '42703') return NextResponse.json({ error: clear.error.message }, { status: 500 })
      if (!clear.error) {
        const set = await sb.from('agents').update({ is_default_website_bot: true, active: true }).eq('business_id', clientId).eq('id', resolved.agent.id)
        if (set.error) return NextResponse.json({ error: set.error.message }, { status: 500 })
      }
    }
    return NextResponse.json({ agent: data })
  }

  if (requestedBotId) {
    return NextResponse.json({ error: resolved.ok ? 'Unknown bot error' : resolved.adminMessage }, { status: resolved.ok ? 500 : resolved.status })
  }

  // No agent yet — insert one for this business.
  const { data, error } = await sb
    .from('agents').insert({
      ...patch,
      business_id: clientId,
      name:        'AI Assistant',
      active:      true,
    }).select().maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ agent: data })
}
