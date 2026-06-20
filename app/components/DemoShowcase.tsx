'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2, School, Stethoscope, UtensilsCrossed, Scissors, Car,
  Bot, UserCheck, CalendarCheck, Database, CheckCheck,
  Zap, MessageSquare, Phone,
} from 'lucide-react'
import { WhatsAppIcon, GlobeIcon, InstagramIcon } from './ChannelIcons'

/* ─── Types ──────────────────────────────────────────────────── */

type LeadData = { Name: string; Phone: string; [k: string]: string | number }
type ApptData = { Type: string; Date: string; Time: string; With: string; Location: string }
type CrmData  = { System: string; Contact: string; Stage: string; Pipeline: string; Score: number }
type NoteData = { channel: 'WhatsApp' | 'SMS' | 'Email'; message: string }

type Demo = {
  id: string
  industry: string
  Icon: React.ComponentType<{ className?: string }>
  color: string
  bg: string
  border: string
  gradient: string
  channel: 'WhatsApp' | 'Website Chat' | 'Instagram' | 'SMS'
  customer: string
  avatar: string
  customerMsg: string
  aiMsg: string
  quickReplies: string[]
  lead: LeadData
  appt: ApptData
  crm: CrmData
  note: NoteData
}

/* ─── Data ───────────────────────────────────────────────────── */

