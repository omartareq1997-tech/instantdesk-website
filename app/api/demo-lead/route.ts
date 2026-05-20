import { type NextRequest } from 'next/server'

/* ── Required fields ────────────────────────────────────── */

const REQUIRED = ['fullName', 'businessName', 'email', 'phone'] as const

/* ── POST /api/demo-lead ────────────────────────────────── */

export async function POST(req: NextRequest) {
  /* 1. Parse body */
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  /* 2. Server-side field validation */
  const missing = REQUIRED.filter(
    (f) => typeof body[f] !== 'string' || !(body[f] as string).trim()
  )
  if (missing.length > 0) {
    return Response.json(
      { error: `Missing required fields: ${missing.join(', ')}` },
      { status: 400 }
    )
  }

  /* 3. Build enriched payload — source and timestamp set server-side */
  const payload = {
    fullName:     (body.fullName     as string).trim(),
    businessName: (body.businessName as string).trim(),
    email:        (body.email        as string).trim(),
    phone:        (body.phone        as string).trim(),
    website:      typeof body.website === 'string' ? body.website.trim() : '',
    message:      typeof body.message === 'string' ? body.message.trim() : '',
    /* Browser context sent by client */
    pageUrl:      typeof body.pageUrl === 'string' ? body.pageUrl : '',
    /* Real User-Agent from request header — more reliable than client-sent */
    userAgent:    req.headers.get('user-agent') ?? '',
    /* Server-controlled fields */
    timestamp:    new Date().toISOString(),
    source:       'instantdesk_website',
  }

  /* 4. Resolve webhook URL */
  const webhookUrl = process.env.MAKE_DEMO_WEBHOOK_URL
  if (!webhookUrl) {
    console.error('[demo-lead] MAKE_DEMO_WEBHOOK_URL env var is not set')
    return Response.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  /* 5. Forward to Make */
  try {
    const makeRes = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })

    if (!makeRes.ok) {
      console.error(`[demo-lead] Make returned ${makeRes.status}`)
      return Response.json({ error: 'Webhook delivery failed' }, { status: 502 })
    }

    return Response.json({ ok: true })
  } catch (err) {
    console.error('[demo-lead] Could not reach Make webhook:', err)
    return Response.json({ error: 'Could not reach webhook' }, { status: 502 })
  }
}
