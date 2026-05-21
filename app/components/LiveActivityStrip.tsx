'use client'

import { motion } from 'framer-motion'
import { Calendar, Bot, Users, PhoneCall, Zap, MessageCircle } from 'lucide-react'

const EVENTS = [
  { text: 'InstantDesk booked a demo for a real estate agency in London',        Icon: Calendar,     color: '#60a5fa' },
  { text: 'AI answered 1,284 customer questions today',                          Icon: Bot,          color: '#a78bfa' },
  { text: '23 businesses onboarded this month',                                  Icon: Users,        color: '#34d399' },
  { text: 'Missed call recovered in under 45 seconds for a dental clinic',       Icon: PhoneCall,    color: '#fb923c' },
  { text: 'AI receptionist booked 6 appointments while the office was closed',   Icon: Zap,          color: '#fbbf24' },
  { text: 'WhatsApp follow-up sent to 14 leads automatically overnight',         Icon: MessageCircle,color: '#34d399' },
  { text: 'New lead from Google captured and qualified in 90 seconds',           Icon: Bot,          color: '#a78bfa' },
  { text: '6-figure revenue pipeline built for a law firm in 30 days',           Icon: Zap,          color: '#f87171' },
]

function EventPill({ text, Icon, color }: typeof EVENTS[number]) {
  return (
    <div className="flex items-center gap-3 px-5 py-2.5 rounded-full mx-4 flex-shrink-0 select-none"
      style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background:`${color}20` }}>
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />
      </div>
      <span className="text-sm text-white/45 whitespace-nowrap font-medium">{text}</span>
    </div>
  )
}

export default function LiveActivityStrip() {
  const doubled = [...EVENTS, ...EVENTS]

  return (
    <section className="relative py-6 overflow-hidden" style={{ borderTop:'1px solid rgba(255,255,255,0.04)', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
      {/* Fade edges */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-32 z-10"
        style={{ background:'linear-gradient(to right,#050510 0%,transparent 100%)' }} />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-32 z-10"
        style={{ background:'linear-gradient(to left,#050510 0%,transparent 100%)' }} />

      {/* Live indicator */}
      <div className="flex items-center gap-2 absolute left-6 top-1/2 -translate-y-1/2 z-20">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/70">Live</span>
      </div>

      <div className="overflow-hidden pause-on-hover pl-28">
        <div className="animate-marquee">
          {doubled.map((e, i) => (
            <EventPill key={i} {...e} />
          ))}
        </div>
      </div>
    </section>
  )
}
