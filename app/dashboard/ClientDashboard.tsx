'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap, LayoutDashboard, Users, MessageSquare, Calendar,
  Settings, LogOut, TrendingUp, TrendingDown,
  Mail, Phone, Globe, CheckCircle, AlertCircle,
  Clock, Search, X, BarChart2, MessageCircle,
  Database, Activity, RefreshCw, ArrowUpRight,
  Bell, Shield, Link2, ChevronRight,
} from 'lucide-react'

/* ── Types ───────────────────────────────────────────────────── */

type Section = 'overview' | 'leads' | 'chat' | 'appointments' | 'automation' | 'settings'
type LeadStatus = 'new' | 'contacted' | 'demo_booked' | 'won' | 'lost'
type ApptStatus = 'confirmed' | 'pending' | 'completed'
type Channel    = 'WhatsApp' | 'Website' | 'Email'

interface Lead {
  id: string; name: string; company: string; email: string
  phone: string; source: string; status: LeadStatus; date: string
}
interface Chat {
  id: string; name: string; company: string; channel: Channel
  lastMessage: string; time: string; unread: number
}
interface Appointment {
  id: string; name: string; company: string; type: string
  date: string; time: string; status: ApptStatus; upcoming: boolean
}
interface Automation {
  id: string; label: string; description: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  status: 'active' | 'connected' | 'paused'
  stat1Label: string; stat1Value: string
  stat2Label: string; stat2Value: string
  lastActivity: string; color: string
}

/* ── Mock Data ───────────────────────────────────────────────── */

const LEADS: Lead[] = [
  { id:'1',  name:'Sarah Mitchell',   company:'Orbit Digital',        email:'sarah.m@orbitdigital.io',    phone:'+44 7700 900123', source:'Website Chat', status:'demo_booked', date:'2026-05-21T09:15:00Z' },
  { id:'2',  name:'James Okafor',     company:'Okafor & Co',          email:'james@okafor.co.uk',          phone:'+44 7911 123456', source:'WhatsApp',    status:'new',         date:'2026-05-21T08:42:00Z' },
  { id:'3',  name:'Priya Sharma',     company:'GrowFast Ltd',         email:'priya.s@growfast.com',         phone:'+44 7800 456789', source:'Email',       status:'contacted',   date:'2026-05-20T14:30:00Z' },
  { id:'4',  name:'Daniel Lee',       company:'Lee Consulting',       email:'daniel@leeconsult.com',        phone:'+44 7922 654321', source:'Website Chat', status:'won',         date:'2026-05-19T11:00:00Z' },
  { id:'5',  name:'Amina Hassan',     company:'Hassan Group',         email:'amina@hassangroup.co',         phone:'+44 7833 789012', source:'WhatsApp',    status:'contacted',   date:'2026-05-18T16:20:00Z' },
  { id:'6',  name:'Tom Reynolds',     company:'Reynolds Tech',        email:'tom@reynoldstech.io',          phone:'+44 7744 234567', source:'Website Chat', status:'new',         date:'2026-05-17T10:45:00Z' },
  { id:'7',  name:'Chen Wei',         company:'Wei Innovations',      email:'chen@weiinnovations.com',      phone:'+44 7955 345678', source:'WhatsApp',    status:'demo_booked', date:'2026-05-16T09:30:00Z' },
  { id:'8',  name:'Fatima Al-Rashid', company:'Al-Rashid Partners',  email:'fatima@alrashid.ae',           phone:'+971 50 123 4567', source:'Email',      status:'won',         date:'2026-05-15T13:00:00Z' },
  { id:'9',  name:'Marcus Brown',     company:'Brown & Associates',   email:'marcus@brownassoc.co.uk',      phone:'+44 7866 456789', source:'Website Chat', status:'lost',        date:'2026-05-14T15:30:00Z' },
  { id:'10', name:'Nina Kowalski',    company:'Kowalski Design',      email:'nina@kowalskidesign.pl',       phone:'+48 601 234 567', source:'WhatsApp',    status:'contacted',   date:'2026-05-13T11:15:00Z' },
]

