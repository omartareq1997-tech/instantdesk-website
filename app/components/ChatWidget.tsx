'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, Check, CheckCheck, Download, FileText, Image as ImageIcon, Paperclip, X, Send, Sparkles, Minimize2 } from 'lucide-react'

/* ─── Config ─────────────────────────────────────────────── */

const DEFAULT_BUSINESS_ID = '59bd9987-46b9-48a3-ad14-cfe1ab733453'
const MAX_MESSAGE_LENGTH = 4000
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const GREETING: Msg = {
  id: 'g1',
  role: 'ai',
  text: "Hi there! 👋 I'm your AI assistant. How can I help you today?",
}

/* ─── Types ─────────────────────────────────────────────── */

type Role = 'ai' | 'user' | 'human' | 'system'
type Attachment = { name: string; type: string; size: number; dataUrl: string; kind?: 'image' | 'file' }
type DeliveryStatus = 'sent' | 'delivered' | 'seen' | 'failed'
type Msg  = { id: string; role: Role; text: string; createdAt?: string | null; readAt?: string | null; deliveryStatus?: DeliveryStatus | null; attachment?: Attachment | null; reactions?: string[] }
type VisitorContext = {
  browser: string
  os: string
  country: string | null
  language: string
  timezone: string
  landing_page: string
  current_page: string
  referrer: string
  utm: Record<string, string>
  device: string
  screen_size: string
}

type StoredChatState = {
  conversationId?: string
  isOpen?: boolean
}

function storageKey(businessId: string) {
  return `instantdesk_chat_${businessId}`
}

function isConversationUuid(value: string | null): value is string {
  return Boolean(value && UUID_RE.test(value))
}

function businessIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const candidate = params.get('instantdesk_business_id') || params.get('business_id')
  if (!candidate || !UUID_RE.test(candidate)) return null
  const hostname = window.location.hostname.toLowerCase()
  if ((hostname === 'instantdesk.pl' || hostname === 'www.instantdesk.pl') && candidate !== DEFAULT_BUSINESS_ID) {
    return DEFAULT_BUSINESS_ID
  }
  return candidate
}

function botIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const candidate = params.get('bot_id') || params.get('instantdesk_bot_id')
  return candidate && UUID_RE.test(candidate) ? candidate : null
}

function shouldOpenFromUrl(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.get('instantdesk_open') === '1' || params.get('open') === '1'
}

