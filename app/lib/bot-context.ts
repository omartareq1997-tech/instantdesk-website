import type { SupabaseClient } from '@supabase/supabase-js'
import { getBusinessTypeConfig, normalizeBusinessType, type BusinessType } from './businessTypes'

export type BotRequestType = 'test_ai' | 'public_widget' | 'dashboard'

export type AgentRow = {
  id: string
  business_id: string
  name: string
  active: boolean
  persona: string
  objective: string
  tone: string
  fallback_msg: string
  model: string
  temperature: number
  created_at?: string
  updated_at?: string
  is_default_website_bot?: boolean | null
  widget_key?: string | null
}

export type BotContextResult =
  | {
      ok: true
      businessId: string
      businessType: BusinessType
      agent: AgentRow
      resolution: string
      toolsEnabled: string[]
    }
  | {
      ok: false
      businessId: string
      businessType: BusinessType
      status: number
      publicMessage: string
      adminMessage: string
      resolution: string
    }

type ResolveBotContextInput = {
  sb: SupabaseClient
  requestType: BotRequestType
  businessId: string
  botId?: string | null
  userId?: string | null
  createDefaultForTestAi?: boolean
  allowExplicitBotForExistingConversation?: boolean
}

function defaultAgentPayload(businessId: string, businessType: BusinessType) {
  const config = getBusinessTypeConfig(businessType)
  return {
    business_id: businessId,
    name: businessType === 'general_service' ? 'AI Assistant' : config.moduleName,
    active: true,
    persona: config.defaultPersona,
    objective: config.defaultObjective,
    tone: 'professional',
    fallback_msg: 'I do not know that yet, but I can connect you with the team.',
    model: businessType === 'car_rental' ? 'gemini-2.5-pro' : 'gpt-4o-mini',
    temperature: 0.4,
  }
}

function enabledToolsForBusinessType(businessType: BusinessType) {
  if (businessType !== 'car_rental') return []
  return [
    'searchFleet',
    'checkAvailability',
    'calculatePrice',
    'createBooking',
    'updateBooking',
    'extendBooking',
    'cancelBooking',
    'getLocations',
    'getBusinessPolicies',
    'handoverToHuman',
  ]
}

function agentText(agent: AgentRow) {
  return `${agent.name ?? ''} ${agent.persona ?? ''} ${agent.objective ?? ''}`.toLowerCase()
}

function isRealEstateLike(agent: AgentRow) {
  const text = agentText(agent)
  return /\b(real estate|property|properties|dubai|luxury real estate|buyer|seller|viewing|apartment|villa)\b/i.test(text)
}

function isBusinessTypeLike(agent: AgentRow, businessType: BusinessType) {
  const text = agentText(agent)
  if (businessType === 'car_rental') return /\b(car rental|rental|fleet|pickup|drop-off|dropoff|vehicle|booking calendar)\b/i.test(text)
  if (businessType === 'real_estate') return /\b(real estate|property|buyer|seller|viewing|apartment|villa)\b/i.test(text)
  return true
}

async function markDefaultIfColumnExists(sb: SupabaseClient, businessId: string, agentId: string) {
  const clear = await sb.from('agents').update({ is_default_website_bot: false }).eq('business_id', businessId)
  if (clear.error?.code === '42703' || /is_default_website_bot/i.test(clear.error?.message ?? '')) return
  if (clear.error) {
    console.warn('[BotResolution] default clear failed:', clear.error.message)
    return
  }
  const set = await sb.from('agents').update({ is_default_website_bot: true, active: true }).eq('business_id', businessId).eq('id', agentId)
  if (set.error) console.warn('[BotResolution] default set failed:', set.error.message)
}

async function createDefaultAgent(sb: SupabaseClient, businessId: string, businessType: BusinessType) {
  const payload = defaultAgentPayload(businessId, businessType)
  const { data, error } = await sb.from('agents').insert(payload).select('*').maybeSingle()
  if (error || !data) throw new Error(error?.message ?? 'Failed to create default bot')
  await markDefaultIfColumnExists(sb, businessId, (data as AgentRow).id)
  return data as AgentRow
}

function pickDefaultAgent(agents: AgentRow[], businessType: BusinessType) {
  const active = agents.filter(agent => agent.active)
  const pool = active.length ? active : agents
  const explicitDefault = pool.find(agent => agent.is_default_website_bot === true)
  if (explicitDefault) return { agent: explicitDefault, resolution: 'business_default_website_bot' }
  const typeMatch = pool.find(agent => isBusinessTypeLike(agent, businessType))
  if (typeMatch) return { agent: typeMatch, resolution: 'business_type_matched_bot' }
  return { agent: pool[0] ?? null, resolution: active.length > 1 ? 'oldest_active_bot_no_default' : 'single_active_bot' }
}

