'use client'

import { useRef, useEffect } from 'react'
import { motion, useInView, animate } from 'framer-motion'
import {
  TrendingUp, TrendingDown, MessageCircle, Zap, Users, BarChart2,
  Bot, UserCheck, Target, Activity,
} from 'lucide-react'
import type { AnalyticsDay, AnalyticsSummary, LiveAnalytics } from './types'

/* ── Loading skeleton ────────────────────────────────────────────── */

function Pulse({ className }: { className?: string }) {
  return <div className={`rounded-xl bg-white/[0.05] animate-pulse ${className ?? ''}`} />
}

export function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[0,1,2,3,4].map(i => (
          <div key={i} className="rounded-2xl p-5"
            style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}>
            <Pulse className="w-8 h-8 mb-3" />
            <Pulse className="h-7 w-24 mb-2" />
            <Pulse className="h-2.5 w-28" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[0,1,2,3].map(i => (
          <div key={i} className="rounded-2xl p-5"
            style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}>
            <Pulse className="h-3 w-32 mb-2" />
            <Pulse className="h-6 w-20 mb-4" />
            <Pulse className="h-[72px] w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Chart helpers ───────────────────────────────────────────────── */

function normalize(data: number[], height: number, pad = 6) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  return data.map(v => pad + ((max - v) / range) * (height - pad * 2))
}

function smoothPath(xs: number[], ys: number[]) {
  let d = `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`
  for (let i = 1; i < xs.length; i++) {
    const cpX = ((xs[i - 1] + xs[i]) / 2).toFixed(1)
    d += ` C ${cpX} ${ys[i-1].toFixed(1)}, ${cpX} ${ys[i].toFixed(1)}, ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`
  }
  return d
}

function areaPath(xs: number[], ys: number[], height: number) {
  return smoothPath(xs, ys) + ` L ${xs[xs.length-1].toFixed(1)} ${height} L ${xs[0].toFixed(1)} ${height} Z`
}

/* ── Empty states ────────────────────────────────────────────────── */

function EmptyChart({ height }: { height: number }) {
  return (
    <div className="flex items-center justify-center rounded-xl"
      style={{ height, background:'rgba(255,255,255,0.015)', border:'1px dashed rgba(255,255,255,0.07)' }}>
      <span className="text-[10px] text-white/20 font-semibold uppercase tracking-widest">No data yet</span>
    </div>
  )
}

function EmptyBreakdown() {
  return (
    <div className="flex items-center justify-center py-8">
      <span className="text-[10px] text-white/20 font-semibold uppercase tracking-widest">No data yet</span>
    </div>
  )
}

/* ── Trend calculator ────────────────────────────────────────────── */

function calcTrend(data: number[]): { trend: 'up' | 'down'; label: string } {
  if (data.length < 4) return { trend: 'up', label: '—' }
  const half   = Math.floor(data.length / 2)
  const recent = data.slice(-half).reduce((a, b) => a + b, 0)
  const prior  = data.slice(-half * 2, -half).reduce((a, b) => a + b, 0)
  if (!prior) return { trend: 'up', label: '—' }
  const pct = Math.round(((recent - prior) / prior) * 100)
  return { trend: pct >= 0 ? 'up' : 'down', label: `${pct >= 0 ? '+' : ''}${pct}% vs prior` }
}

/* ── Animated counter ────────────────────────────────────────────── */

function Counter({ to, suffix = '', prefix = '' }: { to: number; suffix?: string; prefix?: string }) {
  const ref    = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  useEffect(() => {
    if (!inView || !ref.current) return
    const controls = animate(0, to, {
      duration: 1.4, ease: 'easeOut',
      onUpdate(v) { if (ref.current) ref.current.textContent = prefix + Math.round(v).toLocaleString() + suffix },
    })
    return controls.stop
  }, [inView, to, suffix, prefix])
  return <span ref={ref}>{prefix}0{suffix}</span>
}

/* ── Line chart card ─────────────────────────────────────────────── */

function LineCard({
  title, value, suffix, trend, trendLabel, data, labels, color, id, Icon,
}: {
  title: string; value: number; suffix: string; trend: 'up' | 'down'
  trendLabel: string; data: number[]; labels: string[]
  color: string; id: string
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
}) {
  const W = 300; const H = 72
  const hasData = data.length >= 2 && Math.max(...data) > 0
  const xs = hasData ? data.map((_, i) => i * (W / (data.length - 1))) : []
  const ys = hasData ? normalize(data, H) : []
  const lp = hasData ? smoothPath(xs, ys) : ''
  const ap = hasData ? areaPath(xs, ys, H) : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5 }}
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}
      whileHover={{ borderColor: `${color}30`, boxShadow: `0 0 32px ${color}10` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1">{title}</div>
          <div className="text-2xl font-black text-white"><Counter to={value} suffix={suffix} /></div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background:`${color}18`, border:`1px solid ${color}25` }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
          <div className={`flex items-center gap-1 text-[10px] font-semibold ${trend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
            {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trendLabel}
          </div>
        </div>
      </div>

      {!hasData ? <EmptyChart height={H} /> : (
        <div className="relative overflow-hidden rounded-xl" style={{ height: H }}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
            <defs>
              <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <motion.path d={ap} fill={`url(#g-${id})`}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.3 }} />
            <motion.path d={lp} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.4, ease: 'easeInOut' }} />
            {xs.map((x, i) => (
              <motion.circle key={i} cx={x} cy={ys[i]} r={2.5}
                fill={color} opacity={0.7}
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ delay: 1.2 + i * 0.04 }}
                style={{ transformOrigin: `${x}px ${ys[i]}px` }} />
            ))}
          </svg>
        </div>
      )}

      {hasData && (
        <div className="flex justify-between">
          {labels.filter((_, i) => labels.length <= 7 || i % Math.ceil(labels.length / 7) === 0).map((l, i) => (
            <span key={i} className="text-[9px] text-white/20 font-medium">{l}</span>
          ))}
        </div>
      )}
    </motion.div>
  )
}

