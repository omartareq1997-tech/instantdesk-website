import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'

const DEFAULT_FIELDS = [
  { field_key: 'city',          label: 'City / Location',         prompt: 'Which city or area are you looking in?',                                                   required: true,  sort_order: 0, active: true },
  { field_key: 'deal_type',     label: 'Rent or Buy',             prompt: 'Are you looking to rent or buy?',                                                          required: true,  sort_order: 1, active: true },
  { field_key: 'property_type', label: 'Property Type',           prompt: 'What type of property are you looking for — apartment, house, studio, or something else?', required: true,  sort_order: 2, active: true },
  { field_key: 'rooms',         label: 'Number of Rooms',         prompt: 'How many rooms or bedrooms do you need?',                                                  required: true,  sort_order: 3, active: true },
  { field_key: 'budget',        label: 'Budget',                  prompt: 'What is your budget? Please include the currency (e.g. 3000 PLN/month).',                  required: true,  sort_order: 4, active: true },
  { field_key: 'name',          label: 'Full Name',               prompt: 'May I have your full name?',                                                               required: true,  sort_order: 5, active: true },
  { field_key: 'phone',         label: 'Phone Number',            prompt: 'What is the best phone number to reach you on?',                                           required: false, sort_order: 6, active: true },
  { field_key: 'email',         label: 'Email Address',           prompt: 'And your email address?',                                                                  required: false, sort_order: 7, active: true },
  { field_key: 'viewing_time',  label: 'Preferred Viewing Time',  prompt: 'When would you prefer to schedule a viewing?',                                             required: false, sort_order: 8, active: true },
]

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
    const toInsert = DEFAULT_FIELDS.map(f => ({ ...f, business_id: clientId }))
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
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
