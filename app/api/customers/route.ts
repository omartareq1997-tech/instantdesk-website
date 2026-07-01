import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-server'
import { getSessionBusinessId } from '../../lib/getSessionBusinessId'

export const dynamic = 'force-dynamic'

function unauthorized() {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
}

function missingSchema(error: { code?: string } | null | undefined) {
  return error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST204' || error?.code === '42703'
}

export async function GET(request: NextRequest) {
  const session = await getSessionBusinessId()
  if (!session.fromSession) return unauthorized()

  const q = request.nextUrl.searchParams.get('q')?.trim()
  const sb = createAdminClient()
  let query = sb
    .from('customers')
    .select('*')
    .eq('business_id', session.businessId)
    .order('last_seen_at', { ascending: false })
    .limit(100)

  if (q) {
    const term = `%${q.replace(/[%_]/g, '')}%`
    query = query.or(`display_name.ilike.${term},primary_email.ilike.${term},primary_phone.ilike.${term},company.ilike.${term}`)
  }

  const { data, error } = await query
  if (missingSchema(error)) return NextResponse.json({ customers: [], migration_required: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ customers: data ?? [] })
}

export async function POST(request: NextRequest) {
  const session = await getSessionBusinessId()
  if (!session.fromSession) return unauthorized()
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const sb = createAdminClient()
  const now = new Date().toISOString()
  const fullPayload = {
    business_id: session.businessId,
    display_name: typeof body.display_name === 'string' ? body.display_name.trim() : null,
    primary_email: typeof body.primary_email === 'string' ? body.primary_email.trim().toLowerCase() : null,
    primary_phone: typeof body.primary_phone === 'string' ? body.primary_phone.trim() : null,
    avatar: typeof body.avatar === 'string' ? body.avatar : null,
    company: typeof body.company === 'string' ? body.company : null,
    country: typeof body.country === 'string' ? body.country : null,
    language: typeof body.language === 'string' ? body.language : null,
    timezone: typeof body.timezone === 'string' ? body.timezone : null,
    notes: typeof body.notes === 'string' ? body.notes : null,
    first_seen_at: now,
    last_seen_at: now,
  }
  let result = await sb
    .from('customers')
    .insert(fullPayload)
    .select('*')
    .single()
  if (result.error?.code === 'PGRST204' || result.error?.code === '42703') {
    result = await sb
      .from('customers')
      .insert({
        business_id: session.businessId,
        display_name: fullPayload.display_name,
        primary_email: fullPayload.primary_email,
        primary_phone: fullPayload.primary_phone,
        company: fullPayload.company,
        country: fullPayload.country,
        language: fullPayload.language,
        timezone: fullPayload.timezone,
        first_seen_at: now,
        last_seen_at: now,
      })
      .select('*')
      .single()
  }
  const { data, error } = result
  if (missingSchema(error)) return NextResponse.json({ error: 'Customer identity migration is required.' }, { status: 503 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ customer: data }, { status: 201 })
}
