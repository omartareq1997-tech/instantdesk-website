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
  // TODO: Verify WhatsApp Business webhook signatures, map the external account
  // to channels, upsert contacts, then normalize incoming messages into
  // conversations/messages using external_thread_id and external_message_id.
  return NextResponse.json({
    ok: true,
    provider: 'whatsapp',
    normalized: false,
    message: 'WhatsApp webhook stub received. Incoming message normalization is not enabled yet.',
  })
}
