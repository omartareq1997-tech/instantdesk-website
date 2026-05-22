'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Bot, Lightbulb,
  MessageCircle, Calendar, ArrowRight,
  SlidersHorizontal, Phone, Mail, FileText, Clock, Tag,
} from 'lucide-react'

/* ─── Types ──────────────────────────────────────────────────── */

type ScoreLabel = 'hot' | 'warm' | 'cold'
type LeadStatus = 'new' | 'contacted' | 'demo_booked' | 'won' | 'lost'
type ApptStatus = 'confirmed' | 'pending' | 'completed' | 'cancelled'
type FromRole   = 'user' | 'ai' | 'agent'

interface Lead {
  id: string; name: string; company: string
  email?: string; phone?: string
  source: string; interest: string; assignedAgent: string
  score: number; scoreLabel: ScoreLabel; status: LeadStatus; date: string
  metadata?: Record<string, unknown>
}

// Minimal appointment shape — matches Appointment from types.ts
interface ApptSummary {
  id:      string
  type:    string
  date:    string    // YYYY-MM-DD
  time:    string    // HH:MM
  status:  ApptStatus
  name:    string
  company: string
  notes?:  string
  leadId?: string
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
  'full_conversation', 'message', 'initial_message', 'notes', 'note',
])

/* ─── Conversation helpers ───────────────────────────────────── */

function fmtTime(iso: string): string {
  if (!iso) return ''
  // iso may be a bare "HH:MM" time string from a transcript, or a full ISO datetime
  if (/^\d{1,2}:\d{2}/.test(iso)) return iso.slice(0, 5)
  try { return new Date(iso).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }) }
  catch { return '' }
}

function fmtSpeed(ms: number | null): string | null {
  if (!ms || ms <= 0) return null
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) }
  catch { return iso }
}

/** Full weekday date: "Thursday 5 June 2026" */
function fmtApptFull(date: string): string {
  try {
    return new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', {
      weekday:'long', day:'numeric', month:'long', year:'numeric',
    })
  } catch { return date }
}

/**
 * Role label regexes.
 * CLIENT_RX: the human side — Visitor, Client, User, Customer, Lead, You, Human, Reply
 * BOT_RX:    the bot side   — Bot, AI, Assistant, Agent, System, InstantDesk, Support, Chatbot, Rep
 * TS_RX:     optional timestamp prefix — [14:32], (14:32:05), "14:32 - "
 */
const CLIENT_RX = /^(?:client|user|customer|human|lead|visitor|you|reply|sender|guest)\s*[:\-]\s*/i
const BOT_RX    = /^(?:bot|ai|assistant|agent|system|instantdesk|support|rep|help|chatbot|operator|staff)\s*[:\-]\s*/i
const TS_RX     = /^[\[(]?\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?[\])]?\s*[-–|]?\s*/i

/**
 * Parse an HTML conversation transcript from a chat widget.
 * Detects speaker by CSS classes, inline styles, or parent element classes.
 * Returns [] if the HTML structure can't be mapped to roles.
 */
