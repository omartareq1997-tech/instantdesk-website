'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  Bot,
  CalendarCheck,
  Check,
  ClipboardList,
  Menu,
  MessageCircle,
  MessagesSquare,
  Sheet,
  Sparkles,
  Star,
  ThumbsUp,
  X,
} from 'lucide-react'
import { useDemoModal } from '../context/DemoModal'

const logoMark = '/assets/instantdesk-logo.png'
const contactEmail = 'contact@instantdesk.pl'

const assetSlots = {
  heroVideo: '/assets/hero-video.mp4',
  heroImage: '/assets/hero-image.webp',
  customer1: '/assets/customer-1.webp',
  customer2: '/assets/customer-2.webp',
  customer3: '/assets/customer-3.webp',
}

const navLinks = [
  { label: 'Features', href: '/#features' },
  { label: 'Solutions', href: '/#interactive-demo' },
  { label: 'Resources', href: '/#pricing' },
  { label: 'Company', href: '/#demo' },
]

const signupHref = '/login?mode=signup'

const builtForMarquee = [
  'Dental clinics',
  'Beauty salons',
  'Real estate agencies',
  'Home services',
  'Local clinics',
  'Auto services',
  'Fitness studios',
  'Professional services',
]

const featureCards = [
  {
    title: 'Website Chat',
    copy: 'A premium website chat experience that answers questions, captures intent, and routes people to the next step.',
    icon: MessagesSquare,
  },
  {
    title: 'Live Chat',
    copy: 'Your team can jump into any conversation with full context when a lead needs a human response.',
    icon: MessageCircle,
    featured: true,
  },
  {
    title: 'Lead Capture',
    copy: 'Collect name, phone, email, service interest, location, budget, timing, and consent in a clean flow.',
    icon: ClipboardList,
  },
  {
    title: 'Google Sheet CRM',
    copy: 'Every qualified lead is written into a simple Google Sheet CRM your team can use immediately.',
    icon: Sheet,
  },
  {
    title: 'SMS Follow-Up',
    copy: 'Send timely SMS follow-ups when a lead does not book, confirm, or respond after the first conversation.',
    icon: CalendarCheck,
  },
  {
    title: 'Review Requests',
    copy: 'Ask happy customers for reviews after visits, jobs, or appointments without adding staff admin work.',
    icon: ThumbsUp,
  },
]

const features = [
  {
    title: 'Start with live chat',
    copy: 'Install a polished website chat widget so visitors can ask questions while your team sees every conversation in one place.',
  },
  {
    title: 'Capture leads cleanly',
    copy: 'Collect the fields your business needs, then send qualified leads into Google Sheets with the source and conversation summary.',
  },
  {
    title: 'Follow up automatically',
    copy: 'Use SMS reminders and follow-up messages so interested visitors do not disappear after the first chat.',
  },
  {
    title: 'Keep humans in control',
    copy: 'Your team can take over live conversations, mark status, review activity, and improve responses over time.',
  },
]

const industries = [
  { label: 'Dental Clinics', metric: 'New-patient questions answered before reception opens', slot: assetSlots.customer1, size: 'lg:col-span-2 lg:row-span-2' },
  { label: 'Beauty Salons', metric: 'Pricing and availability captured from website visitors', slot: assetSlots.customer2, size: '' },
  { label: 'Real Estate', metric: 'Buyer and seller inquiries qualified by location and budget', slot: assetSlots.customer3, size: '' },
  { label: 'Home Services', metric: 'Urgent job requests routed with contact details', slot: assetSlots.heroImage, size: '' },
  { label: 'Local Clinics', metric: 'Appointment intent and contact details organized', slot: assetSlots.customer1, size: '' },
]

const workflow = [
  ['01', 'Map your front desk', 'We review your calls, website, social messages, FAQs, booking rules, handoffs, and CRM fields.'],
  ['02', 'Build your AI desk', 'We train the agent on your services, tone, policies, prices, channels, and scheduling logic.'],
  ['03', 'Launch and tune', 'Your AI goes live, then we tune answers and automations against real conversion data.'],
]

const pricing = [
  {
    name: 'Starter',
    price: 'From 499 zł/mo',
    desc: 'Basic AI bot, FAQ, lead capture, live chat, and human handover for local businesses.',
    cta: 'Get started',
    features: [
      'Website AI chat and FAQ answers',
      'Lead capture forms',
      'Email notifications',
      'Live chat inbox',
      'Human handover',
      '1 business knowledge base',
      'Monthly tuning/checkup',
    ],
  },
  {
    name: 'Pro',
    price: 'From 899 zł/mo',
    desc: 'Sales assistant workflows for booking requests, CRM capture, and follow-up.',
    cta: 'Book demo',
    badge: 'Popular',
    features: [
      'Everything in Starter',
      'Booking request intake',
      'Google Sheet CRM dashboard',
      'SMS follow-up',
      'Review request automation',
      'Smart lead scoring',
      'Multilingual replies',
      'Priority setup/tuning',
    ],
  },
  {
    name: 'Operations',
    price: 'Custom',
    desc: 'Workflow automation for rental, scheduling, documents, payments, PDFs, and extensions.',
    cta: 'Plan operations',
    badge: 'Workflow automation',
    features: [
      'Everything in Pro',
      'Fleet or resource calendar',
      'Availability checks with buffers',
      'Document collection workflow',
      'Payment link placeholders',
      'Confirmation PDFs',
      'Booking extensions',
      'Operational handover rules',
    ],
  },
  {
    name: 'Custom',
    price: 'Custom',
    desc: 'External API integrations, multi-location operations, and advanced workflows.',
    cta: 'Contact sales',
    features: [
      'Everything in Operations',
      'Multi-location workflows',
      'Advanced routing',
      'External booking/calendar APIs',
      'Multiple channels',
      'Advanced reporting',
      'Team access',
      'Custom automation logic',
    ],
  },
]

