import { NextRequest, NextResponse } from 'next/server'
import Firecrawl, { type CrawlJob, type Document, type ScrapeOptions } from '@mendable/firecrawl-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Mode = 'scrape' | 'crawl'

interface ExtractedPage {
  url: string
  title: string
  headings: string[]
  contacts: string[]
  services: string[]
  summary: string
  markdownPreview: string
}

interface HeadingEntry {
  level: string
  text: string
}

interface WebsiteAudit {
  hero: {
    headline: string
    subheadline: string
    primaryCta: string
    secondaryCta: string
  }
  navigation: {
    menuItems: string[]
  }
  socialProof: {
    logos: string[]
    testimonials: string[]
    trustIndicators: string[]
  }
  leadCapture: {
    forms: string[]
    bookingWidgets: string[]
    contactOptions: string[]
  }
  design: {
    colorPalette: string[]
    buttonStyles: string[]
    layoutPatterns: string[]
  }
  seo: {
    title: string
    metaDescription: string
    headingStructure: HeadingEntry[]
  }
  strategy: {
    strengths: string[]
    weaknesses: string[]
    opportunities: string[]
    recommendations: string[]
  }
}

const SERVICE_PATTERNS = [
  'ai receptionist',
  'website chatbot',
  'chatbot',
  'live chat',
  'human handover',
  'whatsapp automation',
  'instagram dm automation',
  'messenger bot',
  'telegram bot',
  'phone receptionist',
  'booking',
  'scheduling',
  'appointment',
  'lead capture',
  'lead qualification',
  'lead scoring',
  'crm sync',
  'calendar sync',
  'follow-up',
  'review automation',
  'workflow automation',
  'data export',
]

function normalizeUrl(raw: string): string {
  const value = raw.trim()
  if (!value) throw new Error('URL is required')
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`
  const url = new URL(withProtocol)
  url.hash = ''
  return url.toString()
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(v => v.trim()).filter(Boolean))]
}

function metaString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function textFromHtml(value: string): string {
  return decodeEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function stripMarkdown(value: string): string {
  return value
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]*\)/g, match => match.replace(/^\[/, '').replace(/]\([^)]*\)$/, ''))
    .replace(/[`*_>#|-]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function cleanText(value: string, maxLength = 180): string {
  return stripMarkdown(textFromHtml(value)).replace(/\s{2,}/g, ' ').trim().slice(0, maxLength)
}

function extractHeadings(doc: Document): string[] {
  const markdown = doc.markdown ?? ''
  const html = doc.html ?? ''
  const fromMarkdown = [...markdown.matchAll(/^#{1,3}\s+(.+)$/gm)].map(match => stripMarkdown(match[1]).slice(0, 140))
  const fromHtml = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map(match =>
    match[1].replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 140),
  )
  return unique([...fromMarkdown, ...fromHtml]).slice(0, 20)
}

function extractHeadingStructure(doc: Document): HeadingEntry[] {
  const markdown = doc.markdown ?? ''
  const html = doc.html ?? ''
  const fromMarkdown = [...markdown.matchAll(/^(#{1,6})\s+(.+)$/gm)].map(match => ({
    level: `h${match[1].length}`,
    text: stripMarkdown(match[2]).slice(0, 160),
  }))
  const fromHtml = [...html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)].map(match => ({
    level: `h${match[1]}`,
    text: cleanText(match[2], 160),
  }))
  const seen = new Set<string>()
  return [...fromMarkdown, ...fromHtml]
    .filter(item => {
      const key = `${item.level}:${item.text.toLowerCase()}`
      if (!item.text || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 40)
}

function extractContacts(text: string): string[] {
  const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []
  const phones = (text.match(/(?:\+\d{1,3}[\s().-]*)?(?:\(?\d{2,4}\)?[\s.-]*){2,5}\d{2,4}/g) ?? [])
    .filter(phone => {
      const digits = phone.replace(/\D/g, '')
      return digits.length >= 9 && digits.length <= 15 && /[\s().+-]/.test(phone)
    })
  return unique([...emails, ...phones]).slice(0, 20)
}

function extractServices(text: string): string[] {
  const lower = text.toLowerCase()
  return SERVICE_PATTERNS
    .filter(service => lower.includes(service))
    .map(service => service.replace(/\b\w/g, char => char.toUpperCase()))
    .slice(0, 20)
}

function extractMetaDescription(doc: Document): string {
  const metadata = doc.metadata ?? {}
  const fromMetadata = metaString(metadata.description) || metaString(metadata.ogDescription)
  if (fromMetadata) return fromMetadata.slice(0, 260)

  const html = doc.html ?? ''
  const match = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*>/i)
  return match ? decodeEntities(match[1]).trim().slice(0, 260) : ''
}

function extractAnchorTexts(html: string, markdown: string): string[] {
  const fromHtml = [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map(match => cleanText(match[1], 80))
  const fromMarkdown = [...markdown.matchAll(/\[([^\]]{1,80})]\(([^)]+)\)/g)].map(match => stripMarkdown(match[1]).slice(0, 80))
  return unique([...fromHtml, ...fromMarkdown]).filter(item => item.length > 1).slice(0, 40)
}

