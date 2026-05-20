'use client'

import { useRef, useEffect, useState } from 'react'
import { motion, useInView } from 'framer-motion'
import {
  LayoutDashboard, MessageSquare, Users, CalendarCheck,
  Activity, Settings, Zap, TrendingUp, Bot, Bell,
  CheckCircle, Search, Shield,
  ArrowUpRight, ArrowDownRight, Inbox,
} from 'lucide-react'
import {
  WhatsAppIcon, InstagramIcon, MessengerIcon, TelegramIcon, GlobeIcon,
} from './ChannelIcons'

/* ─── Static data ─────────────────────────────────────────── */

const BAR_DATA = [
  { day: 'Mon', leads: 142, pct: 0.64 },
  { day: 'Tue', leads: 168, pct: 0.75 },
  { day: 'Wed', leads: 195, pct: 0.87 },
  { day: 'Thu', leads: 178, pct: 0.80 },
  { day: 'Fri', leads: 223, pct: 1.00, today: true },
  { day: 'Sat', leads: 201, pct: 0.90 },
  { day: 'Sun', leads: 177, pct: 0.79 },
]

const CHANNEL_DATA = [
  { name: 'Website Chat', pct: 34, Icon: GlobeIcon,    color: '#60a5fa' },
  { name: 'WhatsApp',    pct: 28, Icon: WhatsAppIcon,  color: '#25D366' },
  { name: 'Instagram',   pct: 19, Icon: InstagramIcon, color: '#E1306C' },
  { name: 'Messenger',   pct: 12, Icon: MessengerIcon, color: '#0084FF' },
  { name: 'Telegram',    pct:  7, Icon: TelegramIcon,  color: '#229ED9' },
]

const CONVOS = [
  { name: 'Michał Kowalski', initials: 'MK', channelIcon: WhatsAppIcon, channelColor: '#25D366', channelBg: 'rgba(37,211,102,0.12)', msg: 'Can I reschedule for tomorrow at 10?', time: '2s ago', responseTime: '1.8s' },
  { name: 'Anna Wiśniewska', initials: 'AW', channelIcon: InstagramIcon, channelColor: '#E1306C', channelBg: 'rgba(225,48,108,0.12)', msg: 'What are your opening hours today?', time: '1m ago', responseTime: '2.1s' },
  { name: 'Piotr Nowak',     initials: 'PN', channelIcon: WhatsAppIcon,  channelColor: '#25D366', channelBg: 'rgba(37,211,102,0.12)', msg: 'Do you have parking on site?', time: '8m ago', responseTime: '1.5s' },
  { name: 'Katarzyna Bąk',  initials: 'KB', channelIcon: MessengerIcon, channelColor: '#0084FF', channelBg: 'rgba(0,132,255,0.12)',  msg: 'I need to cancel my booking please', time: '24m ago', responseTime: '2.4s' },
]

const AI_METRICS = [
  { label: 'Accuracy',     value: '98.7%', sub: 'response quality',    color: '#a78bfa', bg: 'rgba(167,139,250,0.08)' },
  { label: 'Avg Response', value: '2.3s',  sub: 'across all channels', color: '#60a5fa', bg: 'rgba(96,165,250,0.08)'  },
  { label: 'CSAT Score',   value: '4.9★',  sub: 'client satisfaction', color: '#fbbf24', bg: 'rgba(251,191,36,0.08)' },
  { label: 'Handoff Rate', value: '1.3%',  sub: 'to human agents',     color: '#34d399', bg: 'rgba(52,211,153,0.08)' },
]

const SPARKLINE_PTS = '0,28 20,20 40,32 60,16 80,8 100,22 120,14'

const KPI = [
  { label: 'Leads Captured',  value: 1284, suffix: '',   trend: '+23%', up: true,  icon: Users,         color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.15)' },
  { label: 'Appointments',     value: 347,  suffix: '',   trend: '+18%', up: true,  icon: CalendarCheck, color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.15)'  },
  { label: 'Avg Response',     value: null, static: '2.3s',trend:'+0.4s faster',up:true,icon: Zap,      color: '#34d399', bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.15)'  },
  { label: 'Conversations',    value: 8491, suffix: '',   trend: '+31%', up: true,  icon: MessageSquare, color: '#fb923c', bg: 'rgba(251,146,60,0.08)',  border: 'rgba(251,146,60,0.15)'  },
]