const CHATS: Chat[] = [
  { id:'1', name:'Sarah Mitchell',   company:'Orbit Digital',   channel:'WhatsApp', lastMessage:"Perfect, I'll join the call at 3pm tomorrow",             time:'09:15',     unread:0 },
  { id:'2', name:'James Okafor',     company:'Okafor & Co',     channel:'WhatsApp', lastMessage:"Hi, I'm interested in your AI receptionist service",        time:'08:42',     unread:1 },
  { id:'3', name:'Tom Reynolds',     company:'Reynolds Tech',   channel:'Website',  lastMessage:"Does this integrate with our existing booking system?",      time:'Yesterday', unread:0 },
  { id:'4', name:'Chen Wei',         company:'Wei Innovations', channel:'WhatsApp', lastMessage:"When exactly is the demo scheduled?",                        time:'Mon',       unread:0 },
  { id:'5', name:'Amina Hassan',     company:'Hassan Group',    channel:'Email',    lastMessage:"Please send more details about enterprise pricing",           time:'Mon',       unread:0 },
]

const APPOINTMENTS: Appointment[] = [
  { id:'1', name:'Sarah Mitchell',   company:'Orbit Digital',      type:'Demo Call',       date:'2026-05-22', time:'15:00', status:'confirmed', upcoming:true  },
  { id:'2', name:'Chen Wei',         company:'Wei Innovations',    type:'Demo Call',       date:'2026-05-23', time:'10:00', status:'confirmed', upcoming:true  },
  { id:'3', name:'Priya Sharma',     company:'GrowFast Ltd',       type:'Discovery Call',  date:'2026-05-24', time:'14:00', status:'pending',   upcoming:true  },
  { id:'4', name:'Tom Reynolds',     company:'Reynolds Tech',      type:'Discovery Call',  date:'2026-05-28', time:'16:00', status:'pending',   upcoming:true  },
  { id:'5', name:'Daniel Lee',       company:'Lee Consulting',     type:'Onboarding',      date:'2026-05-15', time:'11:00', status:'completed', upcoming:false },
  { id:'6', name:'Fatima Al-Rashid', company:'Al-Rashid Partners', type:'Onboarding',      date:'2026-05-10', time:'09:00', status:'completed', upcoming:false },
]

const AUTOMATIONS: Automation[] = [
  {
    id:'whatsapp', label:'WhatsApp Bot', color:'#34d399', icon: MessageCircle,
    description:'Auto-replies and lead capture via WhatsApp Business API',
    status:'active', lastActivity:'2 min ago',
    stat1Label:'Messages this week', stat1Value:'127',
    stat2Label:'Leads captured',     stat2Value:'8',
  },
  {
    id:'webchat', label:'Website Chat Widget', color:'#60a5fa', icon: MessageSquare,
    description:'Embedded live chat on your website for instant visitor engagement',
    status:'active', lastActivity:'8 min ago',
    stat1Label:'Chats this week', stat1Value:'89',
    stat2Label:'Leads captured',  stat2Value:'5',
  },
  {
    id:'email', label:'Email Follow-up', color:'#fbbf24', icon: Mail,
    description:'Automated follow-up sequences for leads that haven\'t responded',
    status:'active', lastActivity:'1 hour ago',
    stat1Label:'Emails sent', stat1Value:'34',
    stat2Label:'Open rate',   stat2Value:'68%',
  },
  {
    id:'crm', label:'Google Sheets / CRM', color:'#a78bfa', icon: Database,
    description:'All leads and conversations synced automatically to your spreadsheet',
    status:'connected', lastActivity:'5 min ago',
    stat1Label:'Records synced', stat1Value:'47',
    stat2Label:'Last sync',      stat2Value:'5 min ago',
  },
]

