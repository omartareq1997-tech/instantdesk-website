'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Bot, Tag, Clock, Lightbulb, Star,
  MessageCircle, Globe, Calendar, ArrowRight,
  CheckCircle, AlertCircle, SlidersHorizontal,
} from 'lucide-react'

/* ─── Types (local mirror) ───────────────────────────────────── */

type ScoreLabel = 'hot' | 'warm' | 'cold'
type LeadStatus = 'new' | 'contacted' | 'demo_booked' | 'won' | 'lost'

interface Lead {
  id: string; name: string; company: string; source: string
  interest: string; assignedAgent: string
  score: number; scoreLabel: ScoreLabel; status: LeadStatus; date: string
  metadata?: Record<string, unknown>
}

/* ─── Metadata helpers ───────────────────────────────────────── */

function formatMetaKey(key: string): string {
  return key
    .replace(/_/g, ' ')                         // snake_case → words
    .replace(/([a-z])([A-Z])/g, '$1 $2')        // camelCase → words
    .replace(/\b\w/g, c => c.toUpperCase())     // Title Case
}

function formatMetaValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean')        return v ? 'Yes' : 'No'
  if (typeof v === 'string')         return v
  if (typeof v === 'number')         return v.toLocaleString()
  if (Array.isArray(v))              return v.join(', ')
  return JSON.stringify(v)
}

interface Message { from: 'user' | 'ai'; text: string; time: string; speed?: string }

/* ─── Mock per-lead data ─────────────────────────────────────── */

const CONVOS: Record<string, Message[]> = {
  '1': [
    { from:'user', text:"Hi, I'm looking for an AI receptionist for our dental practice.",                          time:'09:10' },
    { from:'ai',   text:"Hi Sarah! 👋 We work with several dental practices. What's your biggest challenge right now — missed calls, after-hours enquiries, or appointment bookings?", time:'09:10', speed:'3s' },
    { from:'user', text:"All three honestly. We miss loads of calls when we're with patients.",                    time:'09:12' },
    { from:'ai',   text:"That's exactly what we solve. InstantDesk handles calls 24/7, books into your calendar automatically, and follows up on every missed enquiry. Want to see a live demo this week?", time:'09:12', speed:'2s' },
    { from:'user', text:"Yes please! Thursday afternoon works.",                                                   time:'09:14' },
    { from:'ai',   text:"Perfect — I've confirmed Thursday at 3 PM. You'll receive a calendar invite shortly. Our specialist focuses on healthcare practices so it'll be very relevant.",                     time:'09:14', speed:'4s' },
  ],
  '2': [
    { from:'user', text:"Hey, I saw your WhatsApp bot demo on Instagram. How much does it cost?",                  time:'08:42' },
    { from:'ai',   text:"Hi James! 👋 Great question — plans start from £297/month. But pricing really depends on your volume and channels. What does your business do?",                                    time:'08:42', speed:'2s' },
    { from:'user', text:"We run a legal services firm. About 200 enquiries a month.",                             time:'08:45' },
    { from:'ai',   text:"At 200 enquiries/month our Professional plan would be a great fit. It covers WhatsApp, email automation, and lead qualification — all managed by your AI receptionist. Shall I set up a demo?", time:'08:45', speed:'3s' },
  ],
  '7': [
    { from:'user', text:"We need a full AI solution for our startup — chat, WhatsApp, email, the works.",         time:'09:30' },
    { from:'ai',   text:"Hi Chen! 🚀 You're describing our Full Suite — all 5 channels, AI lead scoring, CRM sync, and appointment booking. It's our most popular plan for growing startups.",                time:'09:30', speed:'2s' },
    { from:'user', text:"What's the onboarding like? We can't afford weeks of setup.",                            time:'09:32' },
    { from:'ai',   text:"We go live in 72 hours. Day 1: strategy call. Day 2: AI training. Day 3: deployment and testing. You're live before the weekend.",                                                 time:'09:32', speed:'3s' },
    { from:'user', text:"That's impressive. Let's book a demo.",                                                  time:'09:34' },
    { from:'ai',   text:"Brilliant! I've sent you a booking link. Your dedicated account manager will be on the call. Looking forward to it, Chen!",                                                       time:'09:34', speed:'2s' },
  ],
}