const demos: Demo[] = [
  {
    id: 'realestate',
    industry: 'Real Estate',
    Icon: Building2,
    color: '#60a5fa',
    bg: 'rgba(96,165,250,0.08)',
    border: 'rgba(96,165,250,0.2)',
    gradient: 'from-blue-500 to-cyan-400',
    channel: 'WhatsApp',
    customer: 'Michał K.',
    avatar: 'MK',
    customerMsg: "Hi! I'm interested in the 3-bed apartment in Mokotów. Is it available and what's the asking price?",
    aiMsg: "Hi Michał! The 3BR at ul. Puławska is still available at €285,000. I can arrange a private viewing this week — Thursday at 14:00 or Friday at 11:00 works. Are you pre-approved for financing, or would you like our mortgage advisor to reach out?",
    quickReplies: ['Book Viewing', 'See Floor Plan', 'Finance Options'],
    lead: { Name: 'Michał Kowalski', Phone: '+48 601 234 567', Interest: '3BR, Mokotów', Budget: '€250–300k', Source: 'WhatsApp', Score: 92 },
    appt: { Type: 'Property Viewing', Date: 'Thu, 14 Nov', Time: '14:00', With: 'Anna Wiśniewska', Location: 'ul. Puławska 47, Warsaw' },
    crm: { System: 'HubSpot', Contact: 'Michał Kowalski', Stage: 'Qualified Lead', Pipeline: 'Residential Sales', Score: 92 },
    note: { channel: 'WhatsApp', message: "Hi Michał! ✅ Viewing confirmed.\n📍 ul. Puławska 47, Warsaw\n📅 Thu 14 Nov · 14:00\n👤 Agent: Anna Wiśniewska\n\nReply CONFIRM to lock in your slot." },
  },
  {
    id: 'schools',
    industry: 'Schools',
    Icon: School,
    color: '#fbbf24',
    bg: 'rgba(251,191,36,0.08)',
    border: 'rgba(251,191,36,0.2)',
    gradient: 'from-amber-500 to-yellow-400',
    channel: 'Website Chat',
    customer: 'Joanna M.',
    avatar: 'JM',
    customerMsg: "Hello! I'd like to enrol my daughter — she's 7. What are the requirements and when does the next intake start?",
    aiMsg: "Welcome! For a 7-year-old she'd join Grade 2, starting September 2025 — enrolment is open now. I'd love to arrange a school tour with our Head of Admissions. Would Thursday or Friday work for you and your daughter?",
    quickReplies: ['Book Campus Tour', 'See Curriculum', 'Tuition Fees'],
    lead: { Name: 'Joanna Malinowska', Phone: '+48 512 345 678', Child: 'Age 7, Grade 2', Intake: 'Sep 2025', Source: 'Website', Score: 88 },
    appt: { Type: 'Campus Tour', Date: 'Fri, 15 Nov', Time: '10:00', With: 'Head of Admissions', Location: 'Main Campus, Building A' },
    crm: { System: 'Salesforce', Contact: 'Joanna Malinowska', Stage: 'Tour Scheduled', Pipeline: 'Admissions 2025', Score: 88 },
    note: { channel: 'Email', message: "Hi Joanna! 🎓 Campus tour confirmed.\n📍 Main Campus, Building A\n📅 Fri 15 Nov · 10:00\n👤 Head of Admissions\n\nPlease bring your daughter's school reports." },
  },
  {
    id: 'clinics',
    industry: 'Clinics',
    Icon: Stethoscope,
    color: '#f472b6',
    bg: 'rgba(244,114,182,0.08)',
    border: 'rgba(244,114,182,0.2)',
    gradient: 'from-pink-500 to-rose-400',
    channel: 'WhatsApp',
    customer: 'Piotr N.',
    avatar: 'PN',
    customerMsg: "I need to see a dermatologist urgently. Any morning slots this week?",
    aiMsg: "Of course! Dr. Kowalczyk has Thursday at 09:30 and Friday at 10:00 — both mornings. Is this a first visit or follow-up? Either way I'll send you a pre-appointment checklist right after we confirm.",
    quickReplies: ['Book Thu 09:30', 'Book Fri 10:00', 'Ask About Services'],
    lead: { Name: 'Piotr Nowak', Phone: '+48 789 012 345', Concern: 'Dermatology – Urgent', Preference: 'Morning only', Source: 'WhatsApp', Score: 95 },
    appt: { Type: 'Dermatology Consult', Date: 'Thu, 14 Nov', Time: '09:30', With: 'Dr. Kowalczyk', Location: 'Room 204, 2nd Floor' },
    crm: { System: 'HubSpot', Contact: 'Piotr Nowak', Stage: 'Appointment Set', Pipeline: 'New Patients', Score: 95 },
    note: { channel: 'WhatsApp', message: "Hi Piotr! ✅ Appointment confirmed.\n🏥 Dr. Kowalczyk — Dermatology\n📅 Thu 14 Nov · 09:30\n📍 Room 204, 2nd Floor\n\nPlease arrive 10 min early & bring your ID card." },
  },
  {
    id: 'restaurants',
    industry: 'Restaurants',
    Icon: UtensilsCrossed,
    color: '#fb923c',
    bg: 'rgba(251,146,60,0.08)',
    border: 'rgba(251,146,60,0.2)',
    gradient: 'from-orange-500 to-amber-400',
    channel: 'Instagram',
    customer: 'Katarzyna W.',
    avatar: 'KW',
    customerMsg: "Hi! Table for 8 this Saturday around 7pm — do you have anything available?",
    aiMsg: "Absolutely! We have a perfect spot for 8 this Saturday at 19:00 — terrace or inside, your choice. Can I get your name and a contact number to confirm? Any dietary requirements or occasion I should note?",
    quickReplies: ['Confirm Terrace', 'Confirm Inside', 'See Menu'],
    lead: { Name: 'Katarzyna Wiśniewska', Phone: '+48 604 567 890', Party: '8 guests', DateTime: 'Sat 19:00', Source: 'Instagram', Score: 79 },
    appt: { Type: 'Table Reservation', Date: 'Sat, 16 Nov', Time: '19:00', With: 'Host: Marek', Location: 'Terrace · Table 12' },
    crm: { System: 'Google Sheets', Contact: 'Katarzyna Wiśniewska', Stage: 'Reserved', Pipeline: 'Weekend Bookings', Score: 79 },
    note: { channel: 'SMS', message: "Hi Katarzyna! 🍽️ Reservation confirmed.\n📍 Terrace · Table 12 (8 guests)\n📅 Sat 16 Nov · 19:00\n\nWe look forward to hosting you! Reply CANCEL to cancel." },
  },
  {
    id: 'salons',
    industry: 'Salons',
    Icon: Scissors,
    color: '#c084fc',
    bg: 'rgba(192,132,252,0.08)',
    border: 'rgba(192,132,252,0.2)',
    gradient: 'from-purple-500 to-violet-400',
    channel: 'Website Chat',
    customer: 'Marta S.',
    avatar: 'MS',
    customerMsg: "Hi! I'd like a full colour and cut with a senior stylist. How long and what's the price?",
    aiMsg: "Hi Marta! Colour + cut with our Senior Stylist is around 2.5–3 hours, starting at €95 depending on hair length. I have Tuesday at 11:00 or Wednesday at 14:00 — which works better for you?",
    quickReplies: ['Book Tue 11:00', 'Book Wed 14:00', 'Price List'],
    lead: { Name: 'Marta Szymańska', Phone: '+48 721 234 567', Service: 'Colour + Cut', Level: 'Senior Stylist', Source: 'Website', Score: 85 },
    appt: { Type: 'Colour & Cut', Date: 'Tue, 12 Nov', Time: '11:00', With: 'Ewa (Senior Stylist)', Location: 'Chair 3' },
    crm: { System: 'Google Sheets', Contact: 'Marta Szymańska', Stage: 'Booked', Pipeline: 'Appointments', Score: 85 },
    note: { channel: 'WhatsApp', message: "Hi Marta! 💜 You're all booked!\n✂️ Colour & Cut with Ewa\n📅 Tue 12 Nov · 11:00\n📍 Chair 3\n\nArrive with clean, dry hair for best results ✨" },
  },
  {
    id: 'cars',
    industry: 'Car Dealers',
    Icon: Car,
    color: '#22d3ee',
    bg: 'rgba(34,211,238,0.08)',
    border: 'rgba(34,211,238,0.2)',
    gradient: 'from-cyan-500 to-teal-400',
    channel: 'WhatsApp',
    customer: 'Tomasz B.',
    avatar: 'TB',
    customerMsg: "I'm interested in a BMW 3 Series 2024. Can I get pricing and book a test drive this weekend?",
    aiMsg: "Great taste, Tomasz! The 2024 BMW 3 Series M Sport starts at €52,900 — we have a Carbon Black metallic in showroom right now. Test drive available Saturday at 10:00 or 13:00. Which works for you?",
    quickReplies: ['Book Sat 10:00', 'Book Sat 13:00', 'Finance Quote'],
    lead: { Name: 'Tomasz Bielski', Phone: '+48 605 678 901', Model: 'BMW 3 Series 2024', Budget: '€50–60k', Source: 'WhatsApp', Score: 91 },
    appt: { Type: 'Test Drive', Date: 'Sat, 16 Nov', Time: '10:00', With: 'Marcin (Sales)', Location: 'BMW Showroom · Główna 12' },
    crm: { System: 'Salesforce', Contact: 'Tomasz Bielski', Stage: 'Test Drive Booked', Pipeline: 'Premium Sales', Score: 91 },
    note: { channel: 'WhatsApp', message: "Hi Tomasz! 🚗 Test drive confirmed!\n🚘 BMW 3 Series M Sport · Carbon Black\n📅 Sat 16 Nov · 10:00\n📍 BMW Showroom, Główna 12\n\nBring your driving licence. See you Saturday!" },
  },
]

