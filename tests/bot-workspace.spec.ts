import { expect, test } from './fixtures'
import { signMemberToken } from '../app/lib/auth'

async function addMemberSessionCookie(page: import('@playwright/test').Page, baseURL?: string) {
  const token = await signMemberToken({ id: 'bot-workspace-member', name: 'Bot Workspace QA', role: 'owner' })
  await page.context().addCookies([{
    name: 'member_session',
    value: token,
    url: baseURL ?? 'http://127.0.0.1:3106',
  }])
}

test('Bots workspace selection is passed to Test AI requests', async ({ checkedPage: page, baseURL }) => {
  await addMemberSessionCookie(page, baseURL)

  await page.route('**/api/business/settings', async route => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ businessType: 'car_rental' }),
    })
  })

  await page.route('**/api/bots', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          bots: [
            {
              id: 'bot-car-rental',
              name: 'Car Rental Operations Assistant',
              active: true,
              business_type: 'car_rental',
              model: 'gemini-2.5-pro',
              tone: 'professional',
              is_default_website_bot: true,
            },
            {
              id: 'bot-real-estate',
              name: 'Dubai Real Estate Assistant',
              active: true,
              business_type: 'real_estate',
              model: 'gpt-4o-mini',
              tone: 'luxury',
              is_default_website_bot: false,
            },
          ],
        }),
      })
      return
    }
    await route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
  })

  await page.route('**/api/ai-agent/agent**', async route => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agent: {
          id: 'bot-car-rental',
          name: 'Car Rental Operations Assistant',
          persona: 'You are a car rental operations assistant.',
          objective: 'Handle fleet and booking questions.',
          tone: 'professional',
          fallback_msg: 'I will connect you with the team.',
          model: 'gemini-2.5-pro',
          temperature: 0.4,
        },
      }),
    })
  })

  const capturedChat: { payload?: { bot_id?: unknown; test_ai?: unknown } } = {}
  await page.route('**/api/chat', async route => {
    capturedChat.payload = route.request().postDataJSON() as { bot_id?: unknown; test_ai?: unknown }
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        reply: 'Car rental assistant reply.',
        conversation_id: 'conversation-test',
        debug: {
          confirmedSlots: {},
          missingSlots: ['pickup_datetime'],
          isQualified: false,
          ai_summary: 'Car rental assistant reply.',
          blocked: false,
          businessType: 'car_rental',
          bot: {
            id: 'bot-car-rental',
            name: 'Car Rental Operations Assistant',
            businessId: 'business-test',
            businessType: 'car_rental',
            model: 'gemini-2.5-pro',
            resolution: 'business_default_website_bot',
            toolsEnabled: ['searchFleet'],
            instructionPreview: 'You are a car rental operations assistant.',
          },
        },
      }),
    })
  })

  await page.goto('/dashboard#bots')
  await expect(page.getByRole('heading', { name: 'Car Rental Operations Assistant' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Default website bot' })).toBeVisible()

  await page.getByRole('button', { name: /Test bot/i }).click()
  await expect(page).toHaveURL(/#ai_test/)
  await page.getByPlaceholder('Type a message and press Enter…').fill('hi')
  await page.keyboard.press('Enter')

  await expect(page.getByText('Car rental assistant reply.').first()).toBeVisible()
  expect(capturedChat.payload?.bot_id).toBe('bot-car-rental')
  expect(capturedChat.payload?.test_ai).toBe(true)
})
