'use client'

import { motion } from 'framer-motion'

const metrics = [
  { value: '150+', label: 'Active clients', sub: 'across Europe' },
  { value: '1M+', label: 'AI conversations', sub: 'handled monthly' },
  { value: '<3s', label: 'Response time', sub: 'average across channels' },
  { value: '15+', label: 'Languages', sub: 'supported natively' },
  { value: '4.9★', label: 'Client rating', sub: 'average across all plans' },
  { value: '72h', label: 'Time to live', sub: 'from sign-up to deployed' },
]

const industries = [
  'Medical Clinics', 'Law Firms', 'Real Estate', 'Home Services',
  'Fitness Studios', 'Beauty Salons', 'E-commerce', 'Dental Practices',
]

export default function TrustedBy() {
  return (
    <section className="relative py-20 overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 border-y border-white/[0.04]" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-950/10 to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <p className="text-xs font-semibold tracking-widest uppercase text-white/25 mb-1">
            Trusted by modern businesses
          </p>
          <p className="text-white/40 text-sm">
            From solo operators to multi-location enterprises — across Poland, UK, Germany, and beyond.
          </p>
        </motion.div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-white/[0.04] rounded-2xl overflow-hidden mb-10">
          {metrics.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="flex flex-col items-center py-7 px-4 bg-[#080807] hover:bg-white/[0.02] transition-colors"
            >
              <span className="text-2xl md:text-3xl font-black text-white mb-1">{m.value}</span>
              <span className="text-xs font-semibold text-white/50 mb-0.5">{m.label}</span>
              <span className="text-[10px] text-white/20 text-center">{m.sub}</span>
            </motion.div>
          ))}
        </div>

        {/* Industry scroll strip */}
        <div className="flex flex-wrap justify-center gap-2">
          {industries.map((industry, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
              className="text-xs px-3 py-1.5 rounded-full border border-white/[0.07] text-white/30 bg-white/[0.02]"
            >
              {industry}
            </motion.span>
          ))}
        </div>
      </div>
    </section>
  )
}
