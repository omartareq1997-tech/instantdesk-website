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
  // TODO: Verify Gmail/Microsoft webhook authenticity, resolve the connected
  // email channel, upsert contacts, and normalize email threads/messages into
  // the shared inbox with external_thread_id and attachment metadata.
  return NextResponse.json({
    ok: true,
    provider: 'email',
    normalized: false,
    message: 'Email webhook stub received. Email conversation normalization is not enabled yet.',
  })
}
