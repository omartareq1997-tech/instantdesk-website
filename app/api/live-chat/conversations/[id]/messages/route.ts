import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../../../lib/getSessionBusinessId'
import { markConversationStatus } from '../../../../../lib/live-chat'
import { cookies } from 'next/headers'
import { MEMBER_COOKIE_NAME, verifyMemberToken } from '../../../../../lib/auth'

export const dynamic = 'force-dynamic'
const MAX_HUMAN_MESSAGE_LENGTH = 4000
const STAFF_EDIT_WINDOW_MS = 2 * 60 * 1000
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

interface AttachmentPayload {
  name?: unknown
  type?: unknown
  size?: unknown
  dataUrl?: unknown
}

function parseAttachment(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const raw = value as AttachmentPayload
  const name = typeof raw.name === 'string' ? raw.name.slice(0, 140) : 'attachment'
  const type = typeof raw.type === 'string' ? raw.type : ''
  const size = typeof raw.size === 'number' ? raw.size : 0
  const dataUrl = typeof raw.dataUrl === 'string' ? raw.dataUrl : ''
  if (!ALLOWED_ATTACHMENT_TYPES.has(type)) return { error: 'Unsupported file type' as const }
  if (size <= 0 || size > MAX_ATTACHMENT_BYTES) return { error: 'File is too large' as const }
  if (!dataUrl.startsWith(`data:${type};base64,`)) return { error: 'Invalid attachment data' as const }
  return { attachment: { name, type, size, dataUrl, kind: type.startsWith('image/') ? 'image' : 'file' } }
}

function unauthorized() {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
}

async function resolveConversationBusinessId(request: NextRequest, fallbackBusinessId: string, sb: ReturnType<typeof createAdminClient>) {
  const requestedBusinessId = new URL(request.url).searchParams.get('business_id')
  if (!requestedBusinessId || requestedBusinessId === fallbackBusinessId) return fallbackBusinessId
  try {
    const rawToken = (await cookies()).get(MEMBER_COOKIE_NAME)?.value
    const member = await verifyMemberToken(rawToken)
    if (!member?.id) return fallbackBusinessId
    const { data } = await sb
      .from('team_members')
      .select('client_id')
      .eq('id', member.id)
      .maybeSingle()
    const row = data as { client_id?: string | null } | null
    if (row?.client_id === requestedBusinessId) return requestedBusinessId
  } catch {
    return fallbackBusinessId
  }
  return fallbackBusinessId
}

