'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap, LayoutDashboard, Users, MessageSquare, Calendar,
  Settings, LogOut, TrendingUp, TrendingDown, Mail, Phone,
  CheckCircle, AlertCircle, Clock, Search, X, BarChart2,
  MessageCircle, Database, Activity, RefreshCw,
  Bell, Shield, Link2, Download, ChevronRight,
  Target, DollarSign, Timer,
} from 'lucide-react'

/* ─── Types ──────────────────────────────────────────────────── */

type Section     = 'overview' | 'pipeline' | 'activity' | 'appointments' | 'automation' | 'settings'
type LeadStatus  = 'new' | 'contacted' | 'demo_booked' | 'won' | 'lost'
type ScoreLabel  = 'hot' | 'warm' | 'cold'
type ApptStatus  = 'confirmed' | 'pending' | 'completed'
type ActivityType = 'sms' | 'appointment' | 'assignment' | 'email' | 'call'

interface AutoState {
  aiSms:       'sent' | 'scheduled' | 'off'
  emailSeq:    'active' | 'paused' | 'not_started'
  nurture:     'active' | 'not_started'
  smartAssign: 'assigned' | 'unassigned'
  autoCall:    'scheduled' | 'completed' | 'off'
}

interface Lead {
  id: string; name: string; company: string
  source: string; interest: string; assignedAgent: string
  score: number; scoreLabel: ScoreLabel; status: LeadStatus
  date: string; auto: AutoState
}

interface ActivityItem {
  id: string; type: ActivityType
  text: string; sub: string; time: string
}

interface Appointment {
  id: string; name: string; company: string
  type: string; date: string; time: string
  status: ApptStatus; upcoming: boolean
}

/* ─── Mock Data ──────────────────────────────────────────────── */

const LEADS: Lead[] = [
  { id:'1',  name:'Sarah Mitchell',   company:'Orbit Digital',       source:'Website Chat', interest:'AI Receptionist',    assignedAgent:'Priya S.',  score:92, scoreLabel:'hot',  status:'demo_booked', date:'2026-05-21T09:15:00Z', auto:{ aiSms:'sent',      emailSeq:'active',      nurture:'not_started', smartAssign:'assigned',   autoCall:'off'       }},
  { id:'2',  name:'James Okafor',     company:'Okafor & Co',         source:'WhatsApp',     interest:'WhatsApp Automation', assignedAgent:'James M.',  score:78, scoreLabel:'hot',  status:'new',         date:'2026-05-21T08:42:00Z', auto:{ aiSms:'sent',      emailSeq:'not_started', nurture:'not_started', smartAssign:'assigned',   autoCall:'scheduled' }},
  { id:'3',  name:'Priya Sharma',     company:'GrowFast Ltd',        source:'Email',        interest:'Full Suite',          assignedAgent:'Priya S.',  score:61, scoreLabel:'warm', status:'contacted',   date:'2026-05-20T14:30:00Z', auto:{ aiSms:'scheduled', emailSeq:'active',      nurture:'active',      smartAssign:'assigned',   autoCall:'off'       }},
  { id:'4',  name:'Daniel Lee',       company:'Lee Consulting',      source:'Website Chat', interest:'Lead Capture',        assignedAgent:'Daniel C.', score:55, scoreLabel:'warm', status:'won',         date:'2026-05-19T11:00:00Z', auto:{ aiSms:'off',       emailSeq:'paused',      nurture:'active',      smartAssign:'assigned',   autoCall:'completed' }},
  { id:'5',  name:'Amina Hassan',     company:'Hassan Group',        source:'WhatsApp',     interest:'AI Receptionist',    assignedAgent:'Priya S.',  score:48, scoreLabel:'warm', status:'contacted',   date:'2026-05-18T16:20:00Z', auto:{ aiSms:'sent',      emailSeq:'active',      nurture:'not_started', smartAssign:'assigned',   autoCall:'off'       }},
  { id:'6',  name:'Tom Reynolds',     company:'Reynolds Tech',       source:'Website Chat', interest:'WhatsApp Automation', assignedAgent:'James M.',  score:35, scoreLabel:'cold', status:'new',         date:'2026-05-17T10:45:00Z', auto:{ aiSms:'scheduled', emailSeq:'not_started', nurture:'not_started', smartAssign:'unassigned', autoCall:'off'       }},
  { id:'7',  name:'Chen Wei',         company:'Wei Innovations',     source:'WhatsApp',     interest:'Full Suite',          assignedAgent:'Daniel C.', score:83, scoreLabel:'hot',  status:'demo_booked', date:'2026-05-16T09:30:00Z', auto:{ aiSms:'sent',      emailSeq:'active',      nurture:'not_started', smartAssign:'assigned',   autoCall:'scheduled' }},
  { id:'8',  name:'Fatima Al-Rashid', company:'Al-Rashid Partners',  source:'Email',        interest:'Enterprise Pack',     assignedAgent:'Sarah K.',  score:90, scoreLabel:'hot',  status:'won',         date:'2026-05-15T13:00:00Z', auto:{ aiSms:'off',       emailSeq:'paused',      nurture:'active',      smartAssign:'assigned',   autoCall:'completed' }},
  { id:'9',  name:'Marcus Brown',     company:'Brown & Associates',  source:'Website Chat', interest:'Lead Capture',        assignedAgent:'Sarah K.',  score:22, scoreLabel:'cold', status:'lost',        date:'2026-05-14T15:30:00Z', auto:{ aiSms:'off',       emailSeq:'paused',      nurture:'not_started', smartAssign:'assigned',   autoCall:'off'       }},
  { id:'10', name:'Nina Kowalski',    company:'Kowalski Design',     source:'WhatsApp',     interest:'WhatsApp Automation', assignedAgent:'James M.',  score:44, scoreLabel:'warm', status:'contacted',   date:'2026-05-13T11:15:00Z', auto:{ aiSms:'sent',      emailSeq:'active',      nurture:'not_started', smartAssign:'assigned',   autoCall:'off'       }},
]

