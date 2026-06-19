import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'
import { DEFAULT_HANDOVER_PHRASES, defaultLiveChatSettings, getLiveChatSettings } from '../../../lib/live-chat'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { businessId } = await getSessionBusinessId()
  const sb = createAdminClient()
  const settings = await getLiveChatSettings(sb, businessId)
  return NextResponse.json({ settings })
}

export async function PATCH(request: NextRequest) {
  const { businessId } = await getSessionBusinessId()
  const sb = createAdminClient()
  const body = await request.json().catch(() => ({})) as Partial<ReturnType<typeof defaultLiveChatSettings>>
  const defaults = defaultLiveChatSettings(businessId)

  const payload = {
    business_id: businessId,
    ai_auto_replies_enabled: body.ai_auto_replies_enabled ?? defaults.ai_auto_replies_enabled,
    live_chat_enabled: body.live_chat_enabled ?? defaults.live_chat_enabled,
    human_handover_enabled: body.human_handover_enabled ?? defaults.human_handover_enabled,
    trigger_ai_cannot_answer: body.trigger_ai_cannot_answer ?? defaults.trigger_ai_cannot_answer,
    trigger_customer_asks_human: body.trigger_customer_asks_human ?? defaults.trigger_customer_asks_human,
    trigger_phrases: Array.isArray(body.trigger_phrases) && body.trigger_phrases.length
      ? body.trigger_phrases.map(String).map(s => s.trim()).filter(Boolean)
      : DEFAULT_HANDOVER_PHRASES,
    availability_enabled: body.availability_enabled ?? defaults.availability_enabled,
    availability_timezone: typeof body.availability_timezone === 'string' ? body.availability_timezone : defaults.availability_timezone,
    availability_start: typeof body.availability_start === 'string' ? body.availability_start : defaults.availability_start,
    availability_end: typeof body.availability_end === 'string' ? body.availability_end : defaults.availability_end,
    updated_at: new Date().toISOString(),
  }

  const { error } = await sb
    .from('live_chat_settings')
    .upsert(payload, { onConflict: 'business_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const settings = await getLiveChatSettings(sb, businessId)
  return NextResponse.json({ settings })
}
