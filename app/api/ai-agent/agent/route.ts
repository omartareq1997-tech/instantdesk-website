import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'

const DEMO_BIZ_ID = process.env.DEMO_CLIENT_ID ?? '0616a47a-2c01-49ce-a798-385f8276b92b'

export async function GET() {
  const { clientId } = await getSessionBusinessId()
  const sb = createAdminClient()

  // Try the authenticated user's agent first
  const { data, error } = await sb
    .from('agents').select('*')
    .eq('business_id', clientId).eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1).maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If user has no agent yet, return the demo agent as a template so the UI isn't empty
  if (!data && clientId !== DEMO_BIZ_ID) {
    const { data: demo } = await sb
      .from('agents').select('*')
      .eq('business_id', DEMO_BIZ_ID).eq('active', true)
      .limit(1).maybeSingle()
    return NextResponse.json({ agent: demo ?? null })
  }

  return NextResponse.json({ agent: data ?? null })
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

  // Check if an agent already exists for this business
  const { data: existing } = await sb
    .from('agents').select('id, name')
    .eq('business_id', clientId)
    .limit(1).maybeSingle()

  if (existing?.id) {
    // Update existing
    const { data, error } = await sb
      .from('agents').update(patch)
      .eq('id', existing.id)
      .select().maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ agent: data })
  }

  // No agent yet — insert one. Use the demo agent name as default.
  const { data: demoAgent } = await sb
    .from('agents').select('name')
    .eq('business_id', DEMO_BIZ_ID).limit(1).maybeSingle()

  const { data, error } = await sb
    .from('agents').insert({
      ...patch,
      business_id: clientId,
      name:        (demoAgent as { name?: string } | null)?.name ?? 'AI Assistant',
      active:      true,
    }).select().maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ agent: data })
}
