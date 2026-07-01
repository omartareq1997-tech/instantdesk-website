import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'
import { mergeCustomers, undoCustomerMerge } from '../../../lib/customer-identity'

export const dynamic = 'force-dynamic'

function unauthorized() {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
}

function bodyText(body: Record<string, unknown>, key: string) {
  return typeof body[key] === 'string' ? body[key].trim() : null
}

export async function POST(request: NextRequest) {
  const session = await getSessionBusinessId()
  if (!session.fromSession) return unauthorized()
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const action = bodyText(body, 'action') ?? 'merge'
  const sb = createAdminClient()
  const actor = session.ownerName || session.userEmail || 'Staff'

  try {
    if (action === 'undo') {
      const mergeId = bodyText(body, 'merge_id')
      if (!mergeId) return NextResponse.json({ error: 'merge_id is required' }, { status: 400 })
      const result = await undoCustomerMerge(sb, { businessId: session.businessId, mergeId, actor })
      return NextResponse.json(result)
    }

    if (action === 'reject' || action === 'ignore') {
      const suggestionId = bodyText(body, 'suggestion_id')
      if (!suggestionId) return NextResponse.json({ error: 'suggestion_id is required' }, { status: 400 })
      const { error } = await sb
        .from('customer_identity_suggestions')
        .update({ status: action === 'reject' ? 'rejected' : 'ignored', updated_at: new Date().toISOString() })
        .eq('id', suggestionId)
        .eq('business_id', session.businessId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    const sourceCustomerId = bodyText(body, 'source_customer_id')
    const targetCustomerId = bodyText(body, 'target_customer_id')
    if (!sourceCustomerId || !targetCustomerId) {
      return NextResponse.json({ error: 'source_customer_id and target_customer_id are required' }, { status: 400 })
    }
    const result = await mergeCustomers(sb, {
      businessId: session.businessId,
      sourceCustomerId,
      targetCustomerId,
      mergedBy: actor,
      reason: bodyText(body, 'reason') ?? (action === 'accept' ? 'Accepted duplicate suggestion' : 'Manual merge'),
    })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Merge failed' }, { status: 500 })
  }
}
