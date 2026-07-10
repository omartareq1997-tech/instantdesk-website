import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { expect, test } from './fixtures'
import { POST as postChat } from '../app/api/chat/route'
import { GET as getWidgetConfig } from '../app/api/live-chat/widget/config/route'
import { GET as getConversationDebug } from '../app/api/debug/conversation-resolution/route'
import { resolveBotContext } from '../app/lib/bot-context'
import { MEMBER_COOKIE_NAME, signMemberToken } from '../app/lib/auth'
import { compactTraceData } from '../app/lib/agent-traces'

const BUSINESS_ID = '59bd9987-46b9-48a3-ad14-cfe1ab733453'
const MISSING_OPENAI_KEY_MESSAGE = 'OPENAI_API_KEY is missing. Add it in Vercel Environment Variables and redeploy.'
const MISSING_GEMINI_KEY_MESSAGE = 'GEMINI_API_KEY is missing. Add it in Vercel Environment Variables and redeploy.'

process.loadEnvFile?.('.env.local')

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env for live chat API tests')
  return createClient(url, key, { auth: { persistSession: false } })
}

function warsawDateOffset(days: number) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? ''
  return {
    iso: `${get('year')}-${get('month')}-${get('day')}`,
    short: `${get('day')}/${get('month')}`,
  }
}

async function createTestAiBusiness(options: { aiAutoRepliesEnabled: boolean; liveChatEnabled: boolean }) {
  const sb = adminClient()
  const businessId = crypto.randomUUID()
  await sb.from('businesses').insert({ id: businessId, name: 'QA Test AI Separation Business' })
  await sb.from('agents').insert({
    business_id: businessId,
    name: 'QA Direct Test Agent',
    active: true,
    persona: 'You are a concise test assistant.',
    objective: 'Answer direct Test AI prompts.',
    tone: 'professional',
    fallback_msg: 'I do not know.',
    model: 'gpt-4o-mini',
    temperature: 0.1,
  })
  await sb.from('live_chat_settings').insert({
    business_id: businessId,
    ai_auto_replies_enabled: options.aiAutoRepliesEnabled,
    live_chat_enabled: options.liveChatEnabled,
    human_handover_enabled: true,
    trigger_customer_asks_human: true,
    trigger_ai_cannot_answer: true,
    trigger_phrases: ['human', 'agent', 'support'],
  })
  return { sb, businessId }
}

async function createGeminiTestAiBusiness(options: { aiAutoRepliesEnabled: boolean; liveChatEnabled: boolean }) {
  const sb = adminClient()
  const businessId = crypto.randomUUID()
  await sb.from('businesses').insert({ id: businessId, name: 'QA Gemini Test AI Business', business_type: 'general_service' })
  await sb.from('agents').insert({
    business_id: businessId,
    name: 'QA Gemini Test Agent',
    active: true,
    persona: 'You are a concise test assistant.',
    objective: 'Answer direct Test AI prompts.',
    tone: 'professional',
    fallback_msg: 'I do not know.',
    model: 'gemini-2.5-pro',
    temperature: 0.1,
  })
  await sb.from('live_chat_settings').insert({
    business_id: businessId,
    ai_auto_replies_enabled: options.aiAutoRepliesEnabled,
    live_chat_enabled: options.liveChatEnabled,
    human_handover_enabled: true,
    trigger_customer_asks_human: true,
    trigger_ai_cannot_answer: true,
    trigger_phrases: ['human', 'agent', 'support'],
  })
  return { sb, businessId }
}

async function createGeminiCarRentalBusiness(options: { aiAutoRepliesEnabled: boolean; liveChatEnabled: boolean }) {
  const sb = adminClient()
  const businessId = crypto.randomUUID()
  await sb.from('businesses').insert({ id: businessId, name: 'QA Rental Runtime Business', business_type: 'car_rental' })
  await sb.from('agents').insert({
    business_id: businessId,
    name: 'QA Rental Runtime Agent',
    active: true,
    persona: 'You are a car rental operations assistant.',
    objective: 'Check live fleet availability, collect booking details, and create safe bookings.',
    tone: 'professional',
    fallback_msg: 'I can continue from the saved rental details.',
    model: 'gemini-2.5-pro',
    temperature: 0.1,
  })
  await sb.from('live_chat_settings').insert({
    business_id: businessId,
    ai_auto_replies_enabled: options.aiAutoRepliesEnabled,
    live_chat_enabled: options.liveChatEnabled,
    human_handover_enabled: true,
    trigger_customer_asks_human: true,
    trigger_ai_cannot_answer: true,
    trigger_phrases: ['human', 'agent', 'support'],
  })
  const { data: economy } = await sb.from('car_classes').insert({ business_id: businessId, name: 'Economy' }).select('id').single()
  const { data: location } = await sb.from('rental_locations').insert({
    business_id: businessId,
    name: 'Kraków Bocheńska 2a',
    address: 'Kraków Bocheńska 2a',
    active: true,
  }).select('id').single()
  const { data: cars } = await sb.from('cars').insert([
    {
      business_id: businessId,
      name: 'Skoda Superb',
      model: 'Superb',
      transmission: 'automatic',
      daily_price: 150,
      deposit: 1500,
      status: 'available',
      active: true,
      car_class_id: economy?.id,
      location_id: location?.id,
    },
    {
      business_id: businessId,
      name: 'Toyota Corolla',
      model: 'Corolla',
      transmission: 'automatic',
      daily_price: 140,
      deposit: 1200,
      status: 'available',
      active: true,
      car_class_id: economy?.id,
      location_id: location?.id,
    },
    {
      business_id: businessId,
      name: 'Toyota Camry',
      model: 'Camry',
      transmission: 'automatic',
      daily_price: 160,
      deposit: 1300,
      status: 'available',
      active: true,
      car_class_id: economy?.id,
      location_id: location?.id,
    },
  ]).select('id,name')
  return {
    sb,
    businessId,
    locationId: location?.id as string,
    carIds: Object.fromEntries((cars ?? []).map(car => [car.name, car.id])) as Record<string, string>,
  }
}

async function createTestAiBusinessWithoutAgent(options: { aiAutoRepliesEnabled: boolean; liveChatEnabled: boolean }) {
  const sb = adminClient()
  const businessId = crypto.randomUUID()
  await sb.from('businesses').insert({ id: businessId, name: 'QA Test AI Default Agent Business' })
  await sb.from('live_chat_settings').insert({
    business_id: businessId,
    ai_auto_replies_enabled: options.aiAutoRepliesEnabled,
    live_chat_enabled: options.liveChatEnabled,
    human_handover_enabled: true,
    trigger_customer_asks_human: true,
    trigger_ai_cannot_answer: true,
    trigger_phrases: ['human', 'agent', 'support'],
  })
  return { sb, businessId }
}

async function createTestAiBusinessWithInactiveAgent(options: { aiAutoRepliesEnabled: boolean; liveChatEnabled: boolean }) {
  const { sb, businessId } = await createTestAiBusinessWithoutAgent(options)
  await sb.from('agents').insert({
    business_id: businessId,
    name: 'QA Inactive Test Agent',
    active: false,
    persona: 'You are an inactive agent that should be restored for Test AI.',
    objective: 'Answer Test AI prompts after activation.',
    tone: 'professional',
    fallback_msg: 'I do not know.',
    model: 'gpt-4o-mini',
    temperature: 0.1,
  })
  return { sb, businessId }
}

async function cleanupTestAiBusiness(sb: ReturnType<typeof adminClient>, businessId: string) {
  const { data: conversations } = await sb.from('conversations').select('id').eq('business_id', businessId)
  const conversationIds = (conversations ?? []).map(row => row.id as string)
  if (conversationIds.length) {
    await sb.from('messages').delete().in('conversation_id', conversationIds)
    await sb.from('handover_events').delete().in('conversation_id', conversationIds)
    await sb.from('leads').delete().in('conversation_id', conversationIds)
    await sb.from('conversations').delete().in('id', conversationIds)
  }
  await sb.from('rental_bookings').delete().eq('business_id', businessId)
  await sb.from('cars').delete().eq('business_id', businessId)
  await sb.from('car_classes').delete().eq('business_id', businessId)
  await sb.from('rental_locations').delete().eq('business_id', businessId)
  await sb.from('live_chat_settings').delete().eq('business_id', businessId)
  await sb.from('agents').delete().eq('business_id', businessId)
  await sb.from('businesses').delete().eq('id', businessId)
}

async function createBotIsolationBusiness(name: string, businessType: string) {
  const sb = adminClient()
  const businessId = crypto.randomUUID()
  await sb.from('businesses').insert({ id: businessId, name, business_type: businessType })
  return { sb, businessId }
}

async function insertIsolationBot(sb: ReturnType<typeof adminClient>, businessId: string, input: {
  name: string
  persona: string
  objective: string
  active?: boolean
  model?: string
}) {
  const { data, error } = await sb.from('agents').insert({
    business_id: businessId,
    name: input.name,
    active: input.active ?? true,
    persona: input.persona,
    objective: input.objective,
    tone: 'professional',
    fallback_msg: 'I do not know.',
    model: input.model ?? 'gpt-4o-mini',
    temperature: 0.1,
  }).select('id').maybeSingle()
  expect(error).toBeNull()
  expect(data?.id).toBeTruthy()
  return data!.id as string
}

