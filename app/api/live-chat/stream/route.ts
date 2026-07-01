import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'

export const dynamic = 'force-dynamic'

function unauthorized() {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
}

export async function GET(request: Request) {
  const session = await getSessionBusinessId()
  if (!session.fromSession) return unauthorized()

  const sb = createAdminClient()
  const encoder = new TextEncoder()
  let lastSignature = ''

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const close = () => {
        if (closed) return
        closed = true
        try { controller.close() } catch { /* stream may already be closed */ }
      }
      const send = (event: string, data: unknown) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`event: ${event}\n`))
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          closed = true
        }
      }

      const poll = async () => {
        if (request.signal.aborted) {
          close()
          return
        }

        const [conversations, messages] = await Promise.all([
          sb.from('conversations')
            .select('id,status,last_message_at,unread_count,updated_at')
            .eq('business_id', session.businessId)
            .order('last_message_at', { ascending: false })
            .limit(100),
          sb.from('messages')
            .select('id,conversation_id,role,created_at,metadata')
            .eq('business_id', session.businessId)
            .order('created_at', { ascending: false })
            .limit(1),
        ])

        if (conversations.error || messages.error) {
          send('error', { error: conversations.error?.message ?? messages.error?.message })
          return
        }

        const signature = JSON.stringify({
          conversations: conversations.data ?? [],
          latestMessage: messages.data?.[0] ?? null,
        })
        if (signature !== lastSignature) {
          lastSignature = signature
          const latestMessage = messages.data?.[0] as {
            id?: string
            conversation_id?: string
            role?: string
            metadata?: { sender_type?: string } | null
          } | undefined
          send('live-chat-change', {
            at: new Date().toISOString(),
            latest_conversation_id: latestMessage?.conversation_id ?? null,
            latest_message_id: latestMessage?.id ?? null,
            latest_message_role: latestMessage?.role ?? null,
            latest_sender_type: latestMessage?.metadata?.sender_type ?? null,
          })
        }
      }

      await poll()
      const interval = setInterval(() => { void poll() }, 1000)
      request.signal.addEventListener('abort', () => {
        clearInterval(interval)
        close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
