'use client'

import { useRef, useEffect, useState } from 'react'
import { motion, useInView, animate } from 'framer-motion'
import { TrendingUp, TrendingDown, MessageCircle, Zap, Calendar, Clock } from 'lucide-react'
import type { AnalyticsDay } from './types'

/* ─── Mock analytics data (fallback) ────────────────────────── */

const MOCK_MSGS_PER_DAY  = [45,58,72,67,51,23,18,63,79,85,91,78,31,24]
const MOCK_CONV_RATE_WKS = [8,10,11,13,12,15,17,20]
const MOCK_RESP_SPEED    = [4.2,3.8,4.5,3.1,2.9,3.5,2.7,2.4,2.8,2.2]
const MOCK_DEMOS_BOOKED  = [2,3,2,4,3,5,4,6]

const DAY_LABELS = ['M','T','W','T','F','S','S','M','T','W','T','F','S','S']
const WK_LABELS  = ['Wk1','Wk2','Wk3','Wk4','Wk5','Wk6','Wk7','Wk8']

/* ─── Chart helpers ──────────────────────────────────────────── */

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

/* ─── Animated counter ───────────────────────────────────────── */

function Counter({ to, suffix = '', prefix = '' }: { to: number; suffix?: string; prefix?: string }) {
  const ref   = useRef<HTMLSpanElement>(null)
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

/* ─── Line chart card ────────────────────────────────────────── */

function LineCard({
  title, value, suffix, trend, trendLabel, data, labels, color, id,
  Icon,
}: {
  title: string; value: number; suffix: string; trend: 'up' | 'down'
  trendLabel: string; data: number[]; labels: string[]
  color: string; id: string
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
}) {
  const W = 300; const H = 72
  const step = W / (data.length - 1)
  const xs = data.map((_, i) => i * step)
  const ys = normalize(data, H)
  const lp = smoothPath(xs, ys)
  const ap = areaPath(xs, ys, H)

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

      {/* SVG chart */}
      <div className="relative overflow-hidden rounded-xl" style={{ height: H }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
        >
          <defs>
            <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.path
            d={ap} fill={`url(#g-${id})`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.3 }}
          />
          <motion.path
            d={lp} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.4, ease: 'easeInOut' }}
          />
          {/* Data dots at peaks */}
          {xs.map((x, i) => (
            <motion.circle
              key={i} cx={x} cy={ys[i]} r={2.5}
              fill={color} opacity={0.7}
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ delay: 1.2 + i * 0.04 }}
              style={{ transformOrigin: `${x}px ${ys[i]}px` }}
            />
          ))}
        </svg>
      </div>

      {/* X labels */}
      <div className="flex justify-between">
        {labels.filter((_, i) => i % 2 === 0).map((l, i) => (
          <span key={i} className="text-[9px] text-white/20 font-medium">{l}</span>
        ))}
      </div>
    </motion.div>
  )
}

/* ─── Bar chart card ─────────────────────────────────────────── */

function BarCard({
  title, value, suffix, trend, trendLabel, data, labels, color, id, Icon,
}: {
  title: string; value: number; suffix: string; trend: 'up' | 'down'
  trendLabel: string; data: number[]; labels: string[]
  color: string; id: string
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
}) {
  const W = 300; const H = 72
  const max = Math.max(...data)
  const barW = W / data.length - 4

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

      {/* SVG bars */}
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
            const x = i * (W / data.length) + 2
            const y = H - barH
            return (
              <motion.rect
                key={i}
                x={x} y={y} width={barW} height={barH}
                fill={`url(#bg-${id})`} rx={3}
                initial={{ scaleY: 0, originY: H }}
                animate={{ scaleY: 1 }}
                style={{ transformOrigin: `${x}px ${H}px` }}
                transition={{ delay: 0.3 + i * 0.08, duration: 0.5, ease: 'backOut' }}
              />
            )
          })}
        </svg>
      </div>

      <div className="flex justify-between">
        {labels.map((l, i) => (
          <span key={i} className="text-[9px] text-white/20 font-medium">{l}</span>
        ))}
      </div>
    </motion.div>
  )
}

/* ─── Derive chart data from real analytics rows ─────────────── */

