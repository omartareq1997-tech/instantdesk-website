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

type Role = 'ai' | 'user'
type Msg  = { id: string; role: Role; text: string }

/* ─── Static UI data ─────────────────────────────────────── */

const CHANNELS = [
  { Icon: GlobeIcon,     color: '#60a5fa', bg: 'rgba(96,165,250,0.14)',  label: 'Website'   },
  { Icon: WhatsAppIcon,  color: '#25D366', bg: 'rgba(37,211,102,0.14)',  label: 'WhatsApp'  },
  { Icon: InstagramIcon, color: '#E1306C', bg: 'rgba(225,48,108,0.14)',  label: 'Instagram' },
  { Icon: MessengerIcon, color: '#0084FF', bg: 'rgba(0,132,255,0.14)',   label: 'Messenger' },
  { Icon: TelegramIcon,  color: '#229ED9', bg: 'rgba(34,158,217,0.14)',  label: 'Telegram'  },
]

/* ─── Typing dots ────────────────────────────────────────── */

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-2 h-2 rounded-full"
          style={{ background: 'rgba(167,139,250,0.7)' }}
          animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.16, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

/* ─── Message bubble ─────────────────────────────────────── */

function Bubble({ msg }: { msg: Msg }) {
  const isAI = msg.role === 'ai'
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={`flex items-end gap-2 ${isAI ? '' : 'flex-row-reverse'}`}
    >
      {isAI && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#2563eb)', boxShadow: '0 0 12px rgba(124,58,237,0.5)' }}
        >
          <Bot className="w-3.5 h-3.5 text-white" />
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
          background: 'linear-gradient(135deg,rgba(124,58,237,0.75),rgba(37,99,235,0.65))',
          border: '1px solid rgba(139,92,246,0.35)',
          color: 'rgba(255,255,255,0.92)',
          borderBottomRightRadius: '6px',
          boxShadow: '0 4px 16px rgba(124,58,237,0.2)',
        }}
      >
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
  const [showLabel, setShowLabel] = useState(false)

  const endRef          = useRef<HTMLDivElement>(null)
  const inputRef        = useRef<HTMLInputElement>(null)
  const msgIdRef        = useRef(0)
  const conversationRef = useRef<string | null>(null)  // persists between sends

  const nextId = () => String(++msgIdRef.current)

  /* Hide on admin pages */
  if (pathname?.startsWith('/admin')) return null

  /* Scroll to bottom on new messages */
  useEffect(() => {
    if (isOpen) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping, isOpen])

  /* Focus input on open */
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 350)
  }, [isOpen])

  /* Show label hint after 3s on first load */
  useEffect(() => {
    const t = setTimeout(() => setShowLabel(true), 3000)
    return () => clearTimeout(t)
  }, [])

  const open = useCallback(() => {
    setMessages([GREETING])
    setIsTyping(false)
    setInput('')
    setIsOpen(true)
    setHasOpened(true)
    setShowLabel(false)
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
      }

      // Persist the conversation_id for subsequent messages
      if (data.conversation_id) conversationRef.current = data.conversation_id

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

  return (
    <>
      {/* ── Chat panel ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.88, y: 16, originX: 1, originY: 1 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 16 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="fixed z-[60] bottom-[88px] right-4 sm:right-6 w-[calc(100vw-32px)] sm:w-[380px] flex flex-col rounded-[28px] overflow-hidden"
            style={{
              maxHeight: 'min(580px, calc(100dvh - 120px))',
              background: 'rgba(6,6,20,0.97)',
              backdropFilter: 'blur(48px)',
              WebkitBackdropFilter: 'blur(48px)',
              border: '1px solid rgba(139,92,246,0.22)',
              boxShadow: [
                '0 40px 100px rgba(0,0,0,0.75)',
                '0 0 0 1px rgba(255,255,255,0.035)',
                'inset 0 1px 0 rgba(255,255,255,0.06)',
                '0 0 60px rgba(99,102,241,0.08)',
              ].join(','),
            }}
          >

            {/* ── Header ── */}
            <div
              className="relative flex-shrink-0 px-5 pt-5 pb-4"
              style={{
                background: 'linear-gradient(160deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.06) 100%)',
                borderBottom: '1px solid rgba(255,255,255,0.055)',
              }}
            >
              {/* Shimmer line */}
              <motion.div
                className="absolute top-0 left-0 right-0 h-[1px]"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.8), rgba(96,165,250,0.6), transparent)',
                }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              />

              {/* Top row: avatar + info + close */}
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-shrink-0">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #2563eb 100%)',
                      boxShadow: '0 0 20px rgba(124,58,237,0.5), 0 0 40px rgba(124,58,237,0.2)',
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
                        background: 'rgba(139,92,246,0.15)',
                        border: '1px solid rgba(139,92,246,0.3)',
                        color: '#a78bfa',
                      }}
                    >
                      Pro
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <motion.span
                      className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                      animate={{ opacity: [1, 0.4, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
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
                  Active on
                </span>
                <div className="flex gap-1.5 flex-wrap">
                  {CHANNELS.map(({ Icon, color, bg, label }) => (
                    <motion.div
                      key={label}
                      whileHover={{ scale: 1.1, y: -1 }}
                      transition={{ duration: 0.15 }}
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
              style={{ minHeight: 0, scrollbarWidth: 'thin', scrollbarColor: 'rgba(139,92,246,0.2) transparent' }}
            >
              {messages.map((msg) => (
                <Bubble key={msg.id} msg={msg} />
              ))}

              {/* Typing indicator */}
              <AnimatePresence>
                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-end gap-2"
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg,#7c3aed,#2563eb)', boxShadow: '0 0 12px rgba(124,58,237,0.5)' }}
                    >
                      <Bot className="w-3.5 h-3.5 text-white" />
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
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.94 }}
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-30"
                  style={{
                    background: 'linear-gradient(135deg,#7c3aed,#2563eb)',
                    boxShadow: input.trim() ? '0 4px 16px rgba(124,58,237,0.4)' : 'none',
                  }}
                >
                  <Send className="w-4 h-4 text-white" />
                </motion.button>
              </form>

              <div className="flex items-center justify-center gap-1.5 mt-3">
                <Sparkles className="w-3 h-3 text-violet-500/50" />
                <span className="text-[10px] text-white/20 font-medium">
                  Powered by <span className="text-violet-400/60">InstantDesk AI</span>
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating button ── */}
      <div className="fixed bottom-5 right-4 sm:right-6 z-[60]">
        {/* Label hint */}
        <AnimatePresence>
          {showLabel && !isOpen && !hasOpened && (
            <motion.div
              initial={{ opacity: 0, x: 12, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 12, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              className="absolute bottom-1 right-16 flex items-center gap-2 px-4 py-2.5 rounded-2xl whitespace-nowrap pointer-events-none"
              style={{
                background: 'rgba(6,6,20,0.95)',
                border: '1px solid rgba(139,92,246,0.25)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold text-white/80">Chat with AI</span>
              <span className="text-[10px] text-white/30">· 5 channels</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pulse rings */}
        <div className="relative">
          {[0, 1].map((i) => (
            <motion.div
              key={i}
              className="absolute inset-0 rounded-full"
              style={{ background: 'rgba(124,58,237,0.35)' }}
              animate={{ scale: [1, 1.65 + i * 0.25], opacity: [0.45, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.75, ease: 'easeOut' }}
            />
          ))}

          {/* Button */}
          <motion.button
            onClick={isOpen ? close : open}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 350, damping: 20 }}
            className="relative w-14 h-14 sm:w-[60px] sm:h-[60px] rounded-full flex items-center justify-center cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 45%, #2563eb 100%)',
              boxShadow: isOpen
                ? '0 8px 32px rgba(124,58,237,0.6), 0 0 0 2px rgba(139,92,246,0.4)'
                : '0 8px 32px rgba(124,58,237,0.45), 0 2px 8px rgba(0,0,0,0.4)',
            }}
            aria-label={isOpen ? 'Close chat' : 'Open AI chat'}
          >
            <AnimatePresence mode="wait">
              {isOpen ? (
                <motion.div
                  key="close"
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <X className="w-5 h-5 text-white" />
                </motion.div>
              ) : (
                <motion.div
                  key="bot"
                  initial={{ rotate: 90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -90, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <Bot className="w-5 h-5 text-white" />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Unread badge */}
            {!hasOpened && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 3.2, type: 'spring', stiffness: 400, damping: 14 }}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-white text-[10px] font-black flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg,#ec4899,#ef4444)' }}
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
            style={{ background: '#22c55e', borderColor: '#050510' }}
          >
            <motion.div
              className="w-1.5 h-1.5 rounded-full bg-white/80"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
        </div>
      </div>
    </>
  )
}
