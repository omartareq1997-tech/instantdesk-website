import type { createAdminClient } from './supabase-server'

type DB = ReturnType<typeof createAdminClient>

interface BusinessLimits {
  max_sources:           number
  max_crawl_pages:       number
  max_knowledge_chars:   number
  max_chunks:            number
  max_ai_messages_month: number
}

const DEFAULTS: BusinessLimits = {
  max_sources:           50,
  max_crawl_pages:       25,
  max_knowledge_chars:   500_000,
  max_chunks:            1_000,
  max_ai_messages_month: 2_000,
}

export async function getLimits(sb: DB, businessId: string): Promise<BusinessLimits> {
  const { data } = await sb
    .from('business_limits')
    .select('max_sources,max_crawl_pages,max_knowledge_chars,max_chunks,max_ai_messages_month')
    .eq('business_id', businessId)
    .maybeSingle()

  if (!data) return { ...DEFAULTS }

  return {
    max_sources:           data.max_sources           ?? DEFAULTS.max_sources,
    max_crawl_pages:       data.max_crawl_pages       ?? DEFAULTS.max_crawl_pages,
    max_knowledge_chars:   data.max_knowledge_chars   ?? DEFAULTS.max_knowledge_chars,
    max_chunks:            data.max_chunks             ?? DEFAULTS.max_chunks,
    max_ai_messages_month: data.max_ai_messages_month ?? DEFAULTS.max_ai_messages_month,
  }
}

export async function checkSourceLimit(
  sb: DB,
  businessId: string,
  limits: BusinessLimits,
): Promise<{ ok: boolean; message?: string }> {
  const { count } = await sb
    .from('knowledge_sources')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)

  const current = count ?? 0
  if (current >= limits.max_sources) {
    return {
      ok: false,
      message: `Knowledge source limit reached (${current}/${limits.max_sources}). Delete some sources to add more.`,
    }
  }
  return { ok: true }
}

export async function checkCharLimit(
  sb: DB,
  businessId: string,
  limits: BusinessLimits,
  newChars: number,
): Promise<{ ok: boolean; message?: string }> {
  const { data } = await sb.rpc('get_business_knowledge_chars', { p_business_id: businessId })
  const current = Number(data ?? 0)

  if (current + newChars > limits.max_knowledge_chars) {
    const remaining = Math.max(0, limits.max_knowledge_chars - current)
    return {
      ok: false,
      message: `Knowledge character limit reached. You have ${remaining.toLocaleString()} characters remaining (limit: ${limits.max_knowledge_chars.toLocaleString()}).`,
    }
  }
  return { ok: true }
}

export async function checkChunkLimit(
  sb: DB,
  businessId: string,
  limits: BusinessLimits,
): Promise<{ ok: boolean; message?: string }> {
  const { count } = await sb
    .from('knowledge_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)

  const current = count ?? 0
  if (current >= limits.max_chunks) {
    return {
      ok: false,
      message: `Knowledge chunk limit reached (${current}/${limits.max_chunks}). Delete some knowledge sources to free up space.`,
    }
  }
  return { ok: true }
}

export async function checkMonthlyMessageLimit(
  sb: DB,
  businessId: string,
  limits: BusinessLimits,
): Promise<{ ok: boolean; message?: string }> {
  const { data } = await sb.rpc('get_business_monthly_ai_messages', { p_business_id: businessId })
  const current = Number(data ?? 0)

  if (current >= limits.max_ai_messages_month) {
    return {
      ok: false,
      message: `Monthly AI message limit reached (${current}/${limits.max_ai_messages_month}). Limit resets at the start of next month.`,
    }
  }
  return { ok: true }
}
