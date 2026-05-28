'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Bot, MessageCircle, FileText, Clock,
  Calendar, Building2, Tag,
} from 'lucide-react'

/* ── Types ───────────────────────────────────────────────────── */

type ApptStatus = 'confirmed' | 'pending' | 'completed' | 'cancelled'
type FromRole   = 'user' | 'ai' | 'agent'

export interface DrawerAppointment {
  id:       string
  name:     string
  company:  string
  type:     string
  date:     string   // YYYY-MM-DD
  time:     string   // HH:MM
  status:   ApptStatus
  leadId?:  string
  notes?:   string
}

interface ChatMessage {
  id:              string
  from:            FromRole
  content:         string
  response_time_ms: number | null
  created_at:      string
}

/* ── Config ──────────────────────────────────────────────────── */

const STATUS_CFG: Record<ApptStatus, { label: string; color: string; bg: string; border: string }> = {
  confirmed:  { label:'Confirmed',  color:'#34d399', bg:'rgba(52,211,153,0.10)',  border:'rgba(52,211,153,0.25)'  },
  pending:    { label:'Pending',    color:'#fbbf24', bg:'rgba(251,191,36,0.10)',  border:'rgba(251,191,36,0.25)'  },
  completed:  { label:'Completed',  color:'#60a5fa', bg:'rgba(96,165,250,0.10)',  border:'rgba(96,165,250,0.25)'  },
  cancelled:  { label:'Cancelled',  color:'#f87171', bg:'rgba(248,113,113,0.10)', border:'rgba(248,113,113,0.25)' },
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp:  'WhatsApp',
  website:   'Website Chat',
  email:     'Email',
  instagram: 'Instagram DM',
}

/* ── Helpers ─────────────────────────────────────────────────── */

function initials(name?: string | null): string {
  if (!name?.trim()) return '?'
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function fmtFullDate(date: string, time: string): string {
  try {
    return new Date(`${date}T${time}`).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  } catch { return `${date} ${time}` }
}

function fmtMsgTime(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

function fmtSpeed(ms: number | null): string | null {
  if (!ms || ms <= 0) return null
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

/* ── Conversation skeleton ───────────────────────────────────── */

function ConvSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[80, 65, 75, 55].map((w, i) => (
        <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
          <div className="rounded-2xl animate-pulse"
            style={{
              width: `${w}%`, height: 34,
              background: i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(139,92,246,0.08)',
            }} />
        </div>
      ))}
    </div>
  )
}

/* ── Component ───────────────────────────────────────────────── */

