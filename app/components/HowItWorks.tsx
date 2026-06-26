'use client'

import { motion } from 'framer-motion'
import { ClipboardList, Cpu, Rocket, TrendingUp } from 'lucide-react'
import { channels } from './ChannelIcons'

const steps = [
  {
    step: '01',
    icon: ClipboardList,
    title: 'Strategy Call',
    description: 'A focused 30-minute discovery session. We map your customer journey, identify missed-lead gaps, and decide which channels and workflows to automate first.',
    detail: 'We audit your website, social channels, and current CRM setup before the call.',
    color: 'from-orange-500 to-orange-600',
    glowColor: 'rgba(244,122,99,0.3)',
  },
  {
    step: '02',
    icon: Cpu,
    title: 'Custom AI Build',
    description: 'Our engineers train your AI on your business — services, pricing, FAQs, brand voice, booking flow. Then connect it to all five channels simultaneously.',
    detail: 'Website + WhatsApp + Instagram + Messenger + Telegram — all configured to match your brand.',
    color: 'from-stone-500 to-orange-500',
    glowColor: 'rgba(148,145,140,0.3)',
    showChannels: true,
  },
  {
    step: '03',
    icon: Rocket,
    title: 'Go Live in 72h',
    description: 'We deploy, test, and integrate everything — CRM, Google Calendar, Google Sheets, booking system. Your AI starts replying and capturing leads from day one.',
    detail: 'Synced with your existing tools, no disruption to your current workflow.',
    color: 'from-emerald-500 to-teal-500',
    glowColor: 'rgba(52,211,153,0.3)',
  },
  {
    step: '04',
    icon: TrendingUp,
    title: 'Scale & Optimise',
    description: 'Live dashboards show conversations, leads captured, appointments booked — across all channels. We tune the AI weekly based on real conversion data.',
    detail: 'Monthly performance reviews included. Your AI gets smarter every week.',
    color: 'from-orange-500 to-amber-400',
    glowColor: 'rgba(251,146,60,0.3)',
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-32 overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-orange-900/8 blur-3xl" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-stone-900/8 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `linear-gradient(rgba(244,122,99,1) 1px, transparent 1px)`,
            backgroundSize: '1px 60px',
            backgroundPosition: 'center',
          }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <span className="inline-block text-xs font-semibold tracking-widest uppercase text-orange-400 mb-4">
            Proven process
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-5 leading-tight">
            From zero to{' '}
            <span className="text-gradient">omnichannel AI</span>
            <br />in 72 hours
          </h2>
          <p className="text-lg text-white/40 max-w-xl mx-auto">
            No months of integration work. No technical team needed. A fast, proven process that deploys your AI across all five channels simultaneously.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {steps.map((step, i) => {
            const Icon = step.icon
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                whileHover={{ y: -6, transition: { duration: 0.2 } }}
                className="relative glass-card rounded-2xl p-7 overflow-hidden group"
              >
                {/* Hover glow */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{
                    background: `radial-gradient(circle at 50% 0%, ${step.glowColor} 0%, transparent 65%)`,
                  }}
                />
                {/* Step number */}
                <div className="absolute top-5 right-5 text-5xl font-black text-white/[0.04] leading-none select-none">
                  {step.step}
                </div>

                <div
                  className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center mb-6 shadow-xl group-hover:scale-105 transition-transform duration-300`}
                >
                  <Icon className="w-7 h-7 text-white" />
                </div>

                <h3 className="text-lg font-bold text-white mb-3">{step.title}</h3>
                <p className="text-sm text-white/45 leading-relaxed mb-4">{step.description}</p>

                {/* Channel icons for step 2 */}
                {step.showChannels && (
                  <div className="flex gap-1.5 mb-4">
                    {channels.map((channel, j) => {
                      const CIcon = channel.Icon
                      return (
                        <div
                          key={j}
                          className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ background: channel.bg, border: `1px solid ${channel.border}` }}
                          title={channel.name}
                        >
                          <CIcon className="w-3.5 h-3.5" style={{ color: channel.color }} />
                        </div>
                      )
                    })}
                  </div>
                )}

                <p className="text-xs text-white/25 leading-relaxed border-t border-white/[0.05] pt-4">
                  {step.detail}
                </p>
              </motion.div>
            )
          })}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-center mt-14"
        >
          <a
            href="#demo"
            className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl font-semibold text-white transition-all duration-300 hover:-translate-y-0.5"
            style={{
              background: 'linear-gradient(135deg, #171412 0%, #f47a63 50%, #f89a57 100%)',
              boxShadow: '0 8px 32px rgba(244,122,99,0.30)',
            }}
          >
            Start Your 72-Hour Build
            <span className="text-white/60 font-normal text-sm">— it&apos;s free to scope</span>
          </a>
        </motion.div>
      </div>
    </section>
  )
}
