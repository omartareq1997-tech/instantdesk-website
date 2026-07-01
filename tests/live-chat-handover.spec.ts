import { createClient } from '@supabase/supabase-js'
import { expect, test } from './fixtures'
import { MEMBER_COOKIE_NAME, signMemberToken } from '../app/lib/auth'

process.loadEnvFile?.('.env.local')

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env for handover QA')
  return createClient(url, key, { auth: { persistSession: false } })
}

test('human handover persists a linked lead and avoids duplicate leads on follow-up', async ({ request }) => {
  const sb = adminClient()
  const businessId = crypto.randomUUID()
  let conversationId: string | null = null

  try {
    await sb.from('businesses').insert({ id: businessId, name: 'QA Handover Business' })
    await sb.from('agents').insert({
      business_id: businessId,
      name: 'QA Handover Agent',
      active: true,
      persona: 'You are a handover QA assistant.',
      objective: 'Capture leads and hand over.',
      tone: 'professional',
      fallback_msg: 'I will connect you with a human.',
      model: 'gpt-4o-mini',
      temperature: 0.2,
    })
    await sb.from('live_chat_settings').insert({
      business_id: businessId,
      ai_auto_replies_enabled: true,
      live_chat_enabled: true,
      human_handover_enabled: true,
      trigger_customer_asks_human: true,
      trigger_ai_cannot_answer: true,
      trigger_phrases: ['human', 'agent'],
    })

    const first = await request.post('/api/chat', {
      data: {
        business_id: businessId,
        message: 'Please get a human. My name is Handover Tester, email handover-qa@example.com, phone +15557654321. Company is Handover QA LLC. Notes: urgent billing question.',
      },
    })
    expect(first.ok()).toBeTruthy()
    const firstBody = await first.json() as { conversation_id: string; lead_id: string; status: string; handover: boolean }
    conversationId = firstBody.conversation_id
    expect(firstBody.handover).toBe(true)
    expect(firstBody.status).toBe('handover_requested')
    expect(firstBody.lead_id).toBeTruthy()

    const followUps = await Promise.all(
      Array.from({ length: 3 }, (_, i) => request.post('/api/chat', {
        data: {
          business_id: businessId,
          conversation_id: conversationId,
          message: `Follow-up detail ${i}: I am still waiting for the team.`,
        },
      })),
    )
    for (const response of followUps) expect(response.ok()).toBeTruthy()

    const [conversation, messages, leads, handoverEvents] = await Promise.all([
      sb.from('conversations').select('id,status,business_id,lead_name,lead_phone,lead_email').eq('id', conversationId).single(),
      sb.from('messages').select('id,role,content,created_at,metadata').eq('conversation_id', conversationId).order('created_at', { ascending: true }),
      sb.from('leads').select('id,conversation_id,name,email,phone,budget,metadata').eq('conversation_id', conversationId),
      sb.from('handover_events').select('id,event_type').eq('conversation_id', conversationId),
    ])

    expect(conversation.error).toBeNull()
    expect(conversation.data?.status).toBe('handover_requested')
    expect(messages.error).toBeNull()
    expect(messages.data?.length).toBeGreaterThanOrEqual(6)
    expect(messages.data?.filter(message => message.role === 'user')).toHaveLength(4)
    expect(leads.error).toBeNull()
    expect(leads.data).toHaveLength(1)
    expect(leads.data?.[0]?.name).toBe('Handover Tester')
    expect(leads.data?.[0]?.email).toBe('handover-qa@example.com')
    expect(leads.data?.[0]?.metadata?.company).toBe('Handover QA LLC')
    expect(leads.data?.[0]?.metadata?.notes).toBe('urgent billing question.')
    expect(leads.data?.[0]?.metadata?.budget).toBeUndefined()
    expect(handoverEvents.error).toBeNull()
    expect(handoverEvents.data?.some(event => event.event_type === 'handover_requested')).toBe(true)
  } finally {
    if (conversationId) {
      await sb.from('handover_events').delete().eq('conversation_id', conversationId)
      await sb.from('follow_ups').delete().eq('conversation_id', conversationId)
      await sb.from('lead_memory').delete().eq('conversation_id', conversationId)
      await sb.from('leads').delete().eq('conversation_id', conversationId)
      await sb.from('messages').delete().eq('conversation_id', conversationId)
      await sb.from('conversations').delete().eq('id', conversationId)
    }
    await sb.from('live_chat_settings').delete().eq('business_id', businessId)
    await sb.from('agents').delete().eq('business_id', businessId)
    await sb.from('businesses').delete().eq('id', businessId)
  }
})

