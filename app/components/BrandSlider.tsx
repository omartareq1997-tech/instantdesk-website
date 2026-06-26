'use client'

import { motion } from 'framer-motion'

const ROW_ONE = [
  { name: 'Shopify',      init: 'S',   color: '#96bf48' },
  { name: 'WordPress',    init: 'WP',  color: '#21759b' },
  { name: 'Wix',          init: 'Wx',  color: '#faad00' },
  { name: 'Squarespace',  init: 'Sq',  color: '#a0a0a0' },
  { name: 'Hostinger',    init: 'H',   color: '#673de6' },
  { name: 'GoDaddy',      init: 'GD',  color: '#1bdbdb' },
  { name: 'WooCommerce',  init: 'WC',  color: '#96588a' },
  { name: 'Webflow',      init: 'Wf',  color: '#4353ff' },
]

const ROW_TWO = [
  { name: 'Instagram',      init: 'Ig',  color: '#e1306c' },
  { name: 'WhatsApp',       init: 'WA',  color: '#25d366' },
  { name: 'Google Calendar',init: 'GC',  color: '#4285f4' },
  { name: 'Gmail',          init: 'Gm',  color: '#d44638' },
  { name: 'Shopify',        init: 'S',   color: '#96bf48' },
  { name: 'WordPress',      init: 'WP',  color: '#21759b' },
  { name: 'Webflow',        init: 'Wf',  color: '#4353ff' },
  { name: 'Wix',            init: 'Wx',  color: '#faad00' },
]

function BrandCard({ name, init, color }: { name: string; init: string; color: string }) {
  return (
    <div
      className="flex items-center gap-2.5 px-5 py-3 rounded-xl mx-3 flex-shrink-0 select-none"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border:     '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black flex-shrink-0"
        style={{ background: `${color}22`, color }}
      >
        {init}
      </div>
      <span className="text-sm font-semibold text-white/38 whitespace-nowrap">{name}</span>
    </div>
  )
}

function MarqueeRow({
  items,
  reverse = false,
}: {
  items: typeof ROW_ONE
  reverse?: boolean
}) {
  const doubled = [...items, ...items]
  return (
    <div className="overflow-hidden pause-on-hover">
      <div className={reverse ? 'animate-marquee-reverse' : 'animate-marquee'}>
        {doubled.map((b, i) => (
          <BrandCard key={`${b.name}-${i}`} {...b} />
        ))}
      </div>
    </div>
  )
}

export default function BrandSlider() {
  return (
    <section className="relative py-16 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 border-y border-white/[0.04]" />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(244,122,99,0.04) 0%, transparent 70%)',
          }}
        />
      </div>

      {/* Heading */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5 }}
        className="text-center mb-10 px-6"
      >
        <p className="text-xs font-semibold tracking-widest uppercase text-white/25 mb-2">
          Works everywhere
        </p>
        <h2 className="text-lg font-bold text-white/70">
          Trusted by businesses across industries
        </h2>
      </motion.div>

      {/* Rows */}
      <div className="flex flex-col gap-3">
        <MarqueeRow items={ROW_ONE} />
        <MarqueeRow items={ROW_TWO} reverse />
      </div>

      {/* Fade edges */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-28 z-10"
        style={{ background: 'linear-gradient(to right, #080807 0%, transparent 100%)' }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-28 z-10"
        style={{ background: 'linear-gradient(to left, #080807 0%, transparent 100%)' }}
      />
    </section>
  )
}