/* ─── Typing dots ────────────────────────────────────────── */

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-2 h-2 rounded-full"
          style={{ background: 'rgba(244,122,99,0.78)' }}
          animate={{ opacity: [0.58, 0.86, 0.58] }}
          transition={{ duration: 1.25, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

function formatBytes(size: number) {
  if (!size) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function dateTime(iso?: string | null) {
  if (!iso) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function Ticks({ msg }: { msg: Msg }) {
  const state = msg.readAt ? 'seen' : msg.deliveryStatus ?? (msg.id.startsWith('local-') ? 'sent' : 'delivered')
  if (state === 'sent') return <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5 text-white/55" />Sent</span>
  if (state === 'failed') return <span className="text-red-200/80">Failed</span>
  return <span className="inline-flex items-center gap-1"><CheckCheck className={`h-3.5 w-3.5 ${state === 'seen' ? 'text-emerald-200' : 'text-white/55'}`} />{state === 'seen' ? 'Seen' : 'Delivered'}</span>
}

function visitorContext(): VisitorContext {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'Unknown'
  const os = /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown'
  const params = new URLSearchParams(window.location.search)
  const utm: Record<string, string> = {}
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
    const value = params.get(key)
    if (value) utm[key] = value
  }
  return {
    browser,
    os,
    country: null,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    landing_page: window.localStorage.getItem('instantdesk_landing_page') || window.location.href,
    current_page: window.location.href,
    referrer: document.referrer,
    utm,
    device: window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop',
    screen_size: `${window.screen.width}x${window.screen.height}`,
  }
}

/* ─── Message bubble ─────────────────────────────────────── */

function Bubble({ msg }: { msg: Msg }) {
  if (msg.role === 'system') {
    return (
      <div className="flex justify-center">
        <div
          className="max-w-[86%] px-3 py-1.5 rounded-full text-[11px] text-white/35 text-center"
          style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {msg.text}
        </div>
      </div>
    )
  }

  const isAI = msg.role === 'ai' || msg.role === 'human'
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`flex items-end gap-2 ${isAI ? '' : 'flex-row-reverse'}`}
    >
      {isAI && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5"
          style={{ background: '#171412', boxShadow: '0 0 0 1px rgba(244,122,99,0.22)' }}
        >
          <Bot className="w-3.5 h-3.5 text-[#f47a63]" />
        </div>
      )}
      <div className={`flex max-w-[82%] flex-col ${isAI ? 'items-start' : 'items-end'}`}>
        <div
          className="rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed"
          style={isAI ? {
            background: 'rgba(255,255,255,0.055)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.82)',
            borderBottomLeftRadius: '6px',
          } : {
            background: 'linear-gradient(135deg,rgba(244,122,99,0.88),rgba(248,154,87,0.78))',
            border: '1px solid rgba(248,154,87,0.28)',
            color: 'rgba(255,255,255,0.92)',
            borderBottomRightRadius: '6px',
            boxShadow: '0 4px 16px rgba(244,122,99,0.16)',
          }}
        >
          {msg.role === 'human' && (
            <div className="text-[10px] text-emerald-300/70 font-semibold mb-1">Team reply</div>
          )}
          {msg.attachment && (
            <div className="mb-2 overflow-hidden rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(0,0,0,0.14)' }}>
              {msg.attachment.kind === 'image' ? (
                <img src={msg.attachment.dataUrl} alt={msg.attachment.name} className="max-h-48 w-full object-cover" />
              ) : (
                <a href={msg.attachment.dataUrl} download={msg.attachment.name} className="flex items-center gap-2 px-3 py-2 text-xs text-white/78">
                  <FileText className="h-4 w-4" />
                  <span className="min-w-0 flex-1 truncate">{msg.attachment.name}</span>
                  <span className="text-white/35">{formatBytes(msg.attachment.size)}</span>
                  <Download className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )}
          {msg.text}
        </div>
        {Boolean(msg.reactions?.length) && (
          <div className="mt-1 rounded-full px-2 py-0.5 text-[11px]" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {msg.reactions?.join(' ')}
          </div>
        )}
        <div className="mt-1 flex items-center gap-1.5 px-1 text-[10px] text-white/28">
          <span>{dateTime(msg.createdAt)}</span>
          <Ticks msg={msg} />
        </div>
      </div>
    </motion.div>
  )
}

/* ─── Main widget ────────────────────────────────────────── */

export default function ChatWidget() {
  const pathname = usePathname()
  const [isOpen,    setIsOpen]    = useState(false)
  const [messages,  setMessages]  = useState<Msg[]>([GREETING])
  const [isTyping,  setIsTyping]  = useState(false)
  const [input,     setInput]     = useState('')
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [hasOpened, setHasOpened] = useState(false)
  const [handoverActive, setHandoverActive] = useState(false)
  const [agentTyping, setAgentTyping] = useState<string | null>(null)
  const [presenceLabel, setPresenceLabel] = useState('online')
  const [dragActive, setDragActive] = useState(false)
  const [businessId, setBusinessId] = useState(DEFAULT_BUSINESS_ID)
  const [botId, setBotId] = useState<string | null>(() => botIdFromUrl())
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [aiAutoRepliesEnabled, setAiAutoRepliesEnabled] = useState(true)

  const endRef          = useRef<HTMLDivElement>(null)
  const inputRef        = useRef<HTMLTextAreaElement>(null)
  const fileInputRef    = useRef<HTMLInputElement>(null)
  const msgIdRef        = useRef(0)
  const conversationRef = useRef<string | null>(null)  // persists between sends
  const typingStopRef   = useRef<number | null>(null)

  const nextId = () => String(++msgIdRef.current)

  const persistChatState = useCallback((patch: StoredChatState) => {
    try {
      const current = JSON.parse(window.localStorage.getItem(storageKey(businessId)) ?? '{}') as StoredChatState
      const next = { ...current, ...patch }
      window.localStorage.setItem(storageKey(businessId), JSON.stringify(next))
    } catch { /* localStorage can be unavailable in private modes */ }
  }, [businessId])

  const loadConversationMessages = useCallback(async (conversationId: string, signal?: AbortSignal) => {
    const res = await fetch(`/api/live-chat/widget/messages?conversation_id=${encodeURIComponent(conversationId)}`, { signal })
    if (!res.ok) return
    const data = await res.json() as {
      status?: string
      messages?: { id: string; role: string; content: string; created_at?: string | null; read_at?: string | null; delivery_status?: DeliveryStatus | null; metadata?: { sender_type?: string; attachment?: Attachment | null; reactions?: string[] } | null }[]
    }
    setHandoverActive(data.status === 'handover_requested' || data.status === 'live_chat')
    if (data.messages?.length) {
      setMessages(data.messages.map((msg) => ({
        id: msg.id,
        role: msg.role === 'user'
          ? 'user'
          : msg.role === 'human' || msg.metadata?.sender_type === 'human'
            ? 'human'
            : msg.role === 'system'
              ? 'system'
              : 'ai',
        text: msg.content,
        createdAt: msg.created_at ?? null,
        readAt: msg.read_at ?? null,
        deliveryStatus: msg.delivery_status ?? null,
        attachment: msg.metadata?.attachment ?? null,
        reactions: Array.isArray(msg.metadata?.reactions) ? msg.metadata.reactions : [],
      })))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const explicitBusinessId = businessIdFromUrl()
    const explicitBotId = botIdFromUrl()
    if (explicitBusinessId) setBusinessId(explicitBusinessId)
    if (shouldOpenFromUrl()) {
      setIsOpen(true)
      setHasOpened(true)
    }
    const loadConfig = async () => {
      try {
        const params = new URLSearchParams()
        if (explicitBusinessId) params.set('business_id', explicitBusinessId)
        if (explicitBotId) params.set('bot_id', explicitBotId)
        const res = await fetch(`/api/live-chat/widget/config${params.toString() ? `?${params.toString()}` : ''}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json() as { business_id?: string; bot_id?: string | null; ai_auto_replies_enabled?: boolean }
        if (!cancelled && data.business_id) setBusinessId(data.business_id)
        if (!cancelled) setBotId(data.bot_id && UUID_RE.test(data.bot_id) ? data.bot_id : null)
        if (!cancelled && typeof data.ai_auto_replies_enabled === 'boolean') {
          setAiAutoRepliesEnabled(data.ai_auto_replies_enabled)
        }
      } catch { /* keep default public site business id */ }
    }
    void loadConfig()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    try {
      if (!window.localStorage.getItem('instantdesk_landing_page')) {
        window.localStorage.setItem('instantdesk_landing_page', window.location.href)
      }
    } catch { /* ignore unavailable storage */ }
  }, [])

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(storageKey(businessId)) ?? '{}') as StoredChatState
      if (stored.conversationId) {
        conversationRef.current = stored.conversationId
        setConversationId(stored.conversationId)
      }
      if (stored.isOpen) {
        setIsOpen(true)
        setHasOpened(true)
      }
    } catch { /* ignore invalid persisted state */ }
  }, [businessId])

  /* Scroll to bottom on new messages */
  useEffect(() => {
    if (isOpen) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping, isOpen])

  /* Focus input on open */
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 350)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !conversationId) return

    let cancelled = false
    const controller = new AbortController()
    const loadMessages = async () => {
      try {
        if (cancelled) return
        await loadConversationMessages(conversationId, controller.signal)
      } catch { /* polling is best-effort */ }
    }

    void loadMessages()
    const interval = window.setInterval(() => { void loadMessages() }, 3000)
    return () => {
      cancelled = true
      controller.abort()
      window.clearInterval(interval)
    }
  }, [conversationId, isOpen, loadConversationMessages])

  useEffect(() => {
    if (!isOpen || !isConversationUuid(conversationId)) return
    let cancelled = false
    const ping = async (status: 'online' | 'away' | 'offline' = 'online') => {
      try {
        await fetch('/api/live-chat/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversationId,
            business_id: businessId,
            actor_type: 'visitor',
            status,
            visitor_context: visitorContext(),
          }),
        })
        if (!cancelled && status !== 'offline') setPresenceLabel(status)
      } catch { /* presence is best-effort */ }
    }
    void ping('online')
    const interval = window.setInterval(() => void ping(document.visibilityState === 'hidden' ? 'away' : 'online'), 15_000)
    const visibility = () => void ping(document.visibilityState === 'hidden' ? 'away' : 'online')
    document.addEventListener('visibilitychange', visibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', visibility)
      window.clearInterval(interval)
    }
  }, [businessId, conversationId, isOpen])

  useEffect(() => {
    if (!isOpen || !conversationId) return
    const pollTyping = async () => {
      try {
        const res = await fetch(`/api/live-chat/typing?conversation_id=${encodeURIComponent(conversationId)}`)
        if (!res.ok) return
        const data = await res.json() as { typing?: { actor_type?: string; actor_name?: string | null }[] }
        const agent = data.typing?.find(item => item.actor_type === 'agent')
        setAgentTyping(agent ? agent.actor_name || 'Agent' : null)
      } catch { /* typing is best-effort */ }
    }
    void pollTyping()
    const interval = window.setInterval(() => void pollTyping(), 1800)
    return () => window.clearInterval(interval)
  }, [conversationId, isOpen])

  const open = useCallback(() => {
    setIsTyping(false)
    setIsOpen(true)
    setHasOpened(true)
    persistChatState({ isOpen: true })
    // Do NOT reset conversationRef — preserve thread across open/close cycles
    if (conversationId) void loadConversationMessages(conversationId)
  }, [conversationId, loadConversationMessages, persistChatState])

  const close = useCallback(() => {
    setIsOpen(false)
    persistChatState({ isOpen: false })
  }, [persistChatState])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close, isOpen])

  /* ─── Real API send ──────────────────────────────────────── */

  const readAttachment = async (file: File): Promise<Attachment | null> => {
    const allowed = [
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
    ]
    if (!allowed.includes(file.type)) {
      setMessages(prev => [...prev, { id: nextId(), role: 'ai', text: 'Please upload an image, PDF, text, Word, Excel, or PowerPoint file.' }])
      return null
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setMessages(prev => [...prev, { id: nextId(), role: 'ai', text: 'Please upload a file under 10 MB.' }])
      return null
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    return { name: file.name, type: file.type, size: file.size, dataUrl, kind: file.type.startsWith('image/') ? 'image' : 'file' }
  }

  const chooseAttachment = async (file: File | undefined) => {
    if (!file) return
    const next = await readAttachment(file)
    if (next) setAttachment(next)
  }

  const publishVisitorTyping = useCallback((typing: boolean) => {
    const id = conversationRef.current
    if (!id) return
    void fetch('/api/live-chat/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: id,
        business_id: businessId,
        actor_type: 'visitor',
        is_typing: typing,
      }),
    }).catch(() => undefined)
  }, [businessId])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if ((!trimmed && !attachment) || isTyping) return
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      setMessages(prev => [...prev, {
        id:   nextId(),
        role: 'ai',
        text: `Please keep messages under ${MAX_MESSAGE_LENGTH.toLocaleString()} characters.`,
      }])
      return
    }

    const userMsg: Msg = { id: `local-${nextId()}`, role: 'user', text: trimmed || attachment?.name || '', createdAt: new Date().toISOString(), deliveryStatus: 'sent', attachment }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setAttachment(null)
    const shouldShowTyping = aiAutoRepliesEnabled && !handoverActive
    setIsTyping(shouldShowTyping)

    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id:     businessId,
          bot_id:          botId ?? undefined,
          conversation_id: conversationRef.current ?? undefined,
          message:         trimmed,
          attachment,
          visitor_context: visitorContext(),
        }),
      })

      let data: {
        reply?:           string | null
        conversation_id?: string
        error?:           string
        status?:          string
        handover?:        boolean
        waiting_for_human?: boolean
      }
      try {
        data = await res.json()
      } catch {
        data = { error: 'Invalid server response. Please try again.' }
      }
      if (!res.ok && !data.error) data.error = `Request failed with status ${res.status}. Please try again.`

      // Persist the conversation_id for subsequent messages
      if (data.conversation_id) {
        conversationRef.current = data.conversation_id
        setConversationId(data.conversation_id)
        persistChatState({ conversationId: data.conversation_id })
        if (isConversationUuid(data.conversation_id)) void fetch('/api/live-chat/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: data.conversation_id,
            business_id: businessId,
            actor_type: 'visitor',
            status: 'online',
            visitor_context: visitorContext(),
          }),
        }).catch(() => undefined)
      }
      if (data.handover || data.status === 'handover_requested' || data.status === 'live_chat') {
        setHandoverActive(true)
      }

      const replyText = data.reply ?? data.error
      if (replyText) {
        setMessages(prev => [...prev, { id: nextId(), role: 'ai', text: replyText }])
      }
    } catch {
      setMessages(prev => [...prev, {
        id:   nextId(),
        role: 'ai',
        text: 'Connection error. Please check your internet and try again.',
      }])
    } finally {
      setIsTyping(false)
    }
  }, [aiAutoRepliesEnabled, attachment, businessId, handoverActive, isTyping, persistChatState])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void sendMessage(input)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage(input)
    }
  }

  /* Hide on admin pages */
  if (pathname?.startsWith('/admin')) return null

  return (
    <>
      {/* ── Chat panel ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 8, originX: 1, originY: 1 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            role="dialog"
            aria-label="InstantDesk live chat"
            className="fixed z-[60] bottom-[88px] right-4 sm:right-6 w-[calc(100vw-32px)] sm:w-[380px] flex flex-col rounded-[28px] overflow-hidden"
            style={{
              height: 'min(580px, calc(100dvh - 120px))',
              minHeight: 'min(520px, calc(100dvh - 120px))',
              maxHeight: 'min(580px, calc(100dvh - 120px))',
              background: 'rgba(15,15,14,0.97)',
              backdropFilter: 'blur(48px)',
              WebkitBackdropFilter: 'blur(48px)',
              border: '1px solid rgba(244,122,99,0.18)',
              boxShadow: [
                '0 40px 100px rgba(0,0,0,0.75)',
                '0 0 0 1px rgba(255,255,255,0.035)',
                'inset 0 1px 0 rgba(255,255,255,0.06)',
                '0 0 60px rgba(244,122,99,0.06)',
              ].join(','),
            }}
          >

            {/* ── Header ── */}
            <div
              className="relative flex-shrink-0 px-5 pt-5 pb-4"
              style={{
                background: 'linear-gradient(160deg, rgba(244,122,99,0.10) 0%, rgba(255,255,255,0.025) 100%)',
                borderBottom: '1px solid rgba(255,255,255,0.055)',
              }}
            >
              {/* Shimmer line */}
              <div
                className="absolute top-0 left-0 right-0 h-[1px]"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(244,122,99,0.72), rgba(248,154,87,0.54), transparent)',
                }}
              />

              {/* Top row: avatar + info + close */}
              <div className="flex items-center gap-3">
                <div className="relative flex-shrink-0">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center"
                    style={{
                      background: '#171412',
                      boxShadow: '0 0 0 1px rgba(244,122,99,0.24), 0 14px 34px rgba(0,0,0,0.28)',
                    }}
                  >
                    <Bot className="w-5.5 h-5.5 text-white" style={{ width: '22px', height: '22px' }} />
                  </div>
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2"
                    style={{ background: '#22c55e', borderColor: '#06061400' }}
                  />
                </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">InstantDesk AI</span>
                </div>
                  <div className="mt-0.5 text-[11px] font-semibold text-emerald-300/65">
                    {handoverActive ? `Team ${presenceLabel}` : 'online'}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={close}
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
                    aria-label="Minimise"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={close}
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

            </div>

            {/* ── Messages ── */}
            <div
              className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3"
              style={{ minHeight: 0, scrollbarWidth: 'thin', scrollbarColor: 'rgba(244,122,99,0.22) transparent' }}
              onDragOver={event => { event.preventDefault(); setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              onDrop={event => {
                event.preventDefault()
                setDragActive(false)
                void chooseAttachment(event.dataTransfer.files?.[0])
              }}
            >
              {dragActive && (
                <div className="rounded-2xl border border-dashed border-orange-300/40 bg-orange-300/10 px-4 py-6 text-center text-xs font-bold text-orange-100/80">
                  Drop file to attach
                </div>
              )}
              {messages.map((msg) => (
                <Bubble key={msg.id} msg={msg} />
              ))}
              {agentTyping && !isTyping && (
                <div className="flex items-center gap-2 text-xs font-semibold text-white/35">
                  <Bot className="h-3.5 w-3.5 text-[#f47a63]" />
                  {agentTyping} typing...
                </div>
              )}

              {/* Typing indicator */}
              <AnimatePresence>
                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 2 }}
                    transition={{ duration: 0.18 }}
                    className="flex items-end gap-2"
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: '#171412', boxShadow: '0 0 0 1px rgba(244,122,99,0.22)' }}
                    >
                      <Bot className="w-3.5 h-3.5 text-[#f47a63]" />
                    </div>
                    <div
                      className="rounded-2xl rounded-bl-md"
                      style={{
                        background: 'rgba(255,255,255,0.055)',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <TypingDots />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={endRef} />
            </div>

            {/* ── Input ── */}
            <div
              className="flex-shrink-0 px-4 pb-4 pt-3"
              style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
            >
              {attachment && (
                <div className="mb-3 flex items-center justify-between rounded-xl px-3 py-2 text-xs text-white/62" style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex min-w-0 items-center gap-2">
                    {attachment.kind === 'image' ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    <span className="truncate">{attachment.name}</span>
                    <span className="text-white/28">{formatBytes(attachment.size)}</span>
                  </div>
                  <button type="button" onClick={() => setAttachment(null)} className="text-white/35 hover:text-white/75" aria-label="Remove attachment"><X className="h-4 w-4" /></button>
                </div>
              )}
              <form onSubmit={handleSubmit} className="flex items-center gap-2">
                <input ref={fileInputRef} type="file" className="hidden" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={e => { void chooseAttachment(e.target.files?.[0]); e.currentTarget.value = '' }} />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white/35 hover:text-white/70 transition-all"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                  aria-label="Attach file"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => {
                    setInput(e.target.value.slice(0, MAX_MESSAGE_LENGTH))
                    publishVisitorTyping(true)
                    if (typingStopRef.current) window.clearTimeout(typingStopRef.current)
                    typingStopRef.current = window.setTimeout(() => publishVisitorTyping(false), 1200)
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message…"
                  disabled={isTyping}
                  rows={1}
                  className="max-h-28 min-h-10 flex-1 resize-none bg-transparent text-sm text-white/80 placeholder-white/20 outline-none py-2.5 px-4 rounded-xl transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                />
                <motion.button
                  type="submit"
                  disabled={(!input.trim() && !attachment) || isTyping}
                  aria-label="Send message"
                  whileHover={{ opacity: 0.9 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-30"
                  style={{
                    background: 'linear-gradient(135deg,#f16376,#f89a57)',
                    boxShadow: input.trim() || attachment ? '0 4px 16px rgba(244,122,99,0.28)' : 'none',
                  }}
                >
                  <Send className="w-4 h-4 text-white" />
                </motion.button>
              </form>

              <div className="flex items-center justify-center gap-1.5 mt-3">
                <Sparkles className="w-3 h-3 text-[#f47a63]/60" />
                <span className="text-[10px] text-white/20 font-medium">
                  Powered by <span className="text-[#f47a63]/70">InstantDesk AI</span>
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating button ── */}
      <div className="fixed bottom-5 right-4 sm:right-6 z-[60]">
          <div className="relative">
          {/* Button */}
          <motion.button
            onClick={isOpen ? close : open}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.99 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="relative w-14 h-14 sm:w-[60px] sm:h-[60px] rounded-full flex items-center justify-center cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, #171412 0%, #2a2420 100%)',
              boxShadow: isOpen
                ? '0 8px 32px rgba(244,122,99,0.24), 0 0 0 2px rgba(244,122,99,0.28)'
                : '0 8px 32px rgba(244,122,99,0.18), 0 2px 8px rgba(0,0,0,0.4)',
            }}
            aria-label={isOpen ? 'Close chat' : 'Open AI chat'}
          >
            <AnimatePresence mode="wait">
              {isOpen ? (
                <motion.div
                  key="close"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  <X className="w-5 h-5 text-white" />
                </motion.div>
              ) : (
                <motion.div
                  key="bot"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  <Bot className="w-5 h-5 text-white" />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Unread badge */}
            {!hasOpened && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 3.2, duration: 0.2 }}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-white text-[10px] font-black flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg,#f16376,#f89a57)' }}
              >
                1
              </motion.span>
            )}

            {/* Inner shine */}
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.18) 0%, transparent 60%)' }}
            />
          </motion.button>

          {/* Online indicator dot */}
          <div
            className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full border-[2.5px] flex items-center justify-center"
            style={{ background: '#22c55e', borderColor: '#080807' }}
          >
            <motion.div
              className="w-1.5 h-1.5 rounded-full bg-white/80"
              animate={{ opacity: [0.82, 1, 0.82] }}
              transition={{ duration: 3.8, repeat: Infinity }}
            />
          </div>
        </div>
      </div>
    </>
  )
}