function parseHtmlConversation(html: string): ChatMessage[] {
  if (typeof document === 'undefined') return []
  const wrap = document.createElement('div')
  wrap.innerHTML = html
  const msgs: ChatMessage[] = []

  // Identify role from element + parent classes / inline style
  function detectRole(el: Element): FromRole | null {
    const check = (cls: string): FromRole | null => {
      // Client: right-side, outgoing, blue, visitor, user, etc.
      if (/\b(visitor|client|user[-_]?msg|from[-_]?user|outgoing|sent|right|you|human|lead|customer|blue|own|mine)\b/.test(cls)) return 'user'
      // Bot: left-side, incoming, white, bot, ai, assistant, etc.
      if (/\b(bot|ai|assistant|agent|incoming|received|left|support|chatbot|white|other|operator)\b/.test(cls)) return 'ai'
      return null
    }
    const cls = (el.getAttribute('class') ?? '').toLowerCase()
    const role = check(cls)
    if (role) return role
    // Check inline style for alignment clues
    const style = (el.getAttribute('style') ?? '').toLowerCase()
    if (/text-align\s*:\s*right|float\s*:\s*right|margin-left\s*:\s*auto/.test(style)) return 'user'
    if (/text-align\s*:\s*left|float\s*:\s*left|margin-right\s*:\s*auto/.test(style))  return 'ai'
    // Check parent
    if (el.parentElement) {
      const parentRole = check((el.parentElement.getAttribute('class') ?? '').toLowerCase())
      if (parentRole) return parentRole
    }
    return null
  }

  // Walk DOM, collect leaf-ish message elements
  function walk(el: Element, depth: number) {
    if (depth > 10) return
    const blockKids = Array.from(el.children).filter(c =>
      /^(div|p|li|section|article|blockquote)$/i.test(c.tagName)
    )
    if (blockKids.length > 0) {
      blockKids.forEach(c => walk(c, depth + 1))
      return
    }
    const text = (el.textContent ?? '').trim()
    if (!text) return
    const role = detectRole(el)
    if (role) {
      msgs.push({ id:`h${msgs.length}`, from:role, content:text, response_time_ms:null, created_at:'' })
    }
  }

  Array.from(wrap.children).forEach(c => walk(c, 0))
  return msgs
}

/**
 * Parse a raw text or HTML conversation transcript into ChatMessage[].
 *
 * Priority:
 * 1. HTML → class/style-based role detection
 * 2. Prefixed lines: "Client: …" / "Bot: …" (with optional timestamp prefix)
 *    Continuation lines (no recognisable label) are appended to the previous message.
 * 3. Fallback: alternate user / ai by line index
 */
function parseRawTranscript(rawText: string): ChatMessage[] {
  const text = rawText.trim()
  if (!text) return []

  // ── 1. HTML input ─────────────────────────────────────────────
  if (/<[a-z][\s\S]*?>/i.test(text)) {
    const htmlMsgs = parseHtmlConversation(text)
    if (htmlMsgs.length > 0) return htmlMsgs
    // Strip tags and reparse as plain text
    const stripped = text.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
    return parseRawTranscript(stripped)
  }

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)

  // ── 2. Prefixed lines ─────────────────────────────────────────
  const hasPfx = lines.some(l => {
    const stripped = l.replace(TS_RX, '')
    return CLIENT_RX.test(stripped) || BOT_RX.test(stripped)
  })

  if (hasPfx) {
    const msgs: ChatMessage[] = []
    let cur: ChatMessage | null = null

    for (let i = 0; i < lines.length; i++) {
      const raw  = lines[i]
      // Extract optional timestamp
      const tsM  = raw.match(/^[\[(]?(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)[\])]?/i)
      const time = tsM ? tsM[1].trim() : ''
      const line = raw.replace(TS_RX, '').trim()

      if (CLIENT_RX.test(line)) {
        if (cur) msgs.push(cur)
        cur = { id:`p${i}`, from:'user', content:line.replace(CLIENT_RX, '').trim(), response_time_ms:null, created_at:time }
      } else if (BOT_RX.test(line)) {
        if (cur) msgs.push(cur)
        cur = { id:`p${i}`, from:'ai', content:line.replace(BOT_RX, '').trim(), response_time_ms:null, created_at:time }
      } else if (cur) {
        // Continuation — append to the current speaker's message
        cur.content += '\n' + line
      }
      // else: header/separator line before any speaker — skip
    }
    if (cur) msgs.push(cur)
    // Filter out blank-content messages
    return msgs.filter(m => m.content.trim().length > 0)
  }

  // ── 3. No labels — alternate user / ai by line index ──────────
  return lines.map((line, i) => ({
    id: `p${i}`, from: (i % 2 === 0 ? 'user' : 'ai') as FromRole,
    content: line, response_time_ms: null, created_at: '',
  }))
}

/* ─── Config ─────────────────────────────────────────────────── */