/* ── Constants ───────────────────────────────────────────────── */

const STATUS_CFG: Record<LeadStatus, { label: string; color: string; bg: string; border: string }> = {
  new:         { label:'New',         color:'#a78bfa', bg:'rgba(167,139,250,0.10)', border:'rgba(167,139,250,0.25)' },
  contacted:   { label:'Contacted',   color:'#60a5fa', bg:'rgba(96,165,250,0.10)',  border:'rgba(96,165,250,0.25)'  },
  demo_booked: { label:'Demo Booked', color:'#fbbf24', bg:'rgba(251,191,36,0.10)',  border:'rgba(251,191,36,0.25)'  },
  won:         { label:'Won',         color:'#34d399', bg:'rgba(52,211,153,0.10)',  border:'rgba(52,211,153,0.25)'  },
  lost:        { label:'Lost',        color:'#f87171', bg:'rgba(248,113,113,0.10)', border:'rgba(248,113,113,0.25)' },
}

const APPT_CFG: Record<ApptStatus, { label: string; color: string; bg: string }> = {
  confirmed: { label:'Confirmed', color:'#34d399', bg:'rgba(52,211,153,0.10)'  },
  pending:   { label:'Pending',   color:'#fbbf24', bg:'rgba(251,191,36,0.10)'  },
  completed: { label:'Completed', color:'#60a5fa', bg:'rgba(96,165,250,0.10)'  },
}

const CHANNEL_CFG: Record<Channel, { color: string; bg: string }> = {
  WhatsApp: { color:'#34d399', bg:'rgba(52,211,153,0.10)'   },
  Website:  { color:'#60a5fa', bg:'rgba(96,165,250,0.10)'   },
  Email:    { color:'#fbbf24', bg:'rgba(251,191,36,0.10)'   },
}

const NAV_ITEMS: { id: Section; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
  { id:'overview',     label:'Overview',      icon:LayoutDashboard },
  { id:'leads',        label:'Leads',         icon:Users,          badge:10 },
  { id:'chat',         label:'Chat History',  icon:MessageSquare,  badge:1  },
  { id:'appointments', label:'Appointments',  icon:Calendar        },
  { id:'automation',   label:'Automation',    icon:Zap             },
  { id:'settings',     label:'Settings',      icon:Settings        },
]

/* ── Helpers ─────────────────────────────────────────────────── */

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short' })
}

function fmtApptDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' })
}

/* ── Shared Components ───────────────────────────────────────── */

