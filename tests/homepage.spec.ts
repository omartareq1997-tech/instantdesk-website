import { expect, test } from './fixtures'

const navTargets = [
  { name: 'Features', href: '/#features', selector: '#features' },
  { name: 'Solutions', href: '/#interactive-demo', selector: '#interactive-demo' },
  { name: 'Resources', href: '/#pricing', selector: '#pricing' },
  { name: 'Company', href: '/#demo', selector: '#demo' },
]

async function openHome(page: import('@playwright/test').Page) {
  await page.goto('/')
  await expect(page).toHaveTitle(/InstantDesk/)
  await expect(page.getByRole('heading', { name: /AI Receptionist \+ Live Chat/i })).toBeVisible()
}

function visibleDemoButton(page: import('@playwright/test').Page) {
  return page
    .locator('button:visible')
    .filter({ hasText: /Get Demo|Get Personalized Demo/ })
    .first()
}

test('homepage loads successfully', async ({ checkedPage: page }) => {
  await openHome(page)
  await expect(page.getByRole('navigation').first()).toBeVisible()
  await expect(page.getByText(/Built for local service businesses/i)).toBeVisible()
})

test('all primary navigation links scroll to valid sections', async ({ checkedPage: page }) => {
  await openHome(page)

  const isMobileNav = (page.viewportSize()?.width ?? 1280) < 768
  if (isMobileNav) await page.getByRole('button', { name: 'Open menu' }).click()

  for (const target of navTargets) {
    const link = page.getByRole('navigation').first().locator(`a[href="${target.href}"]:visible`).first()
    await expect(link, `${target.name} nav link is visible`).toBeVisible()
    await link.click()
    await expect(page.locator(target.selector)).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`${target.selector}$`))

    if (isMobileNav) await page.getByRole('button', { name: 'Open menu' }).click()
  }
})

test('desktop mega menu opens populated content for every nav group', async ({ checkedPage: page }) => {
  await openHome(page)

  const isMobileNav = (page.viewportSize()?.width ?? 1280) < 768
  if (isMobileNav) return

  const groups = [
    { nav: 'Features', item: 'AI Receptionist' },
    { nav: 'Solutions', item: 'Dental Clinics' },
    { nav: 'Resources', item: 'Pricing' },
    { nav: 'Company', item: 'Client Login' },
  ]

  const header = page.locator('header')
  for (const group of groups) {
    await header.getByRole('link', { name: group.nav }).hover()
    await expect(header.getByRole('link', { name: group.item })).toBeVisible()
    expect(await header.locator('a:visible').count()).toBeGreaterThan(8)
  }
})

test('homepage buttons and interactive controls respond', async ({ checkedPage: page }) => {
  await openHome(page)

  await visibleDemoButton(page).click()
  await expect(page.getByRole('heading', { name: /Book Your Personalised Demo/i })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: /Book Your Personalised Demo/i })).toBeHidden()

  await page.getByRole('link', { name: /See How It Works/i }).click()
  await expect(page.locator('#how-it-works')).toBeVisible()

  await page.getByRole('link', { name: /Start Growing/i }).click()
  await expect(page.locator('#demo')).toBeVisible()

  const industryButtons = ['Real Estate', 'Schools', 'Clinics', 'Restaurants', 'Salons', 'Car Dealers']
  for (const name of industryButtons) {
    const button = page.getByRole('button', { name }).first()
    await button.scrollIntoViewIfNeeded()
    await button.click()
    await expect(button).toBeVisible()
  }
})

test('header sign up opens account creation separately from demo', async ({ checkedPage: page }) => {
  await openHome(page)

  const isMobileNav = (page.viewportSize()?.width ?? 1280) < 768
  if (isMobileNav) await page.getByRole('button', { name: 'Open menu' }).click()

  const signUpLink = page.getByRole('navigation').first().getByRole('link', { name: /Sign Up/i }).first()
  await expect(signUpLink).toBeVisible()
  await expect(signUpLink).toHaveAttribute('href', '/login?mode=signup')

  await Promise.all([
    page.waitForURL(/\/login\?mode=signup$/),
    signUpLink.click(),
  ])

  await expect(page.getByRole('heading', { name: /Create account/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Create account/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Book Your Personalised Demo/i })).toHaveCount(0)
})

test('demo/contact form validates and submits', async ({ checkedPage: page }) => {
  await page.route('**/api/demo-lead', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  })

  await openHome(page)
  await visibleDemoButton(page).click()
  await expect(page.getByRole('heading', { name: /Book Your Personalised Demo/i })).toBeVisible()

  await page.getByRole('button', { name: /Book My Personalised Demo/i }).click()
  await expect(page.getByText(/Full name is required/i)).toBeVisible()
  await expect(page.getByText(/Business name is required/i)).toBeVisible()

  await page.getByPlaceholder('Anna Kowalska').fill('Playwright Tester')
  await page.getByPlaceholder('Kowalski & Co.').fill('InstantDesk QA')
  await page.getByPlaceholder('anna@company.com').fill('qa@instantdesk.pl')
  await page.getByPlaceholder('+48 600 000 000').fill('+48 600 000 000')
  await page.getByPlaceholder('https://yourwebsite.com').fill('https://instantdesk.pl')
  await page.getByPlaceholder(/Tell us about your business/i).fill('Automated Playwright test submission.')

  await page.getByRole('button', { name: /Book My Personalised Demo/i }).click()
  await expect(page.getByText(/You're on the list, Playwright/i)).toBeVisible()
})

test('responsive layout has no horizontal overflow', async ({ checkedPage: page }, testInfo) => {
  await openHome(page)

  const overflow = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    navVisible: !!document.querySelector('nav'),
  }))

  expect(overflow.navVisible).toBe(true)
  expect(overflow.scrollWidth, `${testInfo.project.name} should not horizontally overflow`).toBeLessThanOrEqual(overflow.clientWidth + 1)
})
