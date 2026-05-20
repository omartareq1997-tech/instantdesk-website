'use client'

import { motion, type Variants } from 'framer-motion'
import {
  Phone, MessageSquare, Calendar,
  Star, Workflow, Shield, Languages, DatabaseZap
} from 'lucide-react'
import { channels } from './ChannelIcons'

const omnichannelCapabilities = [
  'Instant replies on all channels',
  'Lead capture & qualification',
  'FAQ answering 24/7',
  'Appointment booking',
  'Follow-up sequences',
  'CRM & Calendar sync',
  '15+ languages',
]

const features = [
  {
    icon: Phone,
    title: 'AI Phone Receptionist',
    description: 'Handles inbound calls around the clock — qualifies leads, answers FAQs, books appointments, and never puts a caller on hold.',
    gradient: 'from-violet-500 to-purple-600',
    glow: 'rgba(139, 92, 246, 0.3)',
    tag: 'Voice AI',
  },
  {
    icon: MessageSquare,
    title: 'Website Chatbot',
    description: 'Converts visitors into booked leads with intelligent flows trained on your brand voice and services. Engages and captures 24/7.',
    gradient: 'from-blue-500 to-cyan-500',
    glow: 'rgba(96, 165, 250, 0.3)',
    tag: 'Web',
  },
  {
    icon: Calendar,
    title: 'Booking & Scheduling',
    description: 'Clients book, reschedule, and receive confirmations automatically. Synced with Google Calendar and your existing calendar tools.',
    gradient: 'from-orange-500 to-amber-500',
    glow: 'rgba(251, 146, 60, 0.3)',
    tag: 'Automation',
  },
  {
    icon: DatabaseZap,
    title: 'CRM & Data Sync',
    description: 'Every lead, conversation, and booking flows into your CRM, Google Sheets, or HubSpot automatically. Zero manual data entry.',
    gradient: 'from-pink-500 to-rose-500',
    glow: 'rgba(236, 72, 153, 0.3)',
    tag: 'Integrations',
  },
  {
    icon: Star,
    title: 'Review Automation',
    description: 'Trigger review requests at the perfect post-service moment. Build Google, Facebook, and Trustpilot reputation on autopilot.',
    gradient: 'from-yellow-500 to-orange-400',
    glow: 'rgba(234, 179, 8, 0.3)',
    tag: 'Reputation',
  },
  {
    icon: Languages,
    title: 'Multi-Language AI',
    description: 'Your AI speaks 15+ languages natively — Polish, English, German, French, Spanish, and more. Serve every customer, anywhere.',
    gradient: 'from-teal-500 to-emerald-500',
    glow: 'rgba(20, 184, 166, 0.3)',
    tag: 'Global',
  },
  {
    icon: Workflow,
    title: 'AI Workflow Engine',
    description: 'Connect your entire stack — Zapier, Make, Slack, Notion, invoicing — with AI agents that orchestrate complex multi-step processes.',
    gradient: 'from-violet-500 to-blue-500',
    glow: 'rgba(99, 102, 241, 0.3)',
    tag: 'Enterprise',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: 'GDPR compliant, data encrypted at rest and in transit, SOC2-ready infrastructure. Enterprise-grade privacy from day one.',
    gradient: 'from-slate-500 to-slate-600',
    glow: 'rgba(148, 163, 184, 0.2)',
    tag: 'Security',
  },
]

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.07, ease: [0.25, 0.1, 0.25, 1] },
  }),
}

export default function Features() {
  return (
    <section id="features" className="relative py-32 overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1px] h-full bg-gradient-to-b from-transparent via-violet-500/15 to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block text-xs font-semibold tracking-widest uppercase text-violet-400 mb-4">
            Everything you need
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-5 leading-tight">
            One platform,{' '}
            <span className="text-gradient">infinite automation</span>
          </h2>
          <p className="text-lg text-white/40 max-w-xl mx-auto">
            Every capability you need to automate client acquisition, communication, and operations — all working together.
          </p>
        </motion.div>

        {/* Omnichannel hero card — full width */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7 }}
          className="relative rounded-3xl overflow-hidden mb-5 group"
          style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 50%, rgba(59,130,246,0.12) 100%)',
            border: '1px solid rgba(139,92,246,0.2)',
          }}
        >
          {/* Glow on hover */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700"
            style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.15) 0%, transparent 70%)' }}
          />
          {/* Corner decoration */}
          <div className="absolute top-0 right-0 w-96 h-96 opacity-20"
            style={{ background: 'radial-gradient(circle at top right, rgba(99,102,241,0.5), transparent 70%)' }}
          />

          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-0">
            {/* Left: text */}
            <div className="p-10 md:p-12">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs font-bold text-violet-300 mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                Core Technology
              </div>
              <h3 className="text-2xl md:text-3xl font-black text-white mb-4 leading-snug">
                Omnichannel AI — one agent,<br />
                <span className="text-gradient">five channels, zero missed leads</span>
              </h3>
              <p className="text-white/50 leading-relaxed mb-8 max-w-md">
                Your AI agent works simultaneously across your website, WhatsApp, Instagram DMs, Facebook Messenger, and Telegram — with the same knowledge, tone, and capabilities on every platform.
              </p>
              <div className="flex flex-wrap gap-2">
                {omnichannelCapabilities.map((cap, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full"
                    style={{
                      background: 'rgba(139,92,246,0.08)',
                      border: '1px solid rgba(139,92,246,0.18)',
                      color: 'rgba(196,181,253,0.9)',
                    }}
                  >
                    <span className="w-1 h-1 rounded-full bg-violet-400" />
                    {cap}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: channel icons */}
            <div className="p-10 md:p-12 flex items-center">
              <div className="grid grid-cols-5 gap-3 w-full">
                {channels.map((channel, i) => {
                  const Icon = channel.Icon
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.8 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: 0.3 + i * 0.08 }}
                      whileHover={{ scale: 1.08, transition: { duration: 0.15 } }}
                      className="flex flex-col items-center gap-2"
                    >
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
                        style={{ background: channel.bg, border: `1px solid ${channel.border}` }}
                      >
                        <Icon className="w-7 h-7" style={{ color: channel.color }} />
                      </div>
                      <span className="text-[10px] text-white/35 font-medium text-center leading-tight">{channel.name}</span>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((feature, i) => {
            const Icon = feature.icon
            return (
              <motion.div
                key={i}
                custom={i}
                variants={cardVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-60px' }}
                whileHover={{ y: -6, transition: { duration: 0.2 } }}
                className="glass-card rounded-2xl p-6 group cursor-default relative overflow-hidden"
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"
                  style={{
                    background: `radial-gradient(circle at 50% 0%, ${feature.glow} 0%, transparent 70%)`,
                  }}
                />
                {/* Tag */}
                <div className="absolute top-4 right-4 text-[9px] font-bold tracking-widest uppercase text-white/20">
                  {feature.tag}
                </div>
                <div
                  className={`w-11 h-11 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 shadow-lg`}
                >
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-bold text-white text-base mb-2">{feature.title}</h3>
                <p className="text-sm text-white/38 leading-relaxed group-hover:text-white/55 transition-colors">
                  {feature.description}
                </p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