const comparisonRows = [
  ['Website AI chat', 'Included', 'Included', 'Included', 'Included'],
  ['Live chat inbox', 'Included', 'Advanced', 'Advanced', 'Advanced'],
  ['Human handover', 'Included', 'Included', 'Included', 'Included'],
  ['Lead capture', 'Included', 'Included', 'Included', 'Included'],
  ['Google Sheet CRM', 'Basic', 'Dashboard', 'Dashboard', 'Custom'],
  ['Booking requests', '—', 'Included', 'Included', 'Included'],
  ['SMS follow-up', '—', 'Included', 'Included', 'Included'],
  ['Review requests', '—', 'Included', 'Included', 'Included'],
  ['Availability checks', '—', '—', 'Included', 'Included'],
  ['Fleet/resource calendar', '—', '—', 'Included', 'Included'],
  ['Documents and OCR layer', '—', '—', 'Included', 'Included'],
  ['Confirmation PDFs', '—', '—', 'Included', 'Included'],
  ['External API integrations', '—', '—', '—', 'Included'],
  ['Multi-location support', '—', '—', 'Optional', 'Included'],
]

const demos = ['Real Estate', 'Schools', 'Clinics', 'Restaurants', 'Salons', 'Car Dealers']

const footerColumns = [
  ['Products', 'AI Receptionist', 'Website Chat', 'Live Chat', 'Lead Capture', 'Google Sheet CRM', 'SMS Follow-Up', 'Review Requests', 'Human Handover'],
  ['Business Types', 'Dental Clinics', 'Beauty Salons', 'Real Estate Agencies', 'Schools', 'Home Services', 'Local Clinics', 'Auto Services', 'Car Rental Companies'],
  ['Resources', 'Pricing', 'Website Design', 'Small Business Live Chat', 'Google Sheet CRM Automation', 'SMS Follow-Up Automation', 'Google Reviews Automation', 'Human Handover', 'Demo'],
  ['Company', 'About', 'Contact', 'Privacy', 'Terms', 'Client Login'],
]

const megaMenus = {
  Features: [
    ['AI Receptionist', '/ai-receptionist'],
    ['Website Chatbot', '/website-chatbot'],
    ['Live Chat', '/live-chat-for-small-businesses'],
    ['Lead Capture', '/lead-capture'],
    ['Google Sheet CRM', '/google-sheets-crm-automation'],
    ['SMS Follow-Up', '/sms-follow-up-automation'],
    ['Review Requests', '/review-requests'],
    ['Human Handover', '/human-handover-live-chat'],
    ['Multilingual Replies', '/#features'],
  ],
  Solutions: [
    ['Dental Clinics', '/ai-chatbot-for-dental-clinics'],
    ['Beauty Salons', '/ai-chatbot-for-beauty-salons'],
    ['Real Estate Agencies', '/ai-chatbot-for-real-estate-agencies'],
    ['Schools', '/ai-chatbot-for-schools'],
    ['Car Rental Companies', '/ai-assistant-for-car-rental-companies'],
    ['Auto Dealers & Rentals', '/auto-services'],
    ['Home Services', '/home-services'],
    ['Restaurants', '/#interactive-demo'],
    ['Local Service Businesses', '/website-design-for-local-businesses'],
  ],
  Resources: [
    ['Pricing', '/#pricing'],
    ['Why InstantDesk', '/#testimonials'],
    ['Demo', '/#demo'],
    ['Support', `mailto:${contactEmail}`],
    ['Partner Program', `mailto:${contactEmail}`],
    ['Automation Audit', '/#demo'],
  ],
  Company: [
    ['About', '/#testimonials'],
    ['Contact', `mailto:${contactEmail}`],
    ['Privacy', '/privacy'],
    ['Terms', '/terms'],
    ['Client Login', '/client-login'],
  ],
} satisfies Record<string, [string, string][]>

type MegaMenuKey = keyof typeof megaMenus