const ACTIVITY: ActivityItem[] = [
  { id:'1',  type:'sms',         text:'AI SMS sent to James Okafor',                sub:'WhatsApp · auto-triggered on sign-up',        time:'2 min ago'   },
  { id:'2',  type:'appointment', text:'Demo call booked — Sarah Mitchell',          sub:'Thu 22 May · 3:00 PM · confirmed',            time:'10 min ago'  },
  { id:'3',  type:'assignment',  text:'Lead assigned to Priya S.',                  sub:'Chen Wei · smart assignment by score',        time:'18 min ago'  },
  { id:'4',  type:'email',       text:'Email sequence triggered — Tom Reynolds',    sub:'Follow-up sequence day 1 sent',               time:'32 min ago'  },
  { id:'5',  type:'sms',         text:'Follow-up SMS sent to Nina Kowalski',        sub:'WhatsApp · day 3 drip sequence',              time:'1 hour ago'  },
  { id:'6',  type:'appointment', text:'Discovery call booked — Priya Sharma',       sub:'Fri 23 May · 2:00 PM · pending confirmation', time:'2 hours ago' },
  { id:'7',  type:'assignment',  text:'Smart assignment — Amina Hassan → Priya S.', sub:'Based on availability score and territory',   time:'3 hours ago' },
  { id:'8',  type:'email',       text:'Nurture sequence started — Marcus Brown',    sub:'30-day drip campaign initiated',              time:'5 hours ago' },
  { id:'9',  type:'call',        text:'Auto-call completed — Daniel Lee',           sub:'Duration: 4 min 32 sec · outcome logged',    time:'Yesterday'   },
  { id:'10', type:'email',       text:'Welcome email sent — James Okafor',          sub:'Instant auto-response triggered',             time:'Yesterday'   },
]

const APPOINTMENTS: Appointment[] = [
  { id:'1', name:'Fatima Al-Rashid', company:'Al-Rashid Partners', type:'Onboarding',      date:'2026-05-18', time:'09:00', status:'completed', upcoming:false },
  { id:'2', name:'Daniel Lee',       company:'Lee Consulting',     type:'Onboarding',      date:'2026-05-19', time:'11:00', status:'completed', upcoming:false },
  { id:'3', name:'Chen Wei',         company:'Wei Innovations',    type:'Demo Call',       date:'2026-05-22', time:'10:00', status:'confirmed', upcoming:true  },
  { id:'4', name:'Sarah Mitchell',   company:'Orbit Digital',      type:'Demo Call',       date:'2026-05-22', time:'15:00', status:'confirmed', upcoming:true  },
  { id:'5', name:'Priya Sharma',     company:'GrowFast Ltd',       type:'Discovery Call',  date:'2026-05-23', time:'14:00', status:'pending',   upcoming:true  },
  { id:'6', name:'Tom Reynolds',     company:'Reynolds Tech',      type:'Discovery Call',  date:'2026-05-28', time:'16:00', status:'pending',   upcoming:true  },
]

const WEEK: { label: string; date: string; iso: string; today?: true }[] = [
  { label:'Mon', date:'18 May', iso:'2026-05-18' },
  { label:'Tue', date:'19 May', iso:'2026-05-19' },
  { label:'Wed', date:'20 May', iso:'2026-05-20' },
  { label:'Thu', date:'21 May', iso:'2026-05-21', today:true },
  { label:'Fri', date:'22 May', iso:'2026-05-22' },
]

/* ─── Config ─────────────────────────────────────────────────── */

