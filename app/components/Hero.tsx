'use client'

import { motion } from 'framer-motion'
import { ArrowRight, Play, ChevronDown } from 'lucide-react'
import { channels } from './ChannelIcons'

const stats = [
  { value: '10×', label: 'Faster lead response' },
  { value: '94%', label: 'Client satisfaction' },
  { value: '5 channels', label: 'One unified AI' },
  { value: '24/7', label: 'Always on' },
]

export default function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-20">
      {/* Animated background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[#050510]" />
        {/* Fine grid */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(139, 92, 246, 0.07) 1px, transparent 1px),
              linear-gradient(90deg, rgba(139, 92, 246, 0.07) 1px, transparent 1px)
            `,
            backgroundSize: '48px 48px',
          }}
        />
        {/* Large faint radial */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, rgba(96,165,250,0.04) 40%, transparent 70%)',
          }}
        />
        {/* Accent blobs */}
        <div className="absolute top-1/4 -left-20 w-80 h-80 rounded-full bg-violet-600/8 blur-3xl animate-float" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 rounded-full bg-blue-600/8 blur-3xl animate-float" style={{ animationDelay: '3s' }} />
        <div className="absolute top-3/4 left-1/3 w-64 h-64 rounded-full bg-indigo-600/6 blur-3xl animate-float" style={{ animationDelay: '6s' }} />
      </div>

      <div className="max-w-7xl mx-auto px-6 text-center">
        {/* Top badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full glass border border-violet-500/20 text-sm text-violet-300 font-medium mb-10"
        >
          <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
          AI-powered business automation &mdash; deploy in 72 hours
          <span className="w-px h-4 bg-violet-500/30" />
          <span className="text-violet-400 font-semibold">150+ clients live</span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-5xl md:text-7xl lg:text-[80px] font-black tracking-tight leading-[1.02] mb-7 text-white max-w-5xl mx-auto"
        >
          AI Receptionists &{' '}
          <span className="text-gradient">Automation</span>
          <br />
          That Turn Missed Leads Into{' '}
          <span className="relative inline-block">
            Booked Clients
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.8, delay: 0.9, ease: [0.22, 1, 0.36, 1] }}
              className="absolute -bottom-1 left-0 right-0 h-[3px] bg-gradient-to-r from-violet-500 via-blue-500 to-cyan-500 rounded-full origin-left"
            />
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.28 }}
          className="text-lg md:text-xl text-white/45 max-w-2xl mx-auto mb-8 leading-relaxed"
        >
          One AI agent that replies instantly on your website, WhatsApp, Instagram, Messenger, and Telegram — capturing leads, booking appointments, and syncing your CRM, around the clock.
        </motion.p>

        {/* Channel pills */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.38 }}
          className="flex flex-wrap items-center justify-center gap-2.5 mb-11"
        >
          {channels.map((channel, i) => {
            const Icon = channel.Icon
            return (
              <div
                key={i}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold"
                style={{
                  background: channel.bg,
                  border: `1px solid ${channel.border}`,
                  color: channel.color,
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                {channel.name}
              </div>
            )
          })}
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white/[0.04] border border-white/[0.08] text-white/30">
            +more coming
          </div>
        </motion.div>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20"
        >
          <a
            href="#demo"
            className="group relative flex items-center gap-2.5 px-9 py-4 rounded-xl font-semibold text-base text-white overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_50px_rgba(139,92,246,0.4)]"
            style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #2563eb 100%)',
              boxShadow: '0 8px 32px rgba(99,102,241,0.35)',
            }}
          >
            {/* Shine effect */}
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
            Get Personalized Demo
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </a>
          <a
            href="#how-it-works"
            className="group flex items-center gap-2.5 px-9 py-4 rounded-xl glass border border-white/10 text-white/75 font-semibold text-base hover:text-white hover:border-white/25 transition-all duration-300 hover:-translate-y-0.5"
          >
            <Play className="w-4 h-4 group-hover:text-violet-400 transition-colors" />
            See How It Works
          </a>
        </motion.div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.55 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-px overflow-hidden max-w-3xl mx-auto rounded-2xl"
          style={{
            background: 'rgba(255,255,255,0.03)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
          }}
        >
          {stats.map((stat, i) => (
            <div
              key={i}
              className="flex flex-col items-center py-6 px-4 bg-white/[0.015] hover:bg-white/[0.04] transition-colors"
            >
              <span className="text-2xl md:text-3xl font-black text-gradient-blue mb-1 tracking-tight">{stat.value}</span>
              <span className="text-[11px] text-white/35 font-medium tracking-wide text-center">{stat.label}</span>
            </div>
          ))}
        </motion.div>

        {/* Scroll cue */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-white/20"
        >
          <span className="text-[10px] font-semibold tracking-widest uppercase">Discover</span>
          <ChevronDown className="w-4 h-4 animate-bounce" />
        </motion.div>
      </div>
    </section>
  )
}
