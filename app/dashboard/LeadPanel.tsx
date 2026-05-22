'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Bot, Tag, Clock, Lightbulb,
  MessageCircle, Globe, Calendar, ArrowRight,
  SlidersHorizontal, Phone, Mail, FileText, User,
} from 'lucide-react'

/* ─── Types ──────────────────────────────────────────────────── */

type ScoreLabel = 'hot' | 'warm' | 'cold'
type LeadStatus = 'new' | 'contacted' | 'demo_booked' | 'won' | 'lost'
type FromRole   = 'user' | 'ai' | 'agent'

interface Lead {
  id: string; name: string; company: string
  email?: string; phone?: string
  source: string; interest: string; assignedAgent: string
  score: number; scoreLabel: ScoreLabel; status: LeadStatus; date: string
  metadata?: Record<string, unknown>
}

interface ChatMessage {
  id:              string
  from:            FromRole
  content:         string
  response_time_ms: number | null
  created_at:      string
}

/* ─── Metadata helpers ───────────────────────────────────────── */

function formatMetaKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function formatMetaValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean')        return v ? 'Yes' : 'No'
  if (typeof v === 'string')         return v
  if (typeof v === 'number')         return v.toLocaleString()
  if (Array.isArray(v))              return v.join(', ')
  return JSON.stringify(v)
}

// Keys rendered separately — excluded from the generic metadata table
const SURFACED_META_KEYS = new Set([
  'full_conversation', 'message', 'initial_message',
  'notes', 'note',
])

/* ─── Conversation helpers ───────────────────────────────────── */

function fmtTime(iso: string): string {
  if (!iso) return ''
  try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

function fmtSpeed(ms: number | null): string | null {
  if (!ms || ms <= 0) return null
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return iso }
}

/**
 * Parse a raw transcript string (metadata.full_conversation or a single message).
 * Supports: "User: ...\nBot: ...", "Customer: ...\nAI: ...", alternating lines.
 */
function parseRawTranscript(text: string): ChatMessage[] {
  const userRx = /^(?:user|customer|human|lead|client)\s*:/i
  const aiRx   = /^(?:bot|ai|assistant|agent|system|instantdesk)\s*:/i
  const lines  = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const hasPfx = lines.some(l => userRx.test(l) || aiRx.test(l))

  if (hasPfx) {
    return lines.flatMap((line, i): ChatMessage[] => {
      const m = line.match(/^[^:]+:\s*(.+)/i)
      if (userRx.test(line) && m) return [{ id:`p${i}`, from:'user', content:m[1], response_time_ms:null, created_at:'' }]
      if (aiRx.test(line)   && m) return [{ id:`p${i}`, from:'ai',   content:m[1], response_time_ms:null, created_at:'' }]
      return []
    })
  }
  // No prefixes — alternating lines
  return lines.map((line, i) => ({
    id: `p${i}`, from: (i % 2 === 0 ? 'user' : 'ai') as FromRole,
    content: line, response_time_ms: null, created_at: '',
  }))
}

/* ─── Config ─────────────────────────────────────────────────── */

const STATUS_CFG: Record<LeadStatus, { label: string; color: string; bg: string }> = {
  new:         { label:'New',         color:'#a78bfa', bg:'rgba(167,139,250,0.10)' },
  contacted:   { label:'Contacted',   color:'#60a5fa', bg:'rgba(96,165,250,0.10)'  },
  demo_booked: { label:'Demo Booked', color:'#fbbf24', bg:'rgba(251,191,36,0.10)'  },
  won:         { label:'Won',         color:'#34d399', bg:'rgba(52,211,153,0.10)'  },
  lost:        { label:'Lost',        color:'#f87171', bg:'rgba(248,113,113,0.10)' },
}

const SCORE_CFG: Record<ScoreLabel, { color: string; label: string }> = {
  hot:  { color:'#f87171', label:'Hot'  },
  warm: { color:'#fb923c', label:'Warm' },
  cold: { color:'#60a5fa', label:'Cold' },
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp:'WhatsApp', website:'Website Chat', email:'Email', instagram:'Instagram DM',
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

/* ─── Skeletons ──────────────────────────────────────────────── */

function ConvSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[85, 65, 75, 55].map((w, i) => (
        <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
          <div className="rounded-2xl animate-pulse"
            style={{ width:`${w}%`, height:34,
              background: i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(139,92,246,0.08)' }} />
        </div>
      ))}
    </div>
  )
}

/* ─── Shared chat bubbles ────────────────────────────────────── */

