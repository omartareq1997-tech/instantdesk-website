import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'

export async function GET() {
  const { clientId } = await getSessionBusinessId()
  const sb = createAdminClient()

  const { data, error } = await sb
    .from('agents').select('*')
    .eq('business_id', clientId).eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1).maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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

  // No agent yet — insert one.
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
