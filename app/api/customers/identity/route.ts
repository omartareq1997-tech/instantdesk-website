import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'
import { resolveCustomerIdentity, type CustomerChannel } from '../../../lib/customer-identity'

export const dynamic = 'force-dynamic'

function unauthorized() {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
}

function channel(value: unknown): CustomerChannel {
  return value === 'whatsapp' || value === 'messenger' || value === 'instagram' || value === 'email' ? value : 'website'
}

function text(body: Record<string, unknown>, key: string) {
  return typeof body[key] === 'string' ? body[key].trim() : null
}

export async function POST(request: NextRequest) {
  const session = await getSessionBusinessId()
  if (!session.fromSession) return unauthorized()
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const sb = createAdminClient()
  try {
    const result = await resolveCustomerIdentity(sb, {
      businessId: session.businessId,
      conversationId: text(body, 'conversation_id'),
      channel: channel(body.channel),
      externalIdentifier: text(body, 'external_identifier'),
      email: text(body, 'email'),
      phone: text(body, 'phone'),
      displayName: text(body, 'display_name'),
      company: text(body, 'company'),
      country: text(body, 'country'),
      language: text(body, 'language'),
      timezone: text(body, 'timezone'),
      avatar: text(body, 'avatar'),
      metadata: typeof body.metadata === 'object' && body.metadata ? body.metadata as Record<string, unknown> : {},
    })
    if (result.matched_by === 'identity_schema_missing') {
      return NextResponse.json({ error: 'Customer identity migration is required.' }, { status: 503 })
    }
    return NextResponse.json({ identity: result })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Identity lookup failed' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const session = await getSessionBusinessId()
  if (!session.fromSession) return unauthorized()
  const email = request.nextUrl.searchParams.get('email')?.trim().toLowerCase()
  const phone = request.nextUrl.searchParams.get('phone')?.trim()
  const externalIdentifier = request.nextUrl.searchParams.get('external_identifier')?.trim()
  const requestedChannel = channel(request.nextUrl.searchParams.get('channel'))
  if (!email && !phone && !externalIdentifier) return NextResponse.json({ identities: [] })

  const sb = createAdminClient()
  let query = sb
    .from('customer_identities')
    .select('*,customers!inner(id,business_id,display_name,primary_email,primary_phone)')
    .eq('customers.business_id', session.businessId)
    .limit(10)

  if (email) query = query.eq('channel', 'email').eq('external_identifier', email)
  else if (phone) query = query.eq('channel', 'phone').eq('external_identifier', phone.replace(/[^\d+]/g, ''))
  else if (externalIdentifier) query = query.eq('channel', requestedChannel).eq('external_identifier', externalIdentifier)

  const { data, error } = await query
  if (error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST204' || error?.code === '42703') {
    return NextResponse.json({ identities: [], migration_required: true })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ identities: data ?? [] })
}