/* ── Bar chart card ──────────────────────────────────────────────── */

function BarCard({
  title, value, suffix, trend, trendLabel, data, labels, color, id, Icon,
}: {
  title: string; value: number; suffix: string; trend: 'up' | 'down'
  trendLabel: string; data: number[]; labels: string[]
  color: string; id: string
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
}) {
  const W = 300; const H = 72
  const hasData = data.length >= 1 && Math.max(...data) > 0
  const max  = hasData ? Math.max(...data) : 1
  const barW = data.length > 0 ? W / data.length - 4 : W

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5 }}
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}
      whileHover={{ borderColor: `${color}30`, boxShadow: `0 0 32px ${color}10` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1">{title}</div>
          <div className="text-2xl font-black text-white"><Counter to={value} suffix={suffix} /></div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background:`${color}18`, border:`1px solid ${color}25` }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
          <div className={`flex items-center gap-1 text-[10px] font-semibold ${trend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
            {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trendLabel}
          </div>
        </div>
      </div>

      {!hasData ? <EmptyChart height={H} /> : (
        <div className="relative overflow-hidden rounded-xl" style={{ height: H }}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
            <defs>
              <linearGradient id={`bg-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.8" />
                <stop offset="100%" stopColor={color} stopOpacity="0.3" />
              </linearGradient>
            </defs>
            {data.map((v, i) => {
              const barH = (v / max) * (H - 8)
              const x    = i * (W / data.length) + 2
              const y    = H - barH
              return (
                <motion.rect key={i}
                  x={x} y={y} width={barW} height={barH}
                  fill={`url(#bg-${id})`} rx={3}
                  initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
                  style={{ transformOrigin: `${x}px ${H}px` }}
                  transition={{ delay: 0.3 + i * 0.08, duration: 0.5, ease: 'backOut' }} />
              )
            })}
          </svg>
        </div>
      )}

      {hasData && (
        <div className="flex justify-between">
          {labels.filter((_, i) => labels.length <= 7 || i % Math.ceil(labels.length / 7) === 0).map((l, i) => (
            <span key={i} className="text-[9px] text-white/20 font-medium">{l}</span>
          ))}
        </div>
      )}
    </motion.div>
  )
}

