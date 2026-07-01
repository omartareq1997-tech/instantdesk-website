import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { expect, test } from './fixtures'
import { POST as postChat } from '../app/api/chat/route'

const BUSINESS_ID = '0616a47a-2c01-49ce-a798-385f8276b92b'
const MISSING_OPENAI_KEY_MESSAGE = 'OPENAI_API_KEY is missing. Add it in Vercel Environment Variables and redeploy.'

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
