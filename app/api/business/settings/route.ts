import { NextResponse } from 'next/server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'
import { createAdminClient } from '../../../lib/supabase-server'
import { normalizeBusinessType } from '../../../lib/businessTypes'

function isMissingBusinessTypeColumn(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '42703'
}

export async function GET() {
  const { businessId } = await getSessionBusinessId()
  if (!businessId) return NextResponse.json({ businessType: 'general_service' })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('businesses')
    .select('business_type')
    .eq('id', businessId)
    .maybeSingle()

  if (error && isMissingBusinessTypeColumn(error)) {
    return NextResponse.json({ businessType: 'general_service', migrationRequired: true })
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ businessType: data?.business_type ? normalizeBusinessType(data.business_type) : 'general_service' })
}

export async function POST(req: Request) {
  const { businessId } = await getSessionBusinessId()
  if (!businessId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { businessType?: string }
  const businessType = normalizeBusinessType(body.businessType)

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('businesses')
    .update({ business_type: businessType })
    .eq('id', businessId)
    .select('id, business_type')
    .maybeSingle()

  if (error && isMissingBusinessTypeColumn(error)) {
    return NextResponse.json({ ok: false, migrationRequired: true }, { status: 503 })
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.id) return NextResponse.json({ error: 'Business record was not found for this account.' }, { status: 404 })
  return NextResponse.json({ ok: true, businessType })
}
