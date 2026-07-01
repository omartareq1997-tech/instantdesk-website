import { createClient } from '@supabase/supabase-js'
import { expect, test } from './fixtures'
import { MEMBER_COOKIE_NAME, signMemberToken } from '../app/lib/auth'
import { buildCustomerTimeline } from '../app/lib/customer-identity'

process.loadEnvFile?.('.env.local')

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env for customer identity QA')
  return createClient(url, key, { auth: { persistSession: false } })
}

test('customer timeline classifies website events chronologically', () => {
  const timeline = buildCustomerTimeline(
    [{ id: 'conv-1', channel: 'website', status: 'live_chat', created_at: '2026-06-28T08:00:00.000Z' }],
    [
      { id: 'm1', conversation_id: 'conv-1', role: 'user', content: 'Hi', created_at: '2026-06-28T08:01:00.000Z', metadata: { sender_type: 'customer' } },
      { id: 'm2', conversation_id: 'conv-1', role: 'assistant', content: 'AI reply', created_at: '2026-06-28T08:02:00.000Z', metadata: {} },
      { id: 'm3', conversation_id: 'conv-1', role: 'assistant', content: 'Human reply', created_at: '2026-06-28T08:03:00.000Z', metadata: { sender_type: 'human' } },
      { id: 'm4', conversation_id: 'conv-1', role: 'system', content: 'Private note', created_at: '2026-06-28T08:04:00.000Z', metadata: { internal_note: true } },
    ],
  )
  expect(timeline.map(item => item.type)).toEqual(['conversation_created', 'customer_message', 'ai_reply', 'human_reply', 'internal_note'])
})

