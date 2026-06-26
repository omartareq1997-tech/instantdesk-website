'use client'

import { motion } from 'framer-motion'
import { Upload, Cpu, Code2, ArrowRight } from 'lucide-react'
import { useDemoModal } from '../context/DemoModal'

/* ── Platform cards ──────────────────────────────────────────── */

const PLATFORMS = [
  { name: 'Shopify',     init: 'S',   color: '#96bf48' },
  { name: 'WordPress',   init: 'WP',  color: '#21759b' },
  { name: 'Wix',         init: 'Wx',  color: '#faad00' },
  { name: 'Webflow',     init: 'Wf',  color: '#4353ff' },
  { name: 'Squarespace', init: 'Sq',  color: '#a0a0a0' },
  { name: 'Custom site', init: '∞',   color: '#f8a36d' },
]

/* ── Steps ────────────────────────────────────────────────────── */

const STEPS = [
  {
    number: '01',
    Icon: Upload,
    title: 'Connect your website or upload business info',
    desc: 'Paste your website URL or upload your FAQs, services, and pricing. InstantDesk reads your content and prepares your AI automatically.',
    color: '#f8a36d',
    glow: 'rgba(244,122,99,0.15)',
  },
  {
    number: '02',
    Icon: Cpu,
    title: 'Train your AI receptionist',
    desc: 'Review responses, set the tone and personality, define lead capture rules, and configure booking or enquiry flows — all from your dashboard.',
    color: '#948f88',
    glow: 'rgba(148,145,140,0.15)',
  },
  {
    number: '03',
    Icon: Code2,
    title: 'Add one line of code and go live',
    desc: 'Copy a single embed snippet into your site — no developer needed. Your AI receptionist is live and capturing leads within minutes.',
    color: '#34d399',
    glow: 'rgba(52,211,153,0.15)',
  },
]

/* ── Component ────────────────────────────────────────────────── */

export default function WebsiteIntegration() {
  const { open: openDemo } = useDemoModal()

  return (
    <section className="relative py-24 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(244,122,99,0.07) 0%, transparent 70%)',
          }}
        />
        <div className="absolute inset-0 border-t border-white/[0.04]" />
      </div>

      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.55 }}
          className="text-center mb-14"
        >
          <p className="text-xs font-semibold tracking-widest uppercase text-white/25 mb-4">
            Zero-friction setup
          </p>
          <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-4">
            Add your AI receptionist{' '}
            <span
              style={{
                background: 'linear-gradient(135deg,#f47a63,#948f88)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              to any website
            </span>
          </h2>
          <p className="text-white/45 text-base max-w-xl mx-auto leading-relaxed">
            Install InstantDesk on Shopify, WordPress, Wix, Webflow, custom websites
            and more with one simple embed.
          </p>
        </motion.div>

        {/* Platform grid */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex flex-wrap justify-center gap-3 mb-16"
        >
          {PLATFORMS.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.06 }}
              className="flex items-center gap-2.5 px-5 py-3 rounded-2xl"
              style={{
                background: `${p.color}0d`,
                border: `1px solid ${p.color}28`,
              }}
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black flex-shrink-0"
                style={{ background: `${p.color}22`, color: p.color }}
              >
                {p.init}
              </div>
              <span className="text-sm font-semibold" style={{ color: `${p.color}cc` }}>
                {p.name}
              </span>
            </motion.div>
          ))}
        </motion.div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="relative rounded-2xl p-6 flex flex-col gap-4"
              style={{
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              {/* Step number */}
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: step.glow, border: `1px solid ${step.color}30` }}
                >
                  <step.Icon className="w-4 h-4" style={{ color: step.color }} />
                </div>
                <span
                  className="text-xs font-black tracking-widest"
                  style={{ color: `${step.color}80` }}
                >
                  STEP {step.number}
                </span>
              </div>

              {/* Connector line — hidden on last */}
              {i < STEPS.length - 1 && (
                <div
                  className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-px z-10"
                  style={{
                    background: `linear-gradient(to right, ${step.color}40, transparent)`,
                  }}
                />
              )}

              <h3 className="text-sm font-bold text-white leading-snug">{step.title}</h3>
              <p className="text-xs text-white/40 leading-relaxed">{step.desc}</p>

              {/* Bottom accent */}
              <div
                className="absolute bottom-0 left-6 right-6 h-px rounded-full"
                style={{
                  background: `linear-gradient(to right, transparent, ${step.color}30, transparent)`,
                }}
              />
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="flex flex-col items-center gap-4"
        >
          <motion.button
            onClick={() => openDemo('general')}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="group relative inline-flex items-center gap-2.5 px-8 py-4 rounded-xl text-sm font-bold text-white overflow-hidden"
            style={{
              background: 'linear-gradient(135deg,#171412 0%,#f47a63 50%,#f89a57 100%)',
              boxShadow: '0 8px 32px rgba(244,122,99,0.4)',
            }}
          >
            <span
              className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                background:
                  'linear-gradient(105deg,transparent 30%,rgba(255,255,255,0.12) 50%,transparent 70%)',
              }}
            />
            Book setup demo
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </motion.button>
          <p className="text-xs text-white/20">
            Free 30-minute setup call · No credit card required
          </p>
        </motion.div>
      </div>
    </section>
  )
}