export async function GET(request: NextRequest, context: RouteContext<'/api/live-chat/conversations/[id]/messages'>) {
  const { id } = await context.params
  const since = new URL(request.url).searchParams.get('since')
  const session = await getSessionBusinessId()
  if (!session.fromSession) return unauthorized()
  const sb = createAdminClient()
  const businessId = await resolveConversationBusinessId(request, session.businessId, sb)

  const { data: conversation, error: convError } = await sb
    .from('conversations')
    .select('id,business_id,status')
    .eq('id', id)
    .eq('business_id', businessId)
    .maybeSingle()

  if (convError) return NextResponse.json({ error: convError.message }, { status: 500 })
  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  let query = sb
    .from('messages')
    .select('id,conversation_id,business_id,role,content,created_at,read_at,delivery_status,delivered_at,external_message_id,attachment_metadata,metadata')
    .eq('conversation_id', id)
    .eq('business_id', businessId)
  if (since) query = query.gt('created_at', since)
  let messagesResult: { data: unknown; error: { code?: string; message: string } | null } = await query.order('created_at', { ascending: true })

  if (messagesResult.error?.code === '42703' || messagesResult.error?.code === 'PGRST204') {
    let fallbackQuery = sb
      .from('messages')
      .select('id,conversation_id,business_id,role,content,created_at,read_at,metadata')
      .eq('conversation_id', id)
      .eq('business_id', businessId)
    if (since) fallbackQuery = fallbackQuery.gt('created_at', since)
    messagesResult = await fallbackQuery.order('created_at', { ascending: true })
  }

  const { data, error } = messagesResult
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  void Promise.all([
    sb.from('conversations').update({ unread_count: 0 }).eq('id', id).eq('business_id', businessId),
    sb
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', id)
      .eq('business_id', businessId)
      .eq('role', 'user')
      .is('read_at', null),
  ]).catch(error => console.warn('[LiveChatMessages] read receipt update failed', error))
  return NextResponse.json({ messages: data ?? [], conversation }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest, context: RouteContext<'/api/live-chat/conversations/[id]/messages'>) {
  const { id } = await context.params
  const session = await getSessionBusinessId()
  if (!session.fromSession) return unauthorized()
  const { businessId, ownerName } = session
  const sb = createAdminClient()
  const body = await request.json().catch(() => ({})) as { message?: unknown; type?: unknown }
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const messageType = body.type === 'note' ? 'note' : 'reply'
  const attachmentResult = parseAttachment((body as { attachment?: unknown }).attachment)
  if (attachmentResult && 'error' in attachmentResult) return NextResponse.json({ error: attachmentResult.error }, { status: 400 })
  if (!message && !attachmentResult?.attachment) return NextResponse.json({ error: 'message is required' }, { status: 400 })
  if (message.length > MAX_HUMAN_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `message must be ${MAX_HUMAN_MESSAGE_LENGTH} characters or fewer` }, { status: 413 })
  }

  const { data: conversation, error: convError } = await sb
    .from('conversations')
    .select('id,business_id,assigned_to')
    .eq('id', id)
    .eq('business_id', businessId)
    .maybeSingle()

  if (convError) return NextResponse.json({ error: convError.message }, { status: 500 })
  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  if (conversation.assigned_to && conversation.assigned_to !== ownerName) {
    return NextResponse.json({
      error: `Conversation is assigned to ${conversation.assigned_to}. Take over before replying.`,
      assigned_to: conversation.assigned_to,
    }, { status: 409 })
  }
  if (!conversation.assigned_to) {
    await sb.from('conversations').update({ assigned_to: ownerName }).eq('id', id).eq('business_id', businessId)
  }

  if (messageType === 'note') {
    let noteResult: { data: unknown; error: { code?: string; message: string } | null } = await sb
      .from('messages')
      .insert({
        conversation_id: id,
        business_id: businessId,
        role: 'system',
        content: message,
        metadata: {
          internal_note: true,
          sender_type: 'human',
          sender_name: ownerName,
        },
      })
      .select('id,conversation_id,business_id,role,content,created_at,read_at,metadata')
      .single()

    if (noteResult.error?.code === '42703' || noteResult.error?.code === 'PGRST204') {
      noteResult = await sb
        .from('messages')
        .insert({ conversation_id: id, business_id: businessId, role: 'system', content: `[Internal note] ${message}` })
        .select('id,conversation_id,business_id,role,content,created_at')
        .single()
    }
    if (noteResult.error) return NextResponse.json({ error: noteResult.error.message }, { status: 500 })
    return NextResponse.json({ message: noteResult.data })
  }

  let insertResult: { data: unknown; error: { code?: string; message: string } | null } = await sb
    .from('messages')
    .insert({
      conversation_id: id,
      business_id: businessId,
      role: 'assistant',
      content: message || attachmentResult?.attachment?.name || '',
      metadata: {
        sender_type: 'human',
        sender_name: ownerName,
        delivery_status: 'delivered',
        attachment: attachmentResult?.attachment ?? null,
      },
      delivery_status: 'delivered',
      delivered_at: new Date().toISOString(),
      attachment_metadata: attachmentResult?.attachment ?? {},
    })
    .select('id,conversation_id,business_id,role,content,created_at,read_at,delivery_status,delivered_at,external_message_id,attachment_metadata,metadata')
    .single()

  if (insertResult.error?.code === '42703' || insertResult.error?.code === 'PGRST204') {
    insertResult = await sb
      .from('messages')
      .insert({
        conversation_id: id,
        business_id: businessId,
        role: 'assistant',
        content: message || attachmentResult?.attachment?.name || '',
        metadata: {
          sender_type: 'human',
          sender_name: ownerName,
          delivery_status: 'delivered',
          attachment: attachmentResult?.attachment ?? null,
        },
      })
      .select('id,conversation_id,business_id,role,content,created_at,read_at,metadata')
      .single()
  }

  const { data, error } = insertResult
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await markConversationStatus(sb, id, businessId, 'live_chat')

  return NextResponse.json({ message: data })
}

