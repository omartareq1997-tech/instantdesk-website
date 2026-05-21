'use client'

import { useRef, useEffect } from 'react'
import { motion, useInView, animate } from 'framer-motion'
import { TrendingUp, TrendingDown, MessageCircle, Zap, Calendar, BarChart2 } from 'lucide-react'
import type { AnalyticsDay, AnalyticsSummary } from './types'

const WK_LABELS = ['Wk1','Wk2','Wk3','Wk4','Wk5','Wk6','Wk7','Wk8']

/* ── Loading skeleton ────────────────────────────────────────────── */

function Pulse({ className }: { className?: string }) {
  return <div className={`rounded-xl bg-white/[0.05] animate-pulse ${className ?? ''}`} />
}

export function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0,1,2,3].map(i => (
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
            <div className="flex justify-between mt-3">
              {[0,1,2,3,4,5,6].map(j => <Pulse key={j} className="h-2 w-4" />)}
            </div>
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

/* ── Empty chart placeholder ─────────────────────────────────────── */

function EmptyChart({ height }: { height: number }) {
  return (
    <div className="flex items-center justify-center rounded-xl"
      style={{ height, background:'rgba(255,255,255,0.015)', border:'1px dashed rgba(255,255,255,0.07)' }}>
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
  return { trend: pct >= 0 ? 'up' : 'down', label: `${pct >= 0 ? '+' : ''}${pct}% vs prior period` }
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
  const hasData = data.length >= 2
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
          <div className="text-2xl font-black text-white">
            <Counter to={value} suffix={suffix} />
          </div>
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
          {labels.filter((_, i) => i % 2 === 0).map((l, i) => (
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
          <div className="text-2xl font-black text-white">
            <Counter to={value} suffix={suffix} />
          </div>
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
          {labels.map((l, i) => (
            <span key={i} className="text-[9px] text-white/20 font-medium">{l}</span>
          ))}
        </div>
      )}
    </motion.div>
  )
}

/* ── Data derivation (no mock fallbacks — zeros when tables empty) ── */

function groupIntoWeeks(
  days: AnalyticsDay[],
  key: keyof Pick<AnalyticsDay, 'conversionRate' | 'demosBooked'>,
  weeks = 8,
): number[] {
  const buckets: number[][] = Array.from({ length: weeks }, () => [])
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date)).slice(-(weeks * 7))
  sorted.forEach((d, i) => { buckets[Math.floor(i / 7)].push(d[key]) })
  return buckets.map(b =>
    b.length ? Math.round(b.reduce((s, v) => s + v, 0) / (key === 'conversionRate' ? b.length : 1)) : 0,
  )
}

function deriveChartData(analytics: AnalyticsDay[] | undefined) {
  if (!analytics?.length) {
    return { msgsPerDay: [] as number[], convRateWks: [] as number[], respSpeed: [] as number[], demosBooked: [] as number[], dayLabels: [] as string[] }
  }
  const sorted = [...analytics].sort((a, b) => a.date.localeCompare(b.date))
  return {
    msgsPerDay:  sorted.slice(-14).map(d => d.messagesCount),
    respSpeed:   sorted.slice(-10).map(d => Math.round(d.avgResponseMs / 100) / 10),
    convRateWks: groupIntoWeeks(sorted, 'conversionRate', 8),
    demosBooked: groupIntoWeeks(sorted, 'demosBooked', 8),
    dayLabels:   sorted.slice(-14).map(d =>
      new Date(d.date + 'T12:00:00Z').toLocaleDateString('en', { weekday: 'narrow' })
    ),
  }
}

/* ── Main export ─────────────────────────────────────────────────── */

export default function AnalyticsSection({
  analytics,
  analyticsSummary,
}: {
  analytics?:        AnalyticsDay[]
  analyticsSummary?: AnalyticsSummary
}) {
  const { msgsPerDay, convRateWks, respSpeed, demosBooked, dayLabels } = deriveChartData(analytics)

  const msgsTrend  = calcTrend(msgsPerDay)
  const convTrend  = calcTrend(convRateWks)
  const speedRaw   = calcTrend(respSpeed)
  // Response time: lower = better → invert trend direction so green = improvement
  const speedTrend = { trend: speedRaw.trend === 'up' ? 'down' as const : 'up' as const, label: speedRaw.label }
  const demoTrend  = calcTrend(demosBooked)

  const avgRespSec = Math.round((analyticsSummary?.avgResponseMs ?? 0) / 1000)

  const kpis = [
    { label:'Total conversations', value: analyticsSummary?.totalConversations ?? 0, suffix:'',   color:'#a78bfa', Icon: MessageCircle },
    { label:'Total messages',      value: analyticsSummary?.totalMessages      ?? 0, suffix:'',   color:'#60a5fa', Icon: BarChart2    },
    { label:'Avg AI response',     value: avgRespSec,                               suffix:'s',  color:'#34d399', Icon: Zap          },
    { label:'Demos booked',        value: analyticsSummary?.demosBooked        ?? 0, suffix:'',   color:'#fbbf24', Icon: Calendar     },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* KPI summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <motion.div key={k.label}
            initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay: i * 0.07 }}
            className="rounded-2xl p-5"
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
            <div className="text-[10px] font-semibold text-white/30 uppercase tracking-wide mt-1">{k.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Charts 2×2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LineCard
          id="msgs" title="Messages / day" color="#a78bfa" Icon={MessageCircle}
          value={analyticsSummary?.totalMessages ?? 0} suffix=" total"
          trend={msgsTrend.trend} trendLabel={msgsTrend.label}
          data={msgsPerDay}
          labels={dayLabels.length ? dayLabels : msgsPerDay.map((_, i) => `D${i+1}`)}
        />
        <BarCard
          id="conv" title="Conversion rate" color="#34d399" Icon={TrendingUp}
          value={analyticsSummary?.conversionRate ?? 0} suffix="%"
          trend={convTrend.trend} trendLabel={convTrend.label}
          data={convRateWks} labels={WK_LABELS.slice(0, convRateWks.length)}
        />
        <LineCard
          id="speed" title="Avg AI response" color="#60a5fa" Icon={Zap}
          value={avgRespSec} suffix="s"
          trend={speedTrend.trend} trendLabel={speedTrend.label}
          data={respSpeed} labels={respSpeed.map((_, i) => `D${i+1}`)}
        />
        <BarCard
          id="demos" title="Demos booked" color="#fbbf24" Icon={Calendar}
          value={analyticsSummary?.demosBooked ?? 0} suffix=" total"
          trend={demoTrend.trend} trendLabel={demoTrend.label}
          data={demosBooked} labels={WK_LABELS.slice(0, demosBooked.length)}
        />
      </div>
    </div>
  )
}
