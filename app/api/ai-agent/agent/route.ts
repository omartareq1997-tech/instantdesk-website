import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'

const CLIENT_ID = '0616a47a-2c01-49ce-a798-385f8276b92b'

export async function GET() {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('agents').select('*')
    .eq('business_id', CLIENT_ID).eq('active', true)
    .limit(1).maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ agent: data ?? null })
}

export async function PUT(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const sb = createAdminClient()

  const patch: Record<string, unknown> = {}
  if (body.persona      !== undefined) patch.persona      = body.persona
  if (body.objective    !== undefined) patch.objective    = body.objective
  if (body.tone         !== undefined) patch.tone         = body.tone
  if (body.fallback_msg !== undefined) patch.fallback_msg = body.fallback_msg
  if (body.model        !== undefined) patch.model        = body.model
  if (body.temperature  !== undefined) patch.temperature  = body.temperature

  const { data, error } = await sb
    .from('agents').update(patch)
    .eq('business_id', CLIENT_ID).eq('active', true)
    .select().maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ agent: data })
}