const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',     active: true,  badge: '' },
  { icon: Inbox,           label: 'Conversations', active: false, badge: '12' },
  { icon: Users,           label: 'Leads',         active: false, badge: '3' },
  { icon: CalendarCheck,   label: 'Appointments',  active: false, badge: '' },
  { icon: Activity,        label: 'Analytics',     active: false, badge: '' },
  { icon: Settings,        label: 'Settings',      active: false, badge: '' },
]

/* ─── Count-up hook ───────────────────────────────────────── */

function CountUp({ to, duration = 1100 }: { to: number; duration?: number }) {
  const ref   = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const [val, setVal] = useState(0)
  const rafId = useRef(0)

  useEffect(() => {
    if (!inView) return
    const t0 = performance.now()
    const tick = (now: number) => {
      const p    = Math.min((now - t0) / duration, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(ease * to))
      if (p < 1) rafId.current = requestAnimationFrame(tick)
    }
    rafId.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId.current)
  }, [inView, to, duration])

  return <span ref={ref}>{val.toLocaleString()}</span>
}

/* ─── Bar chart ───────────────────────────────────────────── */

function LeadsBarChart() {
  const ref    = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })

  const W = 300, H = 90
  const BOTTOM = 70, slot = W / 7, bw = 26

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="barG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="barGToday" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#60a5fa" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {[0.25, 0.5, 0.75, 1].map((f, i) => (
        <line
          key={i}
          x1={0} y1={BOTTOM - f * BOTTOM}
          x2={W} y2={BOTTOM - f * BOTTOM}
          stroke="rgba(255,255,255,0.05)" strokeWidth="1"
        />
      ))}

      {/* Bars */}
      {BAR_DATA.map((d, i) => {
        const bh = d.pct * BOTTOM
        const bx = i * slot + (slot - bw) / 2
        const by = BOTTOM - bh
        return (
          <g key={i}>
            <motion.rect
              x={bx} rx={4} ry={4}
              initial={{ height: 0, y: BOTTOM }}
              animate={inView ? { height: bh, y: by } : {}}
              transition={{ delay: 0.1 + i * 0.07, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              width={bw}
              fill={d.today ? 'url(#barGToday)' : 'url(#barG)'}
              opacity={d.today ? 1 : 0.65}
            />
            {d.today && (
              <motion.rect
                x={bx} y={by} width={bw} height={bh} rx={4} ry={4}
                fill="rgba(167,139,250,0.12)"
                initial={{ opacity: 0 }} animate={inView ? { opacity: [0, 0.6, 0] } : {}}
                transition={{ delay: 1.2, duration: 1.6, repeat: Infinity }}
              />
            )}
            <text
              x={bx + bw / 2} y={BOTTOM + 10}
              textAnchor="middle" fontSize="7"
              fill={d.today ? '#a78bfa' : 'rgba(255,255,255,0.3)'}
              fontWeight={d.today ? '700' : '400'}
            >
              {d.day}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/* ─── Sparkline ───────────────────────────────────────────── */

function Sparkline() {
  const ref    = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { once: true })
  return (
    <svg ref={ref} viewBox="0 0 120 40" className="w-full h-8" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={`M ${SPARKLINE_PTS.split(' ').join(' L ')} L 120,40 L 0,40 Z`}
        fill="url(#sparkFill)"
        initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
        transition={{ delay: 0.6, duration: 0.5 }}
      />
      <motion.polyline
        points={SPARKLINE_PTS}
        fill="none" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={inView ? { pathLength: 1 } : {}}
        transition={{ delay: 0.4, duration: 1.2, ease: 'easeInOut' }}
      />
    </svg>
  )
}

/* ─── Main component ──────────────────────────────────────── */

export default function DashboardPreview() {
  return (
    <section className="relative py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/30 to-transparent" />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(139,92,246,1) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-violet-400 mb-5">
            <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
            Real-time analytics
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-5 leading-tight">
            Every lead. Every channel.{' '}
            <span className="text-gradient">One dashboard.</span>
          </h2>
          <p className="text-lg text-white/40 max-w-xl mx-auto">
            Watch your AI work in real time — leads captured, appointments booked, conversations handled, and performance tracked across all 5 channels.
          </p>
        </motion.div>

        {/* Browser mockup wrapper */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          {/* Screen glow */}
          <div
            className="absolute -inset-6 -z-10 rounded-3xl blur-3xl opacity-25"
            style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.4), rgba(37,99,235,0.3))' }}
          />

          {/* Browser frame */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(8,8,22,0.98)',
              border: '1px solid rgba(139,92,246,0.2)',
              boxShadow: [
                '0 48px 120px rgba(0,0,0,0.8)',
                '0 0 0 1px rgba(255,255,255,0.04)',
                'inset 0 1px 0 rgba(255,255,255,0.06)',
              ].join(','),
            }}
          >
            {/* Browser chrome */}
            <div
              className="flex items-center gap-3 px-5 py-3.5 border-b"
              style={{
                background: 'rgba(0,0,0,0.4)',
                borderColor: 'rgba(255,255,255,0.05)',
              }}
            >
              <div className="flex gap-1.5 flex-shrink-0">
                <span className="w-3 h-3 rounded-full" style={{ background: 'rgba(255,95,87,0.75)' }} />
                <span className="w-3 h-3 rounded-full" style={{ background: 'rgba(255,188,46,0.75)' }} />
                <span className="w-3 h-3 rounded-full" style={{ background: 'rgba(40,200,64,0.75)' }} />
              </div>
              <div
                className="flex items-center gap-2 flex-1 max-w-xs mx-auto px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <Shield className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                <span className="text-[11px] text-white/30 font-medium truncate">app.instantdesk.pl/dashboard</span>
              </div>
              <div className="flex items-center gap-1.5 ml-auto text-white/15">
                {[ArrowUpRight, Search].map((Icon, i) => (
                  <Icon key={i} className="w-3.5 h-3.5" />
                ))}
              </div>
            </div>

            {/* Dashboard inner — scrollable on small screens */}
            <div className="overflow-x-auto">
              <div style={{ minWidth: '860px' }}>
                <div className="flex" style={{ minHeight: '540px' }}>

                  {/* ── Sidebar ── */}
                  <div
                    className="flex flex-col flex-shrink-0 py-5"
                    style={{
                      width: '192px',
                      background: 'rgba(0,0,0,0.3)',
                      borderRight: '1px solid rgba(255,255,255,0.04)',
                    }}
                  >
                    {/* Logo */}
                    <div className="flex items-center gap-2 px-5 mb-7">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg,#7c3aed,#2563eb)' }}
                      >
                        <Zap className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-sm font-bold text-white">InstantDesk</span>
                    </div>

                    {/* Nav */}
                    <nav className="flex flex-col gap-0.5 px-3 flex-1">
                      {NAV.map(({ icon: Icon, label, active, badge }) => (
                        <div
                          key={label}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition-all"
                          style={active ? {
                            background: 'rgba(139,92,246,0.12)',
                            border: '1px solid rgba(139,92,246,0.2)',
                          } : {
                            border: '1px solid transparent',
                          }}
                        >
                          <Icon
                            className="w-4 h-4 flex-shrink-0"
                            style={{ color: active ? '#a78bfa' : 'rgba(255,255,255,0.3)' }}
                          />
                          <span
                            className="text-xs font-medium flex-1"
                            style={{ color: active ? '#e9d5ff' : 'rgba(255,255,255,0.35)' }}
                          >
                            {label}
                          </span>
                          {badge && (
                            <span
                              className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                              style={{ background: 'rgba(167,139,250,0.2)', color: '#a78bfa' }}
                            >
                              {badge}
                            </span>
                          )}
                        </div>
                      ))}
                    </nav>

                    {/* Bottom AI status */}
                    <div
                      className="mx-3 p-3 rounded-xl"
                      style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.12)' }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <motion.span
                          className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0"
                          animate={{ opacity: [1, 0.3, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        />
                        <span className="text-[10px] font-bold text-emerald-400">AI ACTIVE</span>
                      </div>
                      <p className="text-[9px] text-white/30 leading-tight">5 channels live · 47 automations running</p>
                    </div>
                  </div>

                  {/* ── Main area ── */}
                  <div className="flex-1 flex flex-col min-w-0">

                    {/* Top bar */}
                    <div
                      className="flex items-center justify-between px-6 py-3.5 flex-shrink-0"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.15)' }}
                    >
                      <div>
                        <p className="text-sm font-bold text-white/80">Good morning, Omar 👋</p>
                        <p className="text-[10px] text-white/25">Tuesday, 20 May 2025 · Week 21</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-white/25"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                        >
                          <Search className="w-3 h-3" />
                          <span>Search…</span>
                        </div>
                        <div className="relative">
                          <Bell className="w-4 h-4 text-white/30" />
                          <span
                            className="absolute -top-1 -right-1 w-3 h-3 rounded-full text-[7px] font-black text-white flex items-center justify-center"
                            style={{ background: '#ef4444' }}
                          >3</span>
                        </div>
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black text-white"
                          style={{ background: 'linear-gradient(135deg,#7c3aed,#2563eb)' }}
                        >
                          OT
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-5 flex flex-col gap-4 overflow-hidden">

                      {/* KPI row */}
                      <div className="grid grid-cols-4 gap-3">
                        {KPI.map((kpi, i) => {
                          const Icon = kpi.icon
                          return (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, y: 16 }}
                              whileInView={{ opacity: 1, y: 0 }}
                              viewport={{ once: true }}
                              transition={{ delay: 0.1 + i * 0.07, duration: 0.45 }}
                              className="rounded-xl p-3.5"
                              style={{ background: kpi.bg, border: `1px solid ${kpi.border}` }}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] text-white/40 font-medium">{kpi.label}</span>
                                <Icon className="w-3.5 h-3.5" style={{ color: kpi.color }} />
                              </div>
                              <div className="text-xl font-black text-white mb-1">
                                {kpi.value !== null
                                  ? <CountUp to={kpi.value} />
                                  : kpi.static}
                              </div>
                              <div
                                className="flex items-center gap-1 text-[10px] font-semibold"
                                style={{ color: kpi.up ? '#34d399' : '#f87171' }}
                              >
                                {kpi.up
                                  ? <ArrowUpRight className="w-3 h-3" />
                                  : <ArrowDownRight className="w-3 h-3" />}
                                {kpi.trend}
                              </div>
                            </motion.div>
                          )
                        })}
                      </div>

                      {/* Middle row: chart + channels */}
                      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 220px' }}>

                        {/* Lead activity chart */}
                        <motion.div
                          initial={{ opacity: 0, y: 16 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: 0.3, duration: 0.5 }}
                          className="rounded-xl p-4"
                          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className="text-xs font-bold text-white/70">Lead Activity</p>
                              <p className="text-[10px] text-white/25">Last 7 days · <span style={{ color: '#a78bfa' }}>1,284 total</span></p>
                            </div>
                            <div
                              className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full"
                              style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }}
                            >
                              <TrendingUp className="w-3 h-3" />
                              +23% WoW
                            </div>
                          </div>
                          <LeadsBarChart />
                        </motion.div>

                        {/* Channel distribution */}
                        <motion.div
                          initial={{ opacity: 0, y: 16 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: 0.38, duration: 0.5 }}
                          className="rounded-xl p-4"
                          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
                        >
                          <p className="text-xs font-bold text-white/70 mb-3">Channel Split</p>
                          <div className="flex flex-col gap-2.5">
                            {CHANNEL_DATA.map(({ name, pct, Icon, color }, i) => (
                              <div key={i}>
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-1.5">
                                    <Icon className="w-3 h-3" style={{ color }} />
                                    <span className="text-[10px] text-white/50">{name}</span>
                                  </div>
                                  <span className="text-[10px] font-bold" style={{ color }}>{pct}%</span>
                                </div>
                                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                                  <motion.div
                                    className="h-full rounded-full"
                                    style={{ background: color }}
                                    initial={{ width: 0 }}
                                    whileInView={{ width: `${pct}%` }}
                                    viewport={{ once: true }}
                                    transition={{ delay: 0.4 + i * 0.08, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      </div>

                      {/* Bottom row: conversations + AI metrics */}
                      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 200px' }}>

                        {/* Conversations */}
                        <motion.div
                          initial={{ opacity: 0, y: 16 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: 0.45, duration: 0.5 }}
                          className="rounded-xl overflow-hidden"
                          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
                        >
                          <div
                            className="flex items-center justify-between px-4 py-3 border-b"
                            style={{ borderColor: 'rgba(255,255,255,0.05)' }}
                          >
                            <p className="text-xs font-bold text-white/70">Recent Conversations</p>
                            <span
                              className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
                              style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.2)' }}
                            >
                              All AI-handled ✓
                            </span>
                          </div>
                          <div className="divide-y divide-white/[0.04]">
                            {CONVOS.map((c, i) => {
                              const CIcon = c.channelIcon
                              return (
                                <motion.div
                                  key={i}
                                  initial={{ opacity: 0, x: -10 }}
                                  whileInView={{ opacity: 1, x: 0 }}
                                  viewport={{ once: true }}
                                  transition={{ delay: 0.5 + i * 0.07, duration: 0.35 }}
                                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
                                  style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}
                                >
                                  {/* Avatar + channel */}
                                  <div className="relative flex-shrink-0">
                                    <div
                                      className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white"
                                      style={{ background: `${c.channelColor}30`, border: `1px solid ${c.channelColor}40` }}
                                    >
                                      {c.initials}
                                    </div>
                                    <div
                                      className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                                      style={{ background: c.channelBg, border: `1px solid ${c.channelColor}50` }}
                                    >
                                      <CIcon className="w-2.5 h-2.5" style={{ color: c.channelColor }} />
                                    </div>
                                  </div>

                                  {/* Text */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] font-semibold text-white/75 truncate">{c.name}</span>
                                    </div>
                                    <p className="text-[10px] text-white/30 truncate">{c.msg}</p>
                                  </div>

                                  {/* Meta */}
                                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                    <span className="text-[9px] text-white/20">{c.time}</span>
                                    <span
                                      className="flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                                      style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399' }}
                                    >
                                      <CheckCircle className="w-2.5 h-2.5" />
                                      {c.responseTime}
                                    </span>
                                  </div>
                                </motion.div>
                              )
                            })}
                          </div>
                        </motion.div>

                        {/* AI performance */}
                        <motion.div
                          initial={{ opacity: 0, y: 16 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: 0.5, duration: 0.5 }}
                          className="rounded-xl p-4 flex flex-col gap-3"
                          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <div
                              className="w-6 h-6 rounded-lg flex items-center justify-center"
                              style={{ background: 'linear-gradient(135deg,#7c3aed,#2563eb)' }}
                            >
                              <Bot className="w-3 h-3 text-white" />
                            </div>
                            <p className="text-xs font-bold text-white/70">AI Performance</p>
                          </div>

                          {AI_METRICS.map(({ label, value, sub, color, bg }, i) => (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, scale: 0.95 }}
                              whileInView={{ opacity: 1, scale: 1 }}
                              viewport={{ once: true }}
                              transition={{ delay: 0.55 + i * 0.07, duration: 0.35 }}
                              className="rounded-lg p-2.5"
                              style={{ background: bg, border: `1px solid ${color}20` }}
                            >
                              <div className="text-sm font-black" style={{ color }}>{value}</div>
                              <div className="text-[9px] text-white/35 font-medium">{label}</div>
                              <div className="text-[8px] text-white/20 mt-0.5">{sub}</div>
                            </motion.div>
                          ))}

                          {/* Response time sparkline */}
                          <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[9px] text-white/25">Response trend (7d)</span>
                              <span className="text-[9px] font-bold" style={{ color: '#34d399' }}>↓ improving</span>
                            </div>
                            <Sparkline />
                          </div>
                        </motion.div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Bottom feature pills */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="flex flex-wrap justify-center gap-3 mt-10"
        >
          {[
            'Real-time lead tracking',
            'Channel-by-channel analytics',
            'AI response monitoring',
            'Appointment pipeline view',
            'CSAT & sentiment scoring',
            'CRM sync status',
            'Multi-language conversation log',
            'Exportable reports',
          ].map((feat, i) => (
            <span
              key={i}
              className="flex items-center gap-2 text-xs text-white/40 px-3.5 py-1.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <CheckCircle className="w-3 h-3 text-violet-500" />
              {feat}
            </span>
          ))}
        </motion.div>

      </div>
    </section>
  )
}
