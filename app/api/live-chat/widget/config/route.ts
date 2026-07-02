import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase-server'
import { getLiveChatSettings } from '../../../../lib/live-chat'
import { logBotResolution, resolveBotContext } from '../../../../lib/bot-context'

export const dynamic = 'force-dynamic'

const PUBLIC_SITE_BUSINESS_ID =
  process.env.PUBLIC_SITE_BUSINESS_ID ||
  process.env.NEXT_PUBLIC_SITE_BUSINESS_ID ||
  '0616a47a-2c01-49ce-a798-385f8276b92b'
const ADMIN_WEBSITE_BUSINESS_ID = '0616a47a-2c01-49ce-a798-385f8276b92b'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function requestHost(request: NextRequest): string {
  return (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').toLowerCase()
}

function isInstantDeskPublicHost(host: string): boolean {
  const hostname = host.split(':')[0]
  return hostname === 'instantdesk.pl' || hostname === 'www.instantdesk.pl'
}

export async function GET(request: NextRequest) {
  const host = requestHost(request)
  const requestedBusinessId = request.nextUrl.searchParams.get('business_id')?.trim()
  const requestedBotId = request.nextUrl.searchParams.get('bot_id')?.trim()
  const requestedValidBusinessId = requestedBusinessId && UUID_RE.test(requestedBusinessId) ? requestedBusinessId : null
  const businessId =
    isInstantDeskPublicHost(host) && requestedValidBusinessId !== ADMIN_WEBSITE_BUSINESS_ID
      ? ADMIN_WEBSITE_BUSINESS_ID
      : requestedValidBusinessId ?? PUBLIC_SITE_BUSINESS_ID
  const sb = createAdminClient()
  const settings = await getLiveChatSettings(sb, businessId)
  const botContext = await resolveBotContext({
    sb,
    requestType: 'public_widget',
    businessId,
    botId: requestedBotId && UUID_RE.test(requestedBotId) ? requestedBotId : null,
  })
  logBotResolution({ requestType: 'public_widget', businessId, result: botContext })
  console.log('[LiveChatDebug] widget config', {
    host,
    business_id: businessId,
    bot_id: botContext.ok ? botContext.agent.id : null,
    ai_auto_replies_enabled: settings.ai_auto_replies_enabled,
    live_chat_enabled: settings.live_chat_enabled,
  })

  return NextResponse.json({
    business_id: businessId,
    bot_id: botContext.ok ? botContext.agent.id : null,
    bot_name: botContext.ok ? botContext.agent.name : null,
    business_type: botContext.ok ? botContext.businessType : null,
    ai_auto_replies_enabled: settings.ai_auto_replies_enabled,
    live_chat_enabled: settings.live_chat_enabled,
    configured: botContext.ok,
  }, {
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