function groupIntoWeeks(days: AnalyticsDay[], key: keyof Pick<AnalyticsDay,'conversionRate'|'demosBooked'>, weeks = 8): number[] {
  const buckets: number[][] = Array.from({ length: weeks }, () => [])
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date)).slice(-(weeks * 7))
  sorted.forEach((d, i) => { buckets[Math.floor(i / 7)].push(d[key]) })
  return buckets.map(b => b.length ? Math.round(b.reduce((s, v) => s + v, 0) / (key === 'conversionRate' ? b.length : 1)) : 0)
}

function deriveChartData(analytics: AnalyticsDay[] | undefined) {
  if (!analytics?.length) {
    return {
      msgsPerDay:  MOCK_MSGS_PER_DAY,
      convRateWks: MOCK_CONV_RATE_WKS,
      respSpeed:   MOCK_RESP_SPEED,
      demosBooked: MOCK_DEMOS_BOOKED,
      totalMsgs:   847,
      avgRespSec:  28,
      totalDemos:  32,
    }
  }
  const sorted  = [...analytics].sort((a, b) => a.date.localeCompare(b.date))
  const msgsPerDay  = sorted.slice(-14).map(d => d.messagesCount)
  const respSpeed   = sorted.slice(-10).map(d => Math.round(d.avgResponseMs / 1000 * 10) / 10)
  const convRateWks = groupIntoWeeks(sorted, 'conversionRate', 8)
  const demosBooked = groupIntoWeeks(sorted, 'demosBooked', 8)
  const totalMsgs   = sorted.reduce((s, d) => s + d.messagesCount, 0)
  const avgRespSec  = Math.round(sorted.reduce((s, d) => s + d.avgResponseMs, 0) / sorted.length / 1000)
  const totalDemos  = sorted.reduce((s, d) => s + d.demosBooked, 0)
  return { msgsPerDay, convRateWks, respSpeed, demosBooked, totalMsgs, avgRespSec, totalDemos }
}

/* ─── Main export ────────────────────────────────────────────── */

export default function AnalyticsSection({ analytics }: { analytics?: AnalyticsDay[] }) {
  const { msgsPerDay, convRateWks, respSpeed, demosBooked, totalMsgs, avgRespSec, totalDemos } =
    deriveChartData(analytics)

  const summaryKpis = [
    { label:'Total conversations', value: totalMsgs,  suffix:'',    color:'#a78bfa', Icon: MessageCircle },
    { label:'Avg response time',   value: avgRespSec, suffix:'s',   color:'#60a5fa', Icon: Zap           },
    { label:'Demos booked',        value: totalDemos, suffix:'',    color:'#34d399', Icon: Calendar      },
    { label:'Avg session length',  value: 4,          suffix:'min', color:'#fbbf24', Icon: Clock         },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryKpis.map((k, i) => (
          <motion.div key={k.label}
            initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.07 }}
            className="rounded-2xl p-5"
            style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background:`${k.color}18`, border:`1px solid ${k.color}25` }}>
                <k.Icon className="w-4 h-4" style={{ color:k.color }} />
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
          id="msgs" title="Messages per day" value={totalMsgs} suffix=" total"
          trend="up" trendLabel="+18% vs last week"
          data={msgsPerDay} labels={DAY_LABELS.slice(0, msgsPerDay.length)} color="#a78bfa" Icon={MessageCircle}
        />
        <BarCard
          id="conv" title="Conversion rate" value={convRateWks[convRateWks.length - 1] ?? 20} suffix="%"
          trend="up" trendLabel="+8 pts over 8 wks"
          data={convRateWks} labels={WK_LABELS.slice(0, convRateWks.length)} color="#34d399" Icon={TrendingUp}
        />
        <LineCard
          id="speed" title="Avg response speed" value={avgRespSec} suffix="s"
          trend="up" trendLabel="↓ faster than last week"
          data={respSpeed} labels={respSpeed.map((_, i) => `D${i+1}`)} color="#60a5fa" Icon={Zap}
        />
        <BarCard
          id="demos" title="Demos booked" value={demosBooked[demosBooked.length - 1] ?? 6} suffix=" this week"
          trend="up" trendLabel="+50% vs last week"
          data={demosBooked} labels={WK_LABELS.slice(0, demosBooked.length)} color="#fbbf24" Icon={Calendar}
        />
      </div>
    </div>
  )
}
