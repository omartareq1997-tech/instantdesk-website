import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'
import { getCustomerProfile } from '../../../lib/customer-identity'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

function unauthorized() {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
}

function missingSchema(error: { code?: string } | null | undefined) {
  return error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST204' || error?.code === '42703'
}

function normalizeEmail(email: unknown) {
  const value = typeof email === 'string' ? email.trim().toLowerCase() : ''
  return value && value.includes('@') ? value : null
}

function normalizePhone(phone: unknown) {
  const value = typeof phone === 'string' ? phone.replace(/[^\d+]/g, '') : ''
  return value && value.replace(/\D/g, '').length >= 6 ? value : null
}

export async function GET(_request: NextRequest, context: Context) {
  const session = await getSessionBusinessId()
  if (!session.fromSession) return unauthorized()
  const { id } = await context.params
  const sb = createAdminClient()
  try {
    const profile = await getCustomerProfile(sb, session.businessId, id)
    if (!profile) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    return NextResponse.json({ profile })
  } catch (error) {
    const err = error as { code?: string; message?: string }
    if (missingSchema(err)) return NextResponse.json({ error: 'Customer identity migration is required.' }, { status: 503 })
    return NextResponse.json({ error: err.message ?? 'Failed to load customer' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  const session = await getSessionBusinessId()
  if (!session.fromSession) return unauthorized()
  const { id } = await context.params
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const allowed = ['display_name', 'primary_email', 'primary_phone', 'avatar', 'company', 'country', 'language', 'timezone', 'notes', 'lead_score', 'lifetime_value'] as const
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) patch[key] = body[key] === '' ? null : body[key]
  }
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('customers')
    .update(patch)
    .eq('id', id)
    .eq('business_id', session.businessId)
    .select('*')
    .maybeSingle()
  if (missingSchema(error)) return NextResponse.json({ error: 'Customer identity migration is required.' }, { status: 503 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  const nextEmail = normalizeEmail(body.primary_email)
  const nextPhone = normalizePhone(body.primary_phone)
  const identityRows: Array<{ customer_id: string; channel: 'email' | 'phone'; external_identifier: string; confidence_score: number; verified: boolean; metadata: { source: string } }> = []
  if (nextEmail) {
    identityRows.push({ customer_id: id, channel: 'email', external_identifier: nextEmail, confidence_score: 100, verified: true, metadata: { source: 'manual_profile_edit' } })
  }
  if (nextPhone) {
    identityRows.push({ customer_id: id, channel: 'phone', external_identifier: nextPhone, confidence_score: 100, verified: true, metadata: { source: 'manual_profile_edit' } })
  }

  for (const identity of identityRows) {
    const { error: identityError } = await sb
      .from('customer_identities')
      .upsert(identity, { onConflict: 'channel,external_identifier' })
    if (missingSchema(identityError)) continue
    if (identityError) return NextResponse.json({ error: identityError.message }, { status: 500 })
  }

  return NextResponse.json({ customer: data })
}
