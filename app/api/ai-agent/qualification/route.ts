import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'
import { getBusinessTypeConfig, normalizeBusinessType } from '../../../lib/businessTypes'

async function getBusinessType(sb: ReturnType<typeof createAdminClient>, businessId: string) {
  const { data, error } = await sb.from('businesses').select('business_type').eq('id', businessId).maybeSingle()
  if (error && error.code !== '42703') console.warn('[qualification] business_type lookup failed', JSON.stringify(error))
  return normalizeBusinessType(data?.business_type)
}

export async function GET() {
  const { clientId } = await getSessionBusinessId()
  const sb = createAdminClient()

  const { data, error } = await sb
    .from('agent_qualification_fields')
    .select('id, field_key, label, prompt, required, sort_order, active')
    .eq('business_id', clientId)
    .eq('active', true)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Seed defaults if this business has no fields yet
  if (!data || data.length === 0) {
    const businessType = await getBusinessType(sb, clientId)
    const toInsert = getBusinessTypeConfig(businessType).qualificationSlots.map((field, index) => ({
      business_id: clientId,
      field_key: field.key,
      label: field.label,
      prompt: field.question,
      required: field.required,
      sort_order: index,
      active: true,
    }))
    const { data: seeded, error: seedErr } = await sb
      .from('agent_qualification_fields')
      .insert(toInsert)
      .select('id, field_key, label, prompt, required, sort_order, active')

    if (seedErr) return NextResponse.json({ error: seedErr.message }, { status: 500 })
    return NextResponse.json({ fields: seeded ?? [] })
  }

  return NextResponse.json({ fields: data })
}

export async function PATCH(req: NextRequest) {
  let body: { field_key?: string; required?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.field_key) return NextResponse.json({ error: 'field_key required' }, { status: 400 })
  if (typeof body.required !== 'boolean') return NextResponse.json({ error: 'required (boolean) required' }, { status: 400 })

  const { clientId } = await getSessionBusinessId()
  const sb = createAdminClient()

  const { data, error } = await sb
    .from('agent_qualification_fields')
    .update({ required: body.required, updated_at: new Date().toISOString() })
    .eq('business_id', clientId)
    .eq('field_key', body.field_key)
    .select('id, field_key, required')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Field not found — open the Qualification page first to initialise your fields' }, { status: 404 })
  return NextResponse.json({ field: data })
}

export async function PUT(req: NextRequest) {
  let body: { fields?: { field_key: string; required: boolean; sort_order: number }[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.fields?.length) return NextResponse.json({ error: 'fields array required' }, { status: 400 })

  const { clientId } = await getSessionBusinessId()
  const sb = createAdminClient()
  const now = new Date().toISOString()

  await Promise.all(
    body.fields.map(f =>
      sb.from('agent_qualification_fields')
        .update({ required: f.required, sort_order: f.sort_order, updated_at: now })
        .eq('business_id', clientId)
        .eq('field_key', f.field_key)
    )
  )

  return NextResponse.json({ ok: true })
}
