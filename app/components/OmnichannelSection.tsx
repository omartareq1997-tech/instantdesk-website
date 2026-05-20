'use client'

import { motion } from 'framer-motion'
import { Zap, Globe2, Languages, RefreshCw, CalendarCheck, Bell, DatabaseZap } from 'lucide-react'
import { channels } from './ChannelIcons'

const sampleMessages: Record<string, string> = {
  'Website Chat': 'What are your pricing plans?',
  'WhatsApp': 'Hi, I\'d like to book a consultation',
  'Instagram': 'Do you work with salons?',
  'Messenger': 'Are you open on weekends?',
  'Telegram': 'Send me more info please',
}

const capabilities = [
  { icon: Zap, text: 'Replies in under 3 seconds, around the clock' },
  { icon: Globe2, text: 'Captures & qualifies leads automatically' },
  { icon: CalendarCheck, text: 'Books appointments & sends confirmations' },
  { icon: Bell, text: 'Sends reminders & follow-up sequences' },
  { icon: Languages, text: 'Speaks 15+ languages natively' },
  { icon: DatabaseZap, text: 'Syncs CRM, Google Sheets & Calendar' },
  { icon: RefreshCw, text: 'Unified inbox — one AI, all channels' },
]

const integrations = [
  { name: 'Google Calendar', abbr: 'GCal', color: 'from-blue-500 to-blue-600' },
  { name: 'Google Sheets', abbr: 'Sheets', color: 'from-green-500 to-emerald-600' },
  { name: 'HubSpot', abbr: 'HubSpot', color: 'from-orange-500 to-amber-500' },
  { name: 'Salesforce', abbr: 'SF', color: 'from-blue-400 to-cyan-500' },
  { name: 'Zapier', abbr: 'Zapier', color: 'from-orange-400 to-red-500' },
  { name: 'Notion', abbr: 'Notion', color: 'from-slate-400 to-slate-600' },
]

export default function OmnichannelSection() {
  return (
    <section id="omnichannel" className="relative py-36 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-indigo-950/20 to-transparent" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] rounded-full bg-gradient-to-br from-violet-900/15 via-blue-900/10 to-indigo-900/15 blur-3xl" />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(139, 92, 246, 1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(139, 92, 246, 1) 1px, transparent 1px)
            `,
            backgroundSize: '80px 80px',
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
          className="text-center mb-20"
        >
          <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-violet-400 mb-5">
            <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
            Omnichannel AI
          </span>
          <h2 className="text-4xl md:text-6xl font-black text-white mb-6 leading-[1.08] max-w-4xl mx-auto">
            One AI agent across{' '}
            <span className="text-gradient">every channel</span>{' '}
            your customers use
          </h2>
          <p className="text-lg md:text-xl text-white/45 max-w-2xl mx-auto leading-relaxed">
            Your customers message on WhatsApp, Instagram, Messenger, Telegram, and your website. Your AI is already there — replying instantly on all of them.
          </p>
        </motion.div>

        {/* Main two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-16">

          {/* Left: Live channel mockup */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7 }}
            className="glass-card rounded-3xl overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-500/60" />
                  <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
                  <span className="w-3 h-3 rounded-full bg-green-500/60" />
                </div>
                <span className="text-xs text-white/30 font-medium ml-2">InstantDesk AI — Unified Inbox</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-400 font-semibold tracking-wide">ALL CHANNELS LIVE</span>
              </div>
            </div>

            {/* Channel rows */}
            <div className="divide-y divide-white/[0.04]">
              {channels.map((channel, i) => {
                const Icon = channel.Icon
                return (
                  <motion.div
                    key={channel.name}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: 0.2 + i * 0.08 }}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.02] transition-colors group"
                  >
                    {/* Channel icon */}
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: channel.bg, border: `1px solid ${channel.border}` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: channel.color }} />
                    </div>

                    {/* Message preview */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-white/80">{channel.name}</span>
                        <span className="text-[10px] text-white/25 font-medium">{channel.handle}</span>
                      </div>
                      <p className="text-xs text-white/35 truncate">&ldquo;{sampleMessages[channel.name]}&rdquo;</p>
                    </div>

                    {/* Status */}
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-[10px] text-white/20">{i === 0 ? 'just now' : `${i * 3}m ago`}</span>
                      <span
                        className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          color: channel.color,
                          background: channel.bg,
                          border: `1px solid ${channel.border}`,
                        }}
                      >
                        AI replied ✓
                      </span>
                    </div>
                  </motion.div>
                )
              })}
            </div>

            {/* Footer stat */}
            <div className="px-6 py-4 border-t border-white/5 bg-white/[0.01]">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/25">Avg. response time</span>
                <span className="text-emerald-400 font-bold">&lt; 3 seconds</span>
              </div>
            </div>
          </motion.div>

          {/* Right: Capabilities + integrations */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7 }}
            className="flex flex-col gap-6"
          >
            {/* Capability list */}
            <div className="glass-card rounded-3xl p-8 flex-1">
              <h3 className="text-sm font-bold tracking-widest uppercase text-violet-400 mb-6">
                What your AI does — on every channel
              </h3>
              <ul className="flex flex-col gap-4">
                {capabilities.map((cap, i) => {
                  const Icon = cap.icon
                  return (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: 0.1 + i * 0.06 }}
                      className="flex items-center gap-3 group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-violet-500/20 flex items-center justify-center flex-shrink-0 group-hover:border-violet-500/40 transition-colors">
                        <Icon className="w-4 h-4 text-violet-400" />
                      </div>
                      <span className="text-sm text-white/65 group-hover:text-white/85 transition-colors">{cap.text}</span>
                    </motion.li>
                  )
                })}
              </ul>
            </div>

            {/* Integrations */}
            <div className="glass-card rounded-3xl p-6">
              <h3 className="text-xs font-bold tracking-widest uppercase text-white/30 mb-4">
                Syncs with your existing tools
              </h3>
              <div className="flex flex-wrap gap-2">
                {integrations.map((int, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: 0.3 + i * 0.05 }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.07] hover:border-white/[0.14] transition-colors"
                  >
                    <div className={`w-4 h-4 rounded bg-gradient-to-br ${int.color}`} />
                    <span className="text-xs text-white/55 font-medium">{int.abbr}</span>
                  </motion.div>
                ))}
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.07]">
                  <span className="text-xs text-white/30 font-medium">+40 more</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Channel pills strip */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex flex-wrap justify-center gap-3"
        >
          {channels.map((channel, i) => {
            const Icon = channel.Icon
            return (
              <div
                key={i}
                className="flex items-center gap-2.5 px-5 py-2.5 rounded-full border transition-all duration-300 hover:-translate-y-0.5"
                style={{
                  background: channel.bg,
                  borderColor: channel.border,
                }}
              >
                <Icon className="w-4 h-4" style={{ color: channel.color }} />
                <span className="text-sm font-semibold text-white/70">{channel.name}</span>
                <span
                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ background: channel.color }}
                />
              </div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