/* ── Horizontal breakdown bar ────────────────────────────────────── */

function BreakdownCard({
  title, items, color, Icon,
}: {
  title: string
  items: { label: string; count: number }[]
  color: string
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
}) {
  const total = items.reduce((s, i) => s + i.count, 0) || 1

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5 }}
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}
      whileHover={{ borderColor: `${color}30`, boxShadow: `0 0 32px ${color}10` }}
    >
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">{title}</div>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background:`${color}18`, border:`1px solid ${color}25` }}>
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
      </div>

      {items.length === 0 ? <EmptyBreakdown /> : (
        <div className="flex flex-col gap-2.5">
          {items.map((item, i) => {
            const pct = Math.round((item.count / total) * 100)
            return (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-white/60 truncate max-w-[70%]">{item.label}</span>
                  <span className="text-[11px] font-bold text-white/40">{item.count} <span className="text-white/25">({pct}%)</span></span>
                </div>
                <div className="h-1 rounded-full overflow-hidden" style={{ background:'rgba(255,255,255,0.06)' }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: color }}
                    initial={{ width: 0 }}
                    whileInView={{ width: `${pct}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, delay: 0.1 + i * 0.07, ease: 'easeOut' }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}

/* ── AI vs User messages split card ──────────────────────────────── */

function MessageSplitCard({ aiMessages, userMessages }: { aiMessages: number; userMessages: number }) {
  const total = aiMessages + userMessages || 1
  const aiPct   = Math.round((aiMessages   / total) * 100)
  const userPct = Math.round((userMessages / total) * 100)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5 }}
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}
      whileHover={{ borderColor:'rgba(129,140,248,0.3)', boxShadow:'0 0 32px rgba(129,140,248,0.1)' }}
    >
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">Message Volume</div>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background:'rgba(129,140,248,0.12)', border:'1px solid rgba(129,140,248,0.2)' }}>
          <Activity className="w-3.5 h-3.5" style={{ color:'#818cf8' }} />
        </div>
      </div>

      {aiMessages === 0 && userMessages === 0 ? <EmptyBreakdown /> : (
        <div className="flex flex-col gap-3">
          <div className="flex gap-1 h-5 rounded-full overflow-hidden">
            <motion.div className="h-full rounded-l-full" style={{ background:'#818cf8' }}
              initial={{ width: 0 }} whileInView={{ width: `${aiPct}%` }} viewport={{ once: true }}
              transition={{ duration: 0.9, ease: 'easeOut' }} />
            <motion.div className="h-full rounded-r-full flex-1" style={{ background:'rgba(52,211,153,0.6)' }}
              initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
              transition={{ duration: 0.9, delay: 0.2 }} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background:'#818cf8' }} />
              <span className="text-[11px] text-white/50">AI replies</span>
              <span className="text-[11px] font-bold text-white">{aiMessages.toLocaleString()}</span>
              <span className="text-[10px] text-white/25">({aiPct}%)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background:'rgba(52,211,153,0.8)' }} />
              <span className="text-[11px] text-white/50">User msgs</span>
              <span className="text-[11px] font-bold text-white">{userMessages.toLocaleString()}</span>
              <span className="text-[10px] text-white/25">({userPct}%)</span>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}

/* ── Day-label formatter ─────────────────────────────────────────── */

function dayLabel(dateStr: string) {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

/* ── Main export ─────────────────────────────────────────────────── */

export default function AnalyticsSection({
  liveAnalytics,
}: {
  analytics?:        AnalyticsDay[]      // kept in signature for backward compat, unused
  analyticsSummary?: AnalyticsSummary    // kept in signature for backward compat, unused
  liveAnalytics?:    LiveAnalytics
}) {
  const live = liveAnalytics ?? {
    totalConversations: 0, totalMessages: 0, totalLeads: 0,
    aiMessages: 0, userMessages: 0, conversionRate: 0,
    messagesPerDay: [], leadsPerDay: [], sourceBreakdown: [], intentBreakdown: [],
  }

  const msgData    = live.messagesPerDay.map(d => d.count)
  const msgLabels  = live.messagesPerDay.map(d => dayLabel(d.date))
  const leadData   = live.leadsPerDay.map(d => d.count)
  const leadLabels = live.leadsPerDay.map(d => dayLabel(d.date))

  const msgTrend  = calcTrend(msgData)
  const leadTrend = calcTrend(leadData)

  const kpis = [
    { label:'Conversations', value: live.totalConversations, suffix:'', color:'#a78bfa', Icon: MessageCircle },
    { label:'Total messages', value: live.totalMessages,     suffix:'', color:'#60a5fa', Icon: BarChart2     },
    { label:'Leads captured', value: live.totalLeads,        suffix:'', color:'#34d399', Icon: UserCheck     },
    { label:'Conversion rate',value: live.conversionRate,   suffix:'%', color:'#fbbf24', Icon: Target        },
    { label:'AI replies',     value: live.aiMessages,        suffix:'', color:'#818cf8', Icon: Bot           },
  ]

  return (
    <div className="flex flex-col gap-6">

      {/* KPI summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {kpis.map((k, i) => (
          <motion.div key={k.label}
            initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay: i * 0.07 }}
            className="rounded-2xl p-4 sm:p-5"
            style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background:`${k.color}18`, border:`1px solid ${k.color}25` }}>
                <k.Icon className="w-4 h-4" style={{ color: k.color }} />
              </div>
            </div>
            <div className="text-2xl font-black text-white">
              <Counter to={k.value} suffix={k.suffix} />
            </div>
            <div className="text-[10px] font-semibold text-white/30 uppercase tracking-wide mt-1 leading-tight">{k.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Time-series charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LineCard
          id="msgs-day" title="Messages / day" color="#a78bfa" Icon={MessageCircle}
          value={live.totalMessages} suffix=" total"
          trend={msgTrend.trend} trendLabel={msgTrend.label}
          data={msgData} labels={msgLabels}
        />
        <BarCard
          id="leads-day" title="Leads / day" color="#34d399" Icon={Users}
          value={live.totalLeads} suffix=" total"
          trend={leadTrend.trend} trendLabel={leadTrend.label}
          data={leadData} labels={leadLabels}
        />
      </div>

      {/* Message volume split + conversion */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MessageSplitCard aiMessages={live.aiMessages} userMessages={live.userMessages} />

        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5 }}
          className="rounded-2xl p-5 flex flex-col gap-4"
          style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}
          whileHover={{ borderColor:'rgba(251,191,36,0.3)', boxShadow:'0 0 32px rgba(251,191,36,0.08)' }}
        >
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">Conversion Rate</div>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background:'rgba(251,191,36,0.12)', border:'1px solid rgba(251,191,36,0.2)' }}>
              <Zap className="w-3.5 h-3.5" style={{ color:'#fbbf24' }} />
            </div>
          </div>
          <div className="text-3xl font-black text-white">
            <Counter to={live.conversionRate} suffix="%" />
          </div>
          <div className="text-[11px] text-white/30">
            {live.totalLeads} leads from {live.totalConversations} conversations
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background:'rgba(255,255,255,0.06)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background:'linear-gradient(90deg,#fbbf24,#f59e0b)' }}
              initial={{ width: 0 }}
              whileInView={{ width: `${Math.min(live.conversionRate, 100)}%` }}
              viewport={{ once: true }}
              transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
            />
          </div>
        </motion.div>
      </div>

      {/* Breakdown cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BreakdownCard
          title="Lead source breakdown"
          items={live.sourceBreakdown}
          color="#60a5fa"
          Icon={MessageCircle}
        />
        <BreakdownCard
          title="Intent breakdown"
          items={live.intentBreakdown}
          color="#f472b6"
          Icon={Target}
        />
      </div>

    </div>
  )
}
