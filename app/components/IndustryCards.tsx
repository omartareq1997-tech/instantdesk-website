'use client'

import { motion } from 'framer-motion'
import { Stethoscope, Wrench, Scale, Home, Scissors, Dumbbell } from 'lucide-react'

const industries = [
  {
    icon: Stethoscope,
    name: 'Healthcare & Clinics',
    headline: 'Reduce no-shows by 60%',
    description: 'AI receptionist handles appointment booking, reminders, and patient FAQs around the clock.',
    metrics: [
      { value: '60%', label: 'Fewer no-shows' },
      { value: '3×', label: 'More bookings' },
    ],
    color: 'from-blue-500 to-cyan-400',
    bg: 'rgba(59, 130, 246, 0.05)',
    border: 'rgba(59, 130, 246, 0.15)',
  },
  {
    icon: Wrench,
    name: 'Trades & Home Services',
    headline: 'Capture every inbound lead',
    description: 'Automated follow-ups, quote requests, and job scheduling — even when your crew is on-site.',
    metrics: [
      { value: '100%', label: 'Lead capture' },
      { value: '2h', label: 'Avg response time ↓' },
    ],
    color: 'from-orange-500 to-amber-400',
    bg: 'rgba(249, 115, 22, 0.05)',
    border: 'rgba(249, 115, 22, 0.15)',
  },
  {
    icon: Scale,
    name: 'Law Firms',
    headline: 'Pre-qualify leads 24/7',
    description: 'AI intake forms, document collection triggers, and CRM sync — so attorneys focus on billable work.',
    metrics: [
      { value: '5×', label: 'Faster intake' },
      { value: '40%', label: 'Admin time saved' },
    ],
    color: 'from-violet-500 to-purple-400',
    bg: 'rgba(139, 92, 246, 0.05)',
    border: 'rgba(139, 92, 246, 0.15)',
  },
  {
    icon: Home,
    name: 'Real Estate',
    headline: 'Never lose a hot lead',
    description: 'Instant follow-up the moment a lead inquires — property info, viewings booked, CRM updated.',
    metrics: [
      { value: '10min', label: 'Response in 10 min' },
      { value: '28%', label: 'More showings' },
    ],
    color: 'from-emerald-500 to-teal-400',
    bg: 'rgba(16, 185, 129, 0.05)',
    border: 'rgba(16, 185, 129, 0.15)',
  },
  {
    icon: Scissors,
    name: 'Salons & Spas',
    headline: 'Fill your calendar on autopilot',
    description: 'Booking chatbot, appointment reminders, re-engagement campaigns, and review collection — automated.',
    metrics: [
      { value: '95%', label: 'Booking fill rate' },
      { value: '4.8★', label: 'Avg review score' },
    ],
    color: 'from-pink-500 to-rose-400',
    bg: 'rgba(236, 72, 153, 0.05)',
    border: 'rgba(236, 72, 153, 0.15)',
  },
  {
    icon: Dumbbell,
    name: 'Fitness & Wellness',
    headline: 'Convert trials into members',
    description: 'AI nurture sequences, class reminders, and membership renewal flows that run themselves.',
    metrics: [
      { value: '3×', label: 'Trial conversion' },
      { value: '80%', label: 'Renewal rate' },
    ],
    color: 'from-yellow-500 to-orange-400',
    bg: 'rgba(234, 179, 8, 0.05)',
    border: 'rgba(234, 179, 8, 0.15)',
  },
]

export default function IndustryCards() {
  return (
    <section id="industries" className="relative py-32 overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-violet-950/20 to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <span className="inline-block text-xs font-semibold tracking-widest uppercase text-violet-400 mb-4">
            Built for your industry
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-5 leading-tight">
            Proven results across{' '}
            <span className="text-gradient">every vertical</span>
          </h2>
          <p className="text-lg text-white/40 max-w-xl mx-auto">
            InstantDesk adapts to how your business actually works — no generic templates.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {industries.map((industry, i) => {
            const Icon = industry.icon
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.5, delay: i * 0.07 }}
                whileHover={{ y: -8, transition: { duration: 0.25 } }}
                className="group relative rounded-2xl p-7 overflow-hidden cursor-default"
                style={{
                  background: industry.bg,
                  border: `1px solid ${industry.border}`,
                }}
              >
                {/* Corner gradient */}
                <div
                  className="absolute top-0 right-0 w-48 h-48 opacity-10 group-hover:opacity-20 transition-opacity duration-500"
                  style={{
                    background: `radial-gradient(circle at top right, ${industry.border.replace('0.15', '1')}, transparent 70%)`,
                  }}
                />

                <div className={`inline-flex w-12 h-12 rounded-xl bg-gradient-to-br ${industry.color} items-center justify-center mb-5 shadow-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>

                <div className="text-xs font-semibold tracking-widest uppercase text-white/30 mb-1">
                  {industry.name}
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{industry.headline}</h3>
                <p className="text-sm text-white/50 leading-relaxed mb-6">{industry.description}</p>

                <div className="flex gap-6 pt-5 border-t border-white/5">
                  {industry.metrics.map((m, j) => (
                    <div key={j}>
                      <div className={`text-2xl font-black bg-gradient-to-br ${industry.color} bg-clip-text text-transparent`}>
                        {m.value}
                      </div>
                      <div className="text-xs text-white/30 mt-0.5">{m.label}</div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