function ChatBubbles({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="flex flex-col gap-3">
      {messages.map((msg, i) => (
        <motion.div key={msg.id}
          initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.04 }}
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
                  <span className="text-[9px] text-white/20">· replied in {fmtSpeed(msg.response_time_ms)}</span>
                )}
              </div>
            )}
            <div className="rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed"
              style={msg.from !== 'user' ? {
                background:'rgba(139,92,246,0.12)', border:'1px solid rgba(139,92,246,0.2)',
                color:'rgba(255,255,255,0.75)', borderTopLeftRadius:4,
              } : {
                background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)',
                color:'rgba(255,255,255,0.65)', borderTopRightRadius:4,
              }}>
              {msg.content}
            </div>
            {msg.created_at && (
              <div className={`text-[9px] text-white/20 mt-1 ${msg.from === 'user' ? 'text-right' : 'text-left'}`}>
                {fmtTime(msg.created_at)}
              </div>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  )
}

/* ─── Component ──────────────────────────────────────────────── */

export default function LeadPanel({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const statusCfg = STATUS_CFG[lead.status]
  const scoreCfg  = SCORE_CFG[lead.scoreLabel]

  /* ── Conversation fetch ──────────────────────────────────────── */
  const [messages,    setMessages]    = useState<ChatMessage[]>([])
  const [convLoading, setConvLoading] = useState(true)
  const [channel,     setChannel]     = useState<string | null>(null)

  useEffect(() => {
    setConvLoading(true)
    setMessages([])
    setChannel(null)
    fetch(`/api/lead-messages?lead_id=${encodeURIComponent(lead.id)}`)
      .then(r => r.json())
      .then((d: { messages?: ChatMessage[]; channel?: string | null }) => {
        setMessages(d.messages ?? [])
        setChannel(d.channel ?? null)
      })
      .catch(() => {})
      .finally(() => setConvLoading(false))
  }, [lead.id])

  // Fallback chain: DB messages → full_conversation → message → initial_message
  const rawText: string | null =
    typeof lead.metadata?.full_conversation === 'string' && lead.metadata.full_conversation.trim()
      ? lead.metadata.full_conversation
      : typeof lead.metadata?.message === 'string' && lead.metadata.message.trim()
        ? `User: ${lead.metadata.message}`
        : typeof lead.metadata?.initial_message === 'string' && lead.metadata.initial_message.trim()
          ? `User: ${lead.metadata.initial_message}`
          : null

  const displayMessages: ChatMessage[] =
    messages.length > 0 ? messages : rawText ? parseRawTranscript(rawText) : []
  const fromMetadata = messages.length === 0 && displayMessages.length > 0

  /* ── Scroll lock + ESC ───────────────────────────────────────── */
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  /* ── Metadata sections ───────────────────────────────────────── */
  const notesText =
    typeof lead.metadata?.notes === 'string' ? lead.metadata.notes
    : typeof lead.metadata?.note  === 'string' ? lead.metadata.note
    : null

  // Entries that go in the generic key-value table (excluding already-surfaced keys)
  const metaEntries = lead.metadata
    ? Object.entries(lead.metadata).filter(([k]) => !SURFACED_META_KEYS.has(k))
    : []

  /* ── Lead info rows ──────────────────────────────────────────── */
  const detailRows = [
    { label:'Interest',  value: lead.interest     || null },
    { label:'Agent',     value: lead.assignedAgent || null },
    { label:'Source',    value: lead.source        || null },
    { label:'Added',     value: lead.date ? fmtDate(lead.date) : null },
  ].filter(r => r.value) as { label: string; value: string }[]

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div key="backdrop"
        initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
        className="fixed inset-0 z-40"
        style={{ background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <motion.aside key="panel"
        initial={{ x:'100%', opacity:0 }} animate={{ x:0, opacity:1 }} exit={{ x:'100%', opacity:0 }}
        transition={{ type:'spring', stiffness:300, damping:30 }}
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md overflow-y-auto"
        style={{
          background:'rgba(7,7,25,0.97)', backdropFilter:'blur(24px)',
          borderLeft:'1px solid rgba(139,92,246,0.18)',
          boxShadow:'-32px 0 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* ── Header ───────────────────────────────────────────── */}
        <div className="flex items-start gap-4 px-6 py-5 sticky top-0 z-10"
          style={{ background:'rgba(7,7,25,0.97)', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black text-white flex-shrink-0"
            style={{ background:'linear-gradient(135deg,#7c3aed,#2563eb)' }}>
            {initials(lead.name)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-white leading-tight">{lead.name}</h2>
            {lead.company && <p className="text-xs text-white/40 mt-0.5">{lead.company}</p>}
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/80 transition-all flex-shrink-0"
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">

          {/* ── Contact info ─────────────────────────────────── */}
          {(lead.phone || lead.email) && (
            <div className="flex flex-col gap-2">
              {lead.phone && (
                <a href={`tel:${lead.phone}`}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors hover:bg-white/5"
                  style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
                  <Phone className="w-3.5 h-3.5 text-emerald-400/70 flex-shrink-0" />
                  <span className="text-xs font-medium text-white/65">{lead.phone}</span>
                </a>
              )}
              {lead.email && (
                <a href={`mailto:${lead.email}`}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors hover:bg-white/5"
                  style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
                  <Mail className="w-3.5 h-3.5 text-blue-400/70 flex-shrink-0" />
                  <span className="text-xs font-medium text-white/65 truncate">{lead.email}</span>
                </a>
              )}
            </div>
          )}

          {/* ── Score / Status / Source ───────────────────────── */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl p-3 flex flex-col gap-1.5"
              style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-white/25">Score</div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-sm" style={{ color:scoreCfg.color }}>{lead.score}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ color:scoreCfg.color, background:`${scoreCfg.color}18` }}>
                  {scoreCfg.label}
                </span>
              </div>
            </div>
            <div className="rounded-xl p-3 flex flex-col gap-1.5"
              style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-white/25">Status</div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full self-start"
                style={{ color:statusCfg.color, background:statusCfg.bg }}>
                {statusCfg.label}
              </span>
            </div>
            <div className="rounded-xl p-3 flex flex-col gap-1.5"
              style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-white/25">Source</div>
              <span className="text-xs text-white/55 font-medium leading-tight">{lead.source}</span>
            </div>
          </div>

          {/* ── Lead detail rows ──────────────────────────────── */}
          {detailRows.length > 0 && (
            <div className="rounded-2xl overflow-hidden"
              style={{ border:'1px solid rgba(255,255,255,0.07)' }}>
              {detailRows.map((row, i) => (
                <div key={row.label}
                  className="flex items-center gap-3 px-4 py-2.5"
                  style={{
                    background:   i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                    borderBottom: i < detailRows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  }}>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/25 w-16 flex-shrink-0">
                    {row.label}
                  </span>
                  <span className="text-xs text-white/65 font-medium">{row.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Notes from metadata ───────────────────────────── */}
          {notesText && (
            <div className="rounded-2xl p-4 flex flex-col gap-2.5"
              style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center gap-1.5">
                <FileText className="w-3 h-3 text-white/25" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Notes</span>
              </div>
              <p className="text-xs text-white/55 leading-relaxed whitespace-pre-wrap">{notesText}</p>
            </div>
          )}

          {/* ── Custom metadata table ─────────────────────────── */}
          {metaEntries.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-3 h-3 text-white/25" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">
                  Custom Details
                </span>
              </div>
              <div className="rounded-2xl overflow-hidden"
                style={{ border:'1px solid rgba(255,255,255,0.07)' }}>
                {metaEntries.map(([key, value], i) => (
                  <div key={key}
                    className="flex items-start justify-between gap-4 px-4 py-2.5"
                    style={{
                      background:   i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                      borderBottom: i < metaEntries.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    }}>
                    <span className="text-[11px] font-semibold text-white/35 flex-shrink-0">
                      {formatMetaKey(key)}
                    </span>
                    <span className="text-[11px] font-medium text-white/65 text-right break-all">
                      {formatMetaValue(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Conversation ──────────────────────────────────── */}
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
              {!convLoading && fromMetadata && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background:'rgba(251,191,36,0.08)', color:'rgba(251,191,36,0.6)' }}>
                  from transcript
                </span>
              )}
            </div>

            {convLoading ? (
              <ConvSkeleton />
            ) : displayMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 rounded-2xl"
                style={{ background:'rgba(255,255,255,0.02)', border:'1px dashed rgba(255,255,255,0.07)' }}>
                <MessageCircle className="w-7 h-7 text-white/10" />
                <p className="text-sm text-white/25 font-medium">No conversation recorded</p>
                <p className="text-xs text-white/15">Messages appear once the lead chats</p>
              </div>
            ) : (
              <ChatBubbles messages={displayMessages} />
            )}
          </div>

          {/* ── AI Summary ────────────────────────────────────── */}
          <div className="rounded-2xl p-4 flex flex-col gap-3"
            style={{ background:'rgba(139,92,246,0.07)', border:'1px solid rgba(139,92,246,0.18)' }}>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background:'rgba(139,92,246,0.2)' }}>
                <Bot className="w-3.5 h-3.5 text-violet-400" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-violet-400/70">AI Summary</span>
            </div>
            <p className="text-xs text-white/45 leading-relaxed italic">
              AI-generated summaries coming soon. Review the conversation and custom details above for full context.
            </p>
          </div>

          {/* ── Recommended Action ───────────────────────────── */}
          <div className="rounded-2xl p-4 flex flex-col gap-3"
            style={{ background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.18)' }}>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background:'rgba(251,191,36,0.15)' }}>
                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400/70">
                Recommended Action
              </span>
            </div>
            <p className="text-xs text-white/45 leading-relaxed italic">
              Review conversation, qualify budget &amp; timeline, then send a personalised follow-up.
            </p>
            <button className="flex items-center gap-1.5 text-xs font-semibold text-amber-400/80 hover:text-amber-300 transition-colors self-start">
              Take action <ArrowRight className="w-3 h-3" />
            </button>
          </div>

        </div>
      </motion.aside>
    </AnimatePresence>
  )
}
