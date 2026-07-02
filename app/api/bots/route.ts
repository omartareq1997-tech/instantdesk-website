import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-server'
import { getSessionBusinessId } from '../../lib/getSessionBusinessId'
import { getBusinessTypeConfig, normalizeBusinessType } from '../../lib/businessTypes'

function botPayload(businessId: string, body: Record<string, unknown>) {
  const businessType = normalizeBusinessType(typeof body.business_type === 'string' ? body.business_type : 'general_service')
  const config = getBusinessTypeConfig(businessType)
  return {
    business_id: businessId,
    name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : config.moduleName,
    active: true,
    business_type: businessType,
    persona: config.defaultPersona,
    objective: config.defaultObjective,
    tone: typeof body.tone === 'string' ? body.tone : 'professional',
    fallback_msg: 'I do not know that yet, but I can connect you with the team.',
    model: typeof body.model === 'string' ? body.model : businessType === 'car_rental' ? 'gemini-2.5-pro' : 'gpt-4o-mini',
    temperature: 0.4,
  }
}

export async function GET() {
  const { clientId } = await getSessionBusinessId()
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('agents')
    .select('*')
    .eq('business_id', clientId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bots: data ?? [] })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { clientId } = await getSessionBusinessId()
  const sb = createAdminClient()
  const { data, error } = await sb.from('agents').insert(botPayload(clientId, body)).select('*').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bot: data })
}

export async function PATCH(req: NextRequest) {
  let body: { bot_id?: unknown; default_website_bot?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const botId = typeof body.bot_id === 'string' ? body.bot_id.trim() : ''
  if (!botId) return NextResponse.json({ error: 'bot_id is required' }, { status: 400 })

  const { clientId } = await getSessionBusinessId()
  const sb = createAdminClient()
  if (body.default_website_bot === true) {
    const clear = await sb.from('agents').update({ is_default_website_bot: false }).eq('business_id', clientId)
    if (clear.error) return NextResponse.json({ error: clear.error.code === '42703' ? 'Run bot workspace migration before setting a default website bot.' : clear.error.message }, { status: 500 })
    const set = await sb.from('agents').update({ is_default_website_bot: true, active: true }).eq('business_id', clientId).eq('id', botId).select('*').maybeSingle()
    if (set.error) return NextResponse.json({ error: set.error.message }, { status: 500 })
    if (!set.data) return NextResponse.json({ error: 'Bot not found for this business' }, { status: 404 })
    return NextResponse.json({ bot: set.data })
  }
  return NextResponse.json({ error: 'No supported patch operation provided' }, { status: 400 })
}
