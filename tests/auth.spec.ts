import { expect, test } from './fixtures'
import { signMemberToken } from '../app/lib/auth'

async function addMemberSessionCookie(page: import('@playwright/test').Page, baseURL?: string) {
  const cookieURL = baseURL ?? 'http://127.0.0.1:3106'
  const token = await signMemberToken({
    id:   'playwright-member',
    name: 'Playwright User',
    role: 'owner',
  })
  await page.context().addCookies([{
    name:  'member_session',
    value: token,
    url:   cookieURL,
  }])
}

test('client login links to password reset form', async ({ checkedPage: page }) => {
  await page.goto('/client-login')

  const forgotLink = page.getByRole('link', { name: /forgot your password\?/i })
  await expect(forgotLink).toBeVisible()

  await Promise.all([
    page.waitForURL(/\/forgot-password$/),
    forgotLink.click(),
  ])
  await expect(page.getByRole('heading', { name: /Reset password/i })).toBeVisible()
  await expect(page.getByPlaceholder('Email address')).toBeVisible()
  await expect(page.getByRole('button', { name: /Send reset link/i })).toBeVisible()
})

test('owner login page is visible and links to forgot password', async ({ checkedPage: page }) => {
  await page.goto('/login')

  await expect(page.getByRole('heading', { name: /^Sign in$/i })).toBeVisible()
  await expect(page.getByPlaceholder('Email address')).toBeVisible()
  await expect(page.getByPlaceholder('Password')).toBeVisible()

  const forgotLink = page.getByRole('link', { name: /Forgot password\?/i })
  await expect(forgotLink).toBeVisible()

  await Promise.all([
    page.waitForURL(/\/forgot-password$/),
    forgotLink.click(),
  ])
  await expect(page.getByRole('heading', { name: /Reset password/i })).toBeVisible()
})

test('signup route opens create account mode', async ({ checkedPage: page }) => {
  await page.goto('/login?mode=signup')

  await expect(page.getByRole('heading', { name: /Create account/i })).toBeVisible()
  await expect(page.getByPlaceholder('Email address')).toBeVisible()
  await expect(page.getByPlaceholder('Password')).toBeVisible()
  await expect(page.getByRole('button', { name: /Create account/i })).toBeVisible()
})

test('signup confirmation message respects disabled email confirmation flow', async ({ checkedPage: page }) => {
  const token = await signMemberToken({
    id:   'playwright-signup',
    name: 'Playwright Signup',
    role: 'owner',
  })

  await page.route('**/auth/v1/signup**', async route => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        user: { id: 'signup-user', email: 'new-owner@example.com' },
        session: {
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: 'signup-user', email: 'new-owner@example.com' },
        },
      }),
    })
  })

  await page.route('**/api/auth/login', async route => {
    await route.fulfill({
      status:  200,
      headers: {
        'content-type': 'application/json',
        'set-cookie':   `member_session=${token}; Path=/; SameSite=Lax`,
      },
      body: JSON.stringify({ ok: true }),
    })
  })

  await page.goto('/login?mode=signup')
  await page.getByPlaceholder('Email address').fill('new-owner@example.com')
  await page.getByPlaceholder('Password').fill('correct-password')
  await page.getByRole('button', { name: /Create account/i }).click()

  await expect(page.getByText(/Check your email for a confirmation link/i)).toHaveCount(0)
  await expect(page).toHaveURL(/\/dashboard(?:#.*)?$/)
})

test('reset password page renders reset form state', async ({ checkedPage: page }) => {
  await page.goto('/reset-password')

  await expect(page.getByRole('heading', { name: /Create new password/i })).toBeVisible()
  await expect(page.getByText(/Open the password reset link from your email/i)).toBeVisible()
  await expect(page.locator('input[placeholder="New password"]')).toBeVisible()
  await expect(page.locator('input[placeholder="Confirm new password"]')).toBeVisible()
  await expect(page.getByRole('button', { name: /Update password/i })).toBeVisible()
})

test('owner login posts credentials and redirects to dashboard', async ({ checkedPage: page }) => {
  const token = await signMemberToken({
    id:   'playwright-login',
    name: 'Playwright Login',
    role: 'owner',
  })

  await page.route('**/api/auth/login', async route => {
    await route.fulfill({
      status:  200,
      headers: {
        'content-type': 'application/json',
        'set-cookie':   `member_session=${token}; Path=/; SameSite=Lax`,
      },
      body: JSON.stringify({ ok: true }),
    })
  })

  await page.goto('/login')
  await page.getByPlaceholder('Email address').fill('owner@example.com')
  await page.getByPlaceholder('Password').fill('correct-password')

  await Promise.all([
    page.waitForURL(/\/dashboard(?:#.*)?$/),
    page.getByRole('button', { name: /^Sign in/i }).click(),
  ])

  await expect(page.getByTestId('dashboard-shell')).toBeVisible()
})

test('forgot password back to sign in clears reset state and allows login', async ({ checkedPage: page }) => {
  await page.route('**/api/auth/login', async route => {
    await route.fulfill({
      status:  200,
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ ok: true }),
    })
  })

  await page.goto('/login')
  await page.getByRole('link', { name: /Forgot password\?/i }).click()
  await expect(page.getByRole('heading', { name: /Reset password/i })).toBeVisible()

  await page.goto('/reset-password')
  await page.getByRole('button', { name: /Back to sign in/i }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: /^Sign in$/i })).toBeVisible()
  await expect(page.getByText(/Open the password reset link/i)).toHaveCount(0)
})

test('dashboard content uses the full viewport width after sidebar', async ({ checkedPage: page, baseURL }) => {
  await addMemberSessionCookie(page, baseURL)
  await page.goto('/dashboard')

  const shell = page.getByTestId('dashboard-shell')
  const content = page.getByTestId('dashboard-content')
  await expect(shell).toBeVisible()
  await expect(content).toBeVisible()

  const metrics = await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="dashboard-shell"]')!.getBoundingClientRect()
    const content = document.querySelector('[data-testid="dashboard-content"]')!.getBoundingClientRect()
    return {
      viewportWidth: window.innerWidth,
      shellRight:    shell.right,
      contentRight:  content.right,
      contentWidth:  content.width,
      contentLeft:   content.left,
    }
  })

  expect(metrics.shellRight).toBeGreaterThanOrEqual(metrics.viewportWidth - 1)
  expect(metrics.contentRight).toBeGreaterThanOrEqual(metrics.viewportWidth - 1)
  expect(metrics.contentWidth).toBeGreaterThan(metrics.viewportWidth - metrics.contentLeft - 2)
})