/* ─── Small sub-components ───────────────────────────────────── */

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-2 h-2 rounded-full bg-white/30"
          animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.18 }}
        />
      ))}
    </div>
  )
}

function ChannelBadge({ channel, color }: { channel: Demo['channel']; color: string }) {
  const Icon =
    channel === 'WhatsApp' ? WhatsAppIcon :
    channel === 'Instagram' ? InstagramIcon :
    channel === 'SMS' ? Phone :
    GlobeIcon

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
      style={{ background: `${color}18`, border: `1px solid ${color}40`, color }}
    >
      {'className' in Icon ? <Icon className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
      {channel}
    </span>
  )
}

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ delay: 1.0, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <span className="text-xs font-bold" style={{ color }}>{score}<span className="text-white/30 font-normal">/100</span></span>
    </div>
  )
}

/* ─── Main component ─────────────────────────────────────────── */

export default function DemoShowcase() {
  const [active, setActive] = useState(0)
  const demo = demos[active]

  return (
    <section id="interactive-demo" className="relative py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/40 to-transparent" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle, rgba(139,92,246,1) 1px, transparent 1px)`,
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-violet-400 mb-5">
            <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
            Interactive demo
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-5 leading-tight">
            See your AI in action —{' '}
            <span className="text-gradient">pick your industry</span>
          </h2>
          <p className="text-lg text-white/40 max-w-xl mx-auto">
            Real conversations. Real automation. Watch your AI capture leads, book appointments, sync your CRM, and send confirmations — in seconds.
          </p>
        </motion.div>

        {/* Tab bar */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex items-center justify-start lg:justify-center gap-2 overflow-x-auto scrollbar-none pb-4 mb-6"
          style={{ scrollbarWidth: 'none' }}
        >
          {demos.map((d, i) => {
            const Icon = d.Icon
            const isActive = i === active
            return (
              <button
                key={d.id}
                onClick={() => setActive(i)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all duration-200 hover:-translate-y-0.5 flex-shrink-0"
                style={isActive ? {
                  background: d.bg,
                  border: `1px solid ${d.border}`,
                  color: d.color,
                  boxShadow: `0 4px 16px ${d.color}18`,
                } : {
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.40)',
                }}
              >
                <Icon className="w-4 h-4" />
                {d.industry}
              </button>
            )
          })}
        </motion.div>

        {/* Demo panel */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7 }}
          className="rounded-3xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.4)',
          }}
        >
          {/* Window chrome */}
          <div
            className="flex items-center justify-between px-6 py-4 border-b"
            style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)' }}
          >
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full" style={{ background: 'rgba(255,95,87,0.7)' }} />
                <span className="w-3 h-3 rounded-full" style={{ background: 'rgba(255,188,46,0.7)' }} />
                <span className="w-3 h-3 rounded-full" style={{ background: 'rgba(40,200,64,0.7)' }} />
              </div>
              <AnimatePresence mode="wait">
                <motion.span
                  key={demo.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.2 }}
                  className="text-xs text-white/25 font-medium"
                >
                  {demo.industry} · InstantDesk AI · Live Demo
                </motion.span>
              </AnimatePresence>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-bold tracking-wide text-emerald-400">AI ACTIVE</span>
            </div>
          </div>

          {/* Two-column content */}
          <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[580px]">

            {/* ── Left: Chat ── */}
            <div
              className="flex flex-col border-r"
              style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.25)' }}
            >
              {/* Chat header */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={`header-${demo.id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-3 px-5 py-4 border-b"
                  style={{ borderColor: 'rgba(255,255,255,0.05)' }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: demo.bg, border: `1px solid ${demo.border}` }}
                  >
                    <Bot className="w-5 h-5" style={{ color: demo.color }} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white/85">InstantDesk AI</div>
                    <div className="text-[10px] text-white/30 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Online · Replying instantly
                    </div>
                  </div>
                  <div className="ml-auto">
                    <ChannelBadge channel={demo.channel} color={demo.color} />
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Messages */}
              <div className="flex-1 px-5 py-6 flex flex-col gap-4 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`chat-${demo.id}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-col gap-4"
                  >
                    {/* Customer message */}
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1, duration: 0.35 }}
                      className="flex items-end gap-2.5"
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                        style={{ background: `linear-gradient(135deg, ${demo.color}80, ${demo.color}40)`, border: `1px solid ${demo.border}` }}
                      >
                        {demo.avatar}
                      </div>
                      <div className="max-w-[75%]">
                        <div className="text-[10px] text-white/30 mb-1 ml-1">{demo.customer}</div>
                        <div
                          className="text-sm text-white/80 rounded-2xl rounded-bl-sm px-4 py-3 leading-relaxed"
                          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.06)' }}
                        >
                          {demo.customerMsg}
                        </div>
                      </div>
                    </motion.div>

                    {/* Typing indicator */}
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: [0, 1, 1, 0], y: [8, 0, 0, 0] }}
                      transition={{ delay: 0.5, duration: 1.1, times: [0, 0.15, 0.75, 1] }}
                      className="flex items-end gap-2.5 flex-row-reverse"
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
                      >
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                      <div
                        className="rounded-2xl rounded-br-sm"
                        style={{ background: `linear-gradient(135deg, ${demo.color}25, ${demo.color}10)`, border: `1px solid ${demo.border}` }}
                      >
                        <TypingDots />
                      </div>
                    </motion.div>

                    {/* AI response */}
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.2, duration: 0.4 }}
                      className="flex items-end gap-2.5 flex-row-reverse"
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
                      >
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                      <div className="max-w-[78%]">
                        <div className="text-[10px] text-white/30 mb-1 mr-1 text-right">InstantDesk AI · just now</div>
                        <div
                          className="text-sm text-white/85 rounded-2xl rounded-br-sm px-4 py-3 leading-relaxed"
                          style={{
                            background: `linear-gradient(135deg, ${demo.color}22, ${demo.color}0d)`,
                            border: `1px solid ${demo.border}`,
                          }}
                        >
                          {demo.aiMsg}
                        </div>
                        <div className="flex items-center justify-end gap-1 mt-1.5 mr-1">
                          <span className="text-[9px] text-white/20">Delivered</span>
                          <CheckCheck className="w-3 h-3 text-blue-400" />
                        </div>
                      </div>
                    </motion.div>

                    {/* Quick replies */}
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.55, duration: 0.3 }}
                      className="flex flex-wrap gap-2 pl-10"
                    >
                      {demo.quickReplies.map((reply, i) => (
                        <button
                          key={i}
                          className="text-[11px] font-semibold px-3.5 py-1.5 rounded-full transition-all duration-200 hover:-translate-y-0.5"
                          style={{
                            background: demo.bg,
                            border: `1px solid ${demo.border}`,
                            color: demo.color,
                          }}
                        >
                          {reply}
                        </button>
                      ))}
                    </motion.div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Chat input bar */}
              <div
                className="px-5 py-4 border-t flex items-center gap-3"
                style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.15)' }}
              >
                <div
                  className="flex-1 px-4 py-2.5 rounded-xl text-xs text-white/20 select-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  Type a message…
                </div>
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
                >
                  <MessageSquare className="w-4 h-4 text-white" />
                </div>
              </div>
            </div>

            {/* ── Right: Automation events ── */}
            <div className="flex flex-col">
              {/* Events header */}
              <div
                className="flex items-center gap-3 px-6 py-4 border-b"
                style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.1)' }}
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500/30 to-blue-500/30 border border-violet-500/20 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-violet-400" />
                </div>
                <span className="text-xs font-bold text-white/50 tracking-wide">AUTOMATION SEQUENCE TRIGGERED</span>
                <span className="ml-auto flex items-center gap-1 text-[10px] text-violet-400 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                  4 actions
                </span>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={`events-${demo.id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex-1 p-5 flex flex-col gap-3"
                >

                  {/* ── Event 1: Lead Captured ── */}
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.45, duration: 0.4 }}
                    className="rounded-2xl p-4 relative overflow-hidden"
                    style={{
                      background: 'rgba(139,92,246,0.06)',
                      border: '1px solid rgba(139,92,246,0.18)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                          <UserCheck className="w-3.5 h-3.5 text-violet-400" />
                        </div>
                        <span className="text-xs font-bold text-white/75">Lead Captured</span>
                      </div>
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.75, type: 'spring', stiffness: 300 }}
                        className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center"
                      >
                        <CheckCheck className="w-3 h-3 text-emerald-400" />
                      </motion.div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {Object.entries(demo.lead)
                        .filter(([k]) => k !== 'Score')
                        .map(([k, v]) => (
                          <div key={k}>
                            <div className="text-[9px] uppercase tracking-wider text-white/25 mb-0.5">{k}</div>
                            <div className="text-xs text-white/65 font-medium truncate">{String(v)}</div>
                          </div>
                        ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-white/[0.06]">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[9px] uppercase tracking-wider text-white/25">Lead Score</span>
                      </div>
                      <ScoreBar score={demo.lead.Score as number} color="#a78bfa" />
                    </div>
                  </motion.div>

                  {/* ── Event 2: Appointment Booked ── */}
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.7, duration: 0.4 }}
                    className="rounded-2xl p-4"
                    style={{
                      background: 'rgba(96,165,250,0.06)',
                      border: '1px solid rgba(96,165,250,0.18)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                          <CalendarCheck className="w-3.5 h-3.5 text-blue-400" />
                        </div>
                        <span className="text-xs font-bold text-white/75">Appointment Booked</span>
                      </div>
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 1.0, type: 'spring', stiffness: 300 }}
                        className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center"
                      >
                        <CheckCheck className="w-3 h-3 text-emerald-400" />
                      </motion.div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div
                        className="px-3 py-2 rounded-xl text-center flex-shrink-0"
                        style={{ background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.2)' }}
                      >
                        <div className="text-[10px] text-blue-400/70 font-semibold uppercase tracking-wide">{demo.appt.Date.split(',')[0]}</div>
                        <div className="text-xl font-black text-blue-400 leading-none">{demo.appt.Time}</div>
                        <div className="text-[9px] text-blue-400/50">{demo.appt.Date.split(',')[1]?.trim()}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-white/80 mb-1">{demo.appt.Type}</div>
                        <div className="text-[11px] text-white/40 mb-0.5">👤 {demo.appt.With}</div>
                        <div className="text-[11px] text-white/40 truncate">📍 {demo.appt.Location}</div>
                      </div>
                    </div>
                  </motion.div>

                  {/* ── Event 3: CRM Synced ── */}
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.95, duration: 0.4 }}
                    className="rounded-2xl p-4"
                    style={{
                      background: 'rgba(52,211,153,0.06)',
                      border: '1px solid rgba(52,211,153,0.18)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                          <Database className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                        <span className="text-xs font-bold text-white/75">
                          {demo.crm.System} Synced
                        </span>
                      </div>
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 1.25, type: 'spring', stiffness: 300 }}
                        className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center"
                      >
                        <CheckCheck className="w-3 h-3 text-emerald-400" />
                      </motion.div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <div className="text-white/25 text-[9px] uppercase tracking-wider mb-0.5">Contact</div>
                        <div className="text-white/65 font-medium truncate">{demo.crm.Contact}</div>
                      </div>
                      <div>
                        <div className="text-white/25 text-[9px] uppercase tracking-wider mb-0.5">Stage</div>
                        <div className="text-emerald-400 font-semibold">{demo.crm.Stage}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-white/25 text-[9px] uppercase tracking-wider mb-0.5">Pipeline</div>
                        <div className="text-white/55">{demo.crm.Pipeline}</div>
                      </div>
                    </div>
                    <div className="mt-2.5">
                      <ScoreBar score={demo.crm.Score} color="#34d399" />
                    </div>
                  </motion.div>

                  {/* ── Event 4: Notification Sent ── */}
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.2, duration: 0.4 }}
                    className="rounded-2xl p-4"
                    style={{
                      background: demo.note.channel === 'WhatsApp'
                        ? 'rgba(37,211,102,0.06)'
                        : demo.note.channel === 'SMS'
                        ? 'rgba(251,146,60,0.06)'
                        : 'rgba(96,165,250,0.06)',
                      border: demo.note.channel === 'WhatsApp'
                        ? '1px solid rgba(37,211,102,0.2)'
                        : demo.note.channel === 'SMS'
                        ? '1px solid rgba(251,146,60,0.2)'
                        : '1px solid rgba(96,165,250,0.2)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{
                            background: demo.note.channel === 'WhatsApp' ? 'rgba(37,211,102,0.2)' : demo.note.channel === 'SMS' ? 'rgba(251,146,60,0.2)' : 'rgba(96,165,250,0.2)',
                            border: demo.note.channel === 'WhatsApp' ? '1px solid rgba(37,211,102,0.3)' : demo.note.channel === 'SMS' ? '1px solid rgba(251,146,60,0.3)' : '1px solid rgba(96,165,250,0.3)',
                          }}
                        >
                          {demo.note.channel === 'WhatsApp'
                            ? <WhatsAppIcon className="w-3.5 h-3.5" style={{ color: '#25D366' }} />
                            : demo.note.channel === 'SMS'
                            ? <Phone className="w-3.5 h-3.5" style={{ color: '#fb923c' }} />
                            : <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                          }
                        </div>
                        <span className="text-xs font-bold text-white/75">
                          {demo.note.channel} Confirmation Sent
                        </span>
                      </div>
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 1.5, type: 'spring', stiffness: 300 }}
                        className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center"
                      >
                        <CheckCheck className="w-3 h-3 text-emerald-400" />
                      </motion.div>
                    </div>
                    {/* Message bubble */}
                    <div
                      className="rounded-xl px-3.5 py-3 text-[11px] leading-relaxed font-mono whitespace-pre-line"
                      style={{
                        background: demo.note.channel === 'WhatsApp' ? 'rgba(7,94,84,0.6)' : 'rgba(0,0,0,0.3)',
                        color: 'rgba(255,255,255,0.75)',
                      }}
                    >
                      {demo.note.message}
                    </div>
                    <div className="flex items-center justify-end gap-1 mt-2">
                      <span className="text-[9px] text-white/20">Delivered</span>
                      <CheckCheck className="w-3 h-3" style={{ color: demo.note.channel === 'WhatsApp' ? '#25D366' : '#60a5fa' }} />
                    </div>
                  </motion.div>

                </motion.div>
              </AnimatePresence>
            </div>

          </div>
        </motion.div>

        {/* Bottom note */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="text-center text-xs text-white/20 mt-6"
        >
          All of the above happens automatically · Average total time: &lt;4 seconds · No human involved
        </motion.p>

      </div>
    </section>
  )
}
