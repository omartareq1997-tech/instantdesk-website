import OpenAI from 'openai'
import type { createAdminClient } from './supabase-server'

type DB = ReturnType<typeof createAdminClient>

const CHUNK_SIZE    = 1000  // target chars per chunk
const CHUNK_OVERLAP = 150   // overlap between adjacent chunks
const MIN_CHUNK_LEN = 80    // discard tiny trailing chunks

export function chunkText(text: string): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end   = Math.min(start + CHUNK_SIZE, text.length)
    const chunk = text.slice(start, end).trim()
    if (chunk.length >= MIN_CHUNK_LEN) chunks.push(chunk)
    if (end >= text.length) break
    start = end - CHUNK_OVERLAP
  }
  return chunks
}

async function embedBatch(apiKey: string, texts: string[]): Promise<number[][]> {
  const openai = new OpenAI({ apiKey })
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts.map(t => t.slice(0, 8000)),
  })
  return res.data.sort((a, b) => a.index - b.index).map(d => d.embedding)
}

export async function embedQuery(apiKey: string, text: string): Promise<number[]> {
  const openai = new OpenAI({ apiKey })
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000),
  })
  return res.data[0].embedding
}

/**
 * Chunk + embed a knowledge source and insert into knowledge_chunks.
 * Deletes existing chunks for the source first (safe for re-indexing).
 * Fire-and-forget safe — errors are logged, never thrown.
 */
export async function createChunksForSource(
  sb: DB,
  opts: {
    businessId: string
    sourceId:   string
    title:      string
    content:    string
    sourceUrl?: string
  },
): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.warn('[knowledgeChunks] OPENAI_API_KEY not set — skipping embedding')
    return
  }

  try {
    // Remove stale chunks so re-saves don't duplicate
    await sb.from('knowledge_chunks').delete().eq('source_id', opts.sourceId)

    const chunks = chunkText(opts.content)
    if (chunks.length === 0) return

    const embeddings = await embedBatch(apiKey, chunks)

    const rows = chunks.map((chunk, i) => ({
      business_id:  opts.businessId,
      source_id:    opts.sourceId,
      source_title: opts.title,
      source_url:   opts.sourceUrl ?? null,
      content:      chunk,
      embedding:    embeddings[i],
    }))

    const { error } = await sb.from('knowledge_chunks').insert(rows)
    if (error) {
      console.error('[knowledgeChunks] insert error:', error.message)
      return
    }

    console.log('[knowledgeChunks] created', rows.length, 'chunks for:', opts.title)
  } catch (err) {
    console.error('[knowledgeChunks] embedding error:', err instanceof Error ? err.message : err)
  }
}

export interface ChunkMatch {
  title:      string
  content:    string
  similarity: number
}

/**
 * Embed the user query and retrieve the top-k most relevant chunks for this
 * business. Throws on any error so the caller can distinguish failure modes.
 */
export async function retrieveRelevantChunks(
  sb: DB,
  businessId: string,
  query: string,
  matchCount = 6,
): Promise<ChunkMatch[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not set')

  console.log('[knowledgeChunks] embedding query, length:', query.length)
  const queryEmbedding = await embedQuery(apiKey, query)
  console.log('[knowledgeChunks] query embedded, calling RPC match_knowledge_chunks')

  const { data, error } = await sb.rpc('match_knowledge_chunks', {
    query_embedding:   queryEmbedding,
    match_business_id: businessId,
    match_count:       matchCount,
  })

  if (error) throw new Error(`RPC error: ${error.message} (code: ${error.code})`)

  const rows = (data as { source_title: string | null; content: string; similarity: number }[]) ?? []
  console.log('[knowledgeChunks] RPC returned', rows.length, 'rows')

  return rows.map(c => ({
    title:      c.source_title ?? 'Knowledge',
    content:    c.content,
    similarity: c.similarity,
  }))
}
