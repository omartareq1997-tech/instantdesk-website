'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, X, Send, Sparkles, Minimize2 } from 'lucide-react'
import {
  WhatsAppIcon, InstagramIcon, MessengerIcon, TelegramIcon, GlobeIcon,
} from './ChannelIcons'

/* ─── Config ─────────────────────────────────────────────── */

const BUSINESS_ID = '0616a47a-2c01-49ce-a798-385f8276b92b'

const GREETING: Msg = {
  id: 'g1',
  role: 'ai',
  text: "Hi there! 👋 I'm your AI assistant. How can I help you today?",
}

/* ─── Types ─────────────────────────────────────────────── */

type Role = 'ai' | 'user' | 'human' | 'system'
type Msg  = { id: string; role: Role; text: string }

/* ─── Static UI data ─────────────────────────────────────── */

const CHANNELS = [
  { Icon: GlobeIcon,     color: '#f47a63', bg: 'rgba(244,122,99,0.12)',  label: 'Website'   },
  { Icon: WhatsAppIcon,  color: '#f47a63', bg: 'rgba(244,122,99,0.12)',  label: 'WhatsApp'  },
  { Icon: InstagramIcon, color: '#f47a63', bg: 'rgba(244,122,99,0.12)',  label: 'Instagram' },
  { Icon: MessengerIcon, color: '#f47a63', bg: 'rgba(244,122,99,0.12)',  label: 'Messenger' },
  { Icon: TelegramIcon,  color: '#f47a63', bg: 'rgba(244,122,99,0.12)',  label: 'Telegram'  },
]

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
      <div
        className="max-w-[82%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed"
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
        {msg.text}
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
  const [hasOpened, setHasOpened] = useState(false)
  const [handoverActive, setHandoverActive] = useState(false)

  const endRef          = useRef<HTMLDivElement>(null)
  const inputRef        = useRef<HTMLInputElement>(null)
  const msgIdRef        = useRef(0)
  const conversationRef = useRef<string | null>(null)  // persists between sends

  const nextId = () => String(++msgIdRef.current)

  /* Scroll to bottom on new messages */
  useEffect(() => {
    if (isOpen) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping, isOpen])

  /* Focus input on open */
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 350)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !conversationRef.current) return

    let cancelled = false
    const loadMessages = async () => {
      const conversationId = conversationRef.current
      if (!conversationId) return
      try {
        const res = await fetch(`/api/live-chat/widget/messages?conversation_id=${encodeURIComponent(conversationId)}`)
        if (!res.ok) return
        const data = await res.json() as {
          status?: string
          messages?: { id: string; role: string; content: string; metadata?: { sender_type?: string } | null }[]
        }
        if (cancelled) return
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
          })))
        }
      } catch { /* polling is best-effort */ }
    }

    void loadMessages()
    const interval = window.setInterval(() => { void loadMessages() }, 3000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [isOpen])

  const open = useCallback(() => {
    setMessages([GREETING])
    setIsTyping(false)
    setInput('')
    setIsOpen(true)
    setHasOpened(true)
    // Do NOT reset conversationRef — preserve thread across open/close cycles
  }, [])

  const close = useCallback(() => setIsOpen(false), [])

  /* ─── Real API send ──────────────────────────────────────── */

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isTyping) return

    const userMsg: Msg = { id: nextId(), role: 'user', text: trimmed }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsTyping(true)

    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id:     BUSINESS_ID,
          conversation_id: conversationRef.current ?? undefined,
          message:         trimmed,
        }),
      })

      const data = await res.json() as {
        reply?:           string
        conversation_id?: string
        error?:           string
        status?:          string
        handover?:        boolean
      }

      // Persist the conversation_id for subsequent messages
      if (data.conversation_id) conversationRef.current = data.conversation_id
      if (data.handover || data.status === 'handover_requested' || data.status === 'live_chat') {
        setHandoverActive(true)
      }

      const replyText = data.reply ?? data.error ?? 'Sorry, something went wrong. Please try again.'
      setMessages(prev => [...prev, { id: nextId(), role: 'ai', text: replyText }])
    } catch {
      setMessages(prev => [...prev, {
        id:   nextId(),
        role: 'ai',
        text: 'Connection error. Please check your internet and try again.',
      }])
    } finally {
      setIsTyping(false)
    }
  }, [isTyping])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void sendMessage(input)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
            className="fixed z-[60] bottom-[88px] right-4 sm:right-6 w-[calc(100vw-32px)] sm:w-[380px] flex flex-col rounded-[28px] overflow-hidden"
            style={{
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
              <div className="flex items-center gap-3 mb-4">
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
                    <span
                      className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full"
                      style={{
                        background: 'rgba(244,122,99,0.12)',
                        border: '1px solid rgba(244,122,99,0.24)',
                        color: '#f8a36d',
                      }}
                    >
                      Pro
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <motion.span
                      className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                      animate={{ opacity: [0.82, 1, 0.82] }}
                      transition={{ duration: 3.4, repeat: Infinity }}
                    />
                    <span className="text-[11px] text-white/40">Always on · replies in &lt;3 seconds</span>
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

              {/* Channel pills */}
              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase tracking-widest text-white/20 font-semibold flex-shrink-0">
                  {handoverActive ? 'Handover active' : 'Active on'}
                </span>
                <div className="flex gap-1.5 flex-wrap">
                  {(handoverActive ? CHANNELS.slice(0, 1) : CHANNELS).map(({ Icon, color, bg, label }) => (
                    <motion.div
                      key={label}
                      whileHover={{ opacity: 0.86 }}
                      transition={{ duration: 0.16 }}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg cursor-default"
                      style={{ background: bg, border: `1px solid ${color}30` }}
                      title={label}
                    >
                      <Icon className="w-3 h-3" style={{ color }} />
                      <span className="text-[9px] font-semibold" style={{ color }}>{label}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Messages ── */}
            <div
              className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3"
              style={{ minHeight: 0, scrollbarWidth: 'thin', scrollbarColor: 'rgba(244,122,99,0.22) transparent' }}
            >
              {messages.map((msg) => (
                <Bubble key={msg.id} msg={msg} />
              ))}

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
              <form onSubmit={handleSubmit} className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message…"
                  disabled={isTyping}
                  className="flex-1 bg-transparent text-sm text-white/80 placeholder-white/20 outline-none py-2.5 px-4 rounded-xl transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                />
                <motion.button
                  type="submit"
                  disabled={!input.trim() || isTyping}
                  whileHover={{ opacity: 0.9 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-30"
                  style={{
                    background: 'linear-gradient(135deg,#f16376,#f89a57)',
                    boxShadow: input.trim() ? '0 4px 16px rgba(244,122,99,0.28)' : 'none',
                  }}
                >
                  <Send className="w-4 h-4 text-white" />
                </motion.button>
              </form>

              <div className="flex items-center justify-center gap-1.5 mt-3">
                <Sparkles className="w-3 h-3 text-[#f47a63]/60" />
                <span className="text-[10px] text-white/20 font-medium">
                  {handoverActive ? 'Connected to ' : 'Powered by '}
                  <span className="text-[#f47a63]/70">{handoverActive ? 'the team' : 'InstantDesk AI'}</span>
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