async function postChatRouteWithMissingOpenAi(body: Record<string, unknown>) {
  const previousKey = process.env.OPENAI_API_KEY
  delete process.env.OPENAI_API_KEY
  try {
    const request = new NextRequest('http://127.0.0.1:3106/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return await postChat(request)
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousKey
  }
}

async function postChatRouteWithMissingGemini(body: Record<string, unknown>) {
  const previousKey = process.env.GEMINI_API_KEY
  delete process.env.GEMINI_API_KEY
  try {
    const request = new NextRequest('http://127.0.0.1:3106/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return await postChat(request)
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previousKey
  }
}

async function postChatRouteWithMockedGemini(body: Record<string, unknown>, responses: Array<Record<string, unknown>>) {
  const previousKey = process.env.GEMINI_API_KEY
  process.env.GEMINI_API_KEY = 'test-gemini-key'
  const originalFetch = global.fetch
  let geminiCalls = 0
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    if (url.includes('generativelanguage.googleapis.com')) {
      const payload = responses[Math.min(geminiCalls, responses.length - 1)]
      geminiCalls += 1
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return originalFetch(input, init)
  }) as typeof fetch
  try {
    const request = new NextRequest('http://127.0.0.1:3106/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const response = await postChat(request)
    return { response, geminiCalls }
  } finally {
    global.fetch = originalFetch
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previousKey
  }
}

async function postChatRouteWithMockedOpenAI(body: Record<string, unknown>, responses: Array<Record<string, unknown>>) {
  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'test-openai-key'
  const originalFetch = global.fetch
  let openAiCalls = 0
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    if (url.includes('api.openai.com') && url.includes('/embeddings')) {
      return new Response(JSON.stringify({ data: [{ embedding: [0.01, 0.02, 0.03] }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.includes('api.openai.com') && url.includes('/chat/completions')) {
      const payload = responses[Math.min(openAiCalls, responses.length - 1)]
      openAiCalls += 1
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return originalFetch(input, init)
  }) as typeof fetch
  try {
    const request = new NextRequest('http://127.0.0.1:3106/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const response = await postChat(request)
    return { response, openAiCalls }
  } finally {
    global.fetch = originalFetch
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousKey
  }
}

function geminiTextResponse(text: string, finishReason = 'STOP') {
  return { candidates: [{ finishReason, content: { parts: [{ text }] } }] }
}

function geminiSemanticResponse(payload: Record<string, unknown>, finishReason = 'STOP') {
  return geminiTextResponse(JSON.stringify(payload), finishReason)
}

function openAiTextResponse(text: string, finishReason = 'stop') {
  return { choices: [{ finish_reason: finishReason, message: { content: text } }] }
}

function openAiSemanticResponse(payload: Record<string, unknown>, finishReason = 'stop') {
  return openAiTextResponse(JSON.stringify(payload), finishReason)
}

async function createRentalConversationWithAgentState(
  sb: ReturnType<typeof adminClient>,
  businessId: string,
  slots: Record<string, unknown>,
  assistantHistory: string[] = [],
) {
  const { data: agent, error: agentError } = await sb
    .from('agents')
    .select('id')
    .eq('business_id', businessId)
    .eq('active', true)
    .single()
  expect(agentError).toBeNull()
  expect(agent?.id).toBeTruthy()

  const conversationId = crypto.randomUUID()
  const metadata = {
    bot_id: agent?.id,
    agent_id: agent?.id,
    business_type: 'car_rental',
    agent_state: {
      version: 1,
      state: slots,
      slots,
      missing: [],
      updated_at: new Date().toISOString(),
    },
  }
  const { error: conversationError } = await sb.from('conversations').insert({
    id: conversationId,
    business_id: businessId,
    channel: 'website',
    status: 'ai_active',
    unread_count: 0,
    last_message_at: new Date().toISOString(),
    metadata,
  })
  expect(conversationError).toBeNull()
  if (assistantHistory.length) {
    const { error: historyError } = await sb.from('messages').insert(assistantHistory.map(content => ({
      conversation_id: conversationId,
      business_id: businessId,
      role: 'assistant',
      content,
      metadata: { sender_type: 'ai', delivery_status: 'delivered' },
    })))
    expect(historyError).toBeNull()
  }
  return conversationId
}

async function captureAgentTrace<T>(fn: () => Promise<T>) {
  const previousTrace = process.env.AGENT_TRACE_LOGS
  const originalInfo = console.info
  const lines: string[] = []
  process.env.AGENT_TRACE_LOGS = 'true'
  console.info = ((...args: unknown[]) => {
    const line = args.map(String).join(' ')
    if (line.includes('"event":"rental_')) lines.push(line)
  }) as typeof console.info
  try {
    const result = await fn()
    const traces = lines.map(line => JSON.parse(line) as Record<string, unknown>)
    return { result, traces }
  } finally {
    console.info = originalInfo
    if (previousTrace === undefined) delete process.env.AGENT_TRACE_LOGS
    else process.env.AGENT_TRACE_LOGS = previousTrace
  }
}

test.describe('Live Chat API production boundaries', () => {
  test('dashboard live-chat APIs require authentication', async ({ request }) => {
    const settings = await request.get('/api/live-chat/settings')
    expect(settings.status()).toBe(401)

    const conversations = await request.get('/api/live-chat/conversations')
    expect(conversations.status()).toBe(401)

    const messages = await request.get('/api/live-chat/conversations/00000000-0000-0000-0000-000000000000/messages')
    expect(messages.status()).toBe(401)

    const status = await request.patch('/api/live-chat/conversations/00000000-0000-0000-0000-000000000000/status', {
      data: { status: 'resolved' },
    })
    expect(status.status()).toBe(401)
  })

  test('public chat rejects oversized messages before persistence', async ({ request }) => {
    const response = await request.post('/api/chat', {
      data: {
        business_id: BUSINESS_ID,
        message: 'x'.repeat(4001),
      },
    })
    expect(response.status()).toBe(413)
  })

  test('public chat applies basic per-IP throttling', async ({ request }) => {
    const headers = { 'x-forwarded-for': '203.0.113.42' }
    let lastStatus = 0

    for (let i = 0; i < 21; i += 1) {
      const response = await request.post('/api/chat', {
        headers,
        data: {
          business_id: '00000000-0000-0000-0000-000000000000',
          message: `rate limit probe ${i}`,
        },
      })
      lastStatus = response.status()
    }

    expect(lastStatus).toBe(429)
  })

  test('Test AI ignores Live Chat AI auto-reply settings and reaches the direct AI path', async () => {
    const { sb, businessId } = await createTestAiBusiness({ aiAutoRepliesEnabled: false, liveChatEnabled: true })

    try {
      const response = await postChatRouteWithMissingOpenAi({
        business_id: businessId,
        message: 'Please answer directly in Test AI even though live chat AI replies are disabled.',
        debug: true,
        test_ai: true,
      })
      const body = await response.json() as { error?: string; handover?: boolean; ai_reply_skipped?: boolean }

      expect(response.status).toBe(500)
      expect(body.error).toBe(MISSING_OPENAI_KEY_MESSAGE)
      expect(body.handover).not.toBe(true)
      expect(body.ai_reply_skipped).not.toBe(true)

      const { data: conversations, error } = await sb
        .from('conversations')
        .select('status')
        .eq('business_id', businessId)
      expect(error).toBeNull()
      expect(conversations?.map(row => row.status)).not.toContain('handover_requested')
    } finally {
      await cleanupTestAiBusiness(sb, businessId)
    }
  })

  test('bot resolver prefers the car rental bot over a stale Dubai real estate bot inside the same business', async () => {
    const { sb, businessId } = await createBotIsolationBusiness('QA Bot Isolation Car Rental', 'car_rental')
    try {
      await insertIsolationBot(sb, businessId, {
        name: 'Dubai Real Estate Assistant',
        persona: 'You are a luxury real estate assistant in Dubai.',
        objective: 'Sell premium villas and property viewings.',
      })
      const carBotId = await insertIsolationBot(sb, businessId, {
        name: 'Car Rental Operations Assistant',
        persona: 'You are a car rental operations assistant.',
        objective: 'Help customers rent vehicles from the live fleet and booking calendar.',
        model: 'gemini-2.5-pro',
      })

      const resolved = await resolveBotContext({
        sb,
        requestType: 'public_widget',
        businessId,
      })

      expect(resolved.ok).toBe(true)
      if (resolved.ok) {
        expect(resolved.agent.id).toBe(carBotId)
        expect(resolved.agent.name).toBe('Car Rental Operations Assistant')
        expect(resolved.toolsEnabled).toContain('searchFleet')
        expect(`${resolved.agent.persona} ${resolved.agent.objective}`).not.toMatch(/dubai|real estate/i)
      }
    } finally {
      await cleanupTestAiBusiness(sb, businessId)
    }
  })

  test('public widget config for instantdesk.pl resolves the production car rental bot', async () => {
    const request = new NextRequest('https://instantdesk.pl/api/live-chat/widget/config', {
      headers: { host: 'instantdesk.pl' },
    })
    const response = await getWidgetConfig(request)
    const body = await response.json() as {
      business_id?: string
      bot_name?: string
      business_type?: string
      prompt_preview?: string
      configured?: boolean
    }

    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(body.business_id).toBe(BUSINESS_ID)
    expect(body.configured).toBe(true)
    expect(body.business_type).toBe('car_rental')
    expect(`${body.bot_name ?? ''} ${body.prompt_preview ?? ''}`).toMatch(/car|rental|vehicle|fleet/i)
    expect(`${body.bot_name ?? ''} ${body.prompt_preview ?? ''}`).not.toMatch(/dubai|real estate|property|apartment|villa/i)
  })

  test('public widget cannot resolve an explicit bot from another business', async () => {
    const businessA = await createBotIsolationBusiness('QA Widget Business A', 'car_rental')
    const businessB = await createBotIsolationBusiness('QA Widget Business B', 'real_estate')
    try {
      await insertIsolationBot(businessA.sb, businessA.businessId, {
        name: 'Business A Car Rental Bot',
        persona: 'You are a car rental assistant.',
        objective: 'Rent cars only for business A.',
      })
      const foreignBotId = await insertIsolationBot(businessB.sb, businessB.businessId, {
        name: 'Business B Real Estate Bot',
        persona: 'You are a Dubai real estate assistant.',
        objective: 'Sell property for business B.',
      })

      const resolved = await resolveBotContext({
        sb: businessA.sb,
        requestType: 'public_widget',
        businessId: businessA.businessId,
        botId: foreignBotId,
      })

      expect(resolved.ok).toBe(false)
      if (!resolved.ok) {
        expect(resolved.resolution).toBe('explicit_bot_not_found_in_business')
        expect(resolved.publicMessage).toBe('This assistant is not configured yet.')
      }
    } finally {
      await cleanupTestAiBusiness(businessA.sb, businessA.businessId)
      await cleanupTestAiBusiness(businessB.sb, businessB.businessId)
    }
  })

  test('public widget rejects stale same-business Dubai bot id when it is not website default', async () => {
    const { sb, businessId } = await createBotIsolationBusiness('QA Same Business Stale Bot', 'car_rental')
    try {
      const staleDubaiBotId = await insertIsolationBot(sb, businessId, {
        name: 'Dubai Real Estate Assistant',
        persona: 'You are a Dubai luxury real estate assistant.',
        objective: 'Sell luxury villas and apartments.',
      })
      const carBotId = await insertIsolationBot(sb, businessId, {
        name: 'Car Rental Operations Assistant',
        persona: 'You are a car rental operations assistant.',
        objective: 'Help customers rent vehicles from the fleet.',
        model: 'gemini-2.5-pro',
      })

      const stale = await resolveBotContext({
        sb,
        requestType: 'public_widget',
        businessId,
        botId: staleDubaiBotId,
      })
      expect(stale.ok).toBe(false)
      if (!stale.ok) expect(stale.resolution).toBe('explicit_bot_not_default_for_widget')

      const resolved = await resolveBotContext({ sb, requestType: 'public_widget', businessId })
      expect(resolved.ok).toBe(true)
      if (resolved.ok) {
        expect(resolved.agent.id).toBe(carBotId)
        expect(`${resolved.agent.persona} ${resolved.agent.objective}`).not.toMatch(/dubai|real estate/i)
      }
    } finally {
      await cleanupTestAiBusiness(sb, businessId)
    }
  })

  test('widget config falls back to resolved website bot and sends no-store when a stale bot id is supplied', async () => {
    const { sb, businessId } = await createBotIsolationBusiness('QA Widget Config Stale Bot', 'car_rental')
    try {
      const staleDubaiBotId = await insertIsolationBot(sb, businessId, {
        name: 'Dubai Real Estate Assistant',
        persona: 'You are a Dubai luxury real estate assistant.',
        objective: 'Sell luxury villas and apartments.',
      })
      const carBotId = await insertIsolationBot(sb, businessId, {
        name: 'Car Rental Operations Assistant',
        persona: 'You are a car rental operations assistant.',
        objective: 'Help customers rent vehicles from the fleet.',
        model: 'gemini-2.5-pro',
      })

      const request = new NextRequest(`http://127.0.0.1:3106/api/live-chat/widget/config?business_id=${businessId}&bot_id=${staleDubaiBotId}`)
      const response = await getWidgetConfig(request)
      const body = await response.json() as { bot_id?: string; bot_name?: string; resolution_source?: string; prompt_preview?: string }
      expect(response.headers.get('cache-control')).toContain('no-store')
      expect(body.bot_id).toBe(carBotId)
      expect(body.bot_name).toBe('Car Rental Operations Assistant')
      expect(body.resolution_source).toContain('ignored_stale_explicit_bot')
      expect(body.prompt_preview).not.toMatch(/dubai|real estate/i)
    } finally {
      await cleanupTestAiBusiness(sb, businessId)
    }
  })

  test('public widget continuation resolves the stored conversation bot instead of stale request context', async () => {
    const { sb, businessId } = await createBotIsolationBusiness('QA Widget Continuation Car Rental', 'car_rental')
    const foreign = await createBotIsolationBusiness('QA Widget Continuation Foreign', 'real_estate')
    try {
      await insertIsolationBot(sb, businessId, {
        name: 'Dubai Real Estate Assistant',
        persona: 'You are a Dubai luxury real estate assistant.',
        objective: 'Sell luxury villas and apartments.',
      })
      const carBotId = await insertIsolationBot(sb, businessId, {
        name: 'Car Rental Operations Assistant',
        persona: 'You are a car rental operations assistant.',
        objective: 'Help customers rent vehicles from the fleet and booking calendar.',
        model: 'gemini-2.5-pro',
      })
      const foreignBotId = await insertIsolationBot(foreign.sb, foreign.businessId, {
        name: 'Foreign Dubai Real Estate Assistant',
        persona: 'You are a Dubai real estate assistant.',
        objective: 'Sell property for another business.',
      })

      const first = await postChat(new NextRequest('http://127.0.0.1:3106/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          bot_id: carBotId,
          message: 'I want to rent a car tomorrow',
          channel: 'website',
          host: 'instantdesk.pl',
          debug: true,
        }),
      }))
      const firstBody = await first.json() as { conversation_id?: string; reply?: string; debug?: { bot?: { id?: string } } }
      expect(first.status).toBe(200)
      expect(firstBody.conversation_id).toBeTruthy()
      expect(firstBody.reply ?? '').not.toMatch(/dubai|real estate|property|apartment|villa/i)

      const { data: storedConversation } = await sb
        .from('conversations')
        .select('business_id,metadata')
        .eq('id', firstBody.conversation_id)
        .maybeSingle()
      const storedMetadata = (storedConversation?.metadata ?? {}) as Record<string, unknown>
      expect(storedConversation?.business_id).toBe(businessId)
      expect(storedMetadata.bot_id).toBe(carBotId)
      expect(storedMetadata.agent_id).toBe(carBotId)

      const second = await postChat(new NextRequest('http://127.0.0.1:3106/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: foreign.businessId,
          bot_id: foreignBotId,
          conversation_id: firstBody.conversation_id,
          message: 'I want to rent a car tomorrow',
          channel: 'website',
          host: 'instantdesk.pl',
          debug: true,
        }),
      }))
      const secondBody = await second.json() as { reply?: string; error?: string; conversation_id?: string; debug?: { bot?: { id?: string } } }
      expect(second.status).toBe(200)
      expect(secondBody.conversation_id).toBe(firstBody.conversation_id)
      expect(secondBody.error).toBeFalsy()
      expect(`${secondBody.reply ?? ''} ${secondBody.error ?? ''}`).not.toContain('This assistant is not configured yet')
      expect(`${secondBody.reply ?? ''} ${secondBody.error ?? ''}`).not.toMatch(/dubai|real estate|property|apartment|villa/i)

      const debug = await getConversationDebug(new NextRequest(`http://127.0.0.1:3106/api/debug/conversation-resolution?conversation_id=${firstBody.conversation_id}`))
      const debugBody = await debug.json() as { stored_business_id?: string; stored_bot_id?: string; stored_agent_id?: string; resolved_bot_id?: string; resolved_business_type?: string }
      expect(debug.status).toBe(200)
      expect(debugBody.stored_business_id).toBe(businessId)
      expect(debugBody.stored_bot_id).toBe(carBotId)
      expect(debugBody.stored_agent_id).toBe(carBotId)
      expect(debugBody.resolved_bot_id).toBe(carBotId)
      expect(debugBody.resolved_business_type).toBe('car_rental')

      const { data: messages } = await sb
        .from('messages')
        .select('role,content')
        .eq('conversation_id', firstBody.conversation_id)
        .order('created_at', { ascending: true })
      const userMessages = (messages ?? []).filter(row => row.role === 'user')
      expect(userMessages.length).toBeGreaterThanOrEqual(2)
      expect((messages ?? []).map(row => row.content).join('\n')).not.toContain('This assistant is not configured yet')
    } finally {
      await cleanupTestAiBusiness(sb, businessId)
      await cleanupTestAiBusiness(foreign.sb, foreign.businessId)
    }
  })

  test('real estate bots do not receive rental operational tools', async () => {
    const { sb, businessId } = await createBotIsolationBusiness('QA Real Estate Isolation', 'real_estate')
    try {
      await insertIsolationBot(sb, businessId, {
        name: 'Real Estate Assistant',
        persona: 'You are a real estate assistant.',
        objective: 'Qualify buyers and schedule property viewings.',
      })

      const resolved = await resolveBotContext({
        sb,
        requestType: 'test_ai',
        businessId,
      })

      expect(resolved.ok).toBe(true)
      if (resolved.ok) {
        expect(resolved.businessType).toBe('real_estate')
        expect(resolved.toolsEnabled).toEqual([])
      }
    } finally {
      await cleanupTestAiBusiness(sb, businessId)
    }
  })

  test('public widget with no business bot returns a safe configuration fallback instead of global search', async () => {
    const { sb, businessId } = await createBotIsolationBusiness('QA No Bot Public Widget', 'general_service')
    try {
      const resolved = await resolveBotContext({
        sb,
        requestType: 'public_widget',
        businessId,
      })

      expect(resolved.ok).toBe(false)
      if (!resolved.ok) {
        expect(resolved.status).toBe(200)
        expect(resolved.resolution).toBe('no_business_bot')
        expect(resolved.publicMessage).toBe('This assistant is not configured yet.')
      }
    } finally {
      await cleanupTestAiBusiness(sb, businessId)
    }
  })

  test('missing OPENAI_API_KEY returns the clear admin setup error', async () => {
    const { sb, businessId } = await createTestAiBusiness({ aiAutoRepliesEnabled: true, liveChatEnabled: true })

    try {
      const response = await postChatRouteWithMissingOpenAi({
        business_id: businessId,
        message: 'Hello from Test AI with no OpenAI key.',
        debug: true,
        test_ai: true,
      })
      const body = await response.json() as { error?: string }

      expect(response.status).toBe(500)
      expect(body.error).toBe(MISSING_OPENAI_KEY_MESSAGE)
      expect(body.error).not.toBe('No response')
    } finally {
      await cleanupTestAiBusiness(sb, businessId)
    }
  })

  test('missing GEMINI_API_KEY returns the clear admin setup error for Gemini models', async () => {
    const { sb, businessId } = await createGeminiTestAiBusiness({ aiAutoRepliesEnabled: true, liveChatEnabled: true })

    try {
      const response = await postChatRouteWithMissingGemini({
        business_id: businessId,
        message: 'Hello from Test AI with no Gemini key.',
        debug: true,
        test_ai: true,
      })
      const body = await response.json() as { error?: string }

      expect(response.status).toBe(500)
      expect(body.error).toBe(MISSING_GEMINI_KEY_MESSAGE)
      expect(body.error).not.toBe('No response')
    } finally {
      await cleanupTestAiBusiness(sb, businessId)
    }
  })

  test('Gemini MAX_TOKENS retry persists one clean assistant message', async () => {
    const { sb, businessId } = await createGeminiTestAiBusiness({ aiAutoRepliesEnabled: true, liveChatEnabled: true })
    try {
      const { response, geminiCalls } = await postChatRouteWithMockedGemini({
        business_id: businessId,
        message: 'Please answer with one complete sentence.',
        debug: true,
        test_ai: true,
        turn_id: 'gemini-retry-turn',
        client_message_id: 'gemini-retry-user',
      }, [
        { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: "Okay, so that's pickup today at" }] } }], usageMetadata: { totalTokenCount: 900 } },
        { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'This is a complete clean reply.' }] } }], usageMetadata: { totalTokenCount: 120 } },
      ])
      const body = await response.json() as { reply?: string; conversation_id?: string; assistant_message?: { id?: string } }
      expect(response.status).toBe(200)
      expect(geminiCalls).toBe(2)
      expect(body.reply).toBe('This is a complete clean reply.')
      expect(body.assistant_message?.id).toBeTruthy()
      const { data: assistants } = await sb.from('messages').select('id,content,metadata').eq('conversation_id', body.conversation_id).eq('role', 'assistant')
      expect(assistants).toHaveLength(1)
      expect(assistants?.[0]?.content).toBe('This is a complete clean reply.')
    } finally {
      await cleanupTestAiBusiness(sb, businessId)
    }
  })

  test('Gemini repeated incomplete responses persist a complete fallback instead of partial text', async () => {
    const { sb, businessId } = await createGeminiTestAiBusiness({ aiAutoRepliesEnabled: true, liveChatEnabled: true })
    try {
      const { response, geminiCalls } = await postChatRouteWithMockedGemini({
        business_id: businessId,
        message: 'Please answer completely.',
        debug: true,
        test_ai: true,
        turn_id: 'gemini-fallback-turn',
        client_message_id: 'gemini-fallback-user',
      }, [
        { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Your' }] } }] },
        { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'The reply is still' }] } }] },
      ])
      const body = await response.json() as { reply?: string; conversation_id?: string }
      expect(response.status).toBe(200)
      expect(geminiCalls).toBe(2)
      expect(body.reply).not.toContain('send one more message')
      expect(body.reply).not.toContain('trouble completing')
      expect(body.reply?.trim()).toBeTruthy()
      expect(body.reply).not.toBe('Your')
      expect(body.reply).not.toBe('The reply is still')
      const { data: assistants } = await sb.from('messages').select('id,content').eq('conversation_id', body.conversation_id).eq('role', 'assistant')
      expect(assistants).toHaveLength(1)
      expect(assistants?.[0]?.content).toBe(body.reply)
    } finally {
      await cleanupTestAiBusiness(sb, businessId)
    }
  })

  test('rental runtime preserves Justyna state and interrupts confirmation for location questions', async () => {
    const { sb, businessId } = await createGeminiCarRentalBusiness({ aiAutoRepliesEnabled: true, liveChatEnabled: true })
    let conversationId: string | undefined
    async function send(message: string, suffix: string) {
      const { response } = await postChatRouteWithMockedGemini({
        business_id: businessId,
        conversation_id: conversationId,
        message,
        debug: true,
        test_ai: false,
        turn_id: `justyna-${suffix}`,
        client_message_id: `justyna-client-${suffix}`,
      }, [
        { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Runtime fallback should not dominate this rental workflow.' }] } }] },
      ])
      const body = await response.json() as {
        reply?: string
        conversation_id?: string
        debug?: { confirmedSlots?: Record<string, unknown>; operationalTools?: Array<{ tool: string; ok: boolean }> }
      }
      expect(response.status).toBe(200)
      conversationId = body.conversation_id
      return body
    }
    try {
      await send('yes, i want to rent a car today until 12/07', 'dates')
      await send('pick at 20:00 return at 21:00', 'times')
      const fleet = await send('im looking for economical car', 'class')
      expect(fleet.reply).toMatch(/Skoda Superb|Toyota Corolla|economy|car/i)

      const selected = await send('i will take the skoda', 'vehicle')
      expect(selected.debug?.confirmedSlots?.selected_vehicle).toBe('Skoda Superb')
      expect(selected.reply).not.toMatch(/pickup date|return date/i)

      const name = await send('Justyna', 'name')
      expect(name.debug?.confirmedSlots?.name).toBe('Justyna')
      expect(name.reply).toMatch(/phone/i)

      const phone = await send('510 555 444', 'phone')
      expect(phone.debug?.confirmedSlots?.name).toBe('Justyna')
      expect(phone.debug?.confirmedSlots?.phone).toBe('510 555 444')
      expect(phone.reply).toMatch(/email/i)

      const email = await send('justyna@gmail.com', 'email')
      expect(email.debug?.confirmedSlots?.name).toBe('Justyna')
      expect(email.debug?.confirmedSlots?.phone).toBe('510 555 444')
      expect(email.debug?.confirmedSlots?.email).toBe('justyna@gmail.com')
      expect(email.reply).toContain('Bocheńska 2a')
      expect(email.reply).not.toMatch(/customer name|share your name|provide your name|send one more message|trouble completing/i)

      const confirmWithoutLocations = await send('yes please', 'confirm-missing-location')
      expect(confirmWithoutLocations.reply).toContain('Bocheńska 2a')
      expect(confirmWithoutLocations.reply).not.toMatch(/Booking creation needs|Missing required|failed/i)
      expect(confirmWithoutLocations.debug?.operationalTools?.some(tool => tool.tool === 'createBooking')).toBe(false)

      const locationQuestion = await send('what pick up location do you have in krakow', 'ask-location')
      expect(locationQuestion.reply).toContain('Bocheńska 2a')
      expect(locationQuestion.reply).not.toMatch(/Estimated rental price|Would you like me to create/i)

      const acceptLocation = await send('yes use it for both', 'accept-location')
      expect(acceptLocation.debug?.confirmedSlots?.pickup_location).toBe('Kraków Bocheńska 2a')
      expect(acceptLocation.debug?.confirmedSlots?.dropoff_location).toBe('Kraków Bocheńska 2a')
      expect(acceptLocation.debug?.confirmedSlots?.dropoff_location_id).toBe(acceptLocation.debug?.confirmedSlots?.pickup_location_id)

      const { data: conversation } = await sb.from('conversations').select('metadata').eq('id', conversationId).single()
      const agentState = (conversation?.metadata as { agent_state?: { slots?: Record<string, unknown> } } | null)?.agent_state
      expect(agentState?.slots?.name).toBe('Justyna')
      expect(agentState?.slots?.phone).toBe('510 555 444')
      expect(agentState?.slots?.email).toBe('justyna@gmail.com')
      expect(agentState?.slots?.selected_vehicle).toBe('Skoda Superb')
      expect(agentState?.slots?.pickup_location).toBe('Kraków Bocheńska 2a')
      expect(agentState?.slots?.dropoff_location).toBe('Kraków Bocheńska 2a')
      expect(agentState?.slots?.dropoff_location_id).toBe(agentState?.slots?.pickup_location_id)
    } finally {
      await cleanupTestAiBusiness(sb, businessId)
    }
  })

  test('exact rental flow binds same configured location, hides blocked Camry, and returns truthful pending booking status', async () => {
    const { sb, businessId, locationId, carIds } = await createGeminiCarRentalBusiness({ aiAutoRepliesEnabled: true, liveChatEnabled: true })
    let conversationId: string | undefined
    const pickupDate = warsawDateOffset(1)
    const returnDate = warsawDateOffset(4)
    async function send(message: string, suffix: string) {
      const { response } = await postChatRouteWithMockedGemini({
        business_id: businessId,
        conversation_id: conversationId,
        message,
        debug: true,
        test_ai: false,
        turn_id: `macin-${suffix}`,
        client_message_id: `macin-client-${suffix}`,
      }, [
        { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Runtime fallback should not dominate this rental workflow.' }] } }] },
      ])
      const body = await response.json() as {
        reply?: string
        conversation_id?: string
        debug?: { confirmedSlots?: Record<string, unknown>; operationalTools?: Array<{ tool: string; ok: boolean }> }
      }
      expect(response.status).toBe(200)
      conversationId = body.conversation_id
      expect(body.reply ?? '').not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)
      return body
    }
    try {
      await sb.from('rental_bookings').insert({
        business_id: businessId,
        car_id: carIds['Toyota Camry'],
        customer_name: 'Blocked Customer',
        customer_phone: '500000000',
        customer_email: 'blocked@example.com',
        pickup_location_id: locationId,
        dropoff_location_id: locationId,
        pickup_at: `${pickupDate.iso}T20:00:00+02:00`,
        dropoff_at: `${returnDate.iso}T21:00:00+02:00`,
        status: 'confirmed',
        total_price: 480,
        updated_at: new Date().toISOString(),
      })

      await send(`yes, i want to rent a car tomorrow until ${returnDate.short}`, 'dates')
      const combined = await send('pick at 20:00 return at 21:00, yes i will use that location for both pickup and drop-off', 'times-location')
      expect(combined.debug?.confirmedSlots?.pickup_datetime).toBe(`${pickupDate.iso}T20:00:00+02:00`)
      expect(combined.debug?.confirmedSlots?.return_datetime).toBe(`${returnDate.iso}T21:00:00+02:00`)
      expect(combined.debug?.confirmedSlots?.pickup_location_id).toBe(locationId)
      expect(combined.debug?.confirmedSlots?.dropoff_location_id).toBe(locationId)
      expect(combined.reply).not.toMatch(/still need the drop-off|drop-off location before/i)

      const fleet = await send('im looking for economical car', 'economy')
      expect(fleet.reply).toContain('Skoda Superb')
      expect(fleet.reply).toContain('Toyota Corolla')
      expect(fleet.reply).not.toContain('Toyota Camry')

      const selected = await send('i will go with the skoda', 'skoda')
      expect(selected.debug?.confirmedSlots?.selected_vehicle).toBe('Skoda Superb')
      expect(selected.debug?.operationalTools?.some(tool => tool.tool === 'checkAvailability' && tool.ok)).toBe(true)

      const name = await send('Macin', 'name')
      expect(name.debug?.confirmedSlots?.name).toBe('Macin')
      const phone = await send('666 666 676', 'phone')
      expect(phone.debug?.confirmedSlots?.phone).toBe('666 666 676')
      const email = await send('macin@gmail.com', 'email')
      expect(email.debug?.confirmedSlots?.email).toBe('macin@gmail.com')
      expect(email.reply).toMatch(/Would you like me to create the booking request/i)

      const booking = await send('yes please', 'confirm')
      expect(booking.reply).toMatch(/Your booking request has been created successfully\. Reference: RB-/)
      expect(booking.reply).not.toMatch(/Your booking is confirmed/i)
      expect(booking.debug?.operationalTools?.filter(tool => tool.tool === 'createBooking' && tool.ok)).toHaveLength(1)

      const { data: rows } = await sb
        .from('rental_bookings')
        .select('id,status,car_id,pickup_location_id,dropoff_location_id,pickup_at,dropoff_at')
        .eq('business_id', businessId)
        .eq('customer_email', 'macin@gmail.com')
      expect(rows).toHaveLength(1)
      expect(rows?.[0]?.status).toBe('pending')
      expect(rows?.[0]?.car_id).toBe(carIds['Skoda Superb'])
      expect(rows?.[0]?.pickup_location_id).toBe(locationId)
      expect(rows?.[0]?.dropoff_location_id).toBe(locationId)
      expect(booking.reply).toContain('Skoda Superb is requested')
    } finally {
      await cleanupTestAiBusiness(sb, businessId)
    }
  })

  test('AI resume reconciles handover state, contextual confirmations, budget preference, and pending booking contract', async () => {
    const { sb, businessId, locationId } = await createGeminiCarRentalBusiness({ aiAutoRepliesEnabled: true, liveChatEnabled: true })
    let conversationId: string | undefined
    const pickupDate = warsawDateOffset(1)
    const returnDate = warsawDateOffset(8)
    async function send(message: string, suffix: string, responses: Array<Record<string, unknown>> = [
      { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Runtime fallback should not dominate this rental workflow.' }] } }] },
    ]) {
      const { response } = await postChatRouteWithMockedGemini({
        business_id: businessId,
        conversation_id: conversationId,
        message,
        debug: true,
        test_ai: false,
        turn_id: `handover-resume-${suffix}`,
        client_message_id: `handover-resume-client-${suffix}`,
      }, responses)
      const body = await response.json() as {
        reply?: string
        conversation_id?: string
        debug?: { confirmedSlots?: Record<string, unknown>; operationalTools?: Array<{ tool: string; ok: boolean }> }
      }
      expect(response.status).toBe(200)
      conversationId = body.conversation_id
      expect(body.reply ?? '').not.toMatch(/pickup date and time should I use|return date and time should I use/i)
      expect(body.reply ?? '').not.toMatch(/Our team will contact you shortly|Please hold on|Let me check the availability/i)
      return body
    }
    try {
      await send(`id like to rent a car tomorrow until ${returnDate.short}`, 'dates')
      const times = await send('21:00 and return at 22:00', 'times')
      expect(times.debug?.confirmedSlots?.pickup_datetime).toBe(`${pickupDate.iso}T21:00:00+02:00`)
      expect(times.debug?.confirmedSlots?.return_datetime).toBe(`${returnDate.iso}T22:00:00+02:00`)

      const locations = await send('what locations do you have', 'locations')
      expect(locations.reply).toContain('Bocheńska 2a')

      const acceptLocation = await send('yes please', 'accept-location', [
        geminiSemanticResponse({
          intent: 'UPDATE_RENTAL_DETAILS',
          state_patch: {},
          relations: [{ type: 'SAME_LOCATION', fields: ['pickup_location', 'dropoff_location'] }],
          references: [{ expression: 'yes please', resolved_to: 'last_offered_location' }],
          corrections: [],
          question: null,
          confirmation: 'yes',
          confidence: 0.97,
        }),
        geminiTextResponse('Perfect, I will use the configured location for pickup and return.'),
      ])
      expect(acceptLocation.debug?.confirmedSlots?.pickup_location_id).toBe(locationId)
      expect(acceptLocation.debug?.confirmedSlots?.dropoff_location_id).toBe(locationId)

      const { data: conversationBeforeHandover } = await sb.from('conversations').select('metadata').eq('id', conversationId).single()
      const metadataBeforeHandover = conversationBeforeHandover?.metadata as Record<string, unknown>
      const agentStateBeforeHandover = metadataBeforeHandover.agent_state as Record<string, unknown>
      await sb.from('conversations').update({
        status: 'live_chat',
        metadata: {
          ...metadataBeforeHandover,
          agent_state: {
            ...agentStateBeforeHandover,
            handover_started_at: new Date().toISOString(),
          },
        },
      }).eq('id', conversationId).eq('business_id', businessId)
      await sb.from('messages').insert([
        {
          conversation_id: conversationId,
          business_id: businessId,
          role: 'assistant',
          content: 'Staff greeting with no operational change.',
          metadata: { sender_type: 'human', delivery_status: 'delivered' },
        },
        {
          conversation_id: conversationId,
          business_id: businessId,
          role: 'user',
          content: 'hi',
          metadata: { sender_type: 'customer', delivery_status: 'delivered' },
        },
      ])
      const { data: conversationDuringHandover } = await sb.from('conversations').select('metadata').eq('id', conversationId).single()
      const metadataDuringHandover = conversationDuringHandover?.metadata as Record<string, unknown>
      const agentStateDuringHandover = metadataDuringHandover.agent_state as Record<string, unknown>
      await sb.from('conversations').update({
        status: 'ai_active',
        metadata: {
          ...metadataDuringHandover,
          agent_state: {
            ...agentStateDuringHandover,
            handover_resumed_at: new Date().toISOString(),
          },
        },
      }).eq('id', conversationId).eq('business_id', businessId)

      const budgetTrace = await captureAgentTrace(async () => {
        return await send('i want a car without breaking the bank', 'budget', [
          geminiSemanticResponse({
            intent: 'ASK_AVAILABLE_VEHICLES_BY_CLASS',
            state_patch: { car_class: 'economy' },
            relations: [],
            references: [{ expression: 'without breaking the bank', resolved_to: 'lowest_price_candidate', field: 'selected_vehicle' }],
            corrections: [],
            question: null,
            confirmation: null,
            confidence: 0.94,
          }),
          geminiTextResponse('These verified economy options are available for your saved rental period.'),
        ])
      })
      const budget = budgetTrace.result as Awaited<ReturnType<typeof send>>
      expect(budget.debug?.confirmedSlots?.pickup_datetime).toBe(`${pickupDate.iso}T21:00:00+02:00`)
      expect(budget.debug?.confirmedSlots?.return_datetime).toBe(`${returnDate.iso}T22:00:00+02:00`)
      expect(budget.debug?.confirmedSlots?.pickup_location_id).toBe(locationId)
      expect(budget.debug?.confirmedSlots?.dropoff_location_id).toBe(locationId)
      expect(budget.reply).toMatch(/Toyota Corolla|Skoda Superb|available/i)
      expect(budget.reply).not.toMatch(/what pickup date|what return date/i)
      expect(budgetTrace.traces.some(trace => trace.event === 'rental_resume_reconciliation_started')).toBe(true)
      expect(budgetTrace.traces.some(trace => trace.event === 'rental_resume_reconciliation_completed')).toBe(true)

      const select = await send("i'll take the cheaper one", 'cheaper-one', [
        geminiSemanticResponse({
          intent: 'SELECT_VEHICLE',
          state_patch: {},
          relations: [],
          references: [{ expression: 'the cheaper one', resolved_to: 'lowest_price_candidate', field: 'selected_vehicle' }],
          corrections: [{ field: 'selected_vehicle', operation: 'REPLACE' }],
          question: null,
          confirmation: null,
          confidence: 0.95,
        }),
        geminiTextResponse('The lowest-priced verified option is selected.'),
      ])
      expect(select.debug?.confirmedSlots?.selected_vehicle).toBe('Toyota Corolla')

      await send('Whitney', 'name')
      await send('554 222 000', 'phone')
      const email = await send('whitney@apple.com', 'email')
      expect(email.reply).toMatch(/Would you like me to create the booking request/i)

      const booking = await send('yes please', 'confirm')
      expect(booking.reply).toMatch(/Your booking request has been created successfully\. Reference: RB-/)
      expect(booking.reply).not.toMatch(/Your booking is confirmed|team will contact you/i)
      expect(booking.debug?.operationalTools?.filter(tool => tool.tool === 'createBooking' && tool.ok)).toHaveLength(1)
      const { data: rows } = await sb
        .from('rental_bookings')
        .select('id,status')
        .eq('business_id', businessId)
        .eq('customer_email', 'whitney@apple.com')
      expect(rows).toHaveLength(1)
      expect(rows?.[0]?.status).toBe('pending')
    } finally {
      await cleanupTestAiBusiness(sb, businessId)
    }
  })

  test('rental semantic traces record LLM SAME_AS relations without raw customer text', async () => {
    const { sb, businessId, locationId } = await createGeminiCarRentalBusiness({ aiAutoRepliesEnabled: true, liveChatEnabled: true })
    try {
      const conversationId = await createRentalConversationWithAgentState(sb, businessId, {
        pickup_location: 'Kraków Bocheńska 2a',
        pickup_location_id: locationId,
        pickup_datetime: '2026-07-09T20:00:00+02:00',
        return_datetime: '2026-07-12T21:00:00+02:00',
      }, ['Would you like to use Bocheńska 2a for both pickup and drop-off?'])

      const { traces } = await captureAgentTrace(async () => {
        const { response } = await postChatRouteWithMockedGemini({
          business_id: businessId,
          conversation_id: conversationId,
          message: "wherever i collect the car from is where you'll get it back",
          debug: true,
          turn_id: 'trace-same-as-turn',
          client_message_id: 'trace-same-as-client',
        }, [
          geminiSemanticResponse({
            intent: 'UPDATE_RENTAL_DETAILS',
            state_patch: {},
            relations: [{ type: 'SAME_AS', source: 'pickup_location', target: 'dropoff_location' }],
            references: [{ expression: 'wherever i collect the car from', resolved_to: 'pickup_location', field: 'dropoff_location' }],
            corrections: [],
            question: null,
            confirmation: null,
            confidence: 0.98,
          }),
          geminiTextResponse('Perfect, pickup and return will use the configured location. What type of car would you like?'),
        ])
        expect(response.status).toBe(200)
      })

      const semantic = traces.find(trace => trace.event === 'rental_semantic_interpretation')
      expect(semantic?.semantic_source).toBe('llm')
      expect(semantic?.fallback_used).toBe(false)
      expect(semantic?.semantic_parse_success).toBe(true)
      expect(semantic?.relations).toContainEqual({ type: 'SAME_AS', source: 'pickup_location', target: 'dropoff_location' })
      expect(JSON.stringify(semantic)).not.toContain('wherever i collect')
    } finally {
      await cleanupTestAiBusiness(sb, businessId)
    }
  })

  test('rental semantic traces record lowest-price references structurally', async () => {
    const { sb, businessId } = await createGeminiCarRentalBusiness({ aiAutoRepliesEnabled: true, liveChatEnabled: true })
    try {
      const conversationId = await createRentalConversationWithAgentState(sb, businessId, {
        pickup_datetime: '2026-07-09T20:00:00+02:00',
        return_datetime: '2026-07-12T21:00:00+02:00',
      }, ['Available cars: Skoda Superb, Toyota Corolla, Toyota Camry.'])

      const { traces } = await captureAgentTrace(async () => {
        const { response } = await postChatRouteWithMockedGemini({
          business_id: businessId,
          conversation_id: conversationId,
          message: 'give me whichever hurts the wallet less',
          debug: true,
          turn_id: 'trace-lowest-price-turn',
          client_message_id: 'trace-lowest-price-client',
        }, [
          geminiSemanticResponse({
            intent: 'SELECT_VEHICLE',
            state_patch: {},
            relations: [],
            references: [{ expression: 'whichever hurts the wallet less', resolved_to: 'lowest_price_candidate', field: 'selected_vehicle' }],
            corrections: [{ field: 'selected_vehicle', operation: 'REPLACE' }],
            question: null,
            confirmation: null,
            confidence: 0.93,
          }),
          geminiTextResponse('I will use the lowest-priced available option from the verified list.'),
        ])
        expect(response.status).toBe(200)
      })

      const semantic = traces.find(trace => trace.event === 'rental_semantic_interpretation')
      expect(semantic?.semantic_source).toBe('llm')
      expect(semantic?.fallback_used).toBe(false)
      expect(semantic?.references).toContainEqual({ resolved_to: 'lowest_price_candidate', field: 'selected_vehicle' })
      expect(semantic?.correction_fields).toContain('selected_vehicle')
      expect(JSON.stringify(semantic)).not.toContain('wallet')
    } finally {
      await cleanupTestAiBusiness(sb, businessId)
    }
  })

  test('rental semantic traces distinguish provider fallback and JSON parse fallback', async () => {
    const { sb, businessId } = await createGeminiCarRentalBusiness({ aiAutoRepliesEnabled: true, liveChatEnabled: true })
    try {
      const firstConversationId = await createRentalConversationWithAgentState(sb, businessId, {
        pickup_datetime: '2026-07-09T20:00:00+02:00',
      })
      const first = await captureAgentTrace(async () => {
        const { response } = await postChatRouteWithMockedGemini({
          business_id: businessId,
          conversation_id: firstConversationId,
          message: 'same again',
          debug: true,
          turn_id: 'trace-provider-fallback-turn',
          client_message_id: 'trace-provider-fallback-client',
        }, [
          geminiTextResponse('{"intent":', 'MAX_TOKENS'),
        ])
        expect(response.status).toBe(200)
      })
      const providerFallback = first.traces.find(trace => trace.event === 'rental_semantic_interpretation')
      expect(providerFallback?.semantic_source).toBe('legacy_fallback')
      expect(providerFallback?.fallback_used).toBe(true)
      expect(providerFallback?.fallback_reason).toBe('SEMANTIC_RETRY_EXHAUSTED')
      expect(providerFallback?.fallback_reason_detail).toBe('MAX_TOKENS')
      expect(providerFallback?.semantic_retry_used).toBe(true)
      expect(providerFallback?.semantic_parse_success).toBe(false)

      const secondConversationId = await createRentalConversationWithAgentState(sb, businessId, {
        pickup_datetime: '2026-07-09T20:00:00+02:00',
      })
      const second = await captureAgentTrace(async () => {
        const { response } = await postChatRouteWithMockedGemini({
          business_id: businessId,
          conversation_id: secondConversationId,
          message: 'make it clear',
          debug: true,
          turn_id: 'trace-json-fallback-turn',
          client_message_id: 'trace-json-fallback-client',
        }, [
          geminiTextResponse('not json'),
        ])
        const body = await response.json() as { reply?: string }
        expect(response.status).toBe(200)
        expect(body.reply ?? '').not.toMatch(/json|parse|provider|failed|error/i)
      })
      const jsonFallback = second.traces.find(trace => trace.event === 'rental_semantic_interpretation')
      expect(jsonFallback?.semantic_source).toBe('legacy_fallback')
      expect(jsonFallback?.fallback_used).toBe(true)
      expect(jsonFallback?.fallback_reason).toBe('JSON_PARSE_FAILED')
      expect(jsonFallback?.semantic_retry_used).toBe(true)
      expect(jsonFallback?.semantic_parse_success).toBe(false)
    } finally {
      await cleanupTestAiBusiness(sb, businessId)
    }
  })

  test('GPT-4o semantic interpreter handles contextual location confirmation and budget preference without legacy fallback', async () => {
    const { sb, businessId, locationId } = await createGeminiCarRentalBusiness({ aiAutoRepliesEnabled: true, liveChatEnabled: true })
    try {
      await sb.from('agents').update({ model: 'gpt-4o' }).eq('business_id', businessId)

      let conversationId: string | undefined
      const first = await captureAgentTrace(async () => {
        const { response } = await postChatRouteWithMockedOpenAI({
          business_id: businessId,
          message: 'sup bro i need wheels from tonight until the 16th',
          debug: true,
          turn_id: 'gpt-semantic-date-turn',
          client_message_id: 'gpt-semantic-date-client',
        }, [
          openAiSemanticResponse({
            intent: 'UPDATE_RENTAL_DETAILS',
            state_patch: { pickup_date: '2026-07-10', return_date: '2026-07-16' },
            relations: [],
            references: [],
            corrections: [],
            question: null,
            confirmation: null,
            confidence: 0.92,
          }),
          openAiTextResponse('Sure, what pickup time and return time should I use?'),
        ])
        const body = await response.json() as { conversation_id?: string; debug?: { confirmedSlots?: Record<string, unknown> } }
        expect(response.status).toBe(200)
        conversationId = body.conversation_id
        expect(body.debug?.confirmedSlots?.pickup_date).toBe('2026-07-10')
        expect(body.debug?.confirmedSlots?.return_date).toBe('2026-07-16')
      })
      expect(first.traces.find(trace => trace.event === 'rental_semantic_interpretation')?.semantic_source).toBe('llm')
      expect(first.traces.find(trace => trace.event === 'rental_semantic_interpretation')?.fallback_used).toBe(false)

      const second = await captureAgentTrace(async () => {
        const { response } = await postChatRouteWithMockedOpenAI({
          business_id: businessId,
          conversation_id: conversationId,
          message: 'pick up at 20:00, what location do you have in krakow',
          debug: true,
          turn_id: 'gpt-semantic-location-turn',
          client_message_id: 'gpt-semantic-location-client',
        }, [
          openAiSemanticResponse({
            intent: 'ASK_LOCATION',
            state_patch: { pickup_time: '20:00' },
            relations: [],
            references: [],
            corrections: [],
            question: 'location',
            confirmation: null,
            confidence: 0.94,
          }),
          openAiTextResponse('We currently offer pickup at Kraków Bocheńska 2a. Would you like me to use it for both pickup and drop-off?'),
        ])
        const body = await response.json() as { debug?: { confirmedSlots?: Record<string, unknown> } }
        expect(response.status).toBe(200)
        expect(body.debug?.confirmedSlots?.pickup_datetime).toBe('2026-07-10T20:00:00+02:00')
      })
      expect(second.traces.find(trace => trace.event === 'rental_semantic_interpretation')?.intent).toBe('ASK_LOCATION')

      const third = await captureAgentTrace(async () => {
        const { response } = await postChatRouteWithMockedOpenAI({
          business_id: businessId,
          conversation_id: conversationId,
          message: 'yes please',
          debug: true,
          turn_id: 'gpt-semantic-confirm-location-turn',
          client_message_id: 'gpt-semantic-confirm-location-client',
        }, [
          openAiSemanticResponse({
            intent: 'UPDATE_RENTAL_DETAILS',
            state_patch: {},
            relations: [{ type: 'SAME_LOCATION', fields: ['pickup_location', 'dropoff_location'] }],
            references: [{ resolved_to: 'last_offered_location', field: 'pickup_location' }],
            corrections: [],
            question: null,
            confirmation: 'yes',
            confidence: 0.97,
          }),
          openAiTextResponse('Perfect, I will use Bocheńska 2a for both pickup and drop-off. What return time should I use?'),
        ])
        const body = await response.json() as { debug?: { confirmedSlots?: Record<string, unknown> } }
        expect(response.status).toBe(200)
        expect(body.debug?.confirmedSlots?.pickup_location_id).toBe(locationId)
        expect(body.debug?.confirmedSlots?.dropoff_location_id).toBe(locationId)
        expect(body.debug?.confirmedSlots?.pickup_datetime).toBe('2026-07-10T20:00:00+02:00')
        expect(body.debug?.confirmedSlots?.return_date).toBe('2026-07-16')
      })
      const confirmSemantic = third.traces.find(trace => trace.event === 'rental_semantic_interpretation')
      expect(confirmSemantic?.semantic_source).toBe('llm')
      expect(confirmSemantic?.fallback_used).toBe(false)
      expect(confirmSemantic?.confirmation).toBe('yes')
      expect(confirmSemantic?.relations).toContainEqual({ type: 'SAME_LOCATION', fields: ['pickup_location', 'dropoff_location'] })

      const fourth = await captureAgentTrace(async () => {
        const { response } = await postChatRouteWithMockedOpenAI({
          business_id: businessId,
          conversation_id: conversationId,
          message: 'preferably economical i dont have much money tbh',
          debug: true,
          turn_id: 'gpt-semantic-budget-turn',
          client_message_id: 'gpt-semantic-budget-client',
        }, [
          openAiSemanticResponse({
            intent: 'ASK_AVAILABLE_VEHICLES_BY_CLASS',
            state_patch: { car_class: 'Economy' },
            relations: [],
            references: [{ resolved_to: 'lowest_price_candidate', field: 'selected_vehicle' }],
            corrections: [],
            question: null,
            confirmation: null,
            confidence: 0.93,
          }),
          openAiTextResponse('I have the budget preference. What return time should I use for the 16th?'),
        ])
        const body = await response.json() as { reply?: string; debug?: { confirmedSlots?: Record<string, unknown> } }
        expect(response.status).toBe(200)
        expect(body.debug?.confirmedSlots?.pickup_datetime).toBe('2026-07-10T20:00:00+02:00')
        expect(body.debug?.confirmedSlots?.return_date).toBe('2026-07-16')
        expect(body.reply ?? '').not.toMatch(/pickup date|pickup.*time.*return.*time/i)
      })
      const budgetSemantic = fourth.traces.find(trace => trace.event === 'rental_semantic_interpretation')
      expect(budgetSemantic?.semantic_source).toBe('llm')
      expect(budgetSemantic?.fallback_used).toBe(false)
      expect(budgetSemantic?.references).toContainEqual({ resolved_to: 'lowest_price_candidate', field: 'selected_vehicle' })
    } finally {
      await cleanupTestAiBusiness(sb, businessId)
    }
  })

  test('GPT-4o semantic interpreter retries invalid JSON or schema before legacy fallback', async () => {
    const { sb, businessId } = await createGeminiCarRentalBusiness({ aiAutoRepliesEnabled: true, liveChatEnabled: true })
    try {
      await sb.from('agents').update({ model: 'gpt-4o' }).eq('business_id', businessId)
      const jsonRetry = await captureAgentTrace(async () => {
        const { response } = await postChatRouteWithMockedOpenAI({
          business_id: businessId,
          message: 'wherever you hand me the keys is where you will get the car back',
          debug: true,
          turn_id: 'gpt-semantic-json-retry-turn',
          client_message_id: 'gpt-semantic-json-retry-client',
        }, [
          openAiTextResponse('not json'),
          openAiSemanticResponse({
            intent: 'UPDATE_RENTAL_DETAILS',
            state_patch: {},
            relations: [{ type: 'SAME_AS', source: 'pickup_location', target: 'dropoff_location' }],
            references: [],
            corrections: [],
            confirmation: null,
            confidence: 0.94,
          }),
          openAiTextResponse('Got it. Which pickup location should I use?'),
        ])
        expect(response.status).toBe(200)
      })
      const jsonSemantic = jsonRetry.traces.find(trace => trace.event === 'rental_semantic_interpretation')
      expect(jsonSemantic?.semantic_source).toBe('llm')
      expect(jsonSemantic?.fallback_used).toBe(false)
      expect(jsonSemantic?.semantic_retry_used).toBe(true)

      const schemaRetry = await captureAgentTrace(async () => {
        const { response } = await postChatRouteWithMockedOpenAI({
          business_id: businessId,
          message: 'ill take the camry',
          debug: true,
          turn_id: 'gpt-semantic-schema-retry-turn',
          client_message_id: 'gpt-semantic-schema-retry-client',
        }, [
          openAiSemanticResponse({ intent: 'PICK_RANDOM_CAR', relations: [], references: [], corrections: [], confirmation: null, confidence: 0.8 }),
          openAiSemanticResponse({
            intent: 'SELECT_VEHICLE',
            state_patch: { selected_vehicle_name: 'Toyota Camry' },
            relations: [],
            references: [],
            corrections: [{ field: 'selected_vehicle', operation: 'SET' }],
            confirmation: null,
            confidence: 0.96,
          }),
          openAiTextResponse('I have selected the Toyota Camry. What return time should I use?'),
        ])
        const body = await response.json() as { debug?: { confirmedSlots?: Record<string, unknown> } }
        expect(response.status).toBe(200)
        expect(body.debug?.confirmedSlots?.selected_vehicle).toBe('Toyota Camry')
      })
      const schemaSemantic = schemaRetry.traces.find(trace => trace.event === 'rental_semantic_interpretation')
      expect(schemaSemantic?.semantic_source).toBe('llm')
      expect(schemaSemantic?.fallback_used).toBe(false)
      expect(schemaSemantic?.semantic_retry_used).toBe(true)
    } finally {
      await cleanupTestAiBusiness(sb, businessId)
    }
  })

  test('agent trace data redaction removes raw message and prompt payload fields', () => {
    const compacted = compactTraceData({
      message: 'Customer raw message',
      prompt: 'Full provider prompt',
      content: 'Assistant raw content',
      intent: 'UPDATE_RENTAL_DETAILS',
      changed_fields: ['name', 'phone', 'email'],
      relations: [{ type: 'SAME_AS', source: 'pickup_location', target: 'dropoff_location' }],
    })
    expect(compacted).toEqual({
      intent: 'UPDATE_RENTAL_DETAILS',
      changed_fields: ['name', 'phone', 'email'],
      relations: [{ type: 'SAME_AS', source: 'pickup_location', target: 'dropoff_location' }],
    })
  })

  test('agent traces API scopes bot filters to the authenticated business', async ({ request }) => {
    const businessA = await createGeminiCarRentalBusiness({ aiAutoRepliesEnabled: true, liveChatEnabled: true })
    const businessB = await createGeminiCarRentalBusiness({ aiAutoRepliesEnabled: true, liveChatEnabled: true })
    const memberId = crypto.randomUUID()
    try {
      await businessA.sb.from('team_members').insert({
        id: memberId,
        client_id: businessA.businessId,
        name: 'Trace Inspector',
        email: `trace-${memberId}@example.com`,
        role: 'owner',
        status: 'active',
      })
      const token = await signMemberToken({ id: memberId, name: 'Trace Inspector', role: 'owner' })
      const headers = { cookie: `${MEMBER_COOKIE_NAME}=${token}` }
      const { data: ownBot } = await businessA.sb.from('agents').select('id').eq('business_id', businessA.businessId).single()
      const { data: foreignBot } = await businessB.sb.from('agents').select('id').eq('business_id', businessB.businessId).single()

      const own = await request.get(`/api/agent-traces?bot_id=${ownBot?.id}`, { headers })
      expect(own.status()).toBe(200)
      const ownBody = await own.json() as { bots?: Array<{ id: string }>; traces?: Array<{ business_id: string; bot_id: string }>; migration_required?: boolean }
      expect(ownBody.bots?.map(bot => bot.id)).toContain(ownBot?.id)
      expect(ownBody.bots?.map(bot => bot.id)).not.toContain(foreignBot?.id)
      expect((ownBody.traces ?? []).every(trace => trace.business_id === businessA.businessId && trace.bot_id === ownBot?.id)).toBe(true)

      const foreign = await request.get(`/api/agent-traces?bot_id=${foreignBot?.id}`, { headers })
      expect(foreign.status()).toBe(404)
    } finally {
      await businessA.sb.from('team_members').delete().eq('id', memberId)
      await cleanupTestAiBusiness(businessA.sb, businessA.businessId)
      await cleanupTestAiBusiness(businessB.sb, businessB.businessId)
    }
  })

  test('duplicate client message and turn ids resolve to one persisted user and assistant row', async () => {
    const { sb, businessId } = await createGeminiTestAiBusiness({ aiAutoRepliesEnabled: true, liveChatEnabled: true })
    try {
      const first = await postChatRouteWithMockedGemini({
        business_id: businessId,
        message: 'Please answer once.',
        debug: true,
        test_ai: false,
        turn_id: 'duplicate-turn-id',
        client_message_id: 'duplicate-client-message-id',
      }, [
        { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'One persisted assistant reply.' }] } }] },
      ])
      const firstBody = await first.response.json() as { conversation_id?: string; user_message?: { id?: string }; assistant_message?: { id?: string } }
      expect(first.response.status).toBe(200)
      expect(firstBody.conversation_id).toBeTruthy()

      const second = await postChatRouteWithMockedGemini({
        business_id: businessId,
        conversation_id: firstBody.conversation_id,
        message: 'Please answer once.',
        debug: true,
        test_ai: false,
        turn_id: 'duplicate-turn-id',
        client_message_id: 'duplicate-client-message-id',
      }, [
        { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'This duplicate should not be inserted.' }] } }] },
      ])
      const secondBody = await second.response.json() as { user_message?: { id?: string }; assistant_message?: { id?: string } }
      expect(second.response.status).toBe(200)
      expect(secondBody.user_message?.id).toBe(firstBody.user_message?.id)
      expect(secondBody.assistant_message?.id).toBe(firstBody.assistant_message?.id)

      const { data: rows } = await sb
        .from('messages')
        .select('id,role,content,metadata')
        .eq('conversation_id', firstBody.conversation_id)
        .order('created_at', { ascending: true })
      expect((rows ?? []).filter(row => row.role === 'user')).toHaveLength(1)
      expect((rows ?? []).filter(row => row.role === 'assistant')).toHaveLength(1)
      expect((rows ?? []).find(row => row.role === 'assistant')?.content).toBe('One persisted assistant reply.')
    } finally {
      await cleanupTestAiBusiness(sb, businessId)
    }
  })

  test('Test AI creates a default active agent when none exists for the current business', async () => {
    const { sb, businessId } = await createTestAiBusinessWithoutAgent({ aiAutoRepliesEnabled: false, liveChatEnabled: true })

    try {
      const response = await postChatRouteWithMissingOpenAi({
        business_id: businessId,
        message: 'Use the default agent for Test AI.',
        debug: true,
        test_ai: true,
      })
      const body = await response.json() as { error?: string }

      expect(response.status).toBe(500)
      expect(body.error).toBe(MISSING_OPENAI_KEY_MESSAGE)

      const { data: agent, error } = await sb
        .from('agents')
        .select('business_id, name, active')
        .eq('business_id', businessId)
        .eq('active', true)
        .maybeSingle()
      expect(error).toBeNull()
      expect(agent?.business_id).toBe(businessId)
      expect(agent?.name).toBe('AI Assistant')
      expect(agent?.active).toBe(true)
    } finally {
      await cleanupTestAiBusiness(sb, businessId)
    }
  })

  test('Test AI reactivates an existing inactive agent instead of reporting no active agent', async () => {
    const { sb, businessId } = await createTestAiBusinessWithInactiveAgent({ aiAutoRepliesEnabled: true, liveChatEnabled: true })

    try {
      const response = await postChatRouteWithMissingOpenAi({
        business_id: businessId,
        message: 'Reactivate the existing Test AI agent.',
        debug: true,
        test_ai: true,
      })
      const body = await response.json() as { error?: string }

      expect(response.status).toBe(500)
      expect(body.error).toBe(MISSING_OPENAI_KEY_MESSAGE)

      const { data: agents, error } = await sb
        .from('agents')
        .select('name, active')
        .eq('business_id', businessId)
      expect(error).toBeNull()
      expect(agents).toHaveLength(1)
      expect(agents?.[0]?.name).toBe('QA Inactive Test Agent')
      expect(agents?.[0]?.active).toBe(true)
    } finally {
      await cleanupTestAiBusiness(sb, businessId)
    }
  })
})