export async function PATCH(request: NextRequest, context: RouteContext<'/api/live-chat/conversations/[id]/messages'>) {
  const { id } = await context.params
  const session = await getSessionBusinessId()
  if (!session.fromSession) return unauthorized()
  const { businessId, ownerName } = session
  const sb = createAdminClient()
  const body = await request.json().catch(() => ({})) as { message_id?: unknown; message?: unknown; reaction?: unknown }
  const messageId = typeof body.message_id === 'string' ? body.message_id.trim() : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const reaction = typeof body.reaction === 'string' ? body.reaction.trim().slice(0, 12) : ''

  if (!messageId) return NextResponse.json({ error: 'message_id is required' }, { status: 400 })

  const { data: existing, error: existingError } = await sb
    .from('messages')
    .select('id,conversation_id,business_id,role,content,created_at,metadata')
    .eq('id', messageId)
    .eq('conversation_id', id)
    .eq('business_id', businessId)
    .maybeSingle()

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Message not found' }, { status: 404 })

  const metadata = (existing.metadata ?? {}) as Record<string, unknown>
  if (reaction) {
    const nextMetadata = {
      ...metadata,
      reactions: Array.from(new Set([
        ...(Array.isArray(metadata.reactions) ? metadata.reactions as string[] : []),
        reaction,
      ])),
    }
    const { data, error } = await sb
      .from('messages')
      .update({ metadata: nextMetadata })
      .eq('id', messageId)
      .eq('conversation_id', id)
      .eq('business_id', businessId)
      .select('id,conversation_id,business_id,role,content,created_at,metadata')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ message: data })
  }

  if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 })
  if (message.length > MAX_HUMAN_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `message must be ${MAX_HUMAN_MESSAGE_LENGTH} characters or fewer` }, { status: 413 })
  }

  const isHumanStaffMessage = metadata.sender_type === 'human' && (
    existing.role === 'assistant' ||
    existing.role === 'human' ||
    (existing.role === 'system' && metadata.internal_note === true)
  )
  if (!isHumanStaffMessage) {
    return NextResponse.json({ error: 'Only staff messages can be edited' }, { status: 403 })
  }
  if (metadata.sender_name && metadata.sender_name !== ownerName) {
    return NextResponse.json({ error: 'Only your own staff messages can be edited' }, { status: 403 })
  }

  const ageMs = Date.now() - new Date(existing.created_at as string).getTime()
  if (!Number.isFinite(ageMs) || ageMs > STAFF_EDIT_WINDOW_MS) {
    return NextResponse.json({ error: 'Edit window has expired' }, { status: 403 })
  }

  const nextMetadata = {
    ...metadata,
    sender_type: 'human',
    sender_name: metadata.sender_name ?? ownerName,
    edited: true,
    edited_at: new Date().toISOString(),
    edit_history: [
      ...(
        Array.isArray(metadata.edit_history)
          ? metadata.edit_history as unknown[]
          : []
      ),
      { content: existing.content, edited_at: new Date().toISOString(), actor: ownerName },
    ],
    original_content: metadata.original_content ?? existing.content,
  }

  const { data, error } = await sb
    .from('messages')
    .update({ content: message, metadata: nextMetadata })
    .eq('id', messageId)
    .eq('conversation_id', id)
    .eq('business_id', businessId)
    .select('id,conversation_id,business_id,role,content,created_at,metadata')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  try {
    await sb.from('message_audit_events').insert({
      business_id: businessId,
      conversation_id: id,
      message_id: messageId,
      event_type: 'edited',
      before: { content: existing.content, metadata },
      after: { content: message, metadata: nextMetadata },
      actor_name: ownerName,
    })
  } catch {
    // Optional audit table may not exist yet.
  }
  return NextResponse.json({ message: data })
}

export async function DELETE(request: NextRequest, context: RouteContext<'/api/live-chat/conversations/[id]/messages'>) {
  const { id } = await context.params
  const session = await getSessionBusinessId()
  if (!session.fromSession) return unauthorized()
  const { businessId, ownerName } = session
  const sb = createAdminClient()
  const body = await request.json().catch(() => ({})) as { message_id?: unknown }
  const messageId = typeof body.message_id === 'string' ? body.message_id.trim() : ''
  if (!messageId) return NextResponse.json({ error: 'message_id is required' }, { status: 400 })

  const { data: existing, error: existingError } = await sb
    .from('messages')
    .select('id,conversation_id,business_id,role,content,created_at,metadata')
    .eq('id', messageId)
    .eq('conversation_id', id)
    .eq('business_id', businessId)
    .maybeSingle()
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  const metadata = (existing.metadata ?? {}) as Record<string, unknown>
  const isHumanStaffMessage = metadata.sender_type === 'human' && (
    existing.role === 'assistant' ||
    existing.role === 'human' ||
    (existing.role === 'system' && metadata.internal_note === true)
  )
  if (!isHumanStaffMessage) {
    return NextResponse.json({ error: 'Only staff messages can be deleted' }, { status: 403 })
  }

  const nextMetadata = {
    ...metadata,
    deleted: true,
    deleted_at: new Date().toISOString(),
    deleted_by: ownerName,
    original_content: metadata.original_content ?? existing.content,
  }
  const { data, error } = await sb
    .from('messages')
    .update({ content: 'Message deleted', metadata: nextMetadata })
    .eq('id', messageId)
    .eq('conversation_id', id)
    .eq('business_id', businessId)
    .select('id,conversation_id,business_id,role,content,created_at,metadata')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  try {
    await sb.from('message_audit_events').insert({
      business_id: businessId,
      conversation_id: id,
      message_id: messageId,
      event_type: 'deleted',
      before: { content: existing.content, metadata },
      after: { content: 'Message deleted', metadata: nextMetadata },
      actor_name: ownerName,
    })
  } catch {
    // Optional audit table may not exist yet.
  }
  return NextResponse.json({ message: data })
}
