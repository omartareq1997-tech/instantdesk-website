'use client'

import { motion } from 'framer-motion'
import { ArrowRight, Phone, Sparkles } from 'lucide-react'
import { channels } from './ChannelIcons'
import { useDemoModal } from '../context/DemoModal'

export default function CTA() {
  const { open: openDemo } = useDemoModal()
  return (
    <section id="demo" className="relative py-32 overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative rounded-[2rem] overflow-hidden"
        >
          {/* Layered background */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #1e0a3c 0%, #0f1e5c 50%, #061030 100%)' }} />
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage: `
                linear-gradient(rgba(139,92,246,0.08) 1px, transparent 1px),
                linear-gradient(90deg, rgba(139,92,246,0.08) 1px, transparent 1px)
              `,
              backgroundSize: '48px 48px',
            }}
          />
          {/* Glow orbs */}
          <div className="absolute -top-24 left-1/4 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(139,92,246,0.18)' }} />
          <div className="absolute -bottom-24 right-1/4 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(37,99,235,0.18)' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-2xl max-h-64 rounded-full blur-3xl opacity-20" style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,0.6), transparent)' }} />
          {/* Border */}
          <div className="absolute inset-0 rounded-[2rem]" style={{ border: '1px solid rgba(139,92,246,0.25)' }} />

          <div className="relative px-8 md:px-16 py-20 text-center">
            {/* Icon */}
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="inline-flex w-16 h-16 rounded-2xl items-center justify-center mb-8 mx-auto"
              style={{
                background: 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(37,99,235,0.3))',
                border: '1px solid rgba(139,92,246,0.4)',
              }}
            >
              <Sparkles className="w-7 h-7 text-violet-300" />
            </motion.div>

            <motion.span
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.15 }}
              className="inline-block text-xs font-bold tracking-[0.2em] uppercase text-violet-400 mb-6"
            >
              Ready to transform your business?
            </motion.span>

            <motion.h2
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2, duration: 0.7 }}
              className="text-4xl md:text-6xl font-black text-white mb-6 leading-[1.05]"
            >
              Stop losing leads.
              <br />
              <span className="text-gradient">Your AI is ready to go.</span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.28 }}
              className="text-lg md:text-xl text-white/45 max-w-2xl mx-auto mb-8 leading-relaxed"
            >
              Join 150+ businesses running 24/7 AI agents on every channel — replying instantly, capturing leads, booking appointments, and syncing their CRM while they sleep.
            </motion.p>

            {/* Channel strip */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.35 }}
              className="flex flex-wrap items-center justify-center gap-2 mb-12"
            >
              {channels.map((channel, i) => {
                const Icon = channel.Icon
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-semibold"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: channel.color,
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {channel.name}
                  </div>
                )
              })}
              <div className="px-3.5 py-1.5 rounded-full text-[11px] font-semibold text-white/25"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                All channels live in 72h
              </div>
            </motion.div>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <button
                onClick={() => openDemo('cta')}
                className="group relative flex items-center gap-3 px-10 py-5 rounded-xl font-bold text-base text-gray-900 bg-white hover:bg-white/90 transition-all duration-300 shadow-2xl hover:-translate-y-0.5 hover:shadow-white/20 overflow-hidden"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-black/5 to-transparent -skew-x-12 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
                Get Personalized Demo
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <a
                href="tel:+48000000000"
                className="group flex items-center gap-3 px-10 py-5 rounded-xl font-bold text-base text-white/80 hover:text-white transition-all duration-300 hover:-translate-y-0.5"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.13)' }}
              >
                <Phone className="w-4 h-4 group-hover:text-violet-300 transition-colors" />
                Book a Call
              </a>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 }}
              className="text-xs text-white/20 mt-8"
            >
              Free strategy call &nbsp;·&nbsp; No commitment &nbsp;·&nbsp; Live in 72 hours &nbsp;·&nbsp; All 5 channels included in Growth
            </motion.p>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