function extractNavigation(doc: Document): string[] {
  const html = doc.html ?? ''
  const markdown = doc.markdown ?? ''
  const navBlocks = [...html.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/gi)].map(match => match[1]).join('\n')
  const navItems = extractAnchorTexts(navBlocks, '')
  return (navItems.length ? navItems : extractAnchorTexts(html, markdown)).slice(0, 14)
}

function extractCtas(doc: Document): string[] {
  const html = doc.html ?? ''
  const markdown = doc.markdown ?? ''
  const topHtml = html.slice(0, 20_000)
  const buttons = [...topHtml.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)].map(match => cleanText(match[1], 80))
  const anchors = extractAnchorTexts(topHtml, markdown.slice(0, 8_000))
  const ctaWords = /\b(start|get|try|book|schedule|demo|contact|call|quote|consultation|sign up|learn|talk|chat|see|watch|discover|explore|how it works)\b/i
  return unique([...buttons, ...anchors]).filter(text => ctaWords.test(text)).slice(0, 8)
}

function extractParagraphs(doc: Document): string[] {
  const htmlParagraphs = [...(doc.html ?? '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(match => cleanText(match[1], 240))
  const markdownParagraphs = (doc.markdown ?? '')
    .split(/\n{2,}/)
    .map(item => stripMarkdown(item).slice(0, 240))
    .filter(item => item.length > 45)
  return unique([...htmlParagraphs, ...markdownParagraphs]).slice(0, 30)
}

function extractHero(doc: Document, page: ExtractedPage, headingStructure: HeadingEntry[]): WebsiteAudit['hero'] {
  const paragraphs = extractParagraphs(doc)
  const ctas = extractCtas(doc)
  const headline = headingStructure.find(heading => heading.level === 'h1')?.text || page.headings[0] || page.title
  const subheadline = extractMetaDescription(doc) || paragraphs.find(paragraph => paragraph !== headline) || 'No clear hero subheadline detected.'
  return {
    headline,
    subheadline,
    primaryCta: ctas[0] || 'No primary CTA detected.',
    secondaryCta: ctas[1] || 'No secondary CTA detected.',
  }
}

function extractImageAlts(html: string): string[] {
  return unique([...html.matchAll(/<img\b[^>]*alt=["']([^"']+)["'][^>]*>/gi)].map(match => decodeEntities(match[1]).trim()))
    .filter(alt => alt.length > 1 && alt.length < 80)
    .slice(0, 12)
}

function extractTestimonials(markdown: string, htmlText: string): string[] {
  const lines = `${markdown}\n${htmlText}`.split(/\n|(?<=\.)\s+/)
  return unique(lines
    .map(line => cleanText(line, 220))
    .filter(line => line.length > 35 && /testimonial|review|client|customer|rated|stars|“|"|success|helped/i.test(line)))
    .slice(0, 8)
}

function extractTrustIndicators(text: string): string[] {
  const matches = text.match(/\b(?:\d{2,5}\+|\d+(?:\.\d+)?%|4\.\d\/5|trusted by|gdpr|soc ?2|iso ?27001|secure|reviews?|clients?|customers?|case studies|money-back|guarantee)\b/gi) ?? []
  return unique(matches.map(match => match.replace(/\s{2,}/g, ' '))).slice(0, 12)
}

function extractLeadCapture(doc: Document, contacts: string[]): WebsiteAudit['leadCapture'] {
  const html = doc.html ?? ''
  const text = `${doc.markdown ?? ''}\n${textFromHtml(html)}`
  const formCount = (html.match(/<form\b/gi) ?? []).length
  const fieldNames = unique([...html.matchAll(/<(?:input|textarea|select)\b[^>]*(?:name|placeholder|aria-label)=["']([^"']+)["'][^>]*>/gi)].map(match => cleanText(match[1], 60))).slice(0, 10)
  const forms = formCount
    ? [`${formCount} form${formCount === 1 ? '' : 's'} detected${fieldNames.length ? ` with fields: ${fieldNames.join(', ')}` : ''}.`]
    : []
  const bookingMatches = unique((text.match(/\b(?:book|booking|schedule|calendar|appointment|consultation|demo|meeting)\b[^.\n]{0,90}/gi) ?? []).map(match => cleanText(match, 130))).slice(0, 8)
  const contactLinks = unique([
    ...contacts,
    ...[...html.matchAll(/href=["'](?:mailto:|tel:)([^"']+)["']/gi)].map(match => decodeEntities(match[1])),
  ]).slice(0, 12)

  return {
    forms,
    bookingWidgets: bookingMatches,
    contactOptions: contactLinks,
  }
}

function extractDesign(doc: Document): WebsiteAudit['design'] {
  const html = doc.html ?? ''
  const classText = html.toLowerCase()
  const colors = unique([
    ...(html.match(/#[0-9a-f]{3,8}\b/gi) ?? []),
    ...(classText.match(/\b(?:violet|purple|blue|cyan|emerald|green|amber|orange|red|pink|slate|zinc|neutral|black|white)\b/g) ?? []),
  ]).slice(0, 10)

  const buttonStyles = unique([
    (html.match(/<button\b/gi) ?? []).length ? `${(html.match(/<button\b/gi) ?? []).length} HTML button element(s)` : '',
    classText.includes('rounded') ? 'Rounded buttons' : '',
    classText.includes('gradient') ? 'Gradient treatments' : '',
    classText.includes('border') ? 'Outlined or bordered controls' : '',
    classText.includes('shadow') ? 'Elevated buttons/cards' : '',
  ]).slice(0, 8)

  const layoutPatterns = unique([
    classText.includes('grid') ? 'Grid sections' : '',
    classText.includes('flex') ? 'Flexible row/column layouts' : '',
    classText.includes('card') || classText.includes('rounded') ? 'Card-based content blocks' : '',
    classText.includes('sticky') || classText.includes('fixed') ? 'Sticky/fixed navigation elements' : '',
    /faq|pricing|testimonial|case stud|logos?|features/i.test(`${doc.markdown ?? ''}\n${html}`) ? 'Conversion-focused landing sections' : '',
  ]).slice(0, 8)

  return { colorPalette: colors, buttonStyles, layoutPatterns }
}

function buildStrategyAudit(
  page: ExtractedPage,
  audit: Omit<WebsiteAudit, 'strategy'>,
): WebsiteAudit['strategy'] {
  const h1Count = audit.seo.headingStructure.filter(heading => heading.level === 'h1').length
  const strengths = unique([
    audit.hero.headline && !audit.hero.headline.startsWith('No ') ? 'Clear hero headline is present.' : '',
    audit.hero.primaryCta && !audit.hero.primaryCta.startsWith('No ') ? 'Primary CTA is detectable near the top of the page.' : '',
    audit.socialProof.trustIndicators.length || audit.socialProof.testimonials.length || audit.socialProof.logos.length ? 'Social proof or trust signals are visible.' : '',
    page.services.length ? 'The page communicates identifiable service categories.' : '',
    audit.leadCapture.contactOptions.length ? 'Visitors have at least one clear contact path.' : '',
  ])

  const weaknesses = unique([
    !audit.seo.metaDescription ? 'Meta description was not detected.' : '',
    h1Count === 0 ? 'No H1 was detected.' : '',
    h1Count > 1 ? 'Multiple H1 headings may dilute page hierarchy.' : '',
    audit.hero.secondaryCta.startsWith('No ') ? 'Secondary CTA is missing or not obvious.' : '',
    !audit.leadCapture.forms.length && !audit.leadCapture.bookingWidgets.length ? 'No form or booking path was detected.' : '',
    !audit.socialProof.trustIndicators.length && !audit.socialProof.testimonials.length && !audit.socialProof.logos.length ? 'Social proof appears limited.' : '',
  ])

  const opportunities = unique([
    'Make the hero CTA match the highest-value conversion action.',
    'Add compact trust indicators close to the hero and lead capture areas.',
    page.contacts.length ? 'Use detected contact options as persistent header/footer conversion paths.' : 'Add phone, email, or chat contact options for high-intent visitors.',
    page.services.length ? `Create dedicated sections or pages for: ${page.services.slice(0, 4).join(', ')}.` : '',
    audit.seo.headingStructure.length ? 'Tighten heading hierarchy so each section supports search intent.' : '',
  ])

  const recommendations = unique([
    'Keep one concise H1, one clear subheadline, and one dominant primary CTA above the fold.',
    'Place testimonials, logos, reviews, or numeric proof within the first two screenfuls.',
    'Add a short lead form or booking widget with minimal required fields.',
    'Ensure every major service has a descriptive H2 and supporting conversion CTA.',
    audit.seo.metaDescription ? 'Review the meta description for specificity and conversion language.' : 'Add a unique meta description that states the offer, audience, and outcome.',
  ])

  return { strengths, weaknesses, opportunities, recommendations }
}

function buildAudit(docs: Document[], pages: ExtractedPage[]): WebsiteAudit {
  const primaryDoc = docs[0]
  const primaryPage = pages[0]
  const combinedText = docs.map(doc => `${doc.markdown ?? ''}\n${textFromHtml(doc.html ?? '')}`).join('\n')
  const headingStructure = primaryDoc ? extractHeadingStructure(primaryDoc) : []
  const seo = {
    title: primaryPage?.title ?? '',
    metaDescription: primaryDoc ? extractMetaDescription(primaryDoc) : '',
    headingStructure,
  }
  const hero = primaryDoc && primaryPage
    ? extractHero(primaryDoc, primaryPage, headingStructure)
    : { headline: 'No headline detected.', subheadline: 'No subheadline detected.', primaryCta: 'No primary CTA detected.', secondaryCta: 'No secondary CTA detected.' }
  const navigation = { menuItems: primaryDoc ? extractNavigation(primaryDoc) : [] }
  const socialProof = {
    logos: primaryDoc ? extractImageAlts(primaryDoc.html ?? '') : [],
    testimonials: primaryDoc ? extractTestimonials(primaryDoc.markdown ?? '', textFromHtml(primaryDoc.html ?? '')) : [],
    trustIndicators: extractTrustIndicators(combinedText),
  }
  const leadCapture = primaryDoc ? extractLeadCapture(primaryDoc, unique(pages.flatMap(page => page.contacts))) : { forms: [], bookingWidgets: [], contactOptions: [] }
  const design = primaryDoc ? extractDesign(primaryDoc) : { colorPalette: [], buttonStyles: [], layoutPatterns: [] }
  const auditWithoutStrategy = { hero, navigation, socialProof, leadCapture, design, seo }

  return {
    ...auditWithoutStrategy,
    strategy: buildStrategyAudit(primaryPage ?? {
      url: '',
      title: '',
      headings: [],
      contacts: [],
      services: [],
      summary: '',
      markdownPreview: '',
    }, auditWithoutStrategy),
  }
}

function buildFallbackSummary(page: ExtractedPage): string {
  const parts = [
    page.title ? `Page: ${page.title}.` : '',
    page.headings.length ? `Key sections: ${page.headings.slice(0, 5).join(', ')}.` : '',
    page.services.length ? `Detected services: ${page.services.slice(0, 6).join(', ')}.` : '',
    page.contacts.length ? `Contact information found: ${page.contacts.slice(0, 4).join(', ')}.` : '',
  ].filter(Boolean)
  return parts.join(' ') || 'Firecrawl extracted the page, but there was not enough structured text to summarize.'
}

function pageFromDocument(doc: Document, fallbackUrl: string): ExtractedPage {
  const markdown = doc.markdown ?? ''
  const text = `${markdown}\n${doc.summary ?? ''}\n${textFromHtml(doc.html ?? '')}`
  const title = metaString(doc.metadata?.title) || metaString(doc.metadata?.ogTitle) || new URL(fallbackUrl).hostname
  const url = metaString(doc.metadata?.sourceURL) || metaString(doc.metadata?.url) || fallbackUrl

  const page: ExtractedPage = {
    url,
    title,
    headings: extractHeadings(doc),
    contacts: extractContacts(text),
    services: extractServices(text),
    summary: metaString(doc.summary),
    markdownPreview: stripMarkdown(markdown).slice(0, 900),
  }

  if (!page.summary) page.summary = buildFallbackSummary(page)
  return page
}

function combinedSummary(pages: ExtractedPage[], mode: Mode): string {
  const services = unique(pages.flatMap(page => page.services)).slice(0, 10)
  const contacts = unique(pages.flatMap(page => page.contacts)).slice(0, 8)
  const titles = pages.map(page => page.title).filter(Boolean).slice(0, 6)
  const parts = [
    `${mode === 'crawl' ? 'Crawled' : 'Scraped'} ${pages.length} page${pages.length === 1 ? '' : 's'}.`,
    titles.length ? `Main pages: ${titles.join(', ')}.` : '',
    services.length ? `Detected service areas: ${services.join(', ')}.` : '',
    contacts.length ? `Contact signals: ${contacts.join(', ')}.` : '',
  ].filter(Boolean)
  return parts.join(' ')
}

function crawlDocuments(job: CrawlJob): Document[] {
  return Array.isArray(job.data) ? job.data : []
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { url?: unknown; mode?: unknown; limit?: unknown }
  const mode: Mode = body.mode === 'crawl' ? 'crawl' : 'scrape'
  const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 25)

  let url: string
  try {
    url = normalizeUrl(typeof body.url === 'string' ? body.url : '')
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid URL' }, { status: 400 })
  }

  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'FIRECRAWL_API_KEY is not configured' }, { status: 500 })
  }

  try {
    const firecrawl = new Firecrawl({ apiKey, timeoutMs: 60_000, maxRetries: 2 })
    const scrapeOptions: ScrapeOptions = { formats: ['markdown', 'html', 'summary'] }

    const docs = mode === 'crawl'
      ? crawlDocuments(await firecrawl.crawl(url, {
          limit,
          scrapeOptions,
          pollInterval: 2,
          timeout: 55,
        }))
      : [await firecrawl.scrape(url, scrapeOptions)]

    const pages = docs.map(doc => pageFromDocument(doc, url))
    const audit = buildAudit(docs, pages)

    return NextResponse.json({
      mode,
      inputUrl: url,
      pageCount: pages.length,
      pages,
      contacts: unique(pages.flatMap(page => page.contacts)),
      services: unique(pages.flatMap(page => page.services)),
      headings: unique(pages.flatMap(page => page.headings)),
      aiSummary: combinedSummary(pages, mode),
      audit,
    })
  } catch (error) {
    console.error('[firecrawl-test] Firecrawl request failed:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Firecrawl request failed',
    }, { status: 500 })
  }
}
