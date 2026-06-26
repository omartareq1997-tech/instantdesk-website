'use client'

import { motion } from 'framer-motion'
import { Check, Zap, ArrowRight } from 'lucide-react'
import { channels } from './ChannelIcons'

const tiers = [
  {
    name: 'Starter',
    price: '€497',
    period: '/month',
    tagline: 'For small teams ready to automate',
    channelCount: 2,
    channelNote: 'Website + WhatsApp',
    features: [
      'AI Website Chatbot',
      'WhatsApp automation',
      'Lead capture & CRM sync',
      'Email/SMS follow-up sequences',
      'Google Calendar integration',
      'Up to 500 conversations/mo',
      'Google Sheets data export',
      '3-day setup',
      'Email & chat support',
    ],
    cta: 'Get Started',
    ctaStyle: 'outline',
    highlight: false,
    checkGradient: 'from-slate-600 to-slate-500',
  },
  {
    name: 'Growth',
    price: '€997',
    period: '/month',
    tagline: 'The full omnichannel AI system',
    badge: 'Most Popular',
    channelCount: 5,
    channelNote: 'All 5 channels active',
    features: [
      'Everything in Starter',
      'AI Phone Receptionist (24/7)',
      'Instagram DM automation',
      'Facebook Messenger bot',
      'Telegram bot deployment',
      'Multi-language support (15+)',
      'Review generation automation',
      'Advanced lead scoring & routing',
      'Up to 3,000 conversations/mo',
      'Priority setup & onboarding',
      'Monthly strategy reviews',
    ],
    cta: 'Start Growing',
    ctaStyle: 'gradient',
    highlight: true,
    checkGradient: 'from-orange-600 to-stone-500',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    tagline: 'Full-stack AI for ambitious teams',
    channelCount: 5,
    channelNote: 'All channels + custom',
    features: [
      'Everything in Growth',
      'Custom AI agent development',
      'Full workflow automation (Zapier/Make)',
      'Multi-location & multi-brand',
      'Unlimited conversations',
      'White-label AI solution',
      'Dedicated AI engineer',
      'SLA guarantee & 24/7 support',
      'On-premise deployment option',
    ],
    cta: 'Talk to Sales',
    ctaStyle: 'outline',
    highlight: false,
    checkGradient: 'from-slate-600 to-slate-500',
  },
]

export default function Pricing() {
  return (
    <section id="pricing" className="relative py-32 overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-gradient-to-br from-orange-900/15 to-stone-900/8 blur-3xl" />
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
            Transparent pricing
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-5 leading-tight">
            Investment that{' '}
            <span className="text-gradient">pays for itself</span>
          </h2>
          <p className="text-lg text-white/40 max-w-xl mx-auto">
            Most clients recover their full investment within the first 30 days — from leads that would have otherwise gone cold.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 max-w-6xl mx-auto items-start">
          {tiers.map((tier, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              whileHover={{ y: tier.highlight ? -10 : -5, transition: { duration: 0.25 } }}
              className={`relative rounded-3xl flex flex-col overflow-hidden ${
                tier.highlight
                  ? 'shadow-2xl shadow-orange-500/25'
                  : ''
              }`}
              style={tier.highlight ? {
                background: 'linear-gradient(180deg, rgba(91,60,200,0.18) 0%, rgba(248,154,87,0.10) 100%)',
                border: '1px solid rgba(244,122,99,0.35)',
              } : {
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.07)',
                backdropFilter: 'blur(20px)',
              }}
            >
              {tier.badge && (
                <div className="absolute -top-px left-0 right-0 flex justify-center">
                  <div className="flex items-center gap-1.5 px-5 py-1.5 rounded-b-xl font-bold text-xs text-white"
                    style={{ background: 'linear-gradient(90deg, #171412, #f89a57)' }}
                  >
                    <Zap className="w-3 h-3" />
                    {tier.badge}
                  </div>
                </div>
              )}

              <div className={`p-8 ${tier.badge ? 'pt-10' : ''}`}>
                {/* Tier name */}
                <div className="text-[11px] font-black tracking-[0.15em] uppercase text-white/30 mb-4">
                  {tier.name}
                </div>

                {/* Price */}
                <div className="flex items-end gap-1.5 mb-2">
                  <span className={`font-black leading-none ${tier.price === 'Custom' ? 'text-3xl' : 'text-5xl'} text-white`}>
                    {tier.price}
                  </span>
                  {tier.period && (
                    <span className="text-white/35 font-medium pb-1.5">{tier.period}</span>
                  )}
                </div>
                <p className="text-sm text-white/40 mb-6">{tier.tagline}</p>

                {/* Channels */}
                <div className="mb-6 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="text-[10px] font-bold tracking-widest uppercase text-white/25 mb-3">
                    Active channels ({tier.channelCount}/{channels.length})
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {channels.map((channel, j) => {
                      const Icon = channel.Icon
                      const active = j < tier.channelCount
                      return (
                        <div
                          key={j}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
                          style={active ? {
                            background: channel.bg,
                            border: `1px solid ${channel.border}`,
                            color: channel.color,
                          } : {
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.05)',
                            color: 'rgba(255,255,255,0.18)',
                          }}
                        >
                          <Icon className="w-3 h-3" />
                          {channel.name}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Feature list */}
                <ul className="flex flex-col gap-3 mb-8">
                  {tier.features.map((feat, j) => (
                    <li key={j} className="flex items-start gap-3">
                      <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${tier.checkGradient} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        <Check className="w-3 h-3 text-white" />
                      </div>
                      <span className={`text-sm leading-snug ${
                        feat.startsWith('Everything')
                          ? 'text-white/55 font-semibold'
                          : 'text-white/65'
                      }`}>{feat}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <a
                  href="#demo"
                  className={`group w-full py-4 rounded-xl text-sm font-bold text-center transition-all duration-300 flex items-center justify-center gap-2 ${
                    tier.ctaStyle === 'gradient'
                      ? 'text-white hover:-translate-y-0.5'
                      : 'border border-white/10 text-white hover:bg-white/5'
                  }`}
                  style={tier.ctaStyle === 'gradient' ? {
                    background: 'linear-gradient(135deg, #171412 0%, #f89a57 100%)',
                    boxShadow: '0 4px 20px rgba(244,122,99,0.35)',
                  } : {}}
                >
                  {tier.cta}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </a>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Trust note */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-6 mt-12 text-xs text-white/20"
        >
          {['30-day money-back guarantee', 'No long-term contracts', 'Cancel anytime', 'Setup fee may apply'].map((item, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-white/20" />
              {item}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
