import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { resolveBotContext } from '../../../lib/bot-context'

export const dynamic = 'force-dynamic'

const ADMIN_WEBSITE_BUSINESS_ID = '59bd9987-46b9-48a3-ad14-cfe1ab733453'
const PUBLIC_SITE_BUSINESS_ID =
  process.env.PUBLIC_SITE_BUSINESS_ID ||
  process.env.NEXT_PUBLIC_SITE_BUSINESS_ID ||
  ADMIN_WEBSITE_BUSINESS_ID
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i

function isInstantDeskHost(host: string) {
  const hostname = host.split(':')[0].toLowerCase()
  return hostname === 'instantdesk.pl' || hostname === 'www.instantdesk.pl'
}

export async function GET(request: NextRequest) {
  const host = request.nextUrl.searchParams.get('host') || request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const requestedBusinessId = request.nextUrl.searchParams.get('business_id')?.trim()
  const requestedBotId = request.nextUrl.searchParams.get('bot_id')?.trim()
  const businessId =
    isInstantDeskHost(host)
      ? ADMIN_WEBSITE_BUSINESS_ID
      : requestedBusinessId && UUID_RE.test(requestedBusinessId)
        ? requestedBusinessId
        : PUBLIC_SITE_BUSINESS_ID

  const sb = createAdminClient()
  let resolved = await resolveBotContext({
    sb,
    requestType: 'public_widget',
    businessId,
    botId: requestedBotId && UUID_RE.test(requestedBotId) ? requestedBotId : null,
  })
  if (!resolved.ok && requestedBotId) {
    const fallback = await resolveBotContext({ sb, requestType: 'public_widget', businessId })
    if (fallback.ok) resolved = { ...fallback, resolution: `ignored_stale_explicit_bot:${resolved.resolution}` }
  }

  const { data: defaultBot } = await sb
    .from('agents')
    .select('id,name')
    .eq('business_id', businessId)
    .eq('is_default_website_bot', true)
    .maybeSingle()

  return NextResponse.json({
    host,
    business_id: businessId,
    requested_bot_id: requestedBotId ?? null,
    default_bot_id: defaultBot?.id ?? null,
    default_bot_name: defaultBot?.name ?? null,
    resolved_bot_id: resolved.ok ? resolved.agent.id : null,
    resolved_bot_name: resolved.ok ? resolved.agent.name : null,
    resolved_business_type: resolved.ok ? resolved.businessType : resolved.businessType,
    model: resolved.ok ? resolved.agent.model : null,
    resolution_source: resolved.resolution,
    prompt_preview: resolved.ok ? `${resolved.agent.persona ?? ''} ${resolved.agent.objective ?? ''}`.trim().slice(0, 80) : null,
    configured: resolved.ok,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
