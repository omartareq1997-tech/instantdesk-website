import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'

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
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 1) return NextResponse.json({ customers: [] })

  const term = `%${q.replace(/[%_]/g, '')}%`
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('customers')
    .select('id,display_name,primary_email,primary_phone,company,country,language,timezone,lead_score,last_seen_at,created_at')
    .eq('business_id', session.businessId)
    .or(`display_name.ilike.${term},primary_email.ilike.${term},primary_phone.ilike.${term},company.ilike.${term}`)
    .order('last_seen_at', { ascending: false })
    .limit(12)

  if (missingSchema(error)) return NextResponse.json({ customers: [], migration_required: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ customers: data ?? [] })
}