const STATUS_CFG: Record<LeadStatus, { label:string; color:string; bg:string }> = {
  new:         { label:'New',         color:'#a78bfa', bg:'rgba(167,139,250,0.10)' },
  contacted:   { label:'Contacted',   color:'#60a5fa', bg:'rgba(96,165,250,0.10)'  },
  demo_booked: { label:'Demo Booked', color:'#fbbf24', bg:'rgba(251,191,36,0.10)'  },
  won:         { label:'Won',         color:'#34d399', bg:'rgba(52,211,153,0.10)'  },
  lost:        { label:'Lost',        color:'#f87171', bg:'rgba(248,113,113,0.10)' },
}

const SCORE_CFG: Record<ScoreLabel, { color:string; label:string }> = {
  hot:  { color:'#f87171', label:'Hot'  },
  warm: { color:'#fb923c', label:'Warm' },
  cold: { color:'#60a5fa', label:'Cold' },
}

const APPT_STATUS_CFG: Record<ApptStatus, { label:string; color:string; bg:string; border:string }> = {
  confirmed: { label:'Confirmed', color:'#34d399', bg:'rgba(52,211,153,0.07)',  border:'rgba(52,211,153,0.22)'  },
  pending:   { label:'Pending',   color:'#fbbf24', bg:'rgba(251,191,36,0.07)',  border:'rgba(251,191,36,0.22)'  },
  completed: { label:'Completed', color:'#60a5fa', bg:'rgba(96,165,250,0.07)',  border:'rgba(96,165,250,0.22)'  },
  cancelled: { label:'Cancelled', color:'#f87171', bg:'rgba(248,113,113,0.07)', border:'rgba(248,113,113,0.22)' },
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp:'WhatsApp', website:'Website Chat', email:'Email', instagram:'Instagram DM',
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()
}

/* ─── Skeleton ───────────────────────────────────────────────── */

function ConvSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[85, 65, 75, 55].map((w, i) => (
        <div key={i} className={`flex ${i%2===0?'justify-end':'justify-start'}`}>
          <div className="rounded-2xl animate-pulse"
            style={{ width:`${w}%`, height:34,
              background: i%2===0 ? 'rgba(255,255,255,0.05)' : 'rgba(139,92,246,0.08)' }} />
        </div>
      ))}
    </div>
  )
}

/* ─── Chat bubbles ───────────────────────────────────────────── */

function ChatBubbles({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="flex flex-col gap-3">
      {messages.map((msg, i) => (
        <motion.div key={msg.id}
          initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.04 }}
          className={`flex ${msg.from==='user'?'justify-end':'justify-start'}`}
        >
          <div className="max-w-[85%]">
            {msg.from !== 'user' && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-4 h-4 rounded flex items-center justify-center"
                  style={{ background:'rgba(139,92,246,0.25)' }}>
                  <Bot className="w-2.5 h-2.5 text-violet-400" />
                </div>
                <span className="text-[9px] font-bold text-violet-400/60 uppercase tracking-wider">
                  {msg.from==='agent'?'Agent':'InstantDesk AI'}
                </span>
                {fmtSpeed(msg.response_time_ms) && (
                  <span className="text-[9px] text-white/20">· replied in {fmtSpeed(msg.response_time_ms)}</span>
                )}
              </div>
            )}
            <div className="rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed"
              style={msg.from!=='user' ? {
                background:'rgba(139,92,246,0.12)', border:'1px solid rgba(139,92,246,0.2)',
                color:'rgba(255,255,255,0.75)', borderTopLeftRadius:4,
              } : {
                background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)',
                color:'rgba(255,255,255,0.65)', borderTopRightRadius:4,
              }}>
              {msg.content}
            </div>
            {msg.created_at && (
              <div className={`text-[9px] text-white/20 mt-1 ${msg.from==='user'?'text-right':'text-left'}`}>
                {fmtTime(msg.created_at)}
              </div>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  )
}

/* ─── Appointment card ───────────────────────────────────────── */

function AppointmentCard({ appt }: { appt: ApptSummary }) {
  const sc = APPT_STATUS_CFG[appt.status]
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ background:sc.bg, border:`1px solid ${sc.border}` }}>

      {/* Header row: label + status badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background:`${sc.color}20` }}>
            <Calendar className="w-3.5 h-3.5" style={{ color:sc.color }} />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color:`${sc.color}90` }}>
            Appointment
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ color:sc.color, background:`${sc.color}18`, border:`1px solid ${sc.color}30` }}>
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background:sc.color }} />
          {sc.label}
        </span>
      </div>

      {/* Type */}
      <div className="text-sm font-bold text-white/85">{appt.type}</div>

      {/* Date + Time */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs text-white/55">
          <Calendar className="w-3 h-3 text-white/25 flex-shrink-0" />
          <span>{fmtApptFull(appt.date)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/45">
          <Clock className="w-3 h-3 text-white/20 flex-shrink-0" />
          <span>{appt.time}</span>
        </div>
      </div>

      {/* Lead + Company */}
      {(appt.name || appt.company) && (
        <div className="flex items-center gap-2 text-xs text-white/40">
          <div className="w-5 h-5 rounded-md flex items-center justify-center text-[8px] font-black text-white flex-shrink-0"
            style={{ background:'linear-gradient(135deg,rgba(124,58,237,0.45),rgba(37,99,235,0.35))' }}>
            {initials(appt.name || '?')}
          </div>
          <span>{appt.name}{appt.company ? ` · ${appt.company}` : ''}</span>
        </div>
      )}

      {/* Notes / location */}
      {appt.notes && (
        <div className="flex items-start gap-2 pt-2.5" style={{ borderTop:`1px solid ${sc.color}18` }}>
          <Tag className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color:`${sc.color}60` }} />
          <p className="text-[11px] leading-relaxed" style={{ color:'rgba(255,255,255,0.45)' }}>
            {appt.notes}
          </p>
        </div>
      )}
    </div>
  )
}