export async function resolveBotContext(input: ResolveBotContextInput): Promise<BotContextResult> {
  const { sb, requestType, businessId, botId } = input
  const { data: business, error: businessError } = await sb
    .from('businesses')
    .select('id,business_type')
    .eq('id', businessId)
    .maybeSingle()

  if (businessError) {
    return {
      ok: false,
      businessId,
      businessType: 'general_service',
      status: 500,
      publicMessage: 'This assistant is not configured yet.',
      adminMessage: `Business lookup failed: ${businessError.message}`,
      resolution: 'business_lookup_failed',
    }
  }

  const businessType = normalizeBusinessType(typeof business?.business_type === 'string' ? business.business_type : null)

  const { data: agentRows, error: agentError } = await sb
    .from('agents')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: true })

  if (agentError) {
    return {
      ok: false,
      businessId,
      businessType,
      status: 500,
      publicMessage: 'This assistant is not configured yet.',
      adminMessage: `Bot lookup failed: ${agentError.message}`,
      resolution: 'bot_lookup_failed',
    }
  }

  const agents = (agentRows ?? []) as AgentRow[]
  const explicitAgent = botId ? agents.find(agent => agent.id === botId) ?? null : null
  if (botId && !explicitAgent) {
    return {
      ok: false,
      businessId,
      businessType,
      status: 404,
      publicMessage: 'This assistant is not configured yet.',
      adminMessage: 'Requested bot does not belong to this business or does not exist.',
      resolution: 'explicit_bot_not_found_in_business',
    }
  }

  if (requestType === 'public_widget' && explicitAgent && !input.allowExplicitBotForExistingConversation) {
    if (explicitAgent.is_default_website_bot !== true) {
      return {
        ok: false,
        businessId,
        businessType,
        status: 200,
        publicMessage: 'This assistant is not configured yet.',
        adminMessage: 'Public widget explicit bot is not the default website bot for this business.',
        resolution: 'explicit_bot_not_default_for_widget',
      }
    }
    if (!isBusinessTypeLike(explicitAgent, businessType)) {
      return {
        ok: false,
        businessId,
        businessType,
        status: 200,
        publicMessage: 'This assistant is not configured yet.',
        adminMessage: 'Public widget explicit bot does not match this business type.',
        resolution: 'explicit_bot_business_type_mismatch',
      }
    }
  }

  if (agents.length === 0) {
    if (requestType === 'test_ai' && input.createDefaultForTestAi) {
      try {
        const created = await createDefaultAgent(sb, businessId, businessType)
        return { ok: true, businessId, businessType, agent: created, resolution: 'created_default_test_ai_bot', toolsEnabled: enabledToolsForBusinessType(businessType) }
      } catch (error) {
        return {
          ok: false,
          businessId,
          businessType,
          status: 500,
          publicMessage: 'This assistant is not configured yet.',
          adminMessage: error instanceof Error ? error.message : 'Failed to create default bot',
          resolution: 'default_bot_create_failed',
        }
      }
    }
    return {
      ok: false,
      businessId,
      businessType,
      status: requestType === 'public_widget' ? 200 : 404,
      publicMessage: 'This assistant is not configured yet.',
      adminMessage: 'No bot is configured for this business.',
      resolution: 'no_business_bot',
    }
  }

  let picked = botId
    ? { agent: explicitAgent, resolution: 'explicit_bot_id' }
    : pickDefaultAgent(agents, businessType)

  if (!picked.agent) {
    return {
      ok: false,
      businessId,
      businessType,
      status: 404,
      publicMessage: 'This assistant is not configured yet.',
      adminMessage: 'No usable bot is configured for this business.',
      resolution: 'no_usable_bot',
    }
  }
  let pickedAgent = picked.agent

  if (!botId && businessType === 'car_rental' && isRealEstateLike(pickedAgent) && !isBusinessTypeLike(pickedAgent, businessType)) {
    const carRentalAgent = agents.find(agent => isBusinessTypeLike(agent, businessType))
    if (carRentalAgent) {
      picked = { agent: carRentalAgent, resolution: 'car_rental_guard_preferred_matching_bot' }
      pickedAgent = carRentalAgent
    } else if (requestType === 'test_ai' || requestType === 'public_widget') {
      try {
        const created = await createDefaultAgent(sb, businessId, businessType)
        picked = { agent: created, resolution: 'car_rental_guard_created_default_bot' }
        pickedAgent = created
      } catch {
        return {
          ok: false,
          businessId,
          businessType,
          status: requestType === 'public_widget' ? 200 : 409,
          publicMessage: 'This assistant is not configured yet.',
          adminMessage: 'Car rental business default bot points to a real estate prompt and a replacement could not be created.',
          resolution: 'car_rental_guard_failed',
        }
      }
    }
  }

  if (requestType === 'test_ai' && pickedAgent.active === false) {
    const { error } = await sb
      .from('agents')
      .update({ active: true })
      .eq('business_id', businessId)
      .eq('id', pickedAgent.id)
    if (!error) pickedAgent = { ...pickedAgent, active: true }
    else console.warn('[BotResolution] inactive bot activation failed:', error.message)
  }

  return {
    ok: true,
    businessId,
    businessType,
    agent: pickedAgent,
    resolution: picked.resolution,
    toolsEnabled: enabledToolsForBusinessType(businessType),
  }
}

export function logBotResolution(context: {
  requestType: BotRequestType
  userId?: string | null
  businessId: string
  result: BotContextResult
}) {
  const base = {
    request_type: context.requestType,
    user_id: context.userId ?? null,
    business_id: context.businessId,
    resolution: context.result.resolution,
  }
  if (!context.result.ok) {
    console.warn('[BotResolution]', { ...base, ok: false, error: context.result.adminMessage })
    return
  }
  console.log('[BotResolution]', {
    ...base,
    ok: true,
    bot_id: context.result.agent.id,
    bot_name: context.result.agent.name,
    business_type: context.result.businessType,
    selected_model: context.result.agent.model,
    instruction_preview: `${context.result.agent.persona ?? ''} ${context.result.agent.objective ?? ''}`.trim().slice(0, 80),
    tools_enabled: context.result.toolsEnabled,
  })
}