const STATUS_CFG: Record<LeadStatus, { label: string; color: string; bg: string; border: string }> = {
  new:         { label:'New',         color:'#a78bfa', bg:'rgba(167,139,250,0.10)', border:'rgba(167,139,250,0.25)' },
  contacted:   { label:'Contacted',   color:'#60a5fa', bg:'rgba(96,165,250,0.10)',  border:'rgba(96,165,250,0.25)'  },
  demo_booked: { label:'Demo Booked', color:'#fbbf24', bg:'rgba(251,191,36,0.10)',  border:'rgba(251,191,36,0.25)'  },
  won:         { label:'Won',         color:'#34d399', bg:'rgba(52,211,153,0.10)',  border:'rgba(52,211,153,0.25)'  },
  lost:        { label:'Lost',        color:'#f87171', bg:'rgba(248,113,113,0.10)', border:'rgba(248,113,113,0.25)' },
}

const SCORE_CFG: Record<ScoreLabel, { label: string; color: string; bg: string; border: string }> = {
  hot:  { label:'Hot',  color:'#f87171', bg:'rgba(248,113,113,0.12)', border:'rgba(248,113,113,0.30)' },
  warm: { label:'Warm', color:'#fb923c', bg:'rgba(251,146,60,0.12)',  border:'rgba(251,146,60,0.30)'  },
  cold: { label:'Cold', color:'#60a5fa', bg:'rgba(96,165,250,0.12)',  border:'rgba(96,165,250,0.30)'  },
}

const APPT_CFG: Record<ApptStatus, { label: string; color: string; bg: string }> = {
  confirmed: { label:'Confirmed', color:'#34d399', bg:'rgba(52,211,153,0.10)'  },
  pending:   { label:'Pending',   color:'#fbbf24', bg:'rgba(251,191,36,0.10)'  },
  completed: { label:'Completed', color:'#60a5fa', bg:'rgba(96,165,250,0.10)'  },
}

const ACTIVITY_CFG: Record<ActivityType, { color: string; bg: string; Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }> = {
  sms:         { color:'#34d399', bg:'rgba(52,211,153,0.12)',  Icon: MessageCircle },
  appointment: { color:'#60a5fa', bg:'rgba(96,165,250,0.12)',  Icon: Calendar      },
  assignment:  { color:'#a78bfa', bg:'rgba(167,139,250,0.12)', Icon: Users         },
  email:       { color:'#fbbf24', bg:'rgba(251,191,36,0.12)',  Icon: Mail          },
  call:        { color:'#fb923c', bg:'rgba(251,146,60,0.12)',  Icon: Phone         },
}

const AUTO_COLOR: Record<string, string> = {
  active:'#34d399', sent:'#34d399', completed:'#34d399', assigned:'#34d399',
  scheduled:'#fbbf24',
  not_started:'rgba(255,255,255,0.18)', paused:'rgba(255,255,255,0.18)',
  off:'rgba(255,255,255,0.12)', unassigned:'rgba(255,255,255,0.15)',
}

const NAV_ITEMS: { id: Section; label: string; Icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
  { id:'overview',     label:'Overview',       Icon:LayoutDashboard             },
  { id:'pipeline',     label:'Lead Pipeline',  Icon:Users,       badge:10       },
  { id:'activity',     label:'Activity Feed',  Icon:Activity                    },
  { id:'appointments', label:'Appointments',   Icon:Calendar,    badge:4        },
  { id:'automation',   label:'Automation',     Icon:Zap                         },
  { id:'settings',     label:'Settings',       Icon:Settings                    },
]

const SECTION_META: Record<Section, { title: string; sub: string }> = {
  overview:     { title:'Overview',       sub:'Performance snapshot and live activity'         },
  pipeline:     { title:'Lead Pipeline',  sub:'All leads with scores and follow-up automation' },
  activity:     { title:'Activity Feed',  sub:'Automated events across all channels'           },
  appointments: { title:'Appointments',   sub:'Weekly schedule and upcoming bookings'          },
  automation:   { title:'Automation',     sub:'Follow-up status per lead and performance'      },
  settings:     { title:'Settings',       sub:'Account and portal configuration'               },
}

/* ─── Helpers ────────────────────────────────────────────────── */