export default function ApptDrawer({
  appt,
  onClose,
}: {
  appt:    DrawerAppointment
  onClose: () => void
}) {
  const sc = STATUS_CFG[appt.status]

  /* Conversation ─────────────────────────────────────────────── */
  const [messages,    setMessages]    = useState<ChatMessage[]>([])
  const [convLoading, setConvLoading] = useState(true)
  const [channel,     setChannel]     = useState<string | null>(null)

  useEffect(() => {
    setConvLoading(true)
    setMessages([])
    setChannel(null)

    if (!appt.leadId) {
      setConvLoading(false)
      return
    }

    fetch(`/api/lead-messages?lead_id=${encodeURIComponent(appt.leadId)}`)
      .then(r => r.json())
      .then((d: { messages?: ChatMessage[]; channel?: string | null }) => {
        setMessages(d.messages ?? [])
        setChannel(d.channel ?? null)
      })
      .catch(() => {})
      .finally(() => setConvLoading(false))
  }, [appt.id, appt.leadId])

  /* Scroll lock + ESC ────────────────────────────────────────── */
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="appt-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <motion.aside
        key="appt-panel"
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md overflow-y-auto"
        style={{
          background:    'rgba(7,7,25,0.97)',
          backdropFilter:'blur(24px)',
          borderLeft:    '1px solid rgba(139,92,246,0.18)',
          boxShadow:     '-32px 0 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div className="flex items-start gap-4 px-6 py-5 sticky top-0 z-10"
          style={{ background:'rgba(7,7,25,0.97)', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black text-white flex-shrink-0"
            style={{ background:'linear-gradient(135deg,#7c3aed,#2563eb)' }}>
            {initials(appt.name)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-white leading-tight">{appt.name}</h2>
            {appt.company && (
              <p className="text-xs text-white/40 mt-0.5 flex items-center gap-1">
                <Building2 className="w-3 h-3 flex-shrink-0" />{appt.company}
              </p>
            )}
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/80 transition-all flex-shrink-0"
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">

          {/* Date + time + type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-3.5 flex flex-col gap-1.5"
              style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-white/25">
                <Calendar className="w-3 h-3" />Date &amp; Time
              </div>
              <div className="text-xs font-semibold text-white/70 leading-relaxed">
                {fmtFullDate(appt.date, appt.time)}
              </div>
              <div className="flex items-center gap-1 text-[11px] font-bold text-white/50 mt-0.5">
                <Clock className="w-3 h-3" />{appt.time}
              </div>
            </div>

            <div className="rounded-xl p-3.5 flex flex-col gap-1.5"
              style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-white/25">
                <Tag className="w-3 h-3" />Type
              </div>
              <div className="text-xs font-semibold text-white/70">{appt.type}</div>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full self-start mt-0.5"
                style={{ color: sc.color, background: sc.bg, border: `1px solid ${sc.border}` }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: sc.color }} />
                {sc.label}
              </span>
            </div>
          </div>

          {/* Notes */}
          {appt.notes && (
            <div className="rounded-2xl p-4 flex flex-col gap-2.5"
              style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ background:'rgba(255,255,255,0.06)' }}>
                  <FileText className="w-3 h-3 text-white/40" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Notes</span>
              </div>
              <p className="text-xs text-white/55 leading-relaxed whitespace-pre-wrap">{appt.notes}</p>
            </div>
          )}

          {/* Conversation */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-white/25" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">
                  Conversation
                </span>
              </div>
              {!convLoading && channel && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.35)' }}>
                  {CHANNEL_LABEL[channel] ?? channel}
                </span>
              )}
              {!appt.leadId && !convLoading && (
                <span className="text-[10px] text-white/20">No linked lead</span>
              )}
            </div>

            {convLoading ? (
              <ConvSkeleton />
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 rounded-2xl"
                style={{ background:'rgba(255,255,255,0.02)', border:'1px dashed rgba(255,255,255,0.07)' }}>
                <MessageCircle className="w-7 h-7 text-white/10" />
                <p className="text-sm text-white/25 font-medium">No conversation recorded</p>
                <p className="text-xs text-white/15">Messages appear once the lead chats</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map((msg, i) => (
                  <motion.div key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className="max-w-[85%]">
                      {msg.from !== 'user' && (
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <div className="w-4 h-4 rounded flex items-center justify-center"
                            style={{ background:'rgba(139,92,246,0.25)' }}>
                            <Bot className="w-2.5 h-2.5 text-violet-400" />
                          </div>
                          <span className="text-[9px] font-bold text-violet-400/60 uppercase tracking-wider">
                            {msg.from === 'agent' ? 'Agent' : 'InstantDesk AI'}
                          </span>
                          {fmtSpeed(msg.response_time_ms) && (
                            <span className="text-[9px] text-white/20">
                              · replied in {fmtSpeed(msg.response_time_ms)}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed"
                        style={msg.from !== 'user' ? {
                          background:          'rgba(139,92,246,0.12)',
                          border:              '1px solid rgba(139,92,246,0.2)',
                          color:               'rgba(255,255,255,0.75)',
                          borderTopLeftRadius:  4,
                        } : {
                          background:           'rgba(255,255,255,0.07)',
                          border:               '1px solid rgba(255,255,255,0.1)',
                          color:                'rgba(255,255,255,0.65)',
                          borderTopRightRadius:  4,
                        }}>
                        {msg.content}
                      </div>
                      {msg.created_at && (
                        <div className={`text-[9px] text-white/20 mt-1 ${msg.from === 'user' ? 'text-right' : 'text-left'}`}>
                          {fmtMsgTime(msg.created_at)}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

        </div>
      </motion.aside>
    </AnimatePresence>
  )
}
