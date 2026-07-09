import { expect, test } from './fixtures'

const pagesWithWidget = [
  '/',
  '/website-chatbot',
  '/live-chat-for-small-businesses',
]

async function stubChatApi(page: import('@playwright/test').Page) {
  const storedMessages: { id: string; role: string; content: string; created_at?: string; metadata?: Record<string, unknown> }[] = []
  let count = 0

  await page.route('**/api/live-chat/widget/messages?**', async route => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'ai_active', messages: storedMessages }),
    })
  })

  await page.route('**/api/chat', async route => {
    const body = route.request().postDataJSON() as { message?: string; conversation_id?: string; client_message_id?: string; turn_id?: string }
    const conversationId = body.conversation_id ?? 'pw-live-chat-conversation'
    count += 1
    const userMessage = { id: `u-${count}`, role: 'user', content: body.message ?? '', created_at: new Date(Date.now() + count).toISOString(), metadata: { client_message_id: body.client_message_id } }
    const assistantMessage = { id: `a-${count}`, role: 'assistant', content: `Reply ${count}: ${body.message ?? ''}`, created_at: new Date(Date.now() + count + 1).toISOString(), metadata: { turn_id: body.turn_id } }
    storedMessages.push(userMessage, assistantMessage)
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reply: `Reply ${count}: ${body.message ?? ''}`, conversation_id: conversationId, user_message: userMessage, assistant_message: assistantMessage }),
    })
  })

  return storedMessages
}

