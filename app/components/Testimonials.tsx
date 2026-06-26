'use client'

import { motion } from 'framer-motion'
import { Star, Quote } from 'lucide-react'

const testimonials = [
  {
    name: 'Marcus Kowalski',
    role: 'Owner',
    company: 'Warsaw Dental Clinic',
    avatar: 'MK',
    stars: 5,
    quote:
      'We were losing 30–40 leads a week just because our front desk was overloaded. InstantDesk set up an AI receptionist that books appointments around the clock. Our revenue went up 22% in the first 2 months.',
    metric: '+22% Revenue',
    color: 'from-stone-500 to-orange-400',
  },
  {
    name: 'Anna Wróblewska',
    role: 'Director',
    company: 'Elite Real Estate PL',
    avatar: 'AW',
    stars: 5,
    quote:
      'Every lead now gets a response in under 10 minutes, 24/7. The WhatsApp automation follows up automatically. We went from closing 3 deals/month to 7 deals/month. Insane ROI.',
    metric: '2.3× More Deals',
    color: 'from-emerald-500 to-teal-400',
  },
  {
    name: 'Piotr Nowak',
    role: 'Founder',
    company: 'ProFit Gym Chain',
    avatar: 'PN',
    stars: 5,
    quote:
      'The chatbot converts trial inquiries into memberships automatically. We used to manually follow up every lead — now the system does it. 3× better trial-to-member conversion in 6 weeks.',
    metric: '3× Trial Conversion',
    color: 'from-orange-500 to-amber-400',
  },
  {
    name: 'Katarzyna Maj',
    role: 'Partner',
    company: 'Maj & Partners Law',
    avatar: 'KM',
    stars: 5,
    quote:
      'Our intake process was a bottleneck. InstantDesk automated pre-qualification, document collection, and CRM sync. We saved 15 hours/week of admin and closed 40% more cases.',
    metric: '40% More Cases',
    color: 'from-orange-500 to-orange-400',
  },
  {
    name: 'Tomasz Bielski',
    role: 'CEO',
    company: 'Bielski HVAC Services',
    avatar: 'TB',
    stars: 5,
    quote:
      'We were missing calls constantly while on jobs. Now the AI handles everything — quotes, scheduling, follow-ups. We look like a 20-person operation but we\'re still a team of 5.',
    metric: '100% Lead Capture',
    color: 'from-pink-500 to-rose-400',
  },
  {
    name: 'Magdalena Szymańska',
    role: 'Owner',
    company: 'Glow Beauty Studio',
    avatar: 'MS',
    stars: 5,
    quote:
      'The booking chatbot and review automation changed everything. Our Google reviews went from 4.1 to 4.8 in 3 months and we\'re fully booked 3 weeks ahead. Absolutely worth it.',
    metric: '4.1→4.8 Google Rating',
    color: 'from-yellow-500 to-orange-400',
  },
]

export default function Testimonials() {
  return (
    <section id="testimonials" className="relative py-32 overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full bg-orange-900/15 blur-3xl" />
        <div className="absolute top-20 right-0 w-72 h-72 rounded-full bg-stone-900/15 blur-3xl" />
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
            Client results
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-5 leading-tight">
            Real businesses,{' '}
            <span className="text-gradient">real results</span>
          </h2>
          <p className="text-lg text-white/40 max-w-xl mx-auto">
            Don&apos;t take our word for it — here&apos;s what clients say after 90 days with InstantDesk.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {testimonials.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: i * 0.07 }}
              whileHover={{ y: -6, transition: { duration: 0.2 } }}
              className="glass-card rounded-2xl p-7 flex flex-col gap-5 group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${t.color} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                    {t.avatar}
                  </div>
                  <div>
                    <div className="font-bold text-white text-sm">{t.name}</div>
                    <div className="text-xs text-white/35">{t.role} · {t.company}</div>
                  </div>
                </div>
                <Quote className="w-5 h-5 text-orange-500/50 flex-shrink-0" />
              </div>

              <div className="flex gap-0.5">
                {Array.from({ length: t.stars }).map((_, j) => (
                  <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>

              <p className="text-sm text-white/60 leading-relaxed flex-1">
                &ldquo;{t.quote}&rdquo;
              </p>

              <div className={`inline-flex self-start px-3 py-1.5 rounded-lg bg-gradient-to-r ${t.color} bg-opacity-10`}>
                <span className="text-xs font-bold text-white">{t.metric}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