function StatusBadge({ status }: { status: LeadStatus }) {
  const c = STATUS_CFG[status]
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap"
      style={{ color:c.color, background:c.bg, border:`1px solid ${c.border}` }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background:c.color }} />
      {c.label}
    </span>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl ${className}`}
      style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}>
      {children}
    </div>
  )
}

/* ── Sidebar ─────────────────────────────────────────────────── */

function Sidebar({ active, onNav }: { active: Section; onNav: (s: Section) => void }) {
  return (
    <aside className="w-[260px] flex-shrink-0 flex flex-col h-screen sticky top-0"
      style={{ background:'rgba(5,5,20,0.98)', borderRight:'1px solid rgba(255,255,255,0.06)' }}>

      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5" style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background:'linear-gradient(135deg,#7c3aed,#2563eb)', boxShadow:'0 0 16px rgba(124,58,237,0.4)' }}>
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="text-sm font-bold text-white leading-none">InstantDesk</div>
          <div className="text-[10px] text-white/30 mt-0.5">Client Portal</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const isActive = active === item.id
          return (
            <div key={item.id} className="relative">
              {isActive && (
                <div className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full"
                  style={{ background:'linear-gradient(180deg,#7c3aed,#2563eb)' }} />
              )}
              <button
                onClick={() => onNav(item.id)}
                className="flex items-center gap-3 w-full pl-4 pr-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
                style={isActive
                  ? { background:'rgba(139,92,246,0.10)', color:'#c4b5fd' }
                  : { color:'rgba(255,255,255,0.40)' }}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge !== undefined && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{
                      background: isActive ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.08)',
                      color:      isActive ? '#c4b5fd'                 : 'rgba(255,255,255,0.35)',
                    }}>
                    {item.badge}
                  </span>
                )}
              </button>
            </div>
          )
        })}
      </nav>

      {/* User + logout */}
      <div className="px-3 pb-5 pt-4" style={{ borderTop:'1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1"
          style={{ background:'rgba(255,255,255,0.03)' }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black text-white flex-shrink-0"
            style={{ background:'linear-gradient(135deg,rgba(124,58,237,0.6),rgba(37,99,235,0.5))' }}>
            AT
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white/80 truncate">Alex Thompson</div>
            <div className="text-[10px] text-white/30 truncate">TechFlow Solutions</div>
          </div>
        </div>
        <button
          onClick={() => { window.location.href = '/client-login' }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-white/35 hover:text-red-400 hover:bg-red-500/8 transition-all w-full"
        >
          <LogOut className="w-3.5 h-3.5" />
          Log out
        </button>
      </div>
    </aside>
  )
}

/* ── Overview Section ────────────────────────────────────────── */

function OverviewSection() {
  const kpis = [
    { label:'Total Leads',      value:47,    sub:'+8 this week',     color:'#a78bfa', icon:Users,         trend:'up'   as const },
    { label:'Booked Demos',     value:12,    sub:'4 upcoming',       color:'#60a5fa', icon:Calendar,      trend:'up'   as const },
    { label:'Response Rate',    value:'94%', sub:'avg 4 min reply',  color:'#34d399', icon:Activity,      trend:'up'   as const },
    { label:'Missed Messages',  value:3,     sub:'needs attention',  color:'#f87171', icon:AlertCircle,   trend:'down' as const },
  ]

  const recentLeads = LEADS.slice(0, 5)

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <motion.div
            key={k.label}
            initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
            transition={{ delay: i * 0.06, duration: 0.4 }}
          >
            <Card className="p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-white/35 uppercase tracking-widest">{k.label}</span>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background:`${k.color}18`, border:`1px solid ${k.color}30` }}>
                  <k.icon className="w-4 h-4" style={{ color:k.color }} />
                </div>
              </div>
              <div>
                <div className="text-3xl font-black text-white tracking-tight">{k.value}</div>
                <div className="flex items-center gap-1 mt-1">
                  {k.trend === 'up'
                    ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                    : <TrendingDown className="w-3 h-3 text-red-400" />}
                  <span className="text-xs text-white/30">{k.sub}</span>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Leads */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.25 }}
        >
          <Card>
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
              <h2 className="text-sm font-bold text-white">Recent Leads</h2>
              <span className="text-xs text-white/30">{recentLeads.length} of {LEADS.length}</span>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {recentLeads.map(lead => (
                <div key={lead.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black text-white flex-shrink-0"
                    style={{ background:'linear-gradient(135deg,rgba(124,58,237,0.5),rgba(37,99,235,0.4))' }}>
                    {initials(lead.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white/80 truncate">{lead.name}</div>
                    <div className="text-xs text-white/30 truncate">{lead.company}</div>
                  </div>
                  <StatusBadge status={lead.status} />
                  <span className="text-xs text-white/25 whitespace-nowrap hidden sm:block">{fmtDate(lead.date)}</span>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>

        {/* Automation Health */}
        <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.30 }}>
          <Card className="h-full">
            <div className="px-5 py-4" style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
              <h2 className="text-sm font-bold text-white">Automation Health</h2>
            </div>
            <div className="p-5 flex flex-col gap-3">
              {AUTOMATIONS.map(a => (
                <div key={a.id} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background:`${a.color}18`, border:`1px solid ${a.color}25` }}>
                    <a.icon className="w-3.5 h-3.5" style={{ color:a.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-white/70 truncate">{a.label}</div>
                    <div className="text-[10px] text-white/30">{a.lastActivity}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background:a.color }} />
                    <span className="text-[10px] font-semibold capitalize" style={{ color:a.color }}>{a.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}

/* ── Leads Section ───────────────────────────────────────────── */

function LeadsSection() {
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return LEADS.filter(l => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false
      if (!q) return true
      return l.name.toLowerCase().includes(q) ||
             l.company.toLowerCase().includes(q) ||
             l.email.toLowerCase().includes(q)
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [search, statusFilter])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: LEADS.length }
    for (const l of LEADS) c[l.status] = (c[l.status] ?? 0) + 1
    return c
  }, [])

  return (
    <Card>
      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 px-5 py-4"
        style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
          <input
            type="text" placeholder="Search leads…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all"
            style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)' }}
            onFocus={e => { e.currentTarget.style.border = '1px solid rgba(139,92,246,0.4)' }}
            onBlur={e =>  { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['all', 'new', 'contacted', 'demo_booked', 'won', 'lost'] as const).map(s => {
            const isActive = statusFilter === s
            const cfg = s === 'all' ? null : STATUS_CFG[s]
            return (
              <button key={s} onClick={() => setStatusFilter(s)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                style={isActive ? {
                  background: cfg ? cfg.bg : 'rgba(255,255,255,0.08)',
                  border: `1px solid ${cfg ? cfg.border : 'rgba(255,255,255,0.2)'}`,
                  color: cfg ? cfg.color : '#fff',
                } : {
                  background: 'transparent', border: '1px solid transparent', color: 'rgba(255,255,255,0.35)',
                }}>
                {s === 'all' ? 'All' : cfg!.label}
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                  style={{
                    background: isActive && cfg ? cfg.border : 'rgba(255,255,255,0.08)',
                    color:      isActive && cfg ? cfg.color  : 'rgba(255,255,255,0.35)',
                  }}>
                  {counts[s] ?? 0}
                </span>
              </button>
            )
          })}
        </div>
        <span className="text-xs text-white/20 ml-auto hidden sm:block">{filtered.length} lead{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full" style={{ minWidth:'720px' }}>
          <thead>
            <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
              {['Lead', 'Email', 'Phone', 'Source', 'Submitted', 'Status'].map(col => (
                <th key={col} className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-white/25">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            <AnimatePresence initial={false}>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <p className="text-sm text-white/25">No leads match your filters</p>
                    <button onClick={() => { setSearch(''); setStatusFilter('all') }} className="text-xs text-violet-400 hover:text-violet-300 mt-2">
                      Clear filters
                    </button>
                  </td>
                </tr>
              ) : filtered.map((lead, i) => (
                <motion.tr key={lead.id}
                  initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                  transition={{ delay: i * 0.02 }}
                  className="transition-colors duration-100 cursor-default"
                  style={{ background:'transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                        style={{ background:'linear-gradient(135deg,rgba(124,58,237,0.5),rgba(37,99,235,0.4))' }}>
                        {initials(lead.name)}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white/80">{lead.name}</div>
                        <div className="text-xs text-white/30 truncate max-w-[120px]">{lead.company}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-white/50 truncate max-w-[180px]">{lead.email}</td>
                  <td className="px-5 py-3.5 text-sm text-white/50 whitespace-nowrap">{lead.phone}</td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-white/50 bg-white/5 px-2 py-1 rounded-lg">{lead.source}</span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-white/35 whitespace-nowrap">{fmtDate(lead.date)}</td>
                  <td className="px-5 py-3.5"><StatusBadge status={lead.status} /></td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ── Chat Section ────────────────────────────────────────────── */

function ChatSection() {
  return (
    <Card>
      <div className="px-5 py-4" style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
        <h2 className="text-sm font-bold text-white">Recent Conversations</h2>
        <p className="text-xs text-white/30 mt-0.5">{CHATS.length} conversations · {CHATS.reduce((n, c) => n + c.unread, 0)} unread</p>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {CHATS.map((chat, i) => {
          const ch = CHANNEL_CFG[chat.channel]
          return (
            <motion.div key={chat.id}
              initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }} transition={{ delay: i * 0.05 }}
              className="flex items-center gap-4 px-5 py-4 transition-colors duration-150 cursor-pointer"
              style={{ background:'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <div className="relative flex-shrink-0">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white"
                  style={{ background:'linear-gradient(135deg,rgba(124,58,237,0.5),rgba(37,99,235,0.4))' }}>
                  {initials(chat.name)}
                </div>
                {chat.unread > 0 && (
                  <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center text-[9px] font-black text-white">
                    {chat.unread}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-white/80">{chat.name}</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ color:ch.color, background:ch.bg }}>
                    {chat.channel}
                  </span>
                </div>
                <p className="text-xs text-white/35 truncate">{chat.lastMessage}</p>
              </div>
              <div className="flex-shrink-0 text-right">
                <div className="text-xs text-white/25">{chat.time}</div>
                <ChevronRight className="w-4 h-4 text-white/15 mt-1 ml-auto" />
              </div>
            </motion.div>
          )
        })}
      </div>
    </Card>
  )
}

/* ── Appointments Section ────────────────────────────────────── */

function AppointmentsSection() {
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const shown = APPOINTMENTS.filter(a => a.upcoming === (tab === 'upcoming'))

  return (
    <Card>
      {/* Tabs */}
      <div className="flex items-center gap-1 px-5 py-4" style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
        {(['upcoming', 'past'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all"
            style={tab === t
              ? { background:'rgba(139,92,246,0.12)', color:'#c4b5fd', border:'1px solid rgba(139,92,246,0.25)' }
              : { background:'transparent', color:'rgba(255,255,255,0.35)', border:'1px solid transparent' }}>
            {t} ({APPOINTMENTS.filter(a => a.upcoming === (t === 'upcoming')).length})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full" style={{ minWidth:'560px' }}>
          <thead>
            <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
              {['Client', 'Type', 'Date', 'Time', 'Status'].map(col => (
                <th key={col} className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-white/25">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            <AnimatePresence initial={false} mode="wait">
              {shown.map((appt, i) => {
                const sc = APPT_CFG[appt.status]
                return (
                  <motion.tr key={appt.id}
                    initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                    transition={{ delay: i * 0.04 }}
                    className="cursor-default"
                    style={{ background:'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td className="px-5 py-3.5">
                      <div className="text-sm font-semibold text-white/80">{appt.name}</div>
                      <div className="text-xs text-white/30">{appt.company}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-white/50 bg-white/5 px-2 py-1 rounded-lg">{appt.type}</span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-white/50 whitespace-nowrap">{fmtApptDate(appt.date)}</td>
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-1.5 text-sm text-white/50">
                        <Clock className="w-3.5 h-3.5 text-white/25" />
                        {appt.time}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
                        style={{ color:sc.color, background:sc.bg }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background:sc.color }} />
                        {sc.label}
                      </span>
                    </td>
                  </motion.tr>
                )
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ── Automation Section ──────────────────────────────────────── */

function AutomationSection() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {AUTOMATIONS.map((a, i) => (
        <motion.div key={a.id}
          initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay: i * 0.07 }}>
          <Card className="p-6 flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background:`${a.color}18`, border:`1px solid ${a.color}30` }}>
                  <a.icon className="w-5 h-5" style={{ color:a.color }} />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">{a.label}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background:a.color }} />
                    <span className="text-[10px] font-semibold capitalize" style={{ color:a.color }}>{a.status}</span>
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-white/25 whitespace-nowrap pt-1">{a.lastActivity}</div>
            </div>

            <p className="text-xs text-white/40 leading-relaxed">{a.description}</p>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label:a.stat1Label, value:a.stat1Value },
                { label:a.stat2Label, value:a.stat2Value },
              ].map(s => (
                <div key={s.label} className="rounded-xl px-4 py-3"
                  style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)' }}>
                  <div className="text-xl font-black text-white">{s.value}</div>
                  <div className="text-[10px] text-white/30 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}

/* ── Settings Section ────────────────────────────────────────── */

function SettingsSection() {
  const panels = [
    { icon:Shield,     label:'Company Profile',           sub:'Business name, logo, contact details' },
    { icon:Bell,       label:'Notification Preferences',  sub:'Email alerts, SMS, push notifications' },
    { icon:Link2,      label:'Integrations',              sub:'Connect CRM, calendar, and more'       },
    { icon:BarChart2,  label:'Analytics & Reporting',     sub:'Automated weekly performance reports'  },
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 px-1">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background:'rgba(139,92,246,0.12)', border:'1px solid rgba(139,92,246,0.2)' }}>
          <Settings className="w-4 h-4 text-violet-400" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Settings</h2>
          <p className="text-xs text-white/30">Full configuration coming soon</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {panels.map((p, i) => (
          <motion.div key={p.label}
            initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay: i * 0.06 }}>
            <Card className="p-5 flex items-start gap-4 opacity-60 cursor-not-allowed">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)' }}>
                <p.icon className="w-4 h-4 text-white/40" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-white/60">{p.label}</div>
                <div className="text-xs text-white/25 mt-0.5">{p.sub}</div>
              </div>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full mt-0.5"
                style={{ background:'rgba(139,92,246,0.12)', color:'#a78bfa', border:'1px solid rgba(139,92,246,0.2)' }}>
                Soon
              </span>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/* ── Section meta ────────────────────────────────────────────── */

const SECTION_META: Record<Section, { title: string; sub: string }> = {
  overview:     { title:'Overview',      sub:'Your business at a glance'                   },
  leads:        { title:'Leads',         sub:'All captured leads and their status'          },
  chat:         { title:'Chat History',  sub:'Recent conversations across all channels'     },
  appointments: { title:'Appointments',  sub:'Scheduled calls, demos, and onboardings'      },
  automation:   { title:'Automation',    sub:'Live status of your AI-powered workflows'     },
  settings:     { title:'Settings',      sub:'Account and portal configuration'             },
}

/* ── Main ────────────────────────────────────────────────────── */

export default function ClientDashboard() {
  const [section, setSection] = useState<Section>('overview')
  const meta = SECTION_META[section]

  return (
    <div className="flex h-screen overflow-hidden" style={{ background:'#050510' }}>
      <Sidebar active={section} onNav={setSection} />

      <div className="flex-1 overflow-y-auto">
        {/* Sticky header */}
        <div className="sticky top-0 z-20 px-8 py-5"
          style={{ background:'rgba(5,5,16,0.95)', backdropFilter:'blur(20px)', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">{meta.title}</h1>
              <p className="text-xs text-white/35 mt-0.5">{meta.sub}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                style={{ background:'rgba(52,211,153,0.08)', border:'1px solid rgba(52,211,153,0.2)', color:'#34d399' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                All systems live
              </div>
              <button
                onClick={() => { window.location.href = '/client-login' }}
                className="flex items-center gap-1.5 text-xs text-white/25 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/8"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Log out</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-7">
          <AnimatePresence mode="wait">
            <motion.div key={section}
              initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}
              transition={{ duration:0.25 }}>
              {section === 'overview'     && <OverviewSection />}
              {section === 'leads'        && <LeadsSection />}
              {section === 'chat'         && <ChatSection />}
              {section === 'appointments' && <AppointmentsSection />}
              {section === 'automation'   && <AutomationSection />}
              {section === 'settings'     && <SettingsSection />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
