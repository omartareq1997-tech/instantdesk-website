import { expect, test as base, type Page } from '@playwright/test'

const IGNORED_REQUEST_HOSTS = [
  'clarity.ms',
  'googletagmanager.com',
  'google-analytics.com',
]

function isIgnoredUrl(url: string): boolean {
  return IGNORED_REQUEST_HOSTS.some(host => url.includes(host))
}

export const test = base.extend<{ checkedPage: Page }>({
  checkedPage: async ({ page }, use) => {
    const consoleErrors: string[] = []
    const pageErrors: string[] = []
    const failedResponses: string[] = []

    await page.route('**/*', async (route) => {
      const url = route.request().url()
      if (isIgnoredUrl(url)) {
        await route.fulfill({ status: 204, body: '' })
        return
      }
      await route.fallback()
    })

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })

    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    page.on('response', (response) => {
      const url = response.url()
      if (isIgnoredUrl(url)) return
      if (response.status() >= 400) failedResponses.push(`${response.status()} ${url}`)
    })

    await use(page)

    expect.soft(pageErrors, 'No uncaught browser errors').toEqual([])
    expect.soft(consoleErrors, 'No console.error messages').toEqual([])
    expect.soft(failedResponses, 'No 4xx/5xx page responses').toEqual([])
  },
})

export { expect }