function footerHref(item: string) {
  if (item === 'Pricing') return '/#pricing'
  if (item === 'Contact') return `mailto:${contactEmail}`
  if (item === 'Demo' || item === 'Automation Audit') return '/#demo'
  if (item === 'Client Login') return '/client-login'
  if (item === 'Privacy') return '/privacy'
  if (item === 'Terms') return '/terms'
  if (['Why us?', 'Support', 'Partner Program', 'About', 'Careers'].includes(item)) return '/#testimonials'
  if (item === 'Website Design') return '/website-design-for-local-businesses'
  if (item === 'Small Business Live Chat') return '/live-chat-for-small-businesses'
  if (item === 'Google Reviews Automation') return '/google-reviews-automation'
  if (item === 'Review Requests') return '/review-requests'
  if (item === 'AI Receptionist') return '/ai-receptionist'
  if (item === 'Website Chat') return '/website-chatbot'
  if (item === 'Lead Capture') return '/lead-capture'
  if (item === 'Google Sheet CRM Automation') return '/google-sheets-crm-automation'
  if (item === 'SMS Follow-Up Automation') return '/sms-follow-up-automation'
  if (item === 'Human Handover') return '/human-handover-live-chat'
  if (item === 'Google Sheet CRM') return '/google-sheets-crm-automation'
  if (item === 'SMS Follow-Up') return '/sms-follow-up-automation'
  if (item === 'Live Chat') return '/live-chat-for-small-businesses'
  if (item === 'Dental Clinics') return '/ai-chatbot-for-dental-clinics'
  if (item === 'Beauty Salons') return '/ai-chatbot-for-beauty-salons'
  if (item === 'Real Estate Agencies') return '/ai-chatbot-for-real-estate-agencies'
  if (item === 'Schools') return '/ai-chatbot-for-schools'
  if (item === 'Home Services') return '/home-services'
  if (item === 'Auto Services') return '/auto-services'
  if (item === 'Car Rental Companies') return '/ai-assistant-for-car-rental-companies'
  if (item === 'Local Clinics') return '/#interactive-demo'
  return '/#features'
}

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.36, delay, ease: [0.25, 0.1, 0.25, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function Header() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [activeMenu, setActiveMenu] = useState<MegaMenuKey | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { open: openDemo } = useDemoModal()
  const activeMenuItems = activeMenu ? megaMenus[activeMenu] : null
  const hasActiveMenu = Boolean(activeMenu && activeMenuItems?.length)
  const solidHeader = scrolled || open || hasActiveMenu

  function clearCloseTimer() {
    if (!closeTimer.current) return
    clearTimeout(closeTimer.current)
    closeTimer.current = null
  }

  function openMenu(menu: MegaMenuKey) {
    const items = megaMenus[menu]
    if (!items?.length) return
    clearCloseTimer()
    setActiveMenu(menu)
  }

  function closeMenu() {
    clearCloseTimer()
    closeTimer.current = setTimeout(() => setActiveMenu(null), 120)
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      clearCloseTimer()
    }
  }, [])

  return (
    <header
      onMouseLeave={closeMenu}
      onMouseEnter={clearCloseTimer}
      className={`fixed inset-x-0 top-0 z-50 text-[#0b0b0b] transition-all duration-300 ${
        solidHeader
          ? 'bg-white/70 shadow-[0_16px_45px_rgba(0,0,0,0.08)] backdrop-blur-2xl'
          : 'bg-transparent shadow-none backdrop-blur-0'
      }`}
    >
      <nav className="relative mx-auto flex h-[72px] max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-10" aria-label="Primary">
        <Link href="/" className="flex items-center gap-3">
          <img src={logoMark} alt="InstantDesk" className="h-8 w-auto" />
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map(link => (
            <a
              key={link.href}
              href={link.href}
              onMouseEnter={() => openMenu(link.label as MegaMenuKey)}
              onFocus={() => openMenu(link.label as MegaMenuKey)}
              className={`text-[15px] font-medium transition-colors ${
                solidHeader ? 'text-black/68 hover:text-black' : 'text-white/82 hover:text-white'
              }`}
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/client-login"
            className={`rounded-full px-3 py-2.5 text-[15px] font-medium transition-colors ${
              solidHeader ? 'text-black/68 hover:text-black' : 'text-white/82 hover:text-white'
            }`}
          >
            Log in
          </Link>
          <Link
            href={signupHref}
            className={`rounded-full border px-5 py-2.5 text-[15px] font-medium transition-all duration-200 ${
              solidHeader
                ? 'border-black/12 text-black/72 hover:border-black/24 hover:bg-black/[0.035] hover:text-black'
                : 'border-white/24 text-white/86 hover:border-white/38 hover:bg-white/10 hover:text-white'
            }`}
          >
            Sign Up
          </Link>
          <button
            onClick={() => openDemo('navbar')}
            className={`group rounded-full px-6 py-2.5 text-[15px] font-semibold transition-all duration-200 ${
              solidHeader
                ? 'bg-black text-white hover:bg-[#222]'
                : 'bg-white text-black hover:bg-[#f5f0ea]'
            }`}
          >
            Get Demo <span className="ml-1 text-[#f47a63] transition-transform duration-200 group-hover:inline-block group-hover:translate-x-0.5">→</span>
          </button>
        </div>

        <button
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen(value => !value)}
          className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors md:hidden ${
            solidHeader ? 'border border-black/12 text-black' : 'border border-white/24 text-white'
          }`}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-[72px] bg-white/92 px-4 py-5 shadow-[0_24px_60px_rgba(0,0,0,0.14)] backdrop-blur-2xl md:hidden">
            <div className="flex flex-col gap-3">
              {navLinks.map(link => (
                <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="py-2 text-lg font-medium text-black/75">
                  {link.label}
                </a>
              ))}
              <Link href="/client-login" onClick={() => setOpen(false)} className="py-2 text-lg font-medium text-black/60">
                Log in
              </Link>
              <Link href={signupHref} onClick={() => setOpen(false)} className="rounded-full border border-black/12 px-5 py-2.5 text-center text-[15px] font-medium text-black/72 transition-colors hover:bg-black/[0.035]">
                Sign Up
              </Link>
              <button
                onClick={() => {
                  openDemo('navbar')
                  setOpen(false)
                }}
                className="mt-2 rounded-full bg-black px-5 py-2.5 text-[15px] font-semibold text-white"
              >
                Get Personalized Demo
              </button>
            </div>
          </div>
        )}
      </nav>

      <AnimatePresence>
        {activeMenu && activeMenuItems && activeMenuItems.length > 0 && (
          <motion.div
            key="mega-menu"
            onMouseEnter={clearCloseTimer}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.14, ease: [0.25, 0.1, 0.25, 1] }}
            className="hidden bg-white/90 shadow-[0_28px_70px_rgba(0,0,0,0.10)] backdrop-blur-2xl md:block"
          >
            <div className="mx-auto grid max-w-[1600px] grid-cols-[0.7fr_1.3fr] gap-12 px-10 py-8">
              <div>
                <p className="font-mono text-[11px] font-black uppercase tracking-[0.18em] text-black/35">{activeMenu}</p>
                <p className="mt-4 max-w-xs text-sm font-semibold leading-6 text-black/52">
                  Built in Poland for service businesses that need faster replies, cleaner lead capture, and human handoff when it matters.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-10 gap-y-3 lg:grid-cols-3">
                {activeMenuItems.map(([label, href]) => (
                  <a
                    key={label}
                    href={href}
                    className="group flex items-center justify-between border-b border-black/8 py-3 text-[15px] font-semibold text-black/74 transition-colors hover:text-black"
                  >
                    <span>{label}</span>
                    <span className="text-[#df694f] opacity-0 transition-opacity group-hover:opacity-100">→</span>
                  </a>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}

function Hero() {
  const { open } = useDemoModal()
  const marqueeItems = [...builtForMarquee, ...builtForMarquee]

  return (
    <section className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="absolute inset-0" data-asset-slot={assetSlots.heroVideo}>
        {/* Replace /public/assets/hero-video.mp4 with final owner/client footage when ready. */}
        <div className="absolute inset-0 bg-[linear-gradient(120deg,#191817,#37322d_46%,#1f1f1d)]" />
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={assetSlots.heroVideo}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
        <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(110deg,transparent_0%,transparent_34%,rgba(255,255,255,0.1)_35%,transparent_36%)]" />
        <div className="absolute left-1/2 top-1/2 h-[520px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f47a63]/10 blur-3xl" />
        <div className="absolute inset-0 bg-black/58" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-[1600px] flex-col justify-center px-4 pb-36 pt-12 text-center sm:px-6 lg:px-10">
        <Reveal>
          <h1 className="mx-auto max-w-4xl px-2 font-serif text-[clamp(2.45rem,5.4vw,4.7rem)] leading-[1.08] tracking-[-0.026em] sm:px-6">
            <span className="block">AI Receptionist + Live Chat</span>
            <span className="block">for local businesses that cannot afford missed leads.</span>
          </h1>
          <p className="mx-auto mt-10 max-w-2xl text-base font-medium leading-8 text-white/78 sm:text-lg">
            InstantDesk adds live chat, AI replies, lead capture, Google Sheet CRM updates, SMS follow-up, and review requests to your website.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              onClick={() => open('hero')}
              className="group inline-flex min-w-40 items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors duration-200 hover:bg-[#f5f0ea]"
            >
              Get Personalized Demo
              <ArrowRight className="ml-2 h-4 w-4 text-[#f47a63] transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
            <a
              href="#how-it-works"
              className="inline-flex min-w-40 items-center justify-center rounded-full border border-white/30 bg-transparent px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-white/10"
            >
              See How It Works
            </a>
          </div>
        </Reveal>

        <div className="absolute inset-x-0 bottom-0 bg-transparent py-5">
          <div className="mx-auto max-w-[1500px] overflow-hidden px-4 [mask-image:linear-gradient(90deg,transparent,black_9%,black_91%,transparent)] sm:px-6 lg:px-10">
            {/* Replace these "built for" categories with real client logos later, only after permission is granted. Keep items duplicated for a seamless loop. */}
            <div className="pause-on-hover flex overflow-hidden">
              <div className="animate-brand-marquee flex min-w-max items-center gap-12 pr-12">
                {marqueeItems.map((logo, index) => (
                  <span
                    key={`${logo}-${index}`}
                    className="shrink-0 whitespace-nowrap font-serif text-xl font-semibold tracking-tight text-white/72 sm:text-2xl"
                  >
                    {logo}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ProductShowcase() {
  return (
    <section id="features" className="bg-white py-24 text-[#0b0b0b] sm:py-32">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-10">
        <Reveal className="grid gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:items-end">
          <div>
            <p className="font-mono text-sm font-black uppercase tracking-[0.18em] text-black/45">Live chat first</p>
            <h2 className="mt-6 max-w-2xl font-serif text-5xl leading-[0.95] tracking-[-0.035em] sm:text-7xl">
              One front desk for website visitors and missed leads.
            </h2>
          </div>
          <p className="max-w-2xl text-xl font-semibold leading-9 text-black/66">
            Start with live chat on your website, then add AI replies, lead capture, SMS follow-up, Google Sheet CRM, and review requests without making your team learn a complex platform.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {featureCards.map((feature, index) => {
            const Icon = feature.icon
            return (
              <Reveal key={feature.title} delay={index * 0.06}>
                <article className={`group min-h-[330px] border p-7 transition-all duration-200 hover:-translate-y-0.5 ${
                  feature.featured
                    ? 'border-[#f47a63]/45 bg-black text-white shadow-[0_28px_90px_rgba(0,0,0,0.18)]'
                    : 'border-black/10 bg-[#f6f5f1] text-black hover:border-[#f47a63]/35 hover:bg-white'
                }`}>
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${
                    feature.featured ? 'border-white/15 bg-white/8' : 'border-[#f47a63]/20 bg-[#f47a63]/8'
                  }`}>
                    <Icon className={`h-5 w-5 ${feature.featured ? 'text-[#f8a36d]' : 'text-[#df694f]'}`} />
                  </div>
                  <h3 className="mt-16 text-3xl font-black tracking-tight">{feature.title}</h3>
                  <p className={`mt-5 text-base font-semibold leading-8 ${feature.featured ? 'text-white/68' : 'text-black/62'}`}>
                    {feature.copy}
                  </p>
                </article>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function VisualSystemSection() {
  return (
    <section className="grid bg-[#f8f8f5] text-[#0b0b0b] lg:grid-cols-[0.9fr_1.1fr]">
      <Reveal className="px-4 py-20 sm:px-10 lg:px-16 lg:py-28">
        <p className="font-mono text-sm font-black uppercase tracking-[0.18em] text-black/45">Live chat operating system</p>
        <h2 className="mt-6 max-w-2xl font-serif text-5xl leading-[0.96] tracking-[-0.035em] sm:text-7xl">
          See every website conversation turn into a lead workflow
        </h2>

        <div className="mt-14 divide-y divide-black/16">
          {features.map((feature, index) => (
            <details key={feature.title} open={index === 0} className="group py-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-xl font-black">
                {feature.title}
                <span className="text-3xl leading-none transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-5 max-w-xl text-lg font-semibold leading-8 text-black/65">{feature.copy}</p>
              {index === 0 && (
                <a href="#features" className="mt-6 inline-block text-lg font-black underline decoration-2 underline-offset-4">
                  Learn more
                </a>
              )}
            </details>
          ))}
        </div>
      </Reveal>

      {/* Replace with public/assets/hero-image.webp for this full-width product/lifestyle visual. */}
      <div className="relative min-h-[680px] overflow-hidden bg-[#d8d2c8]" data-asset-slot={assetSlots.heroImage}>
        <div className="absolute inset-0 bg-black/10" />
        <Reveal className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-[1.25rem] bg-white p-5 shadow-2xl shadow-black/25 sm:inset-x-12 lg:left-20 lg:right-16">
          <div className="grid gap-4 lg:grid-cols-[1fr_0.58fr]">
            <div className="grid grid-cols-3 gap-2">
              {['Website chat', 'Live handoff', 'Lead details', 'Google Sheet', 'SMS follow-up', 'Review ask', 'Status', 'Owner alert', 'Reminder'].map((item, index) => (
                <div
                  key={item}
                  className={`aspect-square rounded-md p-3 text-sm font-black text-white ${
                    index % 4 === 0 ? 'bg-[#0b0b0b]' : index % 4 === 1 ? 'bg-[#f3eee7] text-black' : index % 4 === 2 ? 'bg-[#f47a63] text-black' : 'bg-[#2c2a27]'
                  }`}
                >
                  {item}
                </div>
              ))}
            </div>
            <div className="flex flex-col justify-between rounded-lg border border-black/10 p-5">
              <div>
                <p className="text-sm font-black">4 lead actions</p>
                <div className="mt-5 space-y-4 text-sm font-bold text-black/70">
                  <p>Website chats × 3</p>
                  <p>Human handoff × 1</p>
                  <p>CRM updated</p>
                </div>
              </div>
              <button className="mt-8 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#222]">
                Review pipeline
              </button>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function IndustryGrid() {
  return (
    <section id="interactive-demo" className="bg-black py-24 text-white sm:py-32">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-10">
        <Reveal>
          <p className="font-mono text-sm font-black uppercase tracking-[0.18em] text-white/44">Built for local businesses</p>
          <h2 className="mt-6 max-w-4xl font-serif text-5xl leading-[0.95] tracking-[-0.035em] sm:text-7xl">Example live chat use cases</h2>
        </Reveal>

        <div className="mt-16 grid auto-rows-[minmax(380px,auto)] gap-6 lg:grid-cols-4">
          {industries.map((industry, index) => (
            <Reveal key={industry.label} delay={index * 0.06} className={industry.size}>
              <article
                className="group relative min-h-[380px] overflow-hidden bg-neutral-900 transition-opacity duration-300 hover:opacity-[0.96]"
                data-asset-slot={industry.slot}
              >
                {/* Replace with public/assets/customer-1.webp, customer-2.webp, customer-3.webp, or hero-image.webp. */}
                <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(118,103,89,0.84),rgba(27,27,25,0.9)),linear-gradient(45deg,#4a4741,#c4b39b)] transition-transform duration-300 group-hover:scale-[1.005]" />
                <div className="absolute inset-0 bg-black/30" />
                <div className="relative flex min-h-[380px] flex-col justify-between p-7 sm:p-8">
                  <h3 className="max-w-[11ch] font-serif text-[clamp(2.35rem,3.7vw,3.75rem)] leading-[0.98] tracking-[-0.04em] text-white/82">
                    {industry.label}
                  </h3>
                  <div className="mt-8 border-t border-white/52 pt-5">
                    <p className="text-xl font-black leading-tight sm:text-2xl">{industry.metric}</p>
                    <button className="mt-5 text-base font-black underline decoration-2 underline-offset-4">Learn more</button>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        <div className="mt-12 flex gap-2 overflow-x-auto pb-2">
          {demos.map(demo => (
            <button
              key={demo}
              className="shrink-0 rounded-full border border-white/20 px-5 py-3 text-sm font-black text-white/74 transition-colors hover:border-white hover:text-white"
            >
              {demo}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

function AiFeature() {
  return (
    <section className="relative min-h-[760px] overflow-hidden bg-[#f4eee5] text-black" data-asset-slot={assetSlots.heroImage}>
      {/* Replace this section background with public/assets/hero-image.webp when final imagery is ready. */}
      <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(246,241,233,0.95),rgba(216,206,192,0.72)_62%,rgba(255,255,255,0.88))]" />
      <div className="absolute right-[12%] top-[22%] h-[520px] w-[280px] rotate-[28deg] rounded-[2.5rem] border-[12px] border-black bg-white shadow-2xl shadow-black/20" data-asset-slot={assetSlots.customer3}>
        <div className="mx-auto mt-4 h-7 w-20 rounded-full bg-black" />
        <div className="p-5 text-black/20">
          <p className="mt-20 text-sm font-bold">New customer wants to visit this week.</p>
          <div className="mt-16 rounded-full bg-black/5 px-4 py-3 text-xs">When do new customers visit most?</div>
        </div>
      </div>
      <Reveal className="relative mx-auto flex min-h-[760px] max-w-[1600px] flex-col justify-center px-4 sm:px-6 lg:px-10">
        <p className="font-mono text-sm font-black uppercase tracking-[0.18em] text-black/45">InstantDesk Live Chat</p>
        <h2 className="mt-6 max-w-3xl font-serif text-5xl leading-[0.95] tracking-[-0.035em] sm:text-7xl">Answer now, follow up later</h2>
        <p className="mt-7 max-w-2xl text-xl font-semibold leading-9 text-black/68">
          Your team can take over urgent website chats, while InstantDesk keeps every lead, follow-up, and review request organized in the background.
        </p>
        <a href="#demo" className="mt-10 w-fit text-xl font-black underline decoration-2 underline-offset-4">Book a walkthrough</a>
      </Reveal>
    </section>
  )
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-white py-24 text-[#0b0b0b] sm:py-32">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-10">
        <Reveal className="max-w-4xl">
          <p className="font-mono text-sm font-black uppercase tracking-[0.18em] text-black/45">Launch plan</p>
          <h2 className="mt-6 font-serif text-5xl leading-[0.95] tracking-[-0.035em] sm:text-7xl">From missed leads to managed growth</h2>
        </Reveal>

        <div className="mt-16 grid border-y border-black md:grid-cols-3">
          {workflow.map(([number, title, copy], index) => (
            <Reveal key={number} delay={index * 0.08}>
              <article className="min-h-[390px] border-black p-8 md:border-r md:last:border-r-0">
                <p className="font-serif text-7xl leading-none">{number}</p>
                <h3 className="mt-16 text-3xl font-black tracking-tight">{title}</h3>
                <p className="mt-5 text-base font-semibold leading-8 text-black/62">{copy}</p>
              </article>
            </Reveal>
          ))}
        </div>
        <a href="#demo" className="group mt-10 inline-flex items-center gap-2 rounded-full bg-black px-6 py-3 text-[15px] font-semibold text-white transition-colors duration-200 hover:bg-[#222]">
          Start Growing
          <ArrowRight className="h-4 w-4 text-[#f47a63] transition-transform duration-200 group-hover:translate-x-0.5" />
        </a>
      </div>
    </section>
  )
}

function Pricing() {
  const { open } = useDemoModal()

  return (
    <section id="pricing" className="bg-black py-24 text-white sm:py-32">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-10">
        <Reveal>
          <p className="font-mono text-sm font-black uppercase tracking-[0.18em] text-white/44">Pricing</p>
          <h2 className="mt-6 max-w-5xl font-serif text-5xl leading-[0.95] tracking-[-0.035em] sm:text-7xl">Start with live chat, then add operations</h2>
          <p className="mt-7 max-w-3xl text-xl font-semibold leading-9 text-white/70">
            Packs stay consistent across niches. Setup starts from 500 zł depending on website, data, and workflow complexity.
          </p>
        </Reveal>

        <div className="mt-24 grid gap-10 lg:grid-cols-4">
          {pricing.map((plan, index) => (
            <Reveal key={plan.name} delay={index * 0.08}>
              <article className="flex min-h-[680px] flex-col border-l border-white/72 px-7">
                <div className="flex min-h-16 items-start justify-between gap-4">
                  <h3 className="text-2xl font-black">{plan.name}</h3>
                  {plan.badge && <span className="rounded-md bg-white/15 px-4 py-2 font-mono text-xs font-black uppercase tracking-[0.16em]">{plan.badge}</span>}
                </div>
                <p className="mt-5 min-h-14 text-lg font-semibold text-white/42">{plan.desc}</p>
                <div className="my-12 border-t border-white/58" />
                <p className="font-serif text-5xl leading-none tracking-[-0.05em]">{plan.price}</p>
                <p className="mt-5 text-base font-bold text-white/38">{plan.price === 'Custom' ? 'priced after audit' : 'monthly'}</p>
                <ul className="mt-10 space-y-4">
                  {plan.features.map(feature => (
                    <li key={feature} className="flex gap-3 text-sm font-semibold leading-6 text-white/68">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#f8a36d]" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => open('pricing')}
                  className={`mt-auto w-fit rounded-full px-7 py-3 text-[15px] font-semibold transition-colors duration-200 ${
                    index === 1 ? 'bg-white text-black hover:bg-[#f5f0ea]' : 'bg-white text-black hover:bg-white/90'
                  }`}
                >
                  {plan.cta}
                </button>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-20 overflow-hidden border border-white/12">
          <div className="overflow-x-auto">
            <table className="min-w-[840px] w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/12 bg-white/[0.03]">
                  {['Feature', 'Starter', 'Pro', 'Operations', 'Custom'].map(column => (
                    <th key={column} className="px-5 py-5 text-sm font-black uppercase tracking-[0.14em] text-white/46">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(([feature, starter, pro, operations, custom]) => (
                  <tr key={feature} className="border-b border-white/10 last:border-b-0">
                    <td className="px-5 py-4 text-sm font-semibold text-white/80">{feature}</td>
                    {[starter, pro, operations, custom].map((value, index) => (
                      <td key={`${feature}-${index}`} className="px-5 py-4 text-sm font-semibold text-white/58">
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function Testimonials() {
  return (
    <section id="testimonials" className="bg-white py-24 text-[#0b0b0b] sm:py-32">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-10">
        <Reveal className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="font-mono text-sm font-black uppercase tracking-[0.18em] text-black/45">Built for</p>
            <h2 className="mt-6 font-serif text-5xl leading-[0.95] tracking-[-0.035em] sm:text-7xl">Built for real local workflows</h2>
            <p className="mt-7 max-w-xl text-lg font-semibold leading-8 text-black/62">
              Practical examples of how InstantDesk supports service businesses with live chat, lead capture, follow-up, and human handover.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ['Dental clinic', 'A visitor asks about implants after hours. InstantDesk captures contact details, answers basic FAQs, and flags the lead for reception.'],
              ['Beauty salon', 'A client asks about price and availability. Live chat collects service interest and sends a follow-up if they do not book.'],
              ['Real estate agency', 'A buyer asks about a listing. InstantDesk captures budget, location, timeline, and sends the lead to a Google Sheet.'],
              ['Home service business', 'A homeowner asks about an urgent job. The team can take over live chat while the lead record stays organized.'],
            ].map(([title, copy]) => (
              <article key={title} className="group bg-[#f5f5f2] p-7 transition-colors duration-200 hover:bg-[#ededeb]">
                <Star className="h-5 w-5 text-[#df694f]" />
                <h3 className="mt-10 text-2xl font-black">{title}</h3>
                <p className="mt-4 text-base font-semibold leading-8 text-black/62">{copy}</p>
              </article>
            ))}
          </div>
        </Reveal>

        <Reveal className="mt-12 grid gap-4 bg-black p-5 text-white sm:grid-cols-3">
          {[
            'Built for local service businesses',
            'Human live-chat handoff',
            'Lead records in Google Sheets',
          ].map((label) => {
            return (
              <div key={label} className="flex items-center gap-4 border border-white/16 p-5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#f47a63]" />
                <span className="text-base font-black">{label}</span>
              </div>
            )
          })}
        </Reveal>
      </div>
    </section>
  )
}

function DemoBooking() {
  const { open } = useDemoModal()

  return (
    <section id="demo" className="relative min-h-[720px] overflow-hidden bg-black text-white">
      <div className="absolute inset-0">
        <div className="absolute left-[46%] top-[26%] h-36 w-72 rounded-3xl bg-white/14" />
        <div className="absolute right-[12%] top-[32%] h-44 w-64 rounded-3xl bg-white/18" />
        <div className="absolute bottom-[16%] right-[20%] h-56 w-72 rounded-3xl bg-white/10" />
        <div className="absolute bottom-[12%] left-[52%] h-36 w-36 rounded-[2rem] border-8 border-white" />
      </div>
      <Reveal className="relative mx-auto flex min-h-[720px] max-w-[1600px] flex-col items-center justify-center px-4 text-center sm:px-6 lg:px-10">
        <h2 className="max-w-4xl font-serif text-6xl leading-[0.9] tracking-[-0.04em] sm:text-8xl">Make your next move</h2>
        <p className="mt-7 max-w-2xl text-xl font-semibold leading-9 text-white/70">
          Book a focused walkthrough and see exactly how InstantDesk would handle your current lead flow.
        </p>
        <div className="mt-9 flex flex-col gap-4 sm:flex-row">
          <button
            onClick={() => open('cta')}
            className="group rounded-full bg-white px-8 py-4 text-base font-black text-black transition-colors duration-200 hover:bg-[#f5f0ea]"
          >
            Get Personalized Demo
            <ArrowRight className="ml-2 inline h-4 w-4 text-[#f47a63] transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>
          <a href={`mailto:${contactEmail}`} className="rounded-full border border-white/24 px-6 py-3 text-[15px] font-semibold text-white transition-colors duration-200 hover:bg-white/10">
            {contactEmail}
          </a>
        </div>
      </Reveal>
    </section>
  )
}

export function Footer() {
  const { open } = useDemoModal()

  return (
    <footer className="bg-black px-4 py-28 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-20 flex items-center">
          <img src={logoMark} alt="InstantDesk" className="h-10 w-auto" />
        </div>

        <Reveal className="mb-28 grid gap-8 border-y border-white/12 py-12 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="font-mono text-xs font-black uppercase tracking-[0.18em] text-[#f8a36d]">Personalized demo</p>
            <h2 className="mt-4 max-w-3xl font-serif text-4xl leading-tight tracking-[-0.03em] text-white sm:text-5xl">
              See how InstantDesk would handle your website chats and missed leads.
            </h2>
          </div>
          <button
            type="button"
            onClick={() => open('cta')}
            className="group w-fit rounded-full bg-white px-8 py-4 text-base font-black text-black transition-colors hover:bg-[#f5f0ea]"
          >
            Get Personalized Demo
            <ArrowRight className="ml-2 inline h-4 w-4 text-[#f47a63] transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>
        </Reveal>

        <div className="grid gap-x-16 gap-y-14 md:grid-cols-2 lg:grid-cols-4">
          {footerColumns.map(([title, ...links]) => (
            <div key={title}>
              <h3 className="mb-7 text-sm font-black uppercase tracking-[0.16em] text-white/34">{title}</h3>
              <ul className="space-y-[18px]">
                {links.map(item => (
                  <li key={item}>
                    <a href={footerHref(item)} className="text-base font-semibold text-white/68 transition-colors hover:text-white">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-24 border-t border-white/10 pt-10 text-sm font-medium leading-7 text-white/44">
          <p className="font-mono text-xs font-black uppercase tracking-[0.18em] text-white/36">🇵🇱 Built in Poland for service businesses</p>
          <p className="mt-4">
            Contact: <a href={`mailto:${contactEmail}`} className="text-white/68 transition-colors hover:text-white">{contactEmail}</a>
          </p>
          <p>
            AI receptionist and live chat software for customer intake, appointment requests, CRM sync, follow-up workflows, and review requests.
          </p>
          <p className="mt-6">© 2026. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

export default function PremiumHome() {
  return (
    <main className="min-h-screen bg-white">
      <Header />
      <Hero />
      <ProductShowcase />
      <VisualSystemSection />
      <IndustryGrid />
      <AiFeature />
      <HowItWorks />
      <Pricing />
      <Testimonials />
      <DemoBooking />
      <Footer />
      <Bot className="sr-only" aria-hidden="true" />
      <Sparkles className="sr-only" aria-hidden="true" />
      <Check className="sr-only" aria-hidden="true" />
    </main>
  )
}
