import { expect, test } from './fixtures'

test('detects broken internal links, missing anchors, placeholders, and 404s', async ({ checkedPage: page, request, baseURL }) => {
  await page.goto('/')

  const links = await page.locator('a[href]').evaluateAll((anchors) =>
    anchors.map((anchor) => {
      const element = anchor as HTMLAnchorElement
      return {
        text: element.innerText.trim() || element.getAttribute('aria-label') || element.href,
        href: element.getAttribute('href') ?? '',
      }
    }),
  )

  const placeholders = links.filter(link => link.href === '#')
  expect(placeholders, 'No placeholder # links').toEqual([])

  const missingAnchors: string[] = []
  const internalUrls = new Map<string, string>()

  for (const link of links) {
    if (!link.href || link.href.startsWith('mailto:') || link.href.startsWith('tel:')) continue

    const url = new URL(link.href, baseURL)
    if (url.origin !== new URL(baseURL!).origin) continue

    if (url.hash) {
      const exists = await page.locator(url.hash).count()
      if (!exists) missingAnchors.push(`${link.text} -> ${link.href}`)
    }

    url.hash = ''
    internalUrls.set(url.href, link.text)
  }

  expect(missingAnchors, 'Every hash link points to an existing section').toEqual([])

  const broken: string[] = []
  for (const url of internalUrls.keys()) {
    const response = await request.get(url, { maxRedirects: 5 })
    if (response.status() >= 400) broken.push(`${response.status()} ${url}`)
  }

  expect(broken, 'No internal links return 4xx/5xx').toEqual([])
})

