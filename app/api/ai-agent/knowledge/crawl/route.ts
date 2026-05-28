import { type NextRequest } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../../lib/getSessionBusinessId'
import { createChunksForSource } from '../../../../lib/knowledgeChunks'
import { getLimits, checkSourceLimit, checkCharLimit, checkChunkLimit } from '../../../../lib/usageLimits'

const MAX_PAGES_HARD_CAP = 50
const PAGE_FETCH_TIMEOUT = 8_000
const MAX_CONTENT_CHARS  = 8_000
const SKIP_EXT = /\.(pdf|jpg|jpeg|png|gif|svg|ico|css|js|zip|gz|xml|json|woff|woff2|ttf|eot|mp4|mp3|webp)(\?.*)?$/i

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw)
    u.hash = ''
    if (u.pathname !== '/') u.pathname = u.pathname.replace(/\/$/, '')
    return u.toString()
  } catch { return raw }
}

function extractText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function extractLinks(html: string, baseUrl: string, rootHostname: string): string[] {
  const seen = new Set<string>()
  const re   = /href=["']([^"'#][^"']*?)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      const u = new URL(m[1], baseUrl)
      if (
        u.hostname === rootHostname &&
        (u.protocol === 'https:' || u.protocol === 'http:') &&
        !SKIP_EXT.test(u.pathname)
      ) {
        seen.add(normalizeUrl(u.toString()))
      }
    } catch { /* ignore */ }
  }
  return [...seen]
}

async function fetchPage(url: string, rootHostname: string) {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PAGE_FETCH_TIMEOUT)
  let res: Response
  try {
    res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'InstantDesk-Crawler/1.0' },
    })
  } finally { clearTimeout(timer) }

  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const ct = res.headers.get('content-type') ?? ''
  if (!ct.includes('text/html') && !ct.includes('text/plain')) throw new Error(`Non-HTML (${ct})`)

  const html  = await res.text()
  const tm    = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const title = tm ? tm[1].trim().slice(0, 80) : (new URL(url).pathname.split('/').filter(Boolean).pop() ?? new URL(url).hostname)
  const raw   = extractText(html)
  const text  = raw.length > MAX_CONTENT_CHARS ? raw.slice(0, MAX_CONTENT_CHARS) + '\n[Truncated]' : raw
  const links = extractLinks(html, url, rootHostname)
  return { title, text, links }
}

export async function POST(req: NextRequest) {
  let body: { url?: string; max_pages?: number; title_prefix?: string }
  try { body = await req.json() } catch { body = {} }

  const rootUrl  = body.url?.trim() ?? ''
  const maxPages = Math.min(body.max_pages ?? 25, MAX_PAGES_HARD_CAP)
  const prefix   = body.title_prefix?.trim() ?? ''

  const enc = new TextEncoder()

  if (!rootUrl) {
    return new Response(enc.encode(JSON.stringify({ type: 'error', error: 'url is required' }) + '\n'), {
      status: 400, headers: { 'Content-Type': 'text/plain' },
    })
  }

  let rootHostname: string
  try { rootHostname = new URL(rootUrl).hostname }
  catch {
    return new Response(enc.encode(JSON.stringify({ type: 'error', error: 'Invalid URL' }) + '\n'), {
      status: 400, headers: { 'Content-Type': 'text/plain' },
    })
  }

  const { clientId } = await getSessionBusinessId()
  const sb = createAdminClient()

  /* ── Pre-crawl usage checks ────────────────────────────────────────────── */
  const limits = await getLimits(sb, clientId)
  const effectiveMaxPages = Math.min(maxPages, limits.max_crawl_pages)

  const srcCheck = await checkSourceLimit(sb, clientId, limits)
  if (!srcCheck.ok) {
    return new Response(enc.encode(JSON.stringify({ type: 'error', error: srcCheck.message }) + '\n'), {
      status: 429, headers: { 'Content-Type': 'text/plain' },
    })
  }
  const chunkCheck = await checkChunkLimit(sb, clientId, limits)
  if (!chunkCheck.ok) {
    return new Response(enc.encode(JSON.stringify({ type: 'error', error: chunkCheck.message }) + '\n'), {
      status: 429, headers: { 'Content-Type': 'text/plain' },
    })
  }
  /* ────────────────────────────────────────────────────────────────────────── */

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => controller.enqueue(enc.encode(JSON.stringify(data) + '\n'))

      const visited = new Set<string>()
      const queue   = [normalizeUrl(rootUrl)]
      let saved  = 0
      let failed = 0

      while (queue.length > 0 && visited.size < effectiveMaxPages) {
        const url = queue.shift()!
        if (visited.has(url)) continue
        visited.add(url)

        send({ type: 'progress', url, page: visited.size, total: effectiveMaxPages })

        try {
          const { title, text, links } = await fetchPage(url, rootHostname)

          for (const link of links) {
            if (!visited.has(link) && !queue.includes(link)) queue.push(link)
          }

          const content = `Source URL: ${url}\n\n${text}`
          const finalTitle = prefix ? `${prefix} — ${title}` : title

          // Per-page char check (non-fatal — skip page if over limit)
          const pageCharCheck = await checkCharLimit(sb, clientId, limits, content.length)
          if (!pageCharCheck.ok) {
            failed++
            send({ type: 'page_error', url, error: pageCharCheck.message, page: visited.size })
            continue
          }

          // Per-page source count check (non-fatal — stop crawl if over limit)
          const pageSrcCheck = await checkSourceLimit(sb, clientId, limits)
          if (!pageSrcCheck.ok) {
            send({ type: 'done', pages_crawled: visited.size, pages_saved: saved, pages_failed: failed, limit_reached: true })
            controller.close()
            return
          }

          const { data: newSource, error: dbErr } = await sb.from('knowledge_sources').insert({
            business_id: clientId,
            title:       finalTitle,
            content,
            is_active:   true,
            created_at:  new Date().toISOString(),
          }).select('id').single()

          if (dbErr) throw new Error(`DB: ${dbErr.message}`)

          // Fire-and-forget chunk + embed for RAG
          if (newSource?.id) {
            void createChunksForSource(sb, {
              businessId: clientId,
              sourceId:   newSource.id as string,
              title:      finalTitle,
              content,
              sourceUrl:  url,
            })
          }

          saved++
          send({ type: 'page_done', url, title: finalTitle, page: visited.size })
        } catch (err) {
          failed++
          send({ type: 'page_error', url, error: err instanceof Error ? err.message : String(err), page: visited.size })
        }
      }

      send({ type: 'done', pages_crawled: visited.size, pages_saved: saved, pages_failed: failed })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}