const FALLBACK_CONVO: Message[] = [
  { from:'user', text:"I'd like to learn more about InstantDesk for my business.",                               time:'10:00' },
  { from:'ai',   text:"Great to hear from you! 👋 Tell me a bit about your business and what you're hoping to automate.",                                                                                  time:'10:00', speed:'3s' },
  { from:'user', text:"We get a lot of enquiries through our website and WhatsApp but struggle to respond fast enough.",                                                                                   time:'10:02' },
  { from:'ai',   text:"That's a very common challenge. InstantDesk replies in seconds — 24/7, across every channel. Would you like to book a quick demo to see it in action?",                          time:'10:02', speed:'2s' },
]

const SUMMARIES: Record<string, { summary: string; nextAction: string; tags: string[]; lastActivity: string; bookingStatus: string }> = {
  '1': { summary:"Runs a 3-location dental practice. Actively seeking to reduce missed calls and automate appointment booking. High purchase intent — demo already booked for Thursday.", nextAction:"Prepare demo focused on healthcare booking + WhatsApp. Send pre-demo questionnaire by Wed.", tags:['Healthcare','Multi-location','High intent','Demo booked'], lastActivity:'Demo confirmed — Thu 22 May 15:00', bookingStatus:'Demo booked' },
  '2': { summary:"Founder of a legal services firm with ~200 monthly enquiries. Interested in WhatsApp automation and lead capture. Price-sensitive but high volume potential.", nextAction:"Send pricing breakdown for Professional plan. Follow up if no response by tomorrow.", tags:['Legal','WhatsApp','Price sensitive','High volume'], lastActivity:'AI SMS sent — 2 min ago', bookingStatus:'Not booked' },
  '3': { summary:"Growth-stage SaaS company. COO exploring a full suite implementation across all channels. Currently evaluating 2 competitors. Decision expected in 2 weeks.", nextAction:"Send competitive comparison doc + ROI calculator. Book a technical deep-dive call.", tags:['SaaS','Full Suite','Evaluation stage','Decision imminent'], lastActivity:'Email sequence day 2 sent', bookingStatus:'Pending' },
  '4': { summary:"Boutique management consultancy. AI receptionist now live for 3 weeks. Excellent onboarding experience. Potential upsell to Enterprise plan.", nextAction:"Check in on onboarding progress. Present Enterprise upgrade ROI case.", tags:['Consulting','Won','Onboarded','Upsell candidate'], lastActivity:'Onboarding completed 15 May', bookingStatus:'Onboarded ✓' },
  '5': { summary:"Hospitality group with 4 restaurants. Interested in handling reservation enquiries and WhatsApp orders via AI. Budget approved internally.", nextAction:"Follow up on last email. Suggest a live AI demo on their WhatsApp number.", tags:['Hospitality','WhatsApp','Budget approved'], lastActivity:'Contacted by email — 1 day ago', bookingStatus:'Awaiting callback' },
  '7': { summary:"Series A startup CTO looking for full omnichannel AI suite. Fast decision maker. Needs quick deployment (72hr was key selling point).", nextAction:"Prioritise — high score. Confirm demo logistics. Prep technical spec sheet.", tags:['Startup','Full Suite','Technical buyer','Demo booked'], lastActivity:'Demo booked — Fri 23 May', bookingStatus:'Demo booked' },
  '8': { summary:"Regional property group based in Dubai. Won after Enterprise demo. Full deployment across WhatsApp and website chat. Excellent reference client.", nextAction:"Request case study permission. Introduce to Customer Success Manager.", tags:['Real Estate','Enterprise','Won','Reference client'], lastActivity:'Onboarding session completed', bookingStatus:'Live ✓' },
}