test('customer identity APIs and Live Chat profile support creation, lookup, merge, suggestions, and timeline rendering', async ({ page, request, baseURL }) => {
  const sb = adminClient()
  const businessId = crypto.randomUUID()
  const memberId = crypto.randomUUID()
  const sourceCustomerId = crypto.randomUUID()
  const targetCustomerId = crypto.randomUUID()
  const conversationId = crypto.randomUUID()
  const createdCustomerIds: string[] = [sourceCustomerId, targetCustomerId]

  try {
    await sb.from('businesses').insert({ id: businessId, name: 'QA Customer Identity Business' })
    await sb.from('team_members').insert({
      id: memberId,
      client_id: businessId,
      name: 'Identity Agent',
      email: `identity-agent-${memberId}@example.com`,
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
    await sb.from('customers').insert([
      {
        id: sourceCustomerId,
        business_id: businessId,
        display_name: 'John Website',
        primary_email: 'john@example.com',
        primary_phone: '+15550001111',
        company: 'John Co',
        country: 'PL',
        language: 'en',
        timezone: 'Europe/Warsaw',
        lead_score: 72,
        first_seen_at: new Date(Date.now() - 86_400_000).toISOString(),
        last_seen_at: new Date().toISOString(),
      },
      {
        id: targetCustomerId,
        business_id: businessId,
        display_name: 'John Email',
        primary_email: 'john@example.com',
        primary_phone: '+15550001111',
        company: 'John Co',
        country: 'PL',
        language: 'en',
        timezone: 'Europe/Warsaw',
        lead_score: 84,
        first_seen_at: new Date(Date.now() - 172_800_000).toISOString(),
        last_seen_at: new Date().toISOString(),
      },
    ])
    await sb.from('customer_identities').insert([
      { customer_id: sourceCustomerId, channel: 'website', external_identifier: `website:${conversationId}`, confidence_score: 95, verified: true },
      { customer_id: sourceCustomerId, channel: 'email', external_identifier: 'john@example.com', confidence_score: 100, verified: true },
      { customer_id: targetCustomerId, channel: 'email', external_identifier: `john-${targetCustomerId}@example.com`, confidence_score: 100, verified: true },
    ])
    await sb.from('customer_identity_suggestions').insert({
      business_id: businessId,
      source_customer_id: sourceCustomerId,
      target_customer_id: targetCustomerId,
      reason: 'Possible duplicate',
      confidence_score: 92,
      status: 'pending',
    })
    await sb.from('conversations').insert({
      id: conversationId,
      business_id: businessId,
      customer_id: sourceCustomerId,
      channel: 'website',
      status: 'live_chat',
      assigned_to: 'Identity Agent',
      unread_count: 1,
      last_message_at: new Date().toISOString(),
    })
    await sb.from('messages').insert([
      { conversation_id: conversationId, business_id: businessId, role: 'user', content: 'Identity customer message', metadata: { sender_type: 'customer', delivery_status: 'delivered' } },
      { conversation_id: conversationId, business_id: businessId, role: 'assistant', content: 'Identity human reply', metadata: { sender_type: 'human', delivery_status: 'seen' } },
      { conversation_id: conversationId, business_id: businessId, role: 'system', content: 'Identity private note', metadata: { internal_note: true } },
    ])

    const token = await signMemberToken({ id: memberId, name: 'Identity Agent', role: 'owner' })
    const authHeaders = { cookie: `${MEMBER_COOKIE_NAME}=${token}` }
    await page.context().addCookies([{
      name: MEMBER_COOKIE_NAME,
      value: token,
      url: baseURL ?? 'http://127.0.0.1:3106',
      sameSite: 'Lax',
    }])

    const createResponse = await request.post('/api/customers', {
      headers: authHeaders,
      data: { display_name: 'Created API Customer', primary_email: `created-${memberId}@example.com` },
    })
    const createBody = await createResponse.json() as { customer?: { id: string }; error?: string }
    expect(createResponse.ok(), `create customer failed ${createResponse.status()}: ${JSON.stringify(createBody)}`).toBeTruthy()
    const createdCustomerId = createBody.customer?.id
    expect(createdCustomerId).toBeTruthy()
    createdCustomerIds.push(createdCustomerId!)

    const lookup = await request.get('/api/customers/identity?email=john@example.com', { headers: authHeaders })
    expect(lookup.ok()).toBeTruthy()
    const lookupBody = await lookup.json() as { identities: Array<{ customer_id: string }> }
    expect(lookupBody.identities.some(identity => identity.customer_id === sourceCustomerId)).toBe(true)

    const profile = await request.get(`/api/customers/${sourceCustomerId}`, { headers: authHeaders })
    expect(profile.ok()).toBeTruthy()
    const profileBody = await profile.json() as { profile: { conversation_count: number; lifetime_messages: number; duplicate_suggestions: unknown[]; timeline: Array<{ type: string }> } }
    expect(profileBody.profile.conversation_count).toBe(1)
    expect(profileBody.profile.lifetime_messages).toBe(3)
    expect(profileBody.profile.duplicate_suggestions.length).toBeGreaterThan(0)
    expect(profileBody.profile.timeline.map(item => item.type)).toContain('human_reply')
    expect(profileBody.profile.timeline.map(item => item.type)).toContain('internal_note')

    await page.goto('/dashboard#live_chat')
    const panel = page.getByTestId('dashboard-content')
    await expect(panel.getByText('Customer Profile')).toBeVisible()
    await expect(panel.getByText('John Website').last()).toBeVisible()
    await expect(panel.getByText('Possible duplicate', { exact: true })).toBeVisible()
    await expect(panel.getByText('Identity private note')).toBeVisible()
    await panel.getByRole('button', { name: 'Merge Customers' }).click()
    const mergeDialog = page.getByText('Search, preview conflicts, then merge into the selected target profile.').locator('..').locator('..')
    await page.getByPlaceholder('Search customer by name, email, phone, or company').fill('j')
    await expect(page.getByRole('button', { name: /John Email/i })).toBeVisible()
    await expect(page.locator('mark').filter({ hasText: 'J' }).first()).toBeVisible()
    await page.getByPlaceholder('Search customer by name, email, phone, or company').fill('john@example.com')
    await expect(page.getByRole('button', { name: /John Email/i }).first()).toBeVisible()
    await page.keyboard.press('Escape')

    const merge = await request.post('/api/customers/merge', {
      headers: authHeaders,
      data: { source_customer_id: sourceCustomerId, target_customer_id: targetCustomerId, reason: 'QA duplicate merge' },
    })
    expect(merge.ok()).toBeTruthy()
    const mergeBody = await merge.json() as { merge_id: string; target_customer_id: string }
    expect(mergeBody.target_customer_id).toBe(targetCustomerId)

    const mergedProfile = await request.get(`/api/customers/${targetCustomerId}`, { headers: authHeaders })
    expect(mergedProfile.ok()).toBeTruthy()
    const mergedProfileBody = await mergedProfile.json() as { profile: { conversation_count: number; merge_history: Array<{ id: string }> } }
    expect(mergedProfileBody.profile.conversation_count).toBeGreaterThanOrEqual(1)
    expect(mergedProfileBody.profile.merge_history.some(item => item.id === mergeBody.merge_id)).toBe(true)

    const undo = await request.post('/api/customers/merge', {
      headers: authHeaders,
      data: { action: 'undo', merge_id: mergeBody.merge_id },
    })
    expect(undo.ok()).toBeTruthy()
  } finally {
    await sb.from('customer_identity_suggestions').delete().eq('business_id', businessId)
    await sb.from('customer_merge_history').delete().or(`source_customer_id.in.(${createdCustomerIds.join(',')}),target_customer_id.in.(${createdCustomerIds.join(',')})`)
    await sb.from('customer_identities').delete().in('customer_id', createdCustomerIds)
    await sb.from('messages').delete().eq('conversation_id', conversationId)
    await sb.from('conversations').delete().eq('id', conversationId)
    await sb.from('customers').delete().in('id', createdCustomerIds)
    await sb.from('live_chat_settings').delete().eq('business_id', businessId)
    await sb.from('team_members').delete().eq('id', memberId)
    await sb.from('businesses').delete().eq('id', businessId)
  }
})
