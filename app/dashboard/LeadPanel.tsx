'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Bot, Tag, Clock, Lightbulb,
  MessageCircle, Globe, Calendar, ArrowRight, SlidersHorizontal,
} from 'lucide-react'

/* ─── Types ──────────────────────────────────────────────────── */

type ScoreLabel = 'hot' | 'warm' | 'cold'
type LeadStatus = 'new' | 'contacted' | 'demo_booked' | 'won' | 'lost'
type FromRole   = 'user' | 'ai' | 'agent'

interface Lead {
  id: string; name: string; company: string; source: string
  interest: string; assignedAgent: string
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

/* ─── Conversation helpers ───────────────────────────────────── */

function fmtTime(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

function fmtSpeed(ms: number | null): string | null {
  if (!ms || ms <= 0) return null
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

/**
 * Parse a raw conversation transcript stored in metadata.full_conversation.
 * Supports common chatbot export formats:
 *   "User: Hello\nBot: Hi!\nUser: ..."
 *   "Customer: ...\nAI: ...\n"
 *   "Human: ...\nAssistant: ...\n"
 */
function parseRawTranscript(text: string): ChatMessage[] {
  const userRx = /^(?:user|customer|human|lead|client)\s*:/i
  const aiRx   = /^(?:bot|ai|assistant|agent|system|instantdesk)\s*:/i

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)

  // Check if any lines have role prefixes
  const hasPrefixes = lines.some(l => userRx.test(l) || aiRx.test(l))

  if (hasPrefixes) {
    return lines.flatMap((line, i): ChatMessage[] => {
      const userMatch = line.match(/^[^:]+:\s*(.+)/i)
      if (userRx.test(line) && userMatch) {
        return [{ id: `p${i}`, from: 'user', content: userMatch[1], response_time_ms: null, created_at: '' }]
      }
      if (aiRx.test(line) && userMatch) {
        return [{ id: `p${i}`, from: 'ai', content: userMatch[1], response_time_ms: null, created_at: '' }]
      }
      return []
    })
  }

  // No prefixes — treat alternating lines as user / ai
  return lines.map((line, i) => ({
    id: `p${i}`,
    from: (i % 2 === 0 ? 'user' : 'ai') as FromRole,
    content: line,
    response_time_ms: null,
    created_at: '',
  }))
}

/* ─── Static summaries (AI summary + tags remain mock until a
       real AI summary pipeline is built) ─────────────────────── */

const SUMMARIES: Record<string, {
  summary: string; nextAction: string; tags: string[]
  lastActivity: string; bookingStatus: string
}> = {
  '1': { summary:"Runs a 3-location dental practice. Actively seeking to reduce missed calls and automate appointment booking. High purchase intent — demo already booked for Thursday.", nextAction:"Prepare demo focused on healthcare booking + WhatsApp. Send pre-demo questionnaire by Wed.", tags:['Healthcare','Multi-location','High intent','Demo booked'], lastActivity:'Demo confirmed — Thu 22 May 15:00', bookingStatus:'Demo booked' },
  '2': { summary:"Founder of a legal services firm with ~200 monthly enquiries. Interested in WhatsApp automation and lead capture. Price-sensitive but high volume potential.", nextAction:"Send pricing breakdown for Professional plan. Follow up if no response by tomorrow.", tags:['Legal','WhatsApp','Price sensitive','High volume'], lastActivity:'AI SMS sent — 2 min ago', bookingStatus:'Not booked' },
  '3': { summary:"Growth-stage SaaS company. COO exploring a full suite implementation across all channels. Currently evaluating 2 competitors. Decision expected in 2 weeks.", nextAction:"Send competitive comparison doc + ROI calculator. Book a technical deep-dive call.", tags:['SaaS','Full Suite','Evaluation stage','Decision imminent'], lastActivity:'Email sequence day 2 sent', bookingStatus:'Pending' },
  '4': { summary:"Boutique management consultancy. AI receptionist now live for 3 weeks. Excellent onboarding experience. Potential upsell to Enterprise plan.", nextAction:"Check in on onboarding progress. Present Enterprise upgrade ROI case.", tags:['Consulting','Won','Onboarded','Upsell candidate'], lastActivity:'Onboarding completed 15 May', bookingStatus:'Onboarded ✓' },
  '5': { summary:"Hospitality group with 4 restaurants. Interested in handling reservation enquiries and WhatsApp orders via AI. Budget approved internally.", nextAction:"Follow up on last email. Suggest a live AI demo on their WhatsApp number.", tags:['Hospitality','WhatsApp','Budget approved'], lastActivity:'Contacted by email — 1 day ago', bookingStatus:'Awaiting callback' },
  '7': { summary:"Series A startup CTO looking for full omnichannel AI suite. Fast decision maker. Needs quick deployment (72hr was key selling point).", nextAction:"Prioritise — high score. Confirm demo logistics. Prep technical spec sheet.", tags:['Startup','Full Suite','Technical buyer','Demo booked'], lastActivity:'Demo booked — Fri 23 May', bookingStatus:'Demo booked' },
  '8': { summary:"Regional property group based in Dubai. Won after Enterprise demo. Full deployment across WhatsApp and website chat. Excellent reference client.", nextAction:"Request case study permission. Introduce to Customer Success Manager.", tags:['Real Estate','Enterprise','Won','Reference client'], lastActivity:'Onboarding session completed', bookingStatus:'Live ✓' },
}

const DEFAULT_SUMMARY = {
  summary:       'Lead captured via automated channel. AI has initiated follow-up sequence. Agent review recommended to personalise outreach.',
  nextAction:    'Review AI conversation. Send personalised follow-up and qualify budget/timeline.',
  tags:          ['Needs review', 'Auto-captured'],
  lastActivity:  'AI SMS sent',
  bookingStatus: 'Not booked',
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
  whatsapp:  'WhatsApp',
  website:   'Website Chat',
  email:     'Email',
  instagram: 'Instagram DM',
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

/* ─── Conversation skeleton ──────────────────────────────────── */

function ConvSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[90, 70, 80, 60].map((w, i) => (
        <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
          <div className="rounded-2xl animate-pulse"
            style={{
              width: `${w}%`, height: 36,
              background: i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(139,92,246,0.08)',
            }} />
        </div>
      ))}
    </div>
  )
}