function initials(name: string) { return name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase() }
function agentInitials(n: string) { return n.trim().split(/[\s.]+/).filter(Boolean).map(p => p[0]).join('').toUpperCase().slice(0,2) }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short' }) }
function fmtApptDate(d: string) { return new Date(d).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' }) }

/* ─── Shared Components ──────────────────────────────────────── */

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl ${className}`}
      style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}>
      {children}
    </div>
  )
}

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

function ScoreBadge({ score, label }: { score: number; label: ScoreLabel }) {
  const c = SCORE_CFG[label]
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-black" style={{ color:c.color }}>{score}</span>
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
        style={{ color:c.color, background:c.bg, border:`1px solid ${c.border}` }}>
        {c.label}
      </span>
    </div>
  )
}

function ExportButton() {
  const [s, setS] = useState<'idle'|'loading'|'done'>('idle')
  const go = () => {
    if (s !== 'idle') return
    setS('loading')
    setTimeout(() => { setS('done'); setTimeout(() => setS('idle'), 2000) }, 1400)
  }
  return (
    <button onClick={go} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all"
      style={{ background:'rgba(139,92,246,0.12)', border:'1px solid rgba(139,92,246,0.25)', color:'#c4b5fd' }}>
      {s === 'loading' ? (
        <><motion.span className="w-3.5 h-3.5 rounded-full border-2 border-violet-400/30 border-t-violet-400"
          animate={{ rotate:360 }} transition={{ duration:0.7, repeat:Infinity, ease:'linear' }} />Generating…</>
      ) : s === 'done' ? (
        <><CheckCircle className="w-3.5 h-3.5 text-emerald-400" /><span className="text-emerald-400">Exported!</span></>
      ) : (
        <><Download className="w-3.5 h-3.5" />Export Report</>
      )}
    </button>
  )
}

/* Icon rendered from a data-object safely (capitalized prop destructure) */
function DataIcon({ icon: Icon, className, style }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  className?: string; style?: React.CSSProperties
}) {
  return <Icon className={className} style={style} />
}

function AutoDots({ auto }: { auto: AutoState }) {
  const cols: { label: string; Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; status: string }[] = [
    { label:'AI SMS',       Icon:MessageCircle, status:auto.aiSms       },
    { label:'Email Seq',    Icon:Mail,          status:auto.emailSeq    },
    { label:'Nurture',      Icon:RefreshCw,     status:auto.nurture     },
    { label:'Assignment',   Icon:Users,         status:auto.smartAssign },
    { label:'Auto-call',    Icon:Phone,         status:auto.autoCall    },
  ]
  return (
    <div className="flex items-center gap-1">
      {cols.map(c => {
        const color = AUTO_COLOR[c.status] || 'rgba(255,255,255,0.15)'
        return (
          <div key={c.label} title={`${c.label}: ${c.status.replace(/_/g,' ')}`}
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background:`${color}18`, border:`1px solid ${color}35` }}>
            <DataIcon icon={c.Icon} className="w-3 h-3" style={{ color }} />
          </div>
        )
      })}
    </div>
  )
}

/* ─── Sidebar ────────────────────────────────────────────────── */

function Sidebar({ active, onNav }: { active: Section; onNav: (s: Section) => void }) {
  return (
    <aside className="w-[260px] flex-shrink-0 flex flex-col h-screen sticky top-0"
      style={{ background:'rgba(5,5,20,0.98)', borderRight:'1px solid rgba(255,255,255,0.06)' }}>

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

      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const isActive = active === item.id
          return (
            <div key={item.id} className="relative">
              {isActive && (
                <div className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full"
                  style={{ background:'linear-gradient(180deg,#7c3aed,#2563eb)' }} />
              )}
              <button onClick={() => onNav(item.id)}
                className="flex items-center gap-3 w-full pl-4 pr-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
                style={isActive ? { background:'rgba(139,92,246,0.10)', color:'#c4b5fd' } : { color:'rgba(255,255,255,0.40)' }}>
                <item.Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge !== undefined && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{
                      background: isActive ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.08)',
                      color:      isActive ? '#c4b5fd'                : 'rgba(255,255,255,0.35)',
                    }}>{item.badge}</span>
                )}
              </button>
            </div>
          )
        })}
      </nav>

      <div className="px-3 pb-5 pt-4" style={{ borderTop:'1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1" style={{ background:'rgba(255,255,255,0.03)' }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black text-white flex-shrink-0"
            style={{ background:'linear-gradient(135deg,rgba(124,58,237,0.6),rgba(37,99,235,0.5))' }}>AT</div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white/80 truncate">Alex Thompson</div>
            <div className="text-[10px] text-white/30 truncate">TechFlow Solutions</div>
          </div>
        </div>
        <button onClick={() => { window.location.href = '/client-login' }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-white/35 hover:text-red-400 hover:bg-red-500/8 transition-all w-full">
          <LogOut className="w-3.5 h-3.5" />Log out
        </button>
      </div>
    </aside>
  )
}

/* ─── Overview Section ───────────────────────────────────────── */

const KPI_DATA: {
  label: string; value: string | number; sub: string; color: string; trend: 'up' | 'down'
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
}[] = [
  { label:'New Leads This Week',  value:8,     sub:'vs 6 last week',  color:'#a78bfa', trend:'up',   Icon:Users      },
  { label:'Active Opportunities', value:6,     sub:'in pipeline',     color:'#60a5fa', trend:'up',   Icon:Target     },
  { label:'Appointments Booked',  value:4,     sub:'this week',       color:'#34d399', trend:'up',   Icon:Calendar   },
  { label:'Emails Sent',          value:34,    sub:'via automation',  color:'#fbbf24', trend:'up',   Icon:Mail       },
  { label:'Conversion Rate',      value:'17%', sub:'+3% vs last wk', color:'#fb923c', trend:'up',   Icon:BarChart2  },
]

const PERF_DATA: {
  label: string; value: string; sub: string; color: string
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
}[] = [
  { label:'Conversion Lift',  value:'+34%',   sub:'vs manual follow-up',   color:'#34d399', Icon:TrendingUp  },
  { label:'Agent Time Saved', value:'18 hrs', sub:'per week average',       color:'#60a5fa', Icon:Timer       },
  { label:'Monthly Deals',    value:'8',      sub:'closed this month',      color:'#a78bfa', Icon:CheckCircle },
  { label:'Est. Revenue',     value:'£47.2k', sub:'this month pipeline',    color:'#fbbf24', Icon:DollarSign  },
]

function OverviewSection() {
  const upcoming22 = APPOINTMENTS.filter(a => a.upcoming && a.date === '2026-05-22')
    .sort((a,b) => a.time.localeCompare(b.time))

  return (
    <div className="flex flex-col gap-6">
      {/* 5 KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        {KPI_DATA.map((k, i) => (
          <motion.div key={k.label} initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.06 }}>
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background:`${k.color}18`, border:`1px solid ${k.color}28` }}>
                  <DataIcon icon={k.Icon} className="w-4 h-4" style={{ color:k.color }} />
                </div>
                {k.trend === 'up'
                  ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
              </div>
              <div className="text-2xl font-black text-white tracking-tight">{k.value}</div>
              <div className="text-[10px] font-semibold text-white/35 uppercase tracking-wide mt-1 leading-tight">{k.label}</div>
              <div className="text-[10px] text-white/20 mt-0.5">{k.sub}</div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* 4 Performance cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {PERF_DATA.map((p, i) => (
          <motion.div key={p.label} initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.30+i*0.06 }}>
            <Card className="p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background:`${p.color}15`, border:`1px solid ${p.color}28` }}>
                <DataIcon icon={p.Icon} className="w-5 h-5" style={{ color:p.color }} />
              </div>
              <div>
                <div className="text-xl font-black text-white">{p.value}</div>
                <div className="text-xs font-semibold text-white/60 mt-0.5">{p.label}</div>
                <div className="text-[10px] text-white/25 mt-0.5">{p.sub}</div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Activity feed + upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <motion.div className="lg:col-span-3" initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.50 }}>
          <Card>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
              <h2 className="text-sm font-bold text-white">Recent Activity</h2>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                style={{ background:'rgba(52,211,153,0.08)', border:'1px solid rgba(52,211,153,0.2)', color:'#34d399' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live
              </div>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {ACTIVITY.slice(0,5).map((item, i) => {
                const cfg = ACTIVITY_CFG[item.type]
                return (
                  <motion.div key={item.id}
                    initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.55+i*0.04 }}
                    className="flex items-start gap-3 px-5 py-3.5">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background:cfg.bg, border:`1px solid ${cfg.color}25` }}>
                      <DataIcon icon={cfg.Icon} className="w-3.5 h-3.5" style={{ color:cfg.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white/80 truncate">{item.text}</div>
                      <div className="text-xs text-white/30 mt-0.5">{item.sub}</div>
                    </div>
                    <div className="text-xs text-white/25 whitespace-nowrap flex-shrink-0">{item.time}</div>
                  </motion.div>
                )
              })}
            </div>
          </Card>
        </motion.div>

        <motion.div className="lg:col-span-2" initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.55 }}>
          <Card className="h-full flex flex-col">
            <div className="px-5 py-4" style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
              <h2 className="text-sm font-bold text-white">Next Up — Fri 22 May</h2>
              <p className="text-xs text-white/30 mt-0.5">{upcoming22.length} appointments confirmed</p>
            </div>
            <div className="p-4 flex flex-col gap-3 flex-1">
              {upcoming22.map(appt => {
                const sc = APPT_CFG[appt.status]
                return (
                  <div key={appt.id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{ background:`${sc.color}08`, border:`1px solid ${sc.color}20` }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                      style={{ background:'linear-gradient(135deg,rgba(124,58,237,0.5),rgba(37,99,235,0.4))' }}>
                      {initials(appt.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-white/80 truncate">{appt.name}</div>
                      <div className="text-[10px] text-white/35">{appt.type}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-bold text-white/60">{appt.time}</div>
                      <div className="text-[10px] mt-0.5" style={{ color:sc.color }}>{sc.label}</div>
                    </div>
                  </div>
                )
              })}
              <div style={{ borderTop:'1px solid rgba(255,255,255,0.05)', marginTop:'4px', paddingTop:'8px' }}>
                {APPOINTMENTS.filter(a => a.upcoming && a.date !== '2026-05-22').map(appt => (
                  <div key={appt.id} className="flex items-center gap-2 py-1.5">
                    <Clock className="w-3 h-3 text-white/20 flex-shrink-0" />
                    <span className="text-xs text-white/35 truncate flex-1">{appt.name} · {appt.type}</span>
                    <span className="text-[10px] text-white/20 whitespace-nowrap">{fmtApptDate(appt.date)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}

/* ─── Pipeline Section ───────────────────────────────────────── */

function PipelineSection() {
  const [search,      setSearch]      = useState('')
  const [scoreFilter, setScoreFilter] = useState<ScoreLabel | 'all'>('all')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return LEADS
      .filter(l => {
        if (scoreFilter !== 'all' && l.scoreLabel !== scoreFilter) return false
        if (!q) return true
        return (
          l.name.toLowerCase().includes(q) ||
          l.company.toLowerCase().includes(q) ||
          l.interest.toLowerCase().includes(q) ||
          l.assignedAgent.toLowerCase().includes(q)
        )
      })
      .sort((a,b) => b.score - a.score)
  }, [search, scoreFilter])

  return (
    <Card>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 flex-wrap"
        style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
        <h2 className="text-sm font-bold text-white">
          Lead Pipeline <span className="font-normal text-white/30">({filtered.length})</span>
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          {(['all','hot','warm','cold'] as const).map(s => {
            const isA = scoreFilter === s
            const c   = s === 'all' ? null : SCORE_CFG[s]
            return (
              <button key={s} onClick={() => setScoreFilter(s)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold capitalize transition-all"
                style={isA ? {
                  background: c ? c.bg : 'rgba(255,255,255,0.08)',
                  border: `1px solid ${c ? c.border : 'rgba(255,255,255,0.2)'}`,
                  color: c ? c.color : '#fff',
                } : { background:'transparent', border:'1px solid transparent', color:'rgba(255,255,255,0.35)' }}>
                {s === 'all' ? 'All Scores' : s}
              </button>
            )
          })}
          <ExportButton />
        </div>
      </div>

      {/* Search */}
      <div className="px-5 py-3" style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
          <input type="text" placeholder="Search name, company, interest, agent…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all"
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
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full" style={{ minWidth:'1040px' }}>
          <thead>
            <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
              {['Lead / Company','Source','Interest / Service','Assigned Agent','Score','Status','Follow-up'].map(col => (
                <th key={col} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/25">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            <AnimatePresence initial={false}>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-16 text-center">
                  <p className="text-sm text-white/25">No leads match your filters</p>
                  <button onClick={() => { setSearch(''); setScoreFilter('all') }}
                    className="text-xs text-violet-400 hover:text-violet-300 mt-2">Clear filters</button>
                </td></tr>
              ) : filtered.map((lead, i) => (
                <motion.tr key={lead.id}
                  initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                  transition={{ delay:i*0.025 }}
                  style={{ background:'transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                        style={{ background:'linear-gradient(135deg,rgba(124,58,237,0.5),rgba(37,99,235,0.4))' }}>
                        {initials(lead.name)}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white/80 whitespace-nowrap">{lead.name}</div>
                        <div className="text-xs text-white/30 truncate max-w-[120px]">{lead.company}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs text-white/50 bg-white/5 px-2 py-1 rounded-lg whitespace-nowrap">{lead.source}</span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-white/55 whitespace-nowrap">{lead.interest}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black text-white flex-shrink-0"
                        style={{ background:'linear-gradient(135deg,rgba(99,102,241,0.5),rgba(37,99,235,0.5))' }}>
                        {agentInitials(lead.assignedAgent)}
                      </div>
                      <span className="text-xs text-white/55 whitespace-nowrap">{lead.assignedAgent}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5"><ScoreBadge score={lead.score} label={lead.scoreLabel} /></td>
                  <td className="px-4 py-3.5"><StatusBadge status={lead.status} /></td>
                  <td className="px-4 py-3.5"><AutoDots auto={lead.auto} /></td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-5 py-3" style={{ borderTop:'1px solid rgba(255,255,255,0.05)' }}>
        <span className="text-xs text-white/20">Showing {filtered.length} of {LEADS.length} · sorted by score</span>
        <div className="flex gap-4 text-[10px]">
          {(['hot','warm','cold'] as ScoreLabel[]).map(s => (
            <span key={s} style={{ color:SCORE_CFG[s].color }}>
              {LEADS.filter(l => l.scoreLabel === s).length} {SCORE_CFG[s].label}
            </span>
          ))}
        </div>
      </div>
    </Card>
  )
}

/* ─── Activity Section ───────────────────────────────────────── */

function ActivitySection() {
  return (
    <Card>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <h2 className="text-sm font-bold text-white">Automated Activity Feed</h2>
          <p className="text-xs text-white/30 mt-0.5">{ACTIVITY.length} events · last 24 hours</p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold"
          style={{ background:'rgba(52,211,153,0.08)', border:'1px solid rgba(52,211,153,0.2)', color:'#34d399' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live
        </div>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {ACTIVITY.map((item, i) => {
          const cfg = ACTIVITY_CFG[item.type]
          return (
            <motion.div key={item.id}
              initial={{ opacity:0, x:-12 }} animate={{ opacity:1, x:0 }} transition={{ delay:i*0.04 }}
              className="flex items-start gap-4 px-5 py-4 transition-colors duration-100"
              style={{ background:'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.015)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background:cfg.bg, border:`1px solid ${cfg.color}25` }}>
                <DataIcon icon={cfg.Icon} className="w-4 h-4" style={{ color:cfg.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white/80">{item.text}</div>
                <div className="text-xs text-white/35 mt-0.5">{item.sub}</div>
              </div>
              <div className="text-xs text-white/25 whitespace-nowrap flex-shrink-0 pt-0.5">{item.time}</div>
            </motion.div>
          )
        })}
      </div>
    </Card>
  )
}

/* ─── Appointments Section ───────────────────────────────────── */

function AppointmentsSection() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">Weekly Schedule</h2>
          <p className="text-xs text-white/30 mt-0.5">Week of 18–24 May 2026</p>
        </div>
        <ExportButton />
      </div>

      {/* Mon–Fri columns */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        {WEEK.map(day => {
          const dayAppts = APPOINTMENTS.filter(a => a.date === day.iso)
          return (
            <Card key={day.label} className={day.today ? 'ring-1 ring-violet-500/25' : ''}>
              <div className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: dayAppts.length ? '1px solid rgba(255,255,255,0.06)' : 'none', background: day.today ? 'rgba(139,92,246,0.06)' : 'transparent' }}>
                <div>
                  <div className="text-xs font-black text-white/60">{day.label}</div>
                  <div className="text-[10px] text-white/25">{day.date}</div>
                </div>
                {day.today && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background:'rgba(139,92,246,0.2)', color:'#c4b5fd', border:'1px solid rgba(139,92,246,0.3)' }}>
                    TODAY
                  </span>
                )}
              </div>
              {dayAppts.length > 0 ? (
                <div className="p-3 flex flex-col gap-2">
                  {dayAppts.map(appt => {
                    const sc = APPT_CFG[appt.status]
                    return (
                      <div key={appt.id} className="rounded-xl p-3"
                        style={{ background:`${sc.color}08`, border:`1px solid ${sc.color}20` }}>
                        <div className="text-[11px] font-bold text-white/80 leading-snug">{appt.name}</div>
                        <div className="text-[10px] text-white/40 mt-0.5">{appt.type}</div>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-1 text-[10px] text-white/35">
                            <Clock className="w-3 h-3" />{appt.time}
                          </div>
                          <span className="text-[9px] font-bold" style={{ color:sc.color }}>{sc.label}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="px-4 py-6 text-center">
                  <div className="text-[10px] text-white/15">Free</div>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* Beyond this week */}
      <Card>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="text-sm font-bold text-white">Upcoming</h2>
          <span className="text-xs text-white/30">Beyond this week</span>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {APPOINTMENTS.filter(a => !WEEK.some(d => d.iso === a.date)).map((appt, i) => {
            const sc = APPT_CFG[appt.status]
            return (
              <motion.div key={appt.id}
                initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.05 }}
                className="flex items-center gap-4 px-5 py-3.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                  style={{ background:'linear-gradient(135deg,rgba(124,58,237,0.4),rgba(37,99,235,0.3))' }}>
                  {initials(appt.name)}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-white/80">{appt.name}</div>
                  <div className="text-xs text-white/30">{appt.type} · {appt.company}</div>
                </div>
                <div className="text-right mr-2">
                  <div className="text-xs text-white/50">{fmtApptDate(appt.date)}</div>
                  <div className="text-[10px] text-white/30">{appt.time}</div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
                  style={{ color:sc.color, background:sc.bg }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background:sc.color }} />
                  {sc.label}
                </span>
              </motion.div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

/* ─── Automation Section ─────────────────────────────────────── */

const AUTO_COLS: { label: string; key: keyof AutoState; Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }[] = [
  { label:'AI SMS',        key:'aiSms',       Icon:MessageCircle },
  { label:'Email Seq',     key:'emailSeq',    Icon:Mail          },
  { label:'Nurture',       key:'nurture',     Icon:RefreshCw     },
  { label:'Smart Assign',  key:'smartAssign', Icon:Users         },
  { label:'Auto-call',     key:'autoCall',    Icon:Phone         },
]

function AutomationSection() {
  return (
    <div className="flex flex-col gap-6">
      {/* Performance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {PERF_DATA.map((p, i) => (
          <motion.div key={p.label} initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.06 }}>
            <Card className="p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background:`${p.color}15`, border:`1px solid ${p.color}28` }}>
                <DataIcon icon={p.Icon} className="w-5 h-5" style={{ color:p.color }} />
              </div>
              <div>
                <div className="text-xl font-black text-white">{p.value}</div>
                <div className="text-xs font-semibold text-white/60 mt-0.5">{p.label}</div>
                <div className="text-[10px] text-white/25 mt-0.5">{p.sub}</div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Per-lead automation table */}
      <Card>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="text-sm font-bold text-white">Follow-up Automation per Lead</h2>
          <div className="hidden sm:flex items-center gap-4 text-[10px]">
            {[['#34d399','Active / Sent'],['#fbbf24','Scheduled'],['rgba(255,255,255,0.25)','Off']].map(([c,l]) => (
              <span key={l as string} className="flex items-center gap-1.5" style={{ color:'rgba(255,255,255,0.35)' }}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ background:c as string }} />{l}
              </span>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth:'740px' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-white/25">Lead</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/25">Score</th>
                {AUTO_COLS.map(col => (
                  <th key={col.key} className="px-4 py-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <DataIcon icon={col.Icon} className="w-3.5 h-3.5 text-white/25" />
                      <span className="text-[9px] font-bold uppercase tracking-wide text-white/25 whitespace-nowrap">{col.label}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {LEADS.map((lead, i) => (
                <motion.tr key={lead.id}
                  initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.03 }}
                  style={{ background:'transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-black text-white flex-shrink-0"
                        style={{ background:'linear-gradient(135deg,rgba(124,58,237,0.5),rgba(37,99,235,0.4))' }}>
                        {initials(lead.name)}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-white/80 whitespace-nowrap">{lead.name}</div>
                        <div className="text-[10px] text-white/30 truncate max-w-[100px]">{lead.company}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><ScoreBadge score={lead.score} label={lead.scoreLabel} /></td>
                  {AUTO_COLS.map(col => {
                    const status = lead.auto[col.key]
                    const color  = AUTO_COLOR[status] || 'rgba(255,255,255,0.15)'
                    return (
                      <td key={col.key} className="px-4 py-3">
                        <div className="flex justify-center">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                            title={`${col.label}: ${status.replace(/_/g,' ')}`}
                            style={{ background:`${color}20`, border:`1px solid ${color}40` }}>
                            <DataIcon icon={col.Icon} className="w-3.5 h-3.5" style={{ color }} />
                          </div>
                        </div>
                      </td>
                    )
                  })}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

/* ─── Settings Section ───────────────────────────────────────── */

const SETTING_PANELS: {
  label: string; sub: string
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
}[] = [
  { Icon:Shield,    label:'Company Profile',           sub:'Business name, logo, contact details'  },
  { Icon:Bell,      label:'Notification Preferences',  sub:'Email alerts, SMS, push notifications' },
  { Icon:Link2,     label:'Integrations',              sub:'Connect CRM, calendar, and more'       },
  { Icon:BarChart2, label:'Analytics & Reporting',     sub:'Automated weekly performance reports'  },
]

function SettingsSection() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 px-1">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background:'rgba(139,92,246,0.12)', border:'1px solid rgba(139,92,246,0.2)' }}>
          <Settings className="w-4 h-4 text-violet-400" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Settings</h2>
          <p className="text-xs text-white/30">Full configuration coming soon</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SETTING_PANELS.map((p, i) => (
          <motion.div key={p.label} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.06 }}>
            <Card className="p-5 flex items-start gap-4 opacity-55 cursor-not-allowed">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)' }}>
                <DataIcon icon={p.Icon} className="w-4 h-4 text-white/40" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-white/60">{p.label}</div>
                <div className="text-xs text-white/25 mt-0.5">{p.sub}</div>
              </div>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full mt-0.5 flex-shrink-0"
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

/* ─── Main ───────────────────────────────────────────────────── */

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
              <button onClick={() => { window.location.href = '/client-login' }}
                className="flex items-center gap-1.5 text-xs text-white/25 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/8">
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
              transition={{ duration:0.22 }}>
              {section === 'overview'     && <OverviewSection />}
              {section === 'pipeline'     && <PipelineSection />}
              {section === 'activity'     && <ActivitySection />}
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
