import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'
import { createChunksForSource } from '../../../lib/knowledgeChunks'
import { getLimits, checkSourceLimit, checkCharLimit, checkChunkLimit } from '../../../lib/usageLimits'

const MAX_CONTENT_CHARS = 8000
const FETCH_TIMEOUT_MS  = 10_000

function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim()
}

async function scrapeUrl(url: string): Promise<{ text: string; title: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'InstantDesk-KnowledgeBot/1.0' },
    })
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) throw new Error(`URL returned ${res.status} ${res.statusText}`)

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
    throw new Error(`Unsupported content type: ${contentType}. Only HTML and plain text pages are supported.`)
  }

  const html = await res.text()

  // Extract <title> for auto-naming
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const pageTitle  = titleMatch ? titleMatch[1].trim().slice(0, 80) : new URL(url).hostname

  const text = extractTextFromHtml(html)
  if (!text) throw new Error('No readable text found on that page.')

  const truncated = text.length > MAX_CONTENT_CHARS
    ? text.slice(0, MAX_CONTENT_CHARS) + `\n\n[Content truncated at ${MAX_CONTENT_CHARS} characters]`
    : text

  return { text: `Source: ${url}\n\n${truncated}`, title: pageTitle }
}

export async function GET() {
  const { clientId } = await getSessionBusinessId()
  const sb = createAdminClient()

  const { data, error } = await sb
    .from('knowledge_sources').select('*')
    .eq('business_id', clientId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sources: data ?? [] })
}

export async function POST(req: NextRequest) {
  let body: { title?: string; content?: string; source_type?: string; url?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { clientId } = await getSessionBusinessId()
  const sb = createAdminClient()

  /* ── Usage limits ────────────────────────────────────────────────────────── */
  const limits = await getLimits(sb, clientId)

  const srcCheck = await checkSourceLimit(sb, clientId, limits)
  if (!srcCheck.ok) return NextResponse.json({ error: srcCheck.message }, { status: 429 })

  const chunkCheck = await checkChunkLimit(sb, clientId, limits)
  if (!chunkCheck.ok) return NextResponse.json({ error: chunkCheck.message }, { status: 429 })
  /* ────────────────────────────────────────────────────────────────────────── */

  let finalTitle:   string
  let finalContent: string

  if (body.source_type === 'url') {
    const rawUrl = body.url?.trim()
    if (!rawUrl) return NextResponse.json({ error: 'url is required for source_type url' }, { status: 400 })

    // Validate URL
    try { new URL(rawUrl) } catch {
      return NextResponse.json({ error: 'Invalid URL — must start with https:// or http://' }, { status: 400 })
    }

    console.log('[KNOWLEDGE/scrape] fetching:', rawUrl)
    try {
      const scraped  = await scrapeUrl(rawUrl)
      finalContent   = scraped.text
      finalTitle     = body.title?.trim() || scraped.title
      console.log('[KNOWLEDGE/scrape] extracted chars:', finalContent.length, '| title:', finalTitle)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[KNOWLEDGE/scrape] failed:', msg)
      return NextResponse.json({ error: `Could not fetch URL: ${msg}` }, { status: 422 })
    }
  } else {
    if (!body.title?.trim())   return NextResponse.json({ error: 'title is required' }, { status: 400 })
    if (!body.content?.trim()) return NextResponse.json({ error: 'content is required' }, { status: 400 })
    finalTitle   = body.title.trim()
    finalContent = body.content.trim()
  }

  const charCheck = await checkCharLimit(sb, clientId, limits, finalContent.length)
  if (!charCheck.ok) return NextResponse.json({ error: charCheck.message }, { status: 429 })

  const { data, error } = await sb.from('knowledge_sources').insert({
    business_id: clientId,
    title:       finalTitle,
    content:     finalContent,
    is_active:   true,
    created_at:  new Date().toISOString(),
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fire-and-forget: chunk + embed the new source for RAG
  if (data?.id) {
    void createChunksForSource(sb, {
      businessId: clientId,
      sourceId:   data.id as string,
      title:      finalTitle,
      content:    finalContent,
      sourceUrl:  body.source_type === 'url' ? body.url?.trim() : undefined,
    })
  }

  return NextResponse.json({ source: data })
}