/* ─── Component ──────────────────────────────────────────────── */

export default function LeadPanel({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const meta       = SUMMARIES[lead.id] ?? DEFAULT_SUMMARY
  const statusCfg  = STATUS_CFG[lead.status]
  const scoreCfg   = SCORE_CFG[lead.scoreLabel]

  /* Conversation state ─────────────────────────────────────── */
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

  // If DB has no messages, try parsing metadata.full_conversation
  const displayMessages: ChatMessage[] =
    messages.length > 0
      ? messages
      : typeof lead.metadata?.full_conversation === 'string' && lead.metadata.full_conversation.trim()
        ? parseRawTranscript(lead.metadata.full_conversation)
        : []

  const fromMetadata = messages.length === 0 && displayMessages.length > 0

  /* Scroll + keyboard ──────────────────────────────────────── */
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <motion.aside
        key="panel"
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
            {initials(lead.name)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-white leading-tight">{lead.name}</h2>
            <p className="text-xs text-white/40 mt-0.5">{lead.company}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/80 transition-all flex-shrink-0"
            style={{ background:'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: 'Score',
                value: (
                  <>
                    <span className="font-black" style={{ color:scoreCfg.color }}>{lead.score}</span>
                    <span className="text-[10px] ml-1.5 font-bold px-1.5 py-0.5 rounded-full"
                      style={{ color:scoreCfg.color, background:`${scoreCfg.color}18` }}>
                      {scoreCfg.label}
                    </span>
                  </>
                ),
              },
              {
                label: 'Status',
                value: (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                    style={{ color:statusCfg.color, background:statusCfg.bg }}>
                    {statusCfg.label}
                  </span>
                ),
              },
              {
                label: 'Source',
                value: <span className="text-xs text-white/55 font-medium">{lead.source}</span>,
              },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-3 flex flex-col gap-1.5"
                style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
                <div className="text-[9px] font-bold uppercase tracking-widest text-white/25">{s.label}</div>
                <div className="flex items-center">{s.value}</div>
              </div>
            ))}
          </div>

          {/* Booking status + last activity */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl"
              style={{ background:'rgba(52,211,153,0.06)', border:'1px solid rgba(52,211,153,0.15)' }}>
              <Calendar className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span className="text-xs font-semibold text-emerald-300/80">{meta.bookingStatus}</span>
            </div>
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl"
              style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)' }}>
              <Clock className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
              <span className="text-xs text-white/40">{meta.lastActivity}</span>
            </div>
          </div>

          {/* Tags */}
          <div>
            <div className="flex items-center gap-1.5 mb-2.5">
              <Tag className="w-3 h-3 text-white/25" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Tags</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {meta.tags.map(tag => (
                <span key={tag} className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                  style={{ background:'rgba(139,92,246,0.12)', color:'#c4b5fd', border:'1px solid rgba(139,92,246,0.2)' }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* AI Summary */}
          <div className="rounded-2xl p-4 flex flex-col gap-3"
            style={{ background:'rgba(139,92,246,0.07)', border:'1px solid rgba(139,92,246,0.18)' }}>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background:'rgba(139,92,246,0.2)' }}>
                <Bot className="w-3.5 h-3.5 text-violet-400" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-violet-400/70">AI Summary</span>
            </div>
            <p className="text-xs text-white/55 leading-relaxed">{meta.summary}</p>
          </div>

          {/* Recommended next action */}
          <div className="rounded-2xl p-4 flex flex-col gap-3"
            style={{ background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.18)' }}>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background:'rgba(251,191,36,0.15)' }}>
                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400/70">Recommended Action</span>
            </div>
            <p className="text-xs text-white/55 leading-relaxed">{meta.nextAction}</p>
            <button className="flex items-center gap-1.5 text-xs font-semibold text-amber-400/80 hover:text-amber-300 transition-colors self-start">
              Take action <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* Conversation ─────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-white/25" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">
                  Conversation
                </span>
              </div>
              {/* Channel badge — shown once data loads */}
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
                <p className="text-xs text-white/15">Messages will appear here once the lead chats</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {displayMessages.map((msg, i) => (
                  <motion.div
                    key={msg.id}
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
                          background:        'rgba(139,92,246,0.12)',
                          border:            '1px solid rgba(139,92,246,0.2)',
                          color:             'rgba(255,255,255,0.75)',
                          borderTopLeftRadius: 4,
                        } : {
                          background:         'rgba(255,255,255,0.07)',
                          border:             '1px solid rgba(255,255,255,0.1)',
                          color:              'rgba(255,255,255,0.65)',
                          borderTopRightRadius: 4,
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
            )}
          </div>

          {/* Interest */}
          <div className="rounded-xl px-4 py-3 flex items-center gap-3"
            style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)' }}>
            <Globe className="w-4 h-4 text-white/25 flex-shrink-0" />
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-white/20 mb-0.5">Interest</div>
              <div className="text-xs font-semibold text-white/60">{lead.interest}</div>
            </div>
          </div>

          {/* Custom Details — from leads.metadata JSONB */}
          {lead.metadata && Object.keys(lead.metadata).filter(k => k !== 'full_conversation').length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-3 h-3 text-white/25" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Custom Details</span>
              </div>
              <div className="rounded-2xl overflow-hidden"
                style={{ border:'1px solid rgba(255,255,255,0.07)' }}>
                {Object.entries(lead.metadata)
                  .filter(([k]) => k !== 'full_conversation')
                  .map(([key, value], i, arr) => (
                    <div key={key}
                      className="flex items-start justify-between gap-4 px-4 py-2.5"
                      style={{
                        background:   i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                        borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
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

        </div>
      </motion.aside>
    </AnimatePresence>
  )
}