const DEFAULT_SUMMARY = { summary:"Lead captured via automated channel. AI has initiated follow-up sequence. Agent review recommended to personalise outreach.", nextAction:"Review AI conversation. Send personalised follow-up and qualify budget/timeline.", tags:['Needs review','Auto-captured'], lastActivity:'AI SMS sent', bookingStatus:'Not booked' }

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

function initials(name: string) { return name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase() }

/* ─── Component ──────────────────────────────────────────────── */

export default function LeadPanel({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const convo    = CONVOS[lead.id] ?? FALLBACK_CONVO
  const meta     = SUMMARIES[lead.id] ?? DEFAULT_SUMMARY
  const statusCfg = STATUS_CFG[lead.status]
  const scoreCfg  = SCORE_CFG[lead.scoreLabel]

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Close on Escape
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
          background: 'rgba(7,7,25,0.97)',
          backdropFilter: 'blur(24px)',
          borderLeft: '1px solid rgba(139,92,246,0.18)',
          boxShadow: '-32px 0 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div className="flex items-start gap-4 px-6 py-5 sticky top-0 z-10"
          style={{ background: 'rgba(7,7,25,0.97)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black text-white flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#2563eb)' }}>
            {initials(lead.name)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-white leading-tight">{lead.name}</h2>
            <p className="text-xs text-white/40 mt-0.5">{lead.company}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/80 transition-all flex-shrink-0"
            style={{ background: 'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">

          {/* Quick stats row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label:'Score', value: <><span className="font-black" style={{ color:scoreCfg.color }}>{lead.score}</span><span className="text-[10px] ml-1.5 font-bold px-1.5 py-0.5 rounded-full" style={{ color:scoreCfg.color, background:`${scoreCfg.color}18` }}>{scoreCfg.label}</span></>, },
              { label:'Status', value: <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color:statusCfg.color, background:statusCfg.bg }}>{statusCfg.label}</span> },
              { label:'Source', value: <span className="text-xs text-white/55 font-medium">{lead.source}</span> },
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

          {/* Conversation history */}
          <div>
            <div className="flex items-center gap-1.5 mb-4">
              <MessageCircle className="w-3.5 h-3.5 text-white/25" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Conversation</span>
            </div>
            <div className="flex flex-col gap-3">
              {convo.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className="max-w-[85%]">
                    {msg.from === 'ai' && (
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <div className="w-4 h-4 rounded flex items-center justify-center" style={{ background:'rgba(139,92,246,0.25)' }}>
                          <Bot className="w-2.5 h-2.5 text-violet-400" />
                        </div>
                        <span className="text-[9px] font-bold text-violet-400/60 uppercase tracking-wider">InstantDesk AI</span>
                        {msg.speed && (
                          <span className="text-[9px] text-white/20">· replied in {msg.speed}</span>
                        )}
                      </div>
                    )}
                    <div className="rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed"
                      style={msg.from === 'ai' ? {
                        background: 'rgba(139,92,246,0.12)',
                        border: '1px solid rgba(139,92,246,0.2)',
                        color: 'rgba(255,255,255,0.75)',
                        borderTopLeftRadius: 4,
                      } : {
                        background: 'rgba(255,255,255,0.07)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.65)',
                        borderTopRightRadius: 4,
                      }}>
                      {msg.text}
                    </div>
                    <div className={`text-[9px] text-white/20 mt-1 ${msg.from === 'user' ? 'text-right' : 'text-left'}`}>
                      {msg.time}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
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

          {/* Custom Details — rendered from leads.metadata JSONB */}
          {lead.metadata && Object.keys(lead.metadata).length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-3 h-3 text-white/25" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Custom Details</span>
              </div>
              <div className="rounded-2xl overflow-hidden"
                style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                {Object.entries(lead.metadata).map(([key, value], i, arr) => (
                  <div key={key}
                    className="flex items-start justify-between gap-4 px-4 py-2.5"
                    style={{
                      background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
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
