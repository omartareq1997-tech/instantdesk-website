import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'

const CLIENT_ID = '0616a47a-2c01-49ce-a798-385f8276b92b'

export async function GET() {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('knowledge_sources').select('*')
    .eq('business_id', CLIENT_ID)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sources: data ?? [] })
}

export async function POST(req: NextRequest) {
  let body: { title?: string; content?: string; source_type?: string; url?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.title?.trim()) return NextResponse.json({ error: 'title is required' }, { status: 400 })
  if (!body.content?.trim() && !body.url?.trim()) return NextResponse.json({ error: 'content or url is required' }, { status: 400 })

  const sb = createAdminClient()
  const { data, error } = await sb.from('knowledge_sources').insert({
    business_id:  CLIENT_ID,
    title:        body.title.trim(),
    content:      body.content?.trim() ?? body.url?.trim() ?? '',
    is_active:    true,
    created_at:   new Date().toISOString(),
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ source: data })
}
