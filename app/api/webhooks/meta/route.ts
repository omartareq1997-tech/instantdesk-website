import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function methodNotAllowed() {
  return NextResponse.json(
    { ok: false, error: 'Method not allowed', allowed_methods: ['POST'] },
    { status: 405, headers: { Allow: 'POST' } },
  )
}

export function GET() {
  return methodNotAllowed()
}

export async function POST(request: NextRequest) {
  await request.json().catch(() => null)
  // TODO: Verify Meta webhook signatures and subscription challenges, resolve
  // Messenger/Instagram channel records by external account id, upsert contacts,
  // then normalize events into conversations/messages without storing provider
  // secrets in plaintext.
  return NextResponse.json({
    ok: true,
    provider: 'meta',
    normalized: false,
    message: 'Meta webhook stub received. Messenger and Instagram normalization is not enabled yet.',
  })
}