/* ─── Main component ─────────────────────────────────────────── */

export default function LeadPanel({
  lead,
  appointments,
  onClose,
}: {
  lead:         Lead
  appointments?: ApptSummary[]
  onClose:      () => void
}) {
  const statusCfg = STATUS_CFG[lead.status]
  const scoreCfg  = SCORE_CFG[lead.scoreLabel]

  // Find all appointments linked to this lead, upcoming first
  const leadAppts = (appointments ?? [])
    .filter(a => a.leadId === lead.id)
    .sort((a, b) => {
      const aActive = a.status !== 'completed' && a.status !== 'cancelled'
      const bActive = b.status !== 'completed' && b.status !== 'cancelled'
      if (aActive && !bActive) return -1
      if (!aActive && bActive) return 1
      return `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)
    })

  /* ── Conversation fetch ──────────────────────────────────────── */
  const [messages,    setMessages]    = useState<ChatMessage[]>([])
  const [convLoading, setConvLoading] = useState(true)
  const [channel,     setChannel]     = useState<string | null>(null)

  useEffect(() => {
    setConvLoading(true); setMessages([]); setChannel(null)
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

  const metaEntries = lead.metadata
    ? Object.entries(lead.metadata).filter(([k]) => !SURFACED_META_KEYS.has(k))
    : []

  /* ── Lead info rows ──────────────────────────────────────────── */
  const detailRows = [
    { label:'Interest', value: lead.interest     || null },
    { label:'Agent',    value: lead.assignedAgent || null },
    { label:'Source',   value: lead.source        || null },
    { label:'Added',    value: lead.date ? fmtDate(lead.date) : null },
  ].filter(r => r.value) as { label:string; value:string }[]

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
            onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.background='transparent' }}>
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

          {/* ── Booked appointments ───────────────────────────── */}
          {leadAppts.length > 0 && (
            <div className="flex flex-col gap-2">
              {leadAppts.map(appt => (
                <AppointmentCard key={appt.id} appt={appt} />
              ))}
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
                    background:   i%2===0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                    borderBottom: i<detailRows.length-1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
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
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Custom Details</span>
              </div>
              <div className="rounded-2xl overflow-hidden"
                style={{ border:'1px solid rgba(255,255,255,0.07)' }}>
                {metaEntries.map(([key, value], i) => (
                  <div key={key}
                    className="flex items-start justify-between gap-4 px-4 py-2.5"
                    style={{
                      background:   i%2===0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                      borderBottom: i<metaEntries.length-1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
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
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Conversation</span>
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