test.describe('Live Chat widget', () => {
  for (const path of pagesWithWidget) {
    test(`loads without errors on ${path}`, async ({ checkedPage: page }) => {
      await stubChatApi(page)
      await page.goto(path)
      await expect(page.getByRole('button', { name: /open ai chat/i })).toBeVisible()
      await page.getByRole('button', { name: /open ai chat/i }).click()
      await expect(page.getByText('InstantDesk AI').first()).toBeVisible()
      await expect(page.getByPlaceholder('Type a message…')).toBeVisible()
    })
  }

  test('opens, closes, reopens, and handles rapid toggles', async ({ checkedPage: page }) => {
    await stubChatApi(page)
    await page.goto('/')
    const toggle = page.getByRole('button', { name: /open ai chat|close chat/i })

    await toggle.click()
    await expect(page.getByText('InstantDesk AI').first()).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'InstantDesk live chat' })).toBeVisible()
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByText('InstantDesk AI').first()).toBeHidden()
    await toggle.click()
    await expect(page.getByText('InstantDesk AI').first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByText('InstantDesk AI').first()).toBeHidden()
    await toggle.click()
    await expect(page.getByText('InstantDesk AI').first()).toBeVisible()

    for (let i = 0; i < 6; i += 1) await toggle.click()
    await expect(page.getByText('InstantDesk AI').first()).toBeVisible()
  })

  test('sends short, long, emoji, URL, markdown, special, and multi-line messages in order', async ({ checkedPage: page }) => {
    await stubChatApi(page)
    const sent: string[] = []
    page.on('request', request => {
      if (request.url().endsWith('/api/chat')) sent.push((request.postDataJSON() as { message: string }).message)
    })

    await page.goto('/')
    await page.getByRole('button', { name: /open ai chat/i }).click()
    const input = page.getByPlaceholder('Type a message…')
    const messages = [
      'Hi',
      `Long ${'message '.repeat(80)}`,
      'Emoji test 😀🚀',
      'Special chars <>&"\'',
      '**Markdown** _test_ [link](https://example.com)',
      'https://example.com/chat?x=1&y=2',
      'Line one\nLine two',
    ]

    for (const message of messages) {
      await input.fill(message)
      await page.getByRole('button', { name: 'Send message' }).click()
      await expect(page.getByText(`Reply ${sent.length}: ${message}`)).toBeVisible()
    }

    await input.fill('   ')
    await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled()
    expect(sent).toEqual(messages.map(message => message.trim()))
  })

  test('persists conversation across refresh and tabs', async ({ checkedPage: page, context }) => {
    await stubChatApi(page)
    await page.goto('/')
    await page.getByRole('button', { name: /open ai chat/i }).click()
    await page.getByPlaceholder('Type a message…').fill('Persist this chat')
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page.getByText('Reply 1: Persist this chat')).toBeVisible()

    await page.reload()
    await expect(page.getByText('InstantDesk AI').first()).toBeVisible()
    await expect(page.getByText('Persist this chat', { exact: true })).toBeVisible()

    const tab = await context.newPage()
    await stubChatApi(tab)
    await tab.goto('/')
    await expect(tab.getByText('InstantDesk AI').first()).toBeVisible()
  })

  test('reconciles returned assistant message with polling without duplicate flicker', async ({ checkedPage: page }) => {
    await stubChatApi(page)
    await page.goto('/')
    await page.getByRole('button', { name: /open ai chat/i }).click()
    await page.getByPlaceholder('Type a message…').fill('No duplicate please')
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page.getByText('Reply 1: No duplicate please')).toBeVisible()
    await expect.poll(async () => page.getByText('Reply 1: No duplicate please').count()).toBe(1)
    await page.waitForTimeout(3300)
    await expect(page.getByText('Reply 1: No duplicate please')).toHaveCount(1)
  })

  test('ignores out-of-order stale polling responses', async ({ checkedPage: page }) => {
    const storedMessages: { id: string; role: string; content: string; created_at?: string; metadata?: Record<string, unknown> }[] = []
    let pollCount = 0
    await page.route('**/api/live-chat/widget/messages?**', async route => {
      pollCount += 1
      if (pollCount === 1) {
        await new Promise(resolve => setTimeout(resolve, 700))
        return route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'ai_active', messages: [] }),
        })
      }
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'ai_active', messages: storedMessages }),
      })
    })
    await page.route('**/api/chat', async route => {
      const body = route.request().postDataJSON() as { message?: string; client_message_id?: string; turn_id?: string }
      const userMessage = { id: 'u-stable', role: 'user', content: body.message ?? '', created_at: new Date().toISOString(), metadata: { client_message_id: body.client_message_id } }
      const assistantMessage = { id: 'a-stable', role: 'assistant', content: 'Stable assistant reply.', created_at: new Date(Date.now() + 1).toISOString(), metadata: { turn_id: body.turn_id } }
      storedMessages.push(userMessage, assistantMessage)
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reply: assistantMessage.content, conversation_id: 'pw-out-of-order-conversation', user_message: userMessage, assistant_message: assistantMessage }),
      })
    })

    await page.goto('/')
    await page.getByRole('button', { name: /open ai chat/i }).click()
    await page.getByPlaceholder('Type a message…').fill('Out of order poll')
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page.getByText('Out of order poll', { exact: true })).toBeVisible()
    await expect(page.getByText('Stable assistant reply.')).toBeVisible()
    await page.waitForTimeout(1000)
    await expect(page.getByText('Out of order poll', { exact: true })).toHaveCount(1)
    await expect(page.getByText('Stable assistant reply.')).toHaveCount(1)
  })

  test('renders injected markup as text and blocks oversized messages', async ({ checkedPage: page }) => {
    await page.addInitScript(() => { window.localStorage.clear(); (window as unknown as { __xss: number }).__xss = 0 })
    await stubChatApi(page)
    await page.goto('/')
    await page.getByRole('button', { name: /open ai chat/i }).click()

    const payload = '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>'
    await page.getByPlaceholder('Type a message…').fill(payload)
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page.getByText(payload).first()).toBeVisible()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __xss: number }).__xss)).toBe(0)

    await page.getByPlaceholder('Type a message…').fill('x'.repeat(4100))
    await expect(page.getByPlaceholder('Type a message…')).toHaveValue('x'.repeat(4000))
  })

  test('shows graceful errors for 429, 500, and malformed JSON', async ({ page }) => {
    let call = 0
    await page.route('**/api/live-chat/widget/messages?**', route => route.fulfill({ status: 200, body: JSON.stringify({ messages: [] }) }))
    await page.route('**/api/chat', async route => {
      call += 1
      if (call === 1) return route.fulfill({ status: 429, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ error: 'Rate limited' }) })
      if (call === 2) return route.fulfill({ status: 500, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ error: 'Server failed' }) })
      return route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: '{bad json' })
    })

    await page.goto('/')
    await page.getByRole('button', { name: /open ai chat/i }).click()
    for (const message of ['one', 'two', 'three']) {
      await page.getByPlaceholder('Type a message…').fill(message)
      await page.getByRole('button', { name: 'Send message' }).click()
    }
    await expect(page.getByText('Rate limited')).toBeVisible()
    await expect(page.getByText('Server failed')).toBeVisible()
    await expect(page.getByText('Invalid server response. Please try again.')).toBeVisible()
  })
})
