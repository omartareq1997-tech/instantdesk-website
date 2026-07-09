import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { expect, test } from './fixtures'
import { POST as postChat } from '../app/api/chat/route'
import { GET as getWidgetConfig } from '../app/api/live-chat/widget/config/route'
import { GET as getConversationDebug } from '../app/api/debug/conversation-resolution/route'
import { resolveBotContext } from '../app/lib/bot-context'

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
      expect(body.reply).toContain('I have the conversation details saved')
      expect(body.reply).not.toBe('Your')
      expect(body.reply).not.toBe('The reply is still')
      const { data: assistants } = await sb.from('messages').select('id,content').eq('conversation_id', body.conversation_id).eq('role', 'assistant')
      expect(assistants).toHaveLength(1)
      expect(assistants?.[0]?.content).toBe(body.reply)
    } finally {
      await cleanupTestAiBusiness(sb, businessId)
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
