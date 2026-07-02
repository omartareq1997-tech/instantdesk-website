import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase-server'
import { getLiveChatSettings } from '../../../../lib/live-chat'
import { logBotResolution, resolveBotContext } from '../../../../lib/bot-context'

export const dynamic = 'force-dynamic'

const PUBLIC_SITE_BUSINESS_ID =
  process.env.PUBLIC_SITE_BUSINESS_ID ||
  process.env.NEXT_PUBLIC_SITE_BUSINESS_ID ||
  'a7827a5c-8480-4cc9-a418-361ea962f50d'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function requestHost(request: NextRequest): string {
  return (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').toLowerCase()
}

export async function GET(request: NextRequest) {
  const host = requestHost(request)
  const requestedBusinessId = request.nextUrl.searchParams.get('business_id')?.trim()
  const requestedBotId = request.nextUrl.searchParams.get('bot_id')?.trim()
  const businessId = requestedBusinessId && UUID_RE.test(requestedBusinessId) ? requestedBusinessId : PUBLIC_SITE_BUSINESS_ID
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