test('human-only mode does not require an agent or AI response path', async ({ request }) => {
  const sb = adminClient()
  const businessId = crypto.randomUUID()
  const memberId = crypto.randomUUID()
  let conversationId: string | null = null

  try {
    await sb.from('businesses').insert({ id: businessId, name: 'QA Human Only Business' })
    await sb.from('team_members').insert({
      id: memberId,
      client_id: businessId,
      name: 'Human Agent',
      email: 'human-agent@example.com',
      role: 'owner',
      status: 'active',
    })
    await sb.from('live_chat_settings').insert({
      business_id: businessId,
      ai_auto_replies_enabled: false,
      live_chat_enabled: true,
      human_handover_enabled: true,
      trigger_customer_asks_human: true,
      trigger_ai_cannot_answer: true,
      trigger_phrases: ['human', 'agent'],
    })
    const token = await signMemberToken({ id: memberId, name: 'Human Agent', role: 'owner' })
    const authHeaders = { cookie: `${MEMBER_COOKIE_NAME}=${token}` }

    const settingsPatch = await request.patch('/api/live-chat/settings', {
      headers: authHeaders,
      data: {
        ai_auto_replies_enabled: false,
        live_chat_enabled: true,
        human_handover_enabled: true,
        trigger_ai_cannot_answer: true,
        trigger_customer_asks_human: true,
        trigger_phrases: ['human', 'agent'],
      },
    })
    expect(settingsPatch.ok()).toBeTruthy()
    const settingsBody = await settingsPatch.json() as {
      settings: {
        ai_auto_replies_enabled: boolean
        trigger_ai_cannot_answer: boolean
        trigger_customer_asks_human: boolean
      }
    }
    expect(settingsBody.settings.ai_auto_replies_enabled).toBe(false)
    expect(settingsBody.settings.trigger_ai_cannot_answer).toBe(false)
    expect(settingsBody.settings.trigger_customer_asks_human).toBe(false)

    const response = await request.post('/api/chat', {
      data: {
        business_id: businessId,
        message: 'My name is Human Only Tester, email human-only@example.com, phone +15558889999. Company is Human Only QA LLC. Notes: no AI should run.',
      },
    })
    expect(response.ok()).toBeTruthy()
    const body = await response.json() as {
      conversation_id: string
      reply: string | null
      status: string
      handover: boolean
      ai_reply_skipped: boolean
      lead_id: string
      error?: string
    }
    conversationId = body.conversation_id
    expect(body.error).toBeUndefined()
    expect(body.handover).toBe(true)
    expect(body.ai_reply_skipped).toBe(true)
    expect(body.reply).toBeNull()
    expect(body.status).toBe('handover_requested')
    expect(body.lead_id).toBeTruthy()

    for (const followUp of ['Second human-only customer message', 'Third human-only customer message']) {
      const followUpResponse = await request.post('/api/chat', {
        data: {
          business_id: businessId,
          conversation_id: conversationId,
          message: followUp,
        },
      })
      expect(followUpResponse.ok()).toBeTruthy()
      const followUpBody = await followUpResponse.json() as { reply: string | null; ai_reply_skipped: boolean }
      expect(followUpBody.ai_reply_skipped).toBe(true)
      expect(followUpBody.reply).toBeNull()
    }

    const [conversation, leads, messages, events, settings] = await Promise.all([
      sb.from('conversations').select('id,status,unread_count').eq('id', conversationId).single(),
      sb.from('leads').select('id,name,email,phone,budget,metadata').eq('conversation_id', conversationId),
      sb.from('messages').select('id,role,content,metadata').eq('conversation_id', conversationId).order('created_at', { ascending: true }),
      sb.from('handover_events').select('id,event_type').eq('conversation_id', conversationId),
      sb.from('live_chat_settings').select('ai_auto_replies_enabled,trigger_ai_cannot_answer,trigger_customer_asks_human').eq('business_id', businessId).single(),
    ])

    expect(conversation.error).toBeNull()
    expect(conversation.data?.status).toBe('handover_requested')
    expect(conversation.data?.unread_count).toBeGreaterThan(0)
    expect(leads.error).toBeNull()
    expect(leads.data).toHaveLength(1)
    expect(leads.data?.[0]?.name).toBe('Human Only Tester')
    expect(leads.data?.[0]?.metadata?.company).toBe('Human Only QA LLC')
    expect(leads.data?.[0]?.metadata?.budget).toBeUndefined()
    expect(messages.error).toBeNull()
    expect(messages.data?.filter(message => message.role === 'user')).toHaveLength(3)
    expect(messages.data?.filter(message => (
      message.role === 'assistant' &&
      message.content === 'I am handing this over to our team. Someone will reply as soon as possible.'
    ))).toHaveLength(0)
    expect(messages.data?.filter(message => message.metadata?.event_type === 'handover_requested')).toHaveLength(1)
    expect(events.error).toBeNull()
    expect(events.data?.some(event => event.event_type === 'handover_requested')).toBe(true)
    expect(settings.data?.ai_auto_replies_enabled).toBe(false)
    expect(settings.data?.trigger_ai_cannot_answer).toBe(false)
    expect(settings.data?.trigger_customer_asks_human).toBe(false)

    const takeOver = await request.patch(`/api/live-chat/conversations/${conversationId}/status`, {
      headers: authHeaders,
      data: { status: 'live_chat' },
    })
    expect(takeOver.ok()).toBeTruthy()

    let editableStaffMessageId = ''
    for (const text of ['Human agent reply delivered.', 'Second human staff reply.', 'Third human staff reply.']) {
      const humanReply = await request.post(`/api/live-chat/conversations/${conversationId}/messages`, {
        headers: authHeaders,
        data: { message: text },
      })
      expect(humanReply.ok()).toBeTruthy()
      if (!editableStaffMessageId) {
        const humanReplyBody = await humanReply.json() as { message: { id: string } }
        editableStaffMessageId = humanReplyBody.message.id
      }
    }

    const editStaffMessage = await request.patch(`/api/live-chat/conversations/${conversationId}/messages`, {
      headers: authHeaders,
      data: {
        message_id: editableStaffMessageId,
        message: 'Human agent reply delivered, with an edit.',
      },
    })
    expect(editStaffMessage.ok()).toBeTruthy()
    const editedBody = await editStaffMessage.json() as {
      message: { content: string; metadata?: { edited?: boolean; original_content?: string } }
    }
    expect(editedBody.message.content).toBe('Human agent reply delivered, with an edit.')
    expect(editedBody.message.metadata?.edited).toBe(true)
    expect(editedBody.message.metadata?.original_content).toBe('Human agent reply delivered.')

    const postReplyMessages = await sb
      .from('messages')
      .select('id,role,content,metadata')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
    expect(postReplyMessages.error).toBeNull()
    expect(postReplyMessages.data?.filter(message => message.metadata?.event_type === 'human_takeover')).toHaveLength(1)
    expect(postReplyMessages.data?.filter(message => message.metadata?.sender_type === 'human')).toHaveLength(3)

    const customerMessageId = postReplyMessages.data?.find(message => message.role === 'user')?.id
    expect(customerMessageId).toBeTruthy()
    const editCustomerMessage = await request.patch(`/api/live-chat/conversations/${conversationId}/messages`, {
      headers: authHeaders,
      data: {
        message_id: customerMessageId,
        message: 'Staff should not be able to edit this.',
      },
    })
    expect(editCustomerMessage.status()).toBe(403)

    const oldStaffMessageId = crypto.randomUUID()
    const oldStaffInsert = await sb.from('messages').insert({
      id: oldStaffMessageId,
      conversation_id: conversationId,
      business_id: businessId,
      role: 'assistant',
      content: 'Old staff reply.',
      created_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
      metadata: { sender_type: 'human', sender_name: 'Human Agent' },
    })
    expect(oldStaffInsert.error).toBeNull()
    const editOldStaffMessage = await request.patch(`/api/live-chat/conversations/${conversationId}/messages`, {
      headers: authHeaders,
      data: {
        message_id: oldStaffMessageId,
        message: 'Old staff reply edited too late.',
      },
    })
    expect(editOldStaffMessage.status()).toBe(403)

    const repeatedTakeOver = await request.patch(`/api/live-chat/conversations/${conversationId}/status`, {
      headers: authHeaders,
      data: { status: 'live_chat' },
    })
    expect(repeatedTakeOver.ok()).toBeTruthy()
    const afterRepeatedTakeover = await sb
      .from('messages')
      .select('id,metadata')
      .eq('conversation_id', conversationId)
    expect(afterRepeatedTakeover.data?.filter(message => message.metadata?.event_type === 'human_takeover')).toHaveLength(1)

    const widgetMessages = await request.get(`/api/live-chat/widget/messages?conversation_id=${conversationId}`)
    expect(widgetMessages.ok()).toBeTruthy()
    const widgetBody = await widgetMessages.json() as {
      status: string
      messages: { role: string; content: string; metadata?: { sender_type?: string } }[]
    }
    expect(widgetBody.status).toBe('live_chat')
    expect(widgetBody.messages.some(message => (
      message.content === 'Human agent reply delivered, with an edit.' &&
      message.metadata?.sender_type === 'human'
    ))).toBe(true)
  } finally {
    if (conversationId) {
      await sb.from('handover_events').delete().eq('conversation_id', conversationId)
      await sb.from('follow_ups').delete().eq('conversation_id', conversationId)
      await sb.from('lead_memory').delete().eq('conversation_id', conversationId)
      await sb.from('leads').delete().eq('conversation_id', conversationId)
      await sb.from('messages').delete().eq('conversation_id', conversationId)
      await sb.from('conversations').delete().eq('id', conversationId)
    }
    await sb.from('live_chat_settings').delete().eq('business_id', businessId)
    await sb.from('team_members').delete().eq('id', memberId)
    await sb.from('businesses').delete().eq('id', businessId)
  }
})

