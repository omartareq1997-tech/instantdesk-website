import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-server'
import { getSessionBusinessId } from '../../lib/getSessionBusinessId'

export async function GET(req: NextRequest) {
  const leadId = req.nextUrl.searchParams.get('lead_id')
  if (!leadId) return NextResponse.json({ memory: null })

  try {
    const { clientId } = await getSessionBusinessId()
    const sb = createAdminClient()

    const { data, error } = await sb
      .from('lead_memory')
      .select('*')
      .eq('business_id', clientId)
      .eq('lead_id', leadId)
      .maybeSingle()

    if (error) {
      console.error('[GET /api/lead-memory] error:', error.message)
      return NextResponse.json({ memory: null })
    }

    return NextResponse.json({ memory: data ?? null })
  } catch (err) {
    console.error('[GET /api/lead-memory] unexpected error:', err)
    return NextResponse.json({ memory: null })
  }
}