test('website customer name, takeover, and resolved state persist in dashboard', async ({ request, page, baseURL }) => {
  const sb = adminClient()
  const businessId = crypto.randomUUID()
  const memberId = crypto.randomUUID()
  let conversationId: string | null = null
  let customerId: string | null = null
  const email = `alex-${memberId}@example.com`

  try {
    await sb.from('businesses').insert({ id: businessId, name: 'QA Live Chat Regression Business' })
    await sb.from('team_members').insert({
      id: memberId,
      client_id: businessId,
      name: 'Regression Agent',
      email: `regression-agent-${memberId}@example.com`,
      role: 'owner',
      status: 'active',
    })
    await sb.from('live_chat_settings').insert({
      business_id: businessId,
      ai_auto_replies_enabled: false,
      live_chat_enabled: true,
      human_handover_enabled: true,
      trigger_customer_asks_human: false,
      trigger_ai_cannot_answer: false,
      trigger_phrases: ['human', 'agent'],
    })

    const token = await signMemberToken({ id: memberId, name: 'Regression Agent', role: 'owner' })
    const authHeaders = { cookie: `${MEMBER_COOKIE_NAME}=${token}` }
    await page.context().addCookies([{
      name: MEMBER_COOKIE_NAME,
      value: token,
      url: baseURL ?? 'http://127.0.0.1:3106',
      sameSite: 'Lax',
    }])

    const chat = await request.post('/api/chat', {
      data: {
        business_id: businessId,
        message: 'Hello, I need help from the team.',
      },
    })
    expect(chat.ok()).toBeTruthy()
    const chatBody = await chat.json() as { conversation_id: string; customer_id?: string | null }
    conversationId = chatBody.conversation_id
    customerId = chatBody.customer_id ?? null
    expect(customerId).toBeTruthy()

    const followUp = await request.post('/api/chat', {
      data: {
        business_id: businessId,
        conversation_id: conversationId,
        message: `My name is Alex, email ${email}, phone +15551234567.`,
      },
    })
    expect(followUp.ok()).toBeTruthy()

    const customer = await sb
      .from('customers')
      .select('display_name,primary_email,primary_phone')
      .eq('id', customerId)
      .single()
    expect(customer.error).toBeNull()
    expect(customer.data?.display_name).toBe('Alex')
    expect(customer.data?.primary_email).toBe(email)
    expect(customer.data?.primary_phone).toBe('+15551234567')

    await page.goto('/dashboard#live_chat')
    const panel = page.getByTestId('dashboard-content')
    await expect(panel.getByText('Alex').first()).toBeVisible()
    await expect(panel.getByText('Customer Profile')).toBeVisible()
    await expect(panel.getByText('Website visitor')).toHaveCount(0)

    await panel.getByRole('button', { name: 'Take Over' }).click()
    await expect(panel.getByRole('button', { name: 'You took over' })).toBeVisible()
    await page.waitForTimeout(1500)
    await expect(panel.getByRole('button', { name: 'You took over' })).toBeVisible()

    let persisted = await sb
      .from('conversations')
      .select('status,assigned_to,customer_id')
      .eq('id', conversationId)
      .single()
    expect(persisted.error).toBeNull()
    expect(persisted.data?.status).toBe('live_chat')
    expect(persisted.data?.assigned_to).toBe('Regression Agent')
    expect(persisted.data?.customer_id).toBe(customerId)

    await page.reload()
    await expect(panel.getByRole('button', { name: 'You took over' })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Return to AI' })).toBeVisible()
    await expect(panel.getByText('Assigned to Regression Agent').first()).toBeVisible()

    await panel.getByRole('button', { name: 'Mark Resolved' }).click()
    await expect.poll(async () => {
      const result = await sb
        .from('conversations')
        .select('status,assigned_to,customer_id')
        .eq('id', conversationId)
        .single()
      expect(result.error).toBeNull()
      persisted = result
      return result.data?.status
    }).toBe('resolved')
    expect(persisted.data?.status).toBe('resolved')
    expect(persisted.data?.assigned_to).toBeNull()
    expect(persisted.data?.customer_id).toBe(customerId)
    await expect(panel.getByText('Resolved').first()).toBeVisible()
    await expect(panel.getByRole('button', { name: 'You took over' })).toHaveCount(0)
    await expect(panel.getByText('Alex').first()).toBeVisible()

    const conversations = await request.get('/api/live-chat/conversations', { headers: authHeaders })
    expect(conversations.ok()).toBeTruthy()
    const conversationsBody = await conversations.json() as { conversations: Array<{ id: string; status: string; customer?: { display_name?: string | null } | null }> }
    const resolved = conversationsBody.conversations.find(item => item.id === conversationId)
    expect(resolved?.status).toBe('resolved')
    expect(resolved?.customer?.display_name).toBe('Alex')

    const messages = await sb.from('messages').select('id').eq('conversation_id', conversationId)
    expect(messages.error).toBeNull()
    expect(messages.data?.length).toBeGreaterThan(0)
  } finally {
    if (conversationId) {
      await sb.from('handover_events').delete().eq('conversation_id', conversationId)
      await sb.from('follow_ups').delete().eq('conversation_id', conversationId)
      await sb.from('lead_memory').delete().eq('conversation_id', conversationId)
      await sb.from('leads').delete().eq('conversation_id', conversationId)
      await sb.from('messages').delete().eq('conversation_id', conversationId)
      await sb.from('conversations').delete().eq('id', conversationId)
    }
    if (customerId) {
      await sb.from('customer_identity_suggestions').delete().eq('business_id', businessId)
      await sb.from('customer_merge_history').delete().or(`source_customer_id.eq.${customerId},target_customer_id.eq.${customerId}`)
      await sb.from('customer_identities').delete().eq('customer_id', customerId)
      await sb.from('customers').delete().eq('id', customerId)
    }
    await sb.from('live_chat_settings').delete().eq('business_id', businessId)
    await sb.from('team_members').delete().eq('id', memberId)
    await sb.from('businesses').delete().eq('id', businessId)
  }
})

test('new open conversation alerts staff while viewing resolved filter', async ({ request, page, baseURL }) => {
  const sb = adminClient()
  const businessId = crypto.randomUUID()
  const memberId = crypto.randomUUID()
  let conversationId: string | null = null
  let customerId: string | null = null

  try {
    await sb.from('businesses').insert({ id: businessId, name: 'QA Incoming Alert Business' })
    await sb.from('team_members').insert({
      id: memberId,
      client_id: businessId,
      name: 'Alert Agent',
      email: `alert-agent-${memberId}@example.com`,
      role: 'owner',
      status: 'active',
    })
    await sb.from('live_chat_settings').insert({
      business_id: businessId,
      ai_auto_replies_enabled: false,
      live_chat_enabled: true,
      human_handover_enabled: true,
      trigger_customer_asks_human: false,
      trigger_ai_cannot_answer: false,
      trigger_phrases: ['human', 'agent'],
    })

    const token = await signMemberToken({ id: memberId, name: 'Alert Agent', role: 'owner' })
    await page.context().addCookies([{
      name: MEMBER_COOKIE_NAME,
      value: token,
      url: baseURL ?? 'http://127.0.0.1:3106',
      sameSite: 'Lax',
    }])

    await page.goto('/dashboard#live_chat')
    const panel = page.getByTestId('dashboard-content')
    await panel.getByRole('button', { name: 'Resolved' }).click()
    await expect(panel.getByText('No conversations yet.')).toBeVisible()

    const chat = await request.post('/api/chat', {
      data: {
        business_id: businessId,
        message: 'My name is Tommy, email tommy-alert@example.com, phone +15550004444.',
      },
    })
    expect(chat.ok()).toBeTruthy()
    const chatBody = await chat.json() as { conversation_id: string; customer_id?: string | null }
    conversationId = chatBody.conversation_id
    customerId = chatBody.customer_id ?? null

    await expect(page.getByText('New live chat from Tommy').or(page.getByText('New message from Tommy')).first()).toBeVisible({ timeout: 15000 })
    await expect(panel.getByRole('button', { name: /Open\s+1/ })).toBeVisible()
    await expect(panel.getByRole('button', { name: /All\s+1/ })).toBeVisible()

    await page.getByText(/New (live chat|message) from Tommy/).click()
    await expect(panel.getByText('Tommy').first()).toBeVisible()
    await expect(panel.getByText('Customer Profile')).toBeVisible()
    await expect(page.getByText(/New (live chat|message) from Tommy/)).toHaveCount(0)
  } finally {
    if (conversationId) {
      await sb.from('handover_events').delete().eq('conversation_id', conversationId)
      await sb.from('follow_ups').delete().eq('conversation_id', conversationId)
      await sb.from('lead_memory').delete().eq('conversation_id', conversationId)
      await sb.from('leads').delete().eq('conversation_id', conversationId)
      await sb.from('messages').delete().eq('conversation_id', conversationId)
      await sb.from('conversations').delete().eq('id', conversationId)
    }
    if (customerId) {
      await sb.from('customer_identity_suggestions').delete().eq('business_id', businessId)
      await sb.from('customer_identities').delete().eq('customer_id', customerId)
      await sb.from('customers').delete().eq('id', customerId)
    }
    await sb.from('live_chat_settings').delete().eq('business_id', businessId)
    await sb.from('team_members').delete().eq('id', memberId)
    await sb.from('businesses').delete().eq('id', businessId)
  }
})

test('name extraction treats again as returning-visitor context', async ({ request }) => {
  const sb = adminClient()
  const businessId = crypto.randomUUID()
  const cases = [
    ['this is Tommy again', 'Tommy'],
    ["it's Tommy again", 'Tommy'],
    ['Tommy again', 'Tommy'],
    ['sure, Mike mikeraven@gmail.com, 510 998 000', 'Mike'],
    ['Mike, mikeraven@gmail.com, 510 998 000', 'Mike'],
    ['this is Tommy Lee', 'Tommy Lee'],
    ['this is Tommy Al Ghzawi', 'Tommy Al Ghzawi'],
  ] as const
  const conversationIds: string[] = []
  const customerIds: string[] = []

  try {
    await sb.from('businesses').insert({ id: businessId, name: 'QA Name Again Business' })
    await sb.from('live_chat_settings').insert({
      business_id: businessId,
      ai_auto_replies_enabled: false,
      live_chat_enabled: true,
      human_handover_enabled: true,
      trigger_customer_asks_human: false,
      trigger_ai_cannot_answer: false,
      trigger_phrases: ['human', 'agent'],
    })

    for (const [message, expected] of cases) {
      const response = await request.post('/api/chat', {
        data: {
          business_id: businessId,
          message,
        },
      })
      expect(response.ok()).toBeTruthy()
      const body = await response.json() as { conversation_id: string; customer_id?: string | null }
      conversationIds.push(body.conversation_id)
      if (body.customer_id) customerIds.push(body.customer_id)
      const customer = await sb.from('customers').select('display_name').eq('id', body.customer_id).single()
      expect(customer.error).toBeNull()
      expect(customer.data?.display_name).toBe(expected)
    }
  } finally {
    if (conversationIds.length) {
      await sb.from('handover_events').delete().in('conversation_id', conversationIds)
      await sb.from('follow_ups').delete().in('conversation_id', conversationIds)
      await sb.from('lead_memory').delete().in('conversation_id', conversationIds)
      await sb.from('leads').delete().in('conversation_id', conversationIds)
      await sb.from('messages').delete().in('conversation_id', conversationIds)
      await sb.from('conversations').delete().in('id', conversationIds)
    }
    if (customerIds.length) {
      await sb.from('customer_identity_suggestions').delete().eq('business_id', businessId)
      await sb.from('customer_identities').delete().in('customer_id', customerIds)
      await sb.from('customers').delete().in('id', customerIds)
    }
    await sb.from('live_chat_settings').delete().eq('business_id', businessId)
    await sb.from('businesses').delete().eq('id', businessId)
  }
})

test('customer profile edits and internal notes stay dashboard-only', async ({ page, request, baseURL }) => {
  const sb = adminClient()
  const businessId = crypto.randomUUID()
  const memberId = crypto.randomUUID()
  let conversationId: string | null = null
  let customerId: string | null = null

  try {
    await sb.from('businesses').insert({ id: businessId, name: 'QA Editable Profile Business' })
    const memberInsert = await sb.from('team_members').insert({
      id: memberId,
      client_id: businessId,
      name: 'Profile Agent',
      email: `profile-agent-${memberId}@example.com`,
      role: 'owner',
      status: 'active',
    })
    expect(memberInsert.error).toBeNull()
    await sb.from('live_chat_settings').insert({
      business_id: businessId,
      ai_auto_replies_enabled: false,
      live_chat_enabled: true,
      human_handover_enabled: true,
      trigger_customer_asks_human: false,
      trigger_ai_cannot_answer: false,
      trigger_phrases: ['human', 'agent'],
    })

    customerId = crypto.randomUUID()
    conversationId = crypto.randomUUID()
    const customerInsert = await sb.from('customers').insert({
      id: customerId,
      business_id: businessId,
      display_name: 'Mike',
      primary_email: 'mikeraven@gmail.com',
      primary_phone: '510998000',
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
    expect(customerInsert.error).toBeNull()
    const identityInsert = await sb.from('customer_identities').insert([
      { customer_id: customerId, channel: 'email', external_identifier: 'mikeraven@gmail.com', confidence_score: 100, verified: true, metadata: { source: 'test' } },
      { customer_id: customerId, channel: 'phone', external_identifier: '510998000', confidence_score: 100, verified: true, metadata: { source: 'test' } },
      { customer_id: customerId, channel: 'website', external_identifier: `website:${conversationId}`, confidence_score: 95, verified: true, metadata: { source: 'test' } },
    ])
    expect(identityInsert.error).toBeNull()
    const conversationInsert = await sb.from('conversations').insert({
      id: conversationId,
      business_id: businessId,
      customer_id: customerId,
      channel: 'website',
      status: 'handover_requested',
      unread_count: 1,
      last_message_at: new Date().toISOString(),
    })
    expect(conversationInsert.error).toBeNull()
    const messageInsert = await sb.from('messages').insert({
      conversation_id: conversationId,
      business_id: businessId,
      role: 'user',
      content: 'sure, Mike mikeraven@gmail.com, 510 998 000',
      metadata: { sender_type: 'customer', delivery_status: 'delivered' },
    })
    expect(messageInsert.error).toBeNull()

    const token = await signMemberToken({ id: memberId, name: 'Profile Agent', role: 'owner' })
    await page.context().addCookies([{
      name: MEMBER_COOKIE_NAME,
      value: token,
      url: baseURL ?? 'http://127.0.0.1:3106',
      sameSite: 'Lax',
    }])

    await page.goto('/dashboard#live_chat')
    const dashboard = page.getByTestId('dashboard-content')
    const profile = page.getByTestId('customer-profile-panel')
    await expect(profile.getByText('Customer Profile')).toBeVisible({ timeout: 15000 })
    await expect(profile.getByText('Mike').first()).toBeVisible()

    await profile.getByRole('button', { name: 'Edit customer name' }).click()
    await profile.getByRole('textbox', { name: 'Name' }).fill('Mike Raven')
    await profile.getByRole('button', { name: 'Save name' }).click()
    await expect(profile.getByText('Customer profile saved.')).toBeVisible()
    await expect(profile.getByText('Mike Raven').first()).toBeVisible()
    await expect(dashboard.getByText('Mike Raven').first()).toBeVisible()

    await profile.getByRole('button', { name: 'Edit customer email' }).click()
    await profile.getByRole('textbox', { name: 'Email' }).fill('mike.raven.qa@example.com')
    await profile.getByRole('button', { name: 'Save email' }).click()
    await expect(profile.getByText('mike.raven.qa@example.com')).toBeVisible()

    await profile.getByRole('button', { name: 'Edit customer phone' }).click()
    await profile.getByRole('textbox', { name: 'Phone' }).fill('+1 510 998 0000')
    await profile.getByRole('button', { name: 'Save phone' }).click()
    await expect(profile.getByText('+1 510 998 0000')).toBeVisible()

    const updatedCustomer = await sb.from('customers').select('display_name,primary_email,primary_phone').eq('id', customerId).single()
    expect(updatedCustomer.error).toBeNull()
    expect(updatedCustomer.data).toMatchObject({
      display_name: 'Mike Raven',
      primary_email: 'mike.raven.qa@example.com',
      primary_phone: '+1 510 998 0000',
    })
    const identities = await sb
      .from('customer_identities')
      .select('channel,external_identifier')
      .eq('customer_id', customerId)
      .in('external_identifier', ['mike.raven.qa@example.com', '+15109980000'])
    expect(identities.error).toBeNull()
    expect(identities.data?.map(identity => identity.external_identifier).sort()).toEqual(['+15109980000', 'mike.raven.qa@example.com'])

    await dashboard.getByRole('button', { name: 'Note' }).click()
    await dashboard.getByPlaceholder('Add internal note...').fill('Private customer note')
    await dashboard.getByRole('button', { name: 'Send' }).click()
    await expect(dashboard.getByPlaceholder('Reply as human...')).toBeVisible()
    await expect(dashboard.getByText('Private customer note')).toBeVisible()

    const widgetMessages = await request.get(`/api/live-chat/widget/messages?conversation_id=${conversationId}`)
    expect(widgetMessages.ok()).toBeTruthy()
    const widgetBody = await widgetMessages.json() as { messages: Array<{ content: string }> }
    expect(widgetBody.messages.some(message => message.content.includes('Private customer note'))).toBe(false)

    await dashboard.getByText('Private customer note').hover()
    await dashboard.getByRole('button', { name: 'Edit internal note' }).click()
    await dashboard.locator('textarea').fill('Private customer note edited')
    await dashboard.getByRole('button', { name: 'Save edit' }).click()
    await expect(dashboard.getByText('Private customer note edited')).toBeVisible()

    await dashboard.getByText('Private customer note edited').hover()
    await dashboard.getByRole('button', { name: 'Delete internal note' }).click()
    await expect(dashboard.getByText('Private customer note edited')).toHaveCount(0)
  } finally {
    if (conversationId) {
      await sb.from('handover_events').delete().eq('conversation_id', conversationId)
      await sb.from('follow_ups').delete().eq('conversation_id', conversationId)
      await sb.from('lead_memory').delete().eq('conversation_id', conversationId)
      await sb.from('leads').delete().eq('conversation_id', conversationId)
      await sb.from('messages').delete().eq('conversation_id', conversationId)
      await sb.from('conversations').delete().eq('id', conversationId)
    }
    if (customerId) {
      await sb.from('customer_identity_suggestions').delete().eq('business_id', businessId)
      await sb.from('customer_identities').delete().eq('customer_id', customerId)
      await sb.from('customers').delete().eq('id', customerId)
    }
    await sb.from('live_chat_settings').delete().eq('business_id', businessId)
    await sb.from('team_members').delete().eq('id', memberId)
    await sb.from('businesses').delete().eq('id', businessId)
  }
})

test('dashboard realtime stream receives the first human-only conversation without refresh', async ({ page, request, baseURL }) => {
  const sb = adminClient()
  const businessId = crypto.randomUUID()
  const memberId = crypto.randomUUID()
  let conversationId: string | null = null

  try {
    await sb.from('businesses').insert({ id: businessId, name: 'QA Realtime Human Only Business' })
    await sb.from('team_members').insert({
      id: memberId,
      client_id: businessId,
      name: 'Realtime Agent',
      email: `realtime-agent-${memberId}@example.com`,
      role: 'owner',
      status: 'active',
    })
    await sb.from('live_chat_settings').insert({
      business_id: businessId,
      ai_auto_replies_enabled: false,
      live_chat_enabled: true,
      human_handover_enabled: true,
      trigger_customer_asks_human: true,
      trigger_ai_cannot_answer: true,
      trigger_phrases: ['human', 'agent'],
    })

    const token = await signMemberToken({ id: memberId, name: 'Realtime Agent', role: 'owner' })
    await page.context().addCookies([{
      name: MEMBER_COOKIE_NAME,
      value: token,
      url: baseURL ?? 'http://127.0.0.1:3106',
      sameSite: 'Lax',
    }])
    await page.goto('/')
    await page.evaluate(() => {
      const w = window as typeof window & {
        __liveChatEvents?: EventSource
        __liveChatStreamReady?: Promise<boolean>
        __liveChatStreamEvents?: string[]
      }
      w.__liveChatStreamEvents = []
      w.__liveChatStreamReady = new Promise(resolve => {
        const events = new EventSource('/api/live-chat/stream')
        w.__liveChatEvents = events
        events.onopen = () => resolve(true)
        events.addEventListener('live-chat-change', event => {
          w.__liveChatStreamEvents?.push((event as MessageEvent).data)
        })
      })
    })
    await page.evaluate(() => {
      const w = window as typeof window & { __liveChatStreamReady?: Promise<boolean> }
      return w.__liveChatStreamReady
    })

    const response = await request.post('/api/chat', {
      data: {
        business_id: businessId,
        message: 'My name is Realtime Tester, email realtime@example.com. Company is Realtime QA LLC.',
      },
    })
    expect(response.ok()).toBeTruthy()
    const body = await response.json() as { conversation_id: string; ai_reply_skipped: boolean }
    conversationId = body.conversation_id
    expect(body.ai_reply_skipped).toBe(true)

    await expect.poll(
      () => page.evaluate(() => {
        const w = window as typeof window & { __liveChatStreamEvents?: string[] }
        return w.__liveChatStreamEvents?.length ?? 0
      }),
      { timeout: 5_000 },
    ).toBeGreaterThan(0)
  } finally {
    await page.evaluate(() => {
      const w = window as typeof window & { __liveChatEvents?: EventSource }
      w.__liveChatEvents?.close()
    }).catch(() => undefined)
    if (conversationId) {
      await sb.from('handover_events').delete().eq('conversation_id', conversationId)
      await sb.from('follow_ups').delete().eq('conversation_id', conversationId)
      await sb.from('lead_memory').delete().eq('conversation_id', conversationId)
      await sb.from('leads').delete().eq('conversation_id', conversationId)
      await sb.from('messages').delete().eq('conversation_id', conversationId)
      await sb.from('conversations').delete().eq('id', conversationId)
    }
    await sb.from('live_chat_settings').delete().eq('business_id', businessId)
    await sb.from('team_members').delete().eq('id', memberId)
    await sb.from('businesses').delete().eq('id', businessId)
  }
})

test('dashboard live-chat UX exposes compact controls, visitor ID, and staff edit action', async ({ page, request, baseURL }) => {
  const sb = adminClient()
  const businessId = crypto.randomUUID()
  const memberId = crypto.randomUUID()
  let conversationId: string | null = null

  try {
    await sb.from('businesses').insert({ id: businessId, name: 'QA Dashboard UX Business' })
    await sb.from('team_members').insert({
      id: memberId,
      client_id: businessId,
      name: 'Dashboard UX Agent',
      email: `dashboard-ux-agent-${memberId}@example.com`,
      role: 'owner',
      status: 'active',
    })
    await sb.from('live_chat_settings').insert({
      business_id: businessId,
      ai_auto_replies_enabled: false,
      live_chat_enabled: true,
      human_handover_enabled: true,
      trigger_customer_asks_human: false,
      trigger_ai_cannot_answer: false,
      trigger_phrases: ['human', 'agent'],
    })

    const token = await signMemberToken({ id: memberId, name: 'Dashboard UX Agent', role: 'owner' })
    const authHeaders = { cookie: `${MEMBER_COOKIE_NAME}=${token}` }
    await page.context().addCookies([{
      name: MEMBER_COOKIE_NAME,
      value: token,
      url: baseURL ?? 'http://127.0.0.1:3106',
      sameSite: 'Lax',
    }])

    const chat = await request.post('/api/chat', {
      data: {
        business_id: businessId,
        message: 'My name is Dashboard UX Visitor, email dashboard-ux@example.com.',
      },
    })
    expect(chat.ok()).toBeTruthy()
    const chatBody = await chat.json() as { conversation_id: string }
    conversationId = chatBody.conversation_id

    const staffReply = await request.post(`/api/live-chat/conversations/${conversationId}/messages`, {
      headers: authHeaders,
      data: { message: 'Fresh staff reply for editing.' },
    })
    expect(staffReply.ok()).toBeTruthy()

    await page.goto('/dashboard#live_chat')
    const liveChatPanel = page.getByTestId('dashboard-content')
    await expect(liveChatPanel.getByRole('button', { name: 'Live Chat Settings' })).toBeVisible()
    await expect(liveChatPanel.getByRole('button', { name: 'Analytics' })).toBeVisible()
    await liveChatPanel.getByRole('button', { name: 'Live Chat Settings' }).click()
    await expect(liveChatPanel.getByText('Human handover and AI reply controls')).toBeVisible()
    await liveChatPanel.getByRole('button', { name: 'Close live chat settings' }).click()
    await liveChatPanel.getByRole('button', { name: 'Analytics' }).hover()
    await expect(liveChatPanel.getByText('Current inbox load')).toBeVisible()
    await liveChatPanel.getByRole('button', { name: 'Close live chat analytics' }).click()
    await expect(liveChatPanel.getByText('Dashboard UX Visitor').first()).toBeVisible()
    await expect(liveChatPanel.getByText(/Visitor ID: VIS-[A-Z0-9]{6}/).first()).toBeVisible()

    await expect(liveChatPanel.getByRole('button', { name: 'Resolve', exact: true })).toHaveCount(0)
    await expect(liveChatPanel.getByRole('button', { name: /Take Over|You took over/ })).toBeVisible()
    await liveChatPanel.getByRole('button', { name: 'Assign', exact: true }).click()
    await expect(liveChatPanel.getByRole('button', { name: 'Assign to me' })).toBeVisible()
    await expect(liveChatPanel.getByRole('button', { name: 'Unassign', exact: true })).toBeVisible()
    await liveChatPanel.getByRole('button', { name: 'Assign', exact: true }).click()

    await liveChatPanel.getByRole('main').getByText('Fresh staff reply for editing.').hover()
    await liveChatPanel.getByRole('main').getByRole('button', { name: 'Edit', exact: true }).click()
    await liveChatPanel.getByRole('main').locator('textarea').fill('Fresh staff reply after dashboard edit.')
    await liveChatPanel.getByRole('main').getByRole('button', { name: 'Save edit' }).click()
    await expect(liveChatPanel.getByText('Fresh staff reply after dashboard edit.')).toBeVisible()
    await expect(liveChatPanel.getByText('edited')).toBeVisible()

    await liveChatPanel.locator('input[type="file"]').setInputFiles({
      name: 'dashboard-upload.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      ),
    })
    await expect(liveChatPanel.getByText('dashboard-upload.png')).toBeVisible()
    await liveChatPanel.getByPlaceholder('Reply as human...').fill('Attachment from dashboard')
    await liveChatPanel.getByRole('button', { name: 'Send' }).click()
    await expect(liveChatPanel.getByText('Attachment from dashboard')).toBeVisible()
  } finally {
    if (conversationId) {
      await sb.from('handover_events').delete().eq('conversation_id', conversationId)
      await sb.from('follow_ups').delete().eq('conversation_id', conversationId)
      await sb.from('lead_memory').delete().eq('conversation_id', conversationId)
      await sb.from('leads').delete().eq('conversation_id', conversationId)
      await sb.from('messages').delete().eq('conversation_id', conversationId)
      await sb.from('conversations').delete().eq('id', conversationId)
    }
    await sb.from('live_chat_settings').delete().eq('business_id', businessId)
    await sb.from('team_members').delete().eq('id', memberId)
    await sb.from('businesses').delete().eq('id', businessId)
  }
})

test('dashboard keeps thread scroll, new-message bubble, typing indicators, and profile selection stable', async ({ page, request, baseURL }) => {
  const sb = adminClient()
  const businessId = crypto.randomUUID()
  const memberId = crypto.randomUUID()
  const customerIds = Array.from({ length: 5 }, () => crypto.randomUUID())
  const conversationIds = Array.from({ length: 5 }, () => crypto.randomUUID())

  try {
    await sb.from('businesses').insert({ id: businessId, name: 'QA Scroll Typing Business' }).throwOnError()
    await sb.from('team_members').insert({
      id: memberId,
      client_id: businessId,
      name: 'Scroll Agent',
      email: `scroll-agent-${memberId}@example.com`,
      role: 'owner',
      status: 'active',
    }).throwOnError()
    await sb.from('live_chat_settings').insert({
      business_id: businessId,
      ai_auto_replies_enabled: false,
      live_chat_enabled: true,
      human_handover_enabled: true,
      trigger_customer_asks_human: false,
      trigger_ai_cannot_answer: false,
      trigger_phrases: ['human', 'agent'],
    }).throwOnError()

    await sb.from('customers').insert(customerIds.map((id, index) => ({
      id,
      business_id: businessId,
      display_name: `Scroll Visitor ${index + 1}`,
      primary_email: `scroll-visitor-${index + 1}@example.com`,
      first_seen_at: new Date(Date.now() - 60_000).toISOString(),
      last_seen_at: new Date().toISOString(),
    }))).throwOnError()
    await sb.from('customer_identities').insert(customerIds.map((id, index) => ({
      customer_id: id,
      channel: 'website',
      external_identifier: `website:${conversationIds[index]}`,
      confidence_score: 95,
      verified: true,
    }))).throwOnError()

    const baseTime = Date.now() - 30_000
    await sb.from('conversations').insert(conversationIds.map((id, index) => ({
      id,
      business_id: businessId,
      customer_id: customerIds[index],
      channel: 'website',
      status: 'live_chat',
      assigned_to: 'Scroll Agent',
      last_message_at: new Date(baseTime + index * 1000).toISOString(),
      unread_count: 0,
    }))).throwOnError()

    const messageRows: Array<Record<string, unknown>> = []
    for (let index = 0; index < conversationIds.length; index += 1) {
      const count = index === 0 ? 90 : 3
      for (let messageIndex = 0; messageIndex < count; messageIndex += 1) {
        const id = crypto.randomUUID()
        messageRows.push({
          id,
          conversation_id: conversationIds[index],
          business_id: businessId,
          role: messageIndex % 2 === 0 ? 'user' : 'assistant',
          content: `Scroll Visitor ${index + 1} message ${messageIndex + 1}`,
          created_at: new Date(baseTime + index * 1000 + messageIndex).toISOString(),
          metadata: messageIndex % 2 === 0 ? { sender_type: 'customer' } : { sender_type: 'human', sender_name: 'Scroll Agent' },
        })
      }
    }
    await sb.from('messages').insert(messageRows).throwOnError()

    const token = await signMemberToken({ id: memberId, name: 'Scroll Agent', role: 'owner' })
    await page.context().addCookies([{
      name: MEMBER_COOKIE_NAME,
      value: token,
      url: baseURL ?? 'http://127.0.0.1:3106',
      sameSite: 'Lax',
    }])

    await page.goto('/dashboard#live_chat')
    const panel = page.getByTestId('dashboard-content')
    const profilePanel = panel.getByTestId('customer-profile-panel')
    const messagePane = panel.getByTestId('live-chat-message-pane')

    for (let index = 4; index >= 0; index -= 1) {
      await panel.getByRole('button', { name: new RegExp(`Scroll Visitor ${index + 1}`) }).click()
      await expect(profilePanel.getByText(`Scroll Visitor ${index + 1}`).first()).toBeVisible()
      if (index < 4) await expect(profilePanel.getByText(`Scroll Visitor ${index + 2}`).first()).toHaveCount(0)
    }

    await panel.getByRole('button', { name: /Scroll Visitor 1/ }).click()
    await expect(panel.getByText('Scroll Visitor 1 message 28')).toBeVisible()
    await expect.poll(async () => messagePane.evaluate(node => node.scrollTop + node.clientHeight >= node.scrollHeight - 4)).toBe(true)

    await messagePane.evaluate(node => { node.scrollTop = Math.floor(node.scrollHeight / 2) })
    await expect.poll(async () => messagePane.evaluate(node => node.scrollTop + node.clientHeight < node.scrollHeight - 80)).toBe(true)
    const chat = await request.post('/api/chat', {
      data: {
        business_id: businessId,
        conversation_id: conversationIds[0],
        message: 'New mid-thread customer message',
      },
    })
    expect(chat.ok()).toBeTruthy()
    await expect(panel.getByRole('button', { name: 'New message' })).toBeVisible({ timeout: 15000 })
    await panel.getByRole('button', { name: 'New message' }).click()
    await expect(messagePane.getByText('New mid-thread customer message')).toBeVisible()
    await expect.poll(async () => messagePane.evaluate(node => node.scrollTop + node.clientHeight >= node.scrollHeight - 4)).toBe(true)

    const typing = await request.post('/api/live-chat/typing', {
      data: {
        business_id: businessId,
        conversation_id: conversationIds[0],
        actor_type: 'visitor',
        actor_name: 'Scroll Visitor 1',
        is_typing: true,
      },
    })
    expect(typing.ok()).toBeTruthy()
    await expect(panel.getByText('Customer typing...')).toBeVisible({ timeout: 5000 })
    await expect(panel.getByRole('button', { name: /Scroll Visitor 1[\s\S]*typing/i })).toBeVisible()
  } finally {
    await sb.from('live_chat_typing').delete().in('conversation_id', conversationIds)
    await sb.from('handover_events').delete().in('conversation_id', conversationIds)
    await sb.from('follow_ups').delete().in('conversation_id', conversationIds)
    await sb.from('lead_memory').delete().in('conversation_id', conversationIds)
    await sb.from('leads').delete().in('conversation_id', conversationIds)
    await sb.from('messages').delete().in('conversation_id', conversationIds)
    await sb.from('conversations').delete().in('id', conversationIds)
    await sb.from('customer_identity_suggestions').delete().eq('business_id', businessId)
    await sb.from('customer_identities').delete().in('customer_id', customerIds)
    await sb.from('customers').delete().in('id', customerIds)
    await sb.from('live_chat_settings').delete().eq('business_id', businessId)
    await sb.from('team_members').delete().eq('id', memberId)
    await sb.from('businesses').delete().eq('id', businessId)
  }
})

test('dashboard renders omnichannel conversation badges and channel filter', async ({ page, baseURL }) => {
  const sb = adminClient()
  const businessId = crypto.randomUUID()
  const memberId = crypto.randomUUID()
  const conversations: { id: string; channel: string; preview: string }[] = [
    { id: crypto.randomUUID(), channel: 'website', preview: 'Website channel preview' },
    { id: crypto.randomUUID(), channel: 'whatsapp', preview: 'WhatsApp channel preview' },
    { id: crypto.randomUUID(), channel: 'messenger', preview: 'Messenger channel preview' },
    { id: crypto.randomUUID(), channel: 'instagram', preview: 'Instagram channel preview' },
    { id: crypto.randomUUID(), channel: 'email', preview: 'Email channel preview' },
  ]

  try {
    await sb.from('businesses').insert({ id: businessId, name: 'QA Omnichannel Business' })
    await sb.from('team_members').insert({
      id: memberId,
      client_id: businessId,
      name: 'Omnichannel Agent',
      email: `omnichannel-agent-${memberId}@example.com`,
      role: 'owner',
      status: 'active',
    })
    await sb.from('live_chat_settings').insert({
      business_id: businessId,
      ai_auto_replies_enabled: false,
      live_chat_enabled: true,
      human_handover_enabled: true,
      trigger_customer_asks_human: false,
      trigger_ai_cannot_answer: false,
      trigger_phrases: ['human', 'agent'],
    })
    await sb.from('conversations').insert(conversations.map((conversation, index) => ({
      id: conversation.id,
      business_id: businessId,
      channel: conversation.channel,
      status: 'handover_requested',
      unread_count: 1,
      last_message_at: new Date(Date.now() - index * 1000).toISOString(),
    })))
    await sb.from('messages').insert(conversations.map(conversation => ({
      conversation_id: conversation.id,
      business_id: businessId,
      role: 'user',
      content: conversation.preview,
      metadata: { sender_type: 'customer', delivery_status: 'delivered' },
    })))

    const token = await signMemberToken({ id: memberId, name: 'Omnichannel Agent', role: 'owner' })
    await page.context().addCookies([{
      name: MEMBER_COOKIE_NAME,
      value: token,
      url: baseURL ?? 'http://127.0.0.1:3106',
      sameSite: 'Lax',
    }])

    await page.goto('/dashboard#live_chat')
    const panel = page.getByTestId('dashboard-content')
    await expect(panel.locator('span').filter({ hasText: /^Website$/ }).first()).toBeVisible()
    await expect(panel.locator('span').filter({ hasText: /^WhatsApp$/ }).first()).toBeVisible()
    await expect(panel.locator('span').filter({ hasText: /^Messenger$/ }).first()).toBeVisible()
    await expect(panel.locator('span').filter({ hasText: /^Instagram$/ }).first()).toBeVisible()
    await expect(panel.locator('span').filter({ hasText: /^Email$/ }).first()).toBeVisible()

    await panel.locator('#live-chat-channel-filter').selectOption('whatsapp')
    await expect(panel.getByText('WhatsApp channel preview')).toBeVisible()
    await expect(panel.getByText('Website channel preview')).toHaveCount(0)
  } finally {
    await sb.from('messages').delete().in('conversation_id', conversations.map(conversation => conversation.id))
    await sb.from('conversations').delete().in('id', conversations.map(conversation => conversation.id))
    await sb.from('live_chat_settings').delete().eq('business_id', businessId)
    await sb.from('team_members').delete().eq('id', memberId)
    await sb.from('businesses').delete().eq('id', businessId)
  }
})

test('deploy page renders website widget and future channel cards', async ({ page, baseURL }) => {
  const sb = adminClient()
  const businessId = crypto.randomUUID()
  const memberId = crypto.randomUUID()

  try {
    await sb.from('businesses').insert({ id: businessId, name: 'QA Deploy Channels Business' })
    await sb.from('team_members').insert({
      id: memberId,
      client_id: businessId,
      name: 'Deploy Agent',
      email: `deploy-agent-${memberId}@example.com`,
      role: 'owner',
      status: 'active',
    })

    const token = await signMemberToken({ id: memberId, name: 'Deploy Agent', role: 'owner' })
    await page.context().addCookies([{
      name: MEMBER_COOKIE_NAME,
      value: token,
      url: baseURL ?? 'http://127.0.0.1:3106',
      sameSite: 'Lax',
    }])

    await page.goto('/dashboard#deploy')
    const panel = page.getByTestId('dashboard-content')
    await expect(panel.getByText('Website Widget')).toBeVisible()
    await expect(panel.getByText('Direct Link')).toBeVisible()
    await expect(panel.getByText('Website Script')).toBeVisible()
    await expect(panel.getByText('Iframe', { exact: true })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Connect WhatsApp Business' })).toBeDisabled()
    await expect(panel.getByRole('button', { name: 'Connect Facebook Page' })).toBeDisabled()
    await expect(panel.getByRole('button', { name: 'Connect Instagram DM' })).toBeDisabled()
    await expect(panel.getByRole('button', { name: 'Connect Gmail / Microsoft' })).toBeDisabled()
  } finally {
    await sb.from('team_members').delete().eq('id', memberId)
    await sb.from('businesses').delete().eq('id', businessId)
  }
})

test('integrations page renders grouped foundation cards and widget deploy panel', async ({ page, baseURL }) => {
  const sb = adminClient()
  const businessId = crypto.randomUUID()
  const memberId = crypto.randomUUID()

  try {
    await sb.from('businesses').insert({ id: businessId, name: 'QA Integrations Business' })
    await sb.from('team_members').insert({
      id: memberId,
      client_id: businessId,
      name: 'Integrations Agent',
      email: `integrations-agent-${memberId}@example.com`,
      role: 'owner',
      status: 'active',
    })

    const token = await signMemberToken({ id: memberId, name: 'Integrations Agent', role: 'owner' })
    await page.context().addCookies([{
      name: MEMBER_COOKIE_NAME,
      value: token,
      url: baseURL ?? 'http://127.0.0.1:3106',
      sameSite: 'Lax',
    }])

    await page.goto('/dashboard#integrations')
    const panel = page.getByTestId('dashboard-content')

    await expect(panel.getByRole('heading', { name: 'Integrations' })).toBeVisible()
    await expect(panel.getByText('Website Widget deploy panel')).toBeVisible()
    await expect(panel.getByText('Direct link', { exact: true })).toBeVisible()
    await expect(panel.getByText('Script embed snippet')).toBeVisible()
    await expect(panel.getByText('Iframe snippet')).toBeVisible()
    await expect(panel.getByText('Business-specific QR')).toBeVisible()
    await expect(panel.getByText('Paste before closing </body>')).toBeVisible()
    await expect(panel.getByText(`data-business-id="${businessId}"`)).toBeVisible()
    await expect(panel.getByText(`/embed/${businessId}`, { exact: false }).first()).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Test widget' })).toBeEnabled()
    await expect(panel.getByRole('button', { name: 'Copy' })).toHaveCount(3)
    await panel.getByRole('button', { name: 'Copy' }).nth(1).click()
    await expect(panel.getByRole('button', { name: 'Copied' })).toBeVisible()

    for (const name of ['Channels', 'Automation', 'Website/CMS']) {
      await expect(panel.getByRole('heading', { name })).toBeVisible()
    }
    for (const name of ['Website Widget', 'WhatsApp', 'Messenger', 'Instagram', 'Telegram', 'Email', 'Make', 'Zapier', 'Webhooks/API', 'WordPress', 'Shopify', 'Wix']) {
      await expect(panel.getByText(name, { exact: true }).first()).toBeVisible()
    }

    await expect(panel.getByRole('button', { name: 'Open deploy' }).first()).toBeEnabled()
    await expect(panel.getByRole('button', { name: 'View API setup' })).toBeEnabled()
    await expect(panel.getByRole('button', { name: 'Coming soon' })).toHaveCount(10)
    for (const button of await panel.getByRole('button', { name: 'Coming soon' }).all()) {
      await expect(button).toBeDisabled()
    }

    await panel.getByRole('button', { name: 'View API setup' }).click()
    await expect(panel.getByText('Webhooks/API setup')).toBeVisible()
    await expect(panel.getByText('Public webhook endpoint placeholder')).toBeVisible()
    await expect(panel.getByText(`/api/webhooks/custom/${businessId}`, { exact: false })).toBeVisible()
    await expect(panel.getByText('Secret key placeholder')).toBeVisible()
    for (const event of ['conversation.created', 'message.created', 'lead.created', 'customer.updated', 'handover.requested', 'conversation.resolved']) {
      await expect(panel.getByText(event)).toBeVisible()
    }
    await expect(panel.getByRole('button', { name: 'Regenerate secret' })).toBeEnabled()
    await expect(panel.getByRole('button', { name: /Copy|Copied/ })).toHaveCount(5)

    await panel.getByRole('button', { name: 'Open deploy' }).first().click()
    await expect(page).toHaveURL(/#deploy$/)
    await expect(panel.getByText('Production website chat entry points')).toBeVisible()
  } finally {
    await sb.from('team_members').delete().eq('id', memberId)
    await sb.from('businesses').delete().eq('id', businessId)
  }
})

test('live-chat assignment, attachments, delta fetch, and seen receipts work', async ({ request }) => {
  const sb = adminClient()
  const businessId = crypto.randomUUID()
  const ownerId = crypto.randomUUID()
  const otherId = crypto.randomUUID()
  let conversationId: string | null = null

  const attachment = {
    name: 'qa-note.txt',
    type: 'text/plain',
    size: 24,
    dataUrl: `data:text/plain;base64,${Buffer.from('InstantDesk attachment QA').toString('base64')}`,
  }

  try {
    await sb.from('businesses').insert({ id: businessId, name: 'QA Assignment Attachments Business' })
    await sb.from('team_members').insert([
      {
        id: ownerId,
        client_id: businessId,
        name: 'Primary Agent',
        email: `primary-${ownerId}@example.com`,
        role: 'owner',
        status: 'active',
      },
      {
        id: otherId,
        client_id: businessId,
        name: 'Other Agent',
        email: `other-${otherId}@example.com`,
        role: 'agent',
        status: 'active',
      },
    ])
    await sb.from('live_chat_settings').insert({
      business_id: businessId,
      ai_auto_replies_enabled: false,
      live_chat_enabled: true,
      human_handover_enabled: true,
      trigger_customer_asks_human: false,
      trigger_ai_cannot_answer: false,
      trigger_phrases: ['human', 'agent'],
    })

    const ownerToken = await signMemberToken({ id: ownerId, name: 'Primary Agent', role: 'owner' })
    const otherToken = await signMemberToken({ id: otherId, name: 'Other Agent', role: 'agent' })
    const ownerHeaders = { cookie: `${MEMBER_COOKIE_NAME}=${ownerToken}` }
    const otherHeaders = { cookie: `${MEMBER_COOKIE_NAME}=${otherToken}` }

    const chat = await request.post('/api/chat', {
      data: {
        business_id: businessId,
        message: 'Customer attachment message',
        attachment,
      },
    })
    expect(chat.ok()).toBeTruthy()
    const chatBody = await chat.json() as { conversation_id: string }
    conversationId = chatBody.conversation_id

    const takeOver = await request.patch(`/api/live-chat/conversations/${conversationId}/status`, {
      headers: ownerHeaders,
      data: { status: 'live_chat' },
    })
    expect(takeOver.ok()).toBeTruthy()
    expect((await takeOver.json() as { assigned_to: string }).assigned_to).toBe('Primary Agent')

    const blockedReply = await request.post(`/api/live-chat/conversations/${conversationId}/messages`, {
      headers: otherHeaders,
      data: { message: 'Other agent should not reply accidentally.' },
    })
    expect(blockedReply.status()).toBe(409)

    const staffAttachment = await request.post(`/api/live-chat/conversations/${conversationId}/messages`, {
      headers: ownerHeaders,
      data: {
        message: 'Here is the file.',
        attachment,
      },
    })
    expect(staffAttachment.ok()).toBeTruthy()
    const staffBody = await staffAttachment.json() as { message: { id: string; created_at: string; metadata?: { attachment?: { name?: string } } } }
    expect(staffBody.message.metadata?.attachment?.name).toBe('qa-note.txt')

    const delta = await request.get(`/api/live-chat/conversations/${conversationId}/messages?since=${encodeURIComponent(staffBody.message.created_at)}`, {
      headers: ownerHeaders,
    })
    expect(delta.ok()).toBeTruthy()
    expect((await delta.json() as { messages: unknown[] }).messages).toHaveLength(0)

    const widgetMessages = await request.get(`/api/live-chat/widget/messages?conversation_id=${conversationId}`)
    expect(widgetMessages.ok()).toBeTruthy()
    const widgetBody = await widgetMessages.json() as { messages: { metadata?: { attachment?: { name?: string } }; read_at?: string | null }[] }
    expect(widgetBody.messages.some(message => message.metadata?.attachment?.name === 'qa-note.txt')).toBe(true)

    const staffAfterWidgetRead = await sb
      .from('messages')
      .select('id,read_at,metadata')
      .eq('id', staffBody.message.id)
      .single()
    expect(staffAfterWidgetRead.error).toBeNull()
    expect(staffAfterWidgetRead.data?.read_at).toBeTruthy()

    const conversation = await sb
      .from('conversations')
      .select('assigned_to,status')
      .eq('id', conversationId)
      .single()
    expect(conversation.data?.assigned_to).toBe('Primary Agent')
    expect(conversation.data?.status).toBe('live_chat')
  } finally {
    if (conversationId) {
      await sb.from('handover_events').delete().eq('conversation_id', conversationId)
      await sb.from('follow_ups').delete().eq('conversation_id', conversationId)
      await sb.from('lead_memory').delete().eq('conversation_id', conversationId)
      await sb.from('leads').delete().eq('conversation_id', conversationId)
      await sb.from('messages').delete().eq('conversation_id', conversationId)
      await sb.from('conversations').delete().eq('id', conversationId)
    }
    await sb.from('live_chat_settings').delete().eq('business_id', businessId)
    await sb.from('team_members').delete().in('id', [ownerId, otherId])
    await sb.from('businesses').delete().eq('id', businessId)
  }
})
