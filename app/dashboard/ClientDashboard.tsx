'use client'

import { useState, useMemo, useEffect, useLayoutEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap, LayoutDashboard, Users, Calendar, Settings, LogOut,
  TrendingUp, TrendingDown, Mail, Phone, CheckCircle, AlertCircle,
  Clock, Search, X, BarChart2, MessageCircle, Database,
  Activity, RefreshCw, Bell, Shield, Link2, Download, Target,
  DollarSign, Timer, Menu, ChevronLeft, ChevronRight, ChevronDown, LineChart, BellDot,
  MessageSquare, MessagesSquare, SlidersHorizontal, Volume2, VolumeX, ArrowUpDown, Plus,
  History, ScrollText, Undo2, Pencil, Trash2, CalendarPlus, MoveRight,
  UserPlus, Copy, Check, UserCog, Crown, Eye, Bot, BookOpen, FlaskConical, Brain, Headphones,
  Car, MapPin, FileText, KeyRound, CreditCard, UploadCloud, ExternalLink, Wrench, Rocket, Code2, Camera, Globe2,
} from 'lucide-react'
import LeadPanel from './LeadPanel'
import AIAgentSection from './AIAgentSection'
import LiveChatSection from './LiveChatSection'
import AddLeadModal from './AddLeadModal'
import AddAppointmentModal from './AddAppointmentModal'
import AnalyticsSection from './AnalyticsSection'
import ApptDrawer, { type DrawerAppointment } from './ApptDrawer'
import AutomationCenter from './AutomationCenter'
import type { DashboardData, IntegrationRow, OverviewMetrics, TeamMember, Role } from './types'
import { supabase } from '../lib/supabase'
import { getPermissions, type Permissions } from '../lib/permissions'
import type { AvailabilityMatch, RentalBooking, RentalCar, RentalLocation, RentalSettings } from '../lib/rental'
import { BUSINESS_TYPE_CONFIG, CANONICAL_BUSINESS_TYPES, normalizeBusinessType } from '../lib/businessTypes'

/* ─── Types ──────────────────────────────────────────────────── */

type Section      = 'overview' | 'analytics' | 'pipeline' | 'activity' | 'appointments' | 'automation' | 'settings' | 'log' | 'team'
                  | 'bots' | 'live_chat' | 'deploy' | 'integrations' | 'rental_ops' | 'ai_overview' | 'ai_instructions' | 'ai_knowledge' | 'ai_qualification' | 'ai_test'
type LeadStatus   = 'new' | 'contacted' | 'demo_booked' | 'won' | 'lost'
type ScoreLabel   = 'hot' | 'warm' | 'cold'
type ApptStatus   = 'confirmed' | 'pending' | 'completed' | 'cancelled'
type ActivityType = 'sms' | 'appointment' | 'assignment' | 'email' | 'call' | 'chat'
type NotifType    = 'lead' | 'booking' | 'ai' | 'alert'

interface AutoState {
  aiSms: 'sent'|'scheduled'|'off'; emailSeq: 'active'|'paused'|'not_started'
  nurture: 'active'|'not_started'; smartAssign: 'assigned'|'unassigned'; autoCall: 'scheduled'|'completed'|'off'
}
interface Lead {
  id: string; name: string; company: string
  email?: string; phone?: string
  source: string; interest: string
  assignedAgent: string; score: number; scoreLabel: ScoreLabel; status: LeadStatus
  date: string; auto: AutoState; metadata?: Record<string, unknown>
  conversation_id?: string | null
}
interface ActivityItem { id: string; type: ActivityType; text: string; sub: string; time: string; live?: boolean }
interface Appointment { id: string; name: string; company: string; type: string; date: string; time: string; status: ApptStatus; upcoming: boolean; leadId?: string; notes?: string }
interface Notification { id: string; type: NotifType; text: string; sub: string; read: boolean; time: string }

interface ToastItem {
  id:         string
  type:       'lead' | 'appointment' | 'hint'
  title:      string
  sub:        string
  badge:      string
  badgeColor: string
  leadId?:    string
  duration?:  number  // ms — defaults to 5500
}

type DashboardBot = {
  id: string
  name: string
  active?: boolean
  persona?: string | null
  objective?: string | null
  tone?: string | null
  fallback_msg?: string | null
  model?: string | null
  temperature?: number | null
  business_type?: string | null
  is_default_website_bot?: boolean | null
  created_at?: string | null
}

/* ─── Mock Data ──────────────────────────────────────────────── */

const AUTOMATIONS = [
  { id:'whatsapp', label:'WhatsApp Bot',         color:'#34d399', Icon:MessageCircle, description:'Auto-replies and lead capture via WhatsApp Business API', status:'active',    lastActivity:'2 min ago',  stat1Label:'Messages this week', stat1Value:'127', stat2Label:'Leads captured',  stat2Value:'8'        },
  { id:'webchat',  label:'Website Chat Widget',  color:'#948f88', Icon:MessageSquare, description:'Embedded live chat on your website for instant engagement',  status:'active',    lastActivity:'8 min ago',  stat1Label:'Chats this week',    stat1Value:'89',  stat2Label:'Leads captured',  stat2Value:'5'        },
  { id:'email',    label:'Email Follow-up',       color:'#fbbf24', Icon:Mail,          description:"Automated follow-up sequences for leads that haven't responded", status:'active', lastActivity:'1 hour ago', stat1Label:'Emails sent',        stat1Value:'34',  stat2Label:'Open rate',       stat2Value:'68%'      },
  { id:'crm',      label:'Google Sheets / CRM',   color:'#f8a36d', Icon:Database,      description:'All leads and conversations synced automatically to your sheet', status:'connected', lastActivity:'5 min ago', stat1Label:'Records synced',  stat1Value:'47',  stat2Label:'Last sync',       stat2Value:'5 min ago' },
]


/* ─── Config ─────────────────────────────────────────────────── */

const STATUS_CFG: Record<LeadStatus, { label:string; color:string; bg:string; border:string }> = {
  new:         { label:'New',         color:'#f8a36d', bg:'rgba(244,122,99,0.10)', border:'rgba(244,122,99,0.25)' },
  contacted:   { label:'Contacted',   color:'#948f88', bg:'rgba(148,145,140,0.10)',  border:'rgba(148,145,140,0.25)'  },
  demo_booked: { label:'Demo Booked', color:'#fbbf24', bg:'rgba(251,191,36,0.10)',  border:'rgba(251,191,36,0.25)'  },
  won:         { label:'Won',         color:'#34d399', bg:'rgba(52,211,153,0.10)',  border:'rgba(52,211,153,0.25)'  },
  lost:        { label:'Lost',        color:'#f87171', bg:'rgba(248,113,113,0.10)', border:'rgba(248,113,113,0.25)' },
}

const SCORE_CFG: Record<ScoreLabel, { label:string; color:string; bg:string; border:string }> = {
  hot:  { label:'Hot',  color:'#f87171', bg:'rgba(248,113,113,0.12)', border:'rgba(248,113,113,0.30)' },
  warm: { label:'Warm', color:'#fb923c', bg:'rgba(251,146,60,0.12)',  border:'rgba(251,146,60,0.30)'  },
  cold: { label:'Cold', color:'#948f88', bg:'rgba(148,145,140,0.12)',  border:'rgba(148,145,140,0.30)'  },
}

const APPT_CFG: Record<ApptStatus, { label:string; color:string; bg:string }> = {
  confirmed:  { label:'Confirmed',  color:'#34d399', bg:'rgba(52,211,153,0.10)'  },
  pending:    { label:'Pending',    color:'#fbbf24', bg:'rgba(251,191,36,0.10)'  },
  completed:  { label:'Completed',  color:'#948f88', bg:'rgba(148,145,140,0.10)'  },
  cancelled:  { label:'Cancelled',  color:'#f87171', bg:'rgba(248,113,113,0.10)' },
}

type ActivityCfg = { color:string; bg:string; Icon: React.ComponentType<{className?:string;style?:React.CSSProperties}> }

const ACTIVITY_CFG_DEFAULT: ActivityCfg = { color:'rgba(255,255,255,0.25)', bg:'rgba(255,255,255,0.06)', Icon:Activity }

const ACTIVITY_CFG: Record<string, ActivityCfg> = {
  sms:                  { color:'#34d399', bg:'rgba(52,211,153,0.12)',  Icon:MessageCircle },
  appointment:          { color:'#948f88', bg:'rgba(148,145,140,0.12)',  Icon:Calendar      },
  assignment:           { color:'#f8a36d', bg:'rgba(244,122,99,0.12)', Icon:Users         },
  email:                { color:'#fbbf24', bg:'rgba(251,191,36,0.12)',  Icon:Mail          },
  call:                 { color:'#fb923c', bg:'rgba(251,146,60,0.12)',  Icon:Phone         },
  chat:                 { color:'#f47a63', bg:'rgba(244,122,99,0.12)', Icon:Bot           },
  team_member_invited:  { color:'#34d399', bg:'rgba(52,211,153,0.12)',  Icon:UserPlus      },
  team_member_deleted:  { color:'#f87171', bg:'rgba(248,113,113,0.12)', Icon:Trash2        },
  lead_assigned:        { color:'#f8a36d', bg:'rgba(244,122,99,0.12)', Icon:UserCog       },
}

const NOTIF_CFG: Record<NotifType, { color:string; Icon: React.ComponentType<{className?:string;style?:React.CSSProperties}> }> = {
  lead:    { color:'#f8a36d', Icon:Users          },
  booking: { color:'#34d399', Icon:Calendar       },
  ai:      { color:'#948f88', Icon:MessageCircle  },
  alert:   { color:'#f87171', Icon:AlertCircle    },
}

const AUTO_COLOR: Record<string,string> = {
  active:'#34d399', sent:'#34d399', completed:'#34d399', assigned:'#34d399',
  scheduled:'#fbbf24', not_started:'rgba(255,255,255,0.18)',
  paused:'rgba(255,255,255,0.18)', off:'rgba(255,255,255,0.12)', unassigned:'rgba(255,255,255,0.15)',
}

const AUTO_COLS: {label:string; key:keyof AutoState; Icon:React.ComponentType<{className?:string;style?:React.CSSProperties}>}[] = [
  { label:'AI SMS',       key:'aiSms',       Icon:MessageCircle },
  { label:'Email Seq',    key:'emailSeq',    Icon:Mail          },
  { label:'Nurture',      key:'nurture',     Icon:RefreshCw     },
  { label:'Smart Assign', key:'smartAssign', Icon:Users         },
  { label:'Auto-call',    key:'autoCall',    Icon:Phone         },
]

const NAV_ITEMS: {id:Section; label:string; Icon:React.ComponentType<{className?:string}>; badge?:number}[] = [
  { id:'overview',     label:'Overview',      Icon:LayoutDashboard          },
  { id:'analytics',    label:'Analytics',     Icon:LineChart                },
  { id:'pipeline',     label:'Lead Pipeline', Icon:Users,       badge:10    },
  { id:'bots',         label:'Bots',          Icon:Bot                     },
  { id:'live_chat',    label:'Live Chat',     Icon:Headphones              },
  { id:'deploy',       label:'Deploy',        Icon:Rocket                  },
  { id:'integrations', label:'Integrations',  Icon:Link2                   },
  { id:'activity',     label:'Activity Feed', Icon:Activity                 },
  { id:'appointments', label:'Appointments',  Icon:Calendar,    badge:4     },
  { id:'rental_ops',   label:'Car Rental Ops', Icon:Car                    },
  { id:'log',          label:'Audit Log',     Icon:History                  },
  { id:'team',         label:'Team',          Icon:UserCog                  },
  { id:'automation',   label:'Automation',    Icon:Zap                      },
  { id:'settings',     label:'Settings',      Icon:Settings                 },
]

const AI_NAV_ITEMS: {id:Section; label:string; Icon:React.ComponentType<{className?:string}>}[] = [
  { id:'ai_overview',      label:'AI Overview',        Icon:Bot          },
  { id:'ai_instructions',  label:'AI Instructions',    Icon:Brain        },
  { id:'ai_knowledge',     label:'Knowledge Base',     Icon:BookOpen     },
  { id:'ai_qualification', label:'Lead Qualification', Icon:Target       },
  { id:'ai_test',          label:'Test AI',            Icon:FlaskConical },
]

const SECTION_META: Record<Section,{title:string;sub:string}> = {
  overview:     { title:'Overview',       sub:'Performance snapshot and live activity'                },
  analytics:    { title:'Analytics',      sub:'Conversation metrics and conversion data'              },
  pipeline:     { title:'Lead Pipeline',  sub:'Click any lead to view full details'                  },
  bots:         { title:'Bots',           sub:'Manage bot workspaces, prompts, tests and website defaults' },
  live_chat:    { title:'Live Chat',      sub:'Human handover inbox and real-time customer messages' },
  deploy:       { title:'Deploy',         sub:'Share and embed your InstantDesk chat experience'     },
  integrations: { title:'Integrations',   sub:'Connect InstantDesk with channels, automation tools and websites' },
  activity:     { title:'Activity Feed',  sub:'Automated events across all channels'                  },
  appointments: { title:'Appointments',   sub:'Weekly schedule and upcoming bookings'                 },
  rental_ops:   { title:'Car Rental Ops',  sub:'Fleet, availability, bookings, documents and pickup support' },
  log:          { title:'Audit Log',      sub:'Full history of every action — click Undo to reverse'  },
  team:         { title:'Team',           sub:'Members, roles and lead assignments'                   },
  automation:        { title:'Automation',         sub:'Make.com scenario control center — configure, monitor and log'  },
  settings:          { title:'Settings',           sub:'Account and portal configuration'                               },
  ai_overview:       { title:'AI Overview',        sub:'Agent status, metrics and quick actions'                        },
  ai_instructions:   { title:'AI Instructions',    sub:'Persona, tone, creativity and fallback settings'                },
  ai_knowledge:      { title:'Knowledge Base',     sub:'Documents and URLs that train your AI agent'                    },
  ai_qualification:  { title:'Lead Qualification', sub:'Required fields, scoring thresholds and booking triggers'       },
  ai_test:           { title:'Test AI',            sub:'Live chat simulator with slot extraction debug panels'          },
}

/* ─── Helpers ────────────────────────────────────────────────── */

function initials(name?: string | null): string {
  if (!name?.trim()) return '?'
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}
function agentInitials(n?: string | null): string {
  if (!n?.trim()) return '?'
  return n.trim().split(/[\s.]+/).filter(Boolean).map(p => p[0]).join('').toUpperCase().slice(0, 2)
}
function fmtDate(iso:string) { return new Date(iso).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) }
function fmtApptDate(d:string) { return new Date(d).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}) }

/** If the appointment has a linked lead_id, return the current lead name; else fall back to stored lead_name. */
function liveApptName(appt: Appointment, leads: Lead[]): string {
  if (!appt.leadId) return appt.name
  return leads.find(l => l.id === appt.leadId)?.name ?? appt.name
}
function relativeTime(iso: string | null): string {
  if (!iso) return 'recently'
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`
  const d = Math.floor(h / 24)
  return `${d} day${d > 1 ? 's' : ''} ago`
}

/* ─── Shared components ──────────────────────────────────────── */

function Card({ children, className='', ...rest }: { children:React.ReactNode; className?:string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-2xl ${className}`}
      style={{
        background:'var(--bg-card)',
        border:'1px solid var(--border-warm)',
        boxShadow:'0 24px 80px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.045)',
        backdropFilter:'blur(20px)',
      }}
      {...rest}>
      {children}
    </div>
  )
}

function StatusBadge({ status }: { status:LeadStatus }) {
  const c = STATUS_CFG[status]
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap"
      style={{ color:c.color, background:c.bg, border:`1px solid ${c.border}` }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background:c.color }} />
      {c.label}
    </span>
  )
}

function ScoreBadge({ score, label }: { score:number; label:ScoreLabel }) {
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

function DataIcon({ icon:Icon, className, style }: { icon:React.ComponentType<{className?:string;style?:React.CSSProperties}>; className?:string; style?:React.CSSProperties }) {
  return <Icon className={className} style={style} />
}

function AutoDots({ auto }: { auto:AutoState }) {
  const cols = [
    { label:'AI SMS',    Icon:MessageCircle, status:auto.aiSms       },
    { label:'Email Seq', Icon:Mail,          status:auto.emailSeq    },
    { label:'Nurture',   Icon:RefreshCw,     status:auto.nurture     },
    { label:'Assigned',  Icon:Users,         status:auto.smartAssign },
    { label:'Auto-call', Icon:Phone,         status:auto.autoCall    },
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

function ExportButton() {
  const [s, setS] = useState<'idle'|'loading'|'done'>('idle')
  return (
    <button onClick={() => { if(s!=='idle')return; setS('loading'); setTimeout(()=>{setS('done');setTimeout(()=>setS('idle'),2000)},1400) }}
      className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all"
      style={{ background:'rgba(244,122,99,0.12)', border:'1px solid rgba(244,122,99,0.25)', color:'#f8a36d' }}>
      {s==='loading' ? (
        <><motion.span className="w-3.5 h-3.5 rounded-full border-2 border-orange-400/30 border-t-orange-400"
          animate={{ rotate:360 }} transition={{ duration:0.7, repeat:Infinity, ease:'linear' }} />Generating…</>
      ) : s==='done' ? (
        <><CheckCircle className="w-3.5 h-3.5 text-emerald-400" /><span className="text-emerald-400">Exported!</span></>
      ) : <><Download className="w-3.5 h-3.5" />Export</>}
    </button>
  )
}

/* ─── Notification Center ────────────────────────────────────── */

function NotificationCenter({ notifs, setNotifs }: { notifs:Notification[]; setNotifs:React.Dispatch<React.SetStateAction<Notification[]>> }) {
  const [open, setOpen] = useState(false)
  const unread = notifs.filter(n => !n.read).length

  const markAllRead = () => setNotifs(n => n.map(x => ({ ...x, read:true })))

  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-all"
        style={{ background: open ? 'rgba(244,122,99,0.15)' : 'rgba(255,255,255,0.04)', border:`1px solid ${open?'rgba(244,122,99,0.3)':'rgba(255,255,255,0.08)'}` }}>
        {unread > 0 ? <BellDot className="w-4 h-4 text-orange-400" /> : <Bell className="w-4 h-4 text-white/40" />}
        {unread > 0 && (
          <motion.span initial={{ scale:0 }} animate={{ scale:1 }}
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white"
            style={{ background:'#171412' }}>
            {unread}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity:0, scale:0.95, y:-8 }} animate={{ opacity:1, scale:1, y:0 }}
            exit={{ opacity:0, scale:0.95, y:-8 }} transition={{ duration:0.18 }}
            className="absolute right-0 top-12 w-80 rounded-2xl z-50 overflow-hidden"
            style={{ background:'rgba(18,17,15,0.97)', border:'1px solid rgba(244,122,99,0.2)', boxShadow:'0 24px 60px rgba(0,0,0,0.6)', backdropFilter:'blur(24px)' }}>
            <div className="flex items-center justify-between px-4 py-3.5"
              style={{ borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
              <span className="text-sm font-bold text-white">Notifications</span>
              <button onClick={markAllRead} className="text-xs text-orange-400/70 hover:text-orange-300 transition-colors">
                Mark all read
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Bell className="w-6 h-6 text-white/10" />
                  <p className="text-xs text-white/25 font-medium">No notifications yet</p>
                  <p className="text-[10px] text-white/15">New leads and bookings appear here</p>
                </div>
              ) : notifs.map((n, i) => {
                const cfg = NOTIF_CFG[n.type]
                return (
                  <motion.div key={n.id} initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }} transition={{ delay:i*0.04 }}
                    className="flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer"
                    style={{ background: n.read ? 'transparent' : 'rgba(244,122,99,0.04)', borderBottom:'1px solid rgba(255,255,255,0.04)' }}
                    onClick={() => setNotifs(prev => prev.map(x => x.id===n.id ? {...x,read:true} : x))}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background:`${cfg.color}18` }}>
                      <DataIcon icon={cfg.Icon} className="w-3.5 h-3.5" style={{ color:cfg.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-white/80">{n.text}</span>
                        {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />}
                      </div>
                      <div className="text-[10px] text-white/35 mt-0.5">{n.sub}</div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
    </div>
  )
}

/* ─── Sidebar ────────────────────────────────────────────────── */

function Sidebar({ active, onNav, open, onClose, badges = {}, userName = 'Owner', businessName = 'My Business', onLogout }: {
  active: Section | null; onNav:(s:Section)=>void; open:boolean; onClose:()=>void
  badges?: Partial<Record<Section, number>>
  userName?: string
  businessName?: string
  onLogout?: () => void
}) {
  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div key="backdrop" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="fixed inset-0 z-30 md:hidden"
            style={{ background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)' }}
            onClick={onClose} />
        )}
      </AnimatePresence>

      <aside
        className={`
          group fixed md:relative inset-y-0 left-0 z-40 md:z-auto w-[260px] md:w-[76px] md:hover:w-[260px]
          flex-shrink-0 flex flex-col h-screen overflow-hidden
          transition-[width,transform] duration-150 ease-out
          ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        style={{
          background:'rgba(7,9,12,0.94)',
          borderRight:'1px solid rgba(255,255,255,0.10)',
          boxShadow:'10px 0 28px rgba(0,0,0,0.18)',
        }}
      >
        <div className="flex items-center gap-3 px-5 md:px-[22px] py-5" style={{ borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
          <img src="/assets/instantdesk-logo.png" alt="InstantDesk" className="h-8 w-auto flex-shrink-0" />
          <div className="flex-1 min-w-0 overflow-hidden transition-[max-width,opacity] duration-150 ease-out md:max-w-0 md:opacity-0 md:group-hover:max-w-[160px] md:group-hover:opacity-100">
            <div className="text-sm font-semibold text-white leading-none">InstantDesk</div>
            <div className="text-[10px] text-white/30 mt-0.5">Client Portal</div>
          </div>
          <button onClick={onClose} className="md:hidden w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70"
            style={{ background:'rgba(255,255,255,0.05)' }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-x-hidden overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(148,163,184,0.28) transparent' }}>
          {NAV_ITEMS.map(item => {
            const isActive = active === item.id
            const badge = badges[item.id] ?? item.badge
            return (
              <div key={item.id} className="relative">
                {isActive && (
                  <div className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full"
                    style={{ background:'rgba(148,163,184,0.72)' }} />
                )}
                <button onClick={() => { onNav(item.id); onClose() }}
                  title={item.label}
                  className="flex items-center gap-3 w-full pl-4 pr-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-100 hover:bg-white/[0.055] hover:text-white"
                  style={isActive ? { background:'rgba(148,163,184,0.12)', color:'rgba(255,255,255,0.88)' } : { color:'rgba(255,255,255,0.40)' }}>
                  <item.Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 overflow-hidden whitespace-nowrap text-left transition-[max-width,opacity] duration-150 ease-out md:max-w-0 md:opacity-0 md:group-hover:max-w-[150px] md:group-hover:opacity-100">{item.label}</span>
                  {badge !== undefined && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full transition-[max-width,opacity,padding] duration-150 ease-out md:max-w-0 md:overflow-hidden md:px-0 md:opacity-0 md:group-hover:max-w-[40px] md:group-hover:px-1.5 md:group-hover:opacity-100"
                      style={{ background:isActive?'rgba(148,163,184,0.18)':'rgba(255,255,255,0.08)', color:isActive?'rgba(255,255,255,0.76)':'rgba(255,255,255,0.35)' }}>
                      {badge}
                    </span>
                  )}
                </button>
              </div>
            )
          })}

        </nav>

        <div className="px-3 pb-5 pt-4" style={{ borderTop:'1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1" style={{ background:'rgba(255,255,255,0.035)' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black text-white flex-shrink-0"
              style={{ background:'linear-gradient(135deg,rgba(244,122,99,0.6),rgba(248,154,87,0.5))' }}>
              {userName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 overflow-hidden transition-[max-width,opacity] duration-150 ease-out md:max-w-0 md:opacity-0 md:group-hover:max-w-[150px] md:group-hover:opacity-100">
              <div className="text-xs font-semibold text-white/80 truncate">{userName}</div>
              <div className="text-[10px] text-white/30 truncate">{businessName}</div>
            </div>
          </div>
          <button
            onClick={onLogout}
            title="Log out"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-white/35 hover:text-red-400 hover:bg-red-500/8 transition-colors duration-100 w-full">
            <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-150 ease-out md:max-w-0 md:opacity-0 md:group-hover:max-w-[80px] md:group-hover:opacity-100">Log out</span>
          </button>
        </div>
      </aside>
    </>
  )
}

/* ─── Overview ───────────────────────────────────────────────── */

function OverviewSection({
  onSelectLead, leads, appointments, activity, overviewMetrics,
}: {
  onSelectLead:(id:string)=>void
  leads:Lead[]
  appointments:Appointment[]
  activity:ActivityItem[]
  overviewMetrics?: OverviewMetrics
}) {
  const m = overviewMetrics

  // ── Dynamic "Next Up": find the soonest upcoming date ──────────
  const todayISO      = new Date().toISOString().split('T')[0]
  const upcomingSorted = appointments
    .filter(a => a.upcoming && a.date >= todayISO)
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
  const nextDate     = upcomingSorted[0]?.date ?? null
  const soonestAppts = nextDate ? upcomingSorted.filter(a => a.date === nextDate) : []
  const laterAppts   = nextDate ? upcomingSorted.filter(a => a.date !== nextDate) : []
  const nextDateLabel = nextDate
    ? new Date(nextDate + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' })
    : null

  // ── KPI cards ──────────────────────────────────────────────────
  const kpiCards: { label:string; value:string|number; sub:string; color:string; trend:'up'|'down'; Icon:React.ComponentType<{className?:string;style?:React.CSSProperties}> }[] = [
    {
      label:'New Leads This Week',
      value: m?.newLeadsThisWeek ?? 0,
      sub:`${m?.activeOpportunities ?? 0} active in pipeline`,
      color:'#f8a36d', trend:'up', Icon:Users,
    },
    {
      label:'Active Opportunities',
      value: m?.activeOpportunities ?? 0,
      sub:'in pipeline',
      color:'#948f88', trend:'up', Icon:Target,
    },
    {
      label:'Appointments Booked',
      value: m?.appointmentsThisWeek ?? 0,
      sub:'this week',
      color:'#34d399', trend:'up', Icon:Calendar,
    },
    {
      label:'Emails Sent',
      value: m?.emailsSentThisWeek ?? 0,
      sub:'via automation',
      color:'#fbbf24', trend:'up', Icon:Mail,
    },
    {
      label:'Conversion Rate',
      value: `${m?.conversionRate ?? 0}%`,
      sub: (m?.conversionLiftPct ?? 0) > 0
        ? `+${m!.conversionLiftPct}pts vs last wk`
        : 'won / total leads',
      color:'#fb923c',
      trend: (m?.conversionRate ?? 0) > 0 ? 'up' : 'down',
      Icon:BarChart2,
    },
  ]

  // ── Performance cards ──────────────────────────────────────────
  const revenueStr = m && m.estimatedRevenue > 0
    ? m.estimatedRevenue >= 10000
      ? `£${(m.estimatedRevenue / 1000).toFixed(1)}k`
      : `£${m.estimatedRevenue.toLocaleString()}`
    : '—'

  const perfCards: { label:string; value:string|number; sub:string; color:string; Icon:React.ComponentType<{className?:string;style?:React.CSSProperties}> }[] = [
    {
      label:'Conversion Lift',
      value: (m?.conversionLiftPct ?? 0) > 0 ? `+${m!.conversionLiftPct}%` : '—',
      sub:'vs prior week',
      color:'#34d399', Icon:TrendingUp,
    },
    {
      label:'Agent Time Saved',
      value: m ? `${m.agentTimeSavedHrs} hrs` : '—',
      sub:'this week (AI replies)',
      color:'#948f88', Icon:Timer,
    },
    {
      label:'Monthly Deals',
      value: m?.monthlyDeals ?? 0,
      sub:'closed this month',
      color:'#f8a36d', Icon:CheckCircle,
    },
    {
      label:'Est. Revenue',
      value: revenueStr,
      sub:'this month pipeline',
      color:'#fbbf24', Icon:DollarSign,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* 5 KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        {kpiCards.map((k, i) => (
          <motion.div key={k.label} initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.06 }}>
            <motion.div whileHover={{ y:-2, boxShadow:`0 8px 24px ${k.color}18` }}
              className="rounded-2xl p-5 cursor-default transition-all"
              style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background:`${k.color}18`, border:`1px solid ${k.color}28` }}>
                  <DataIcon icon={k.Icon} className="w-4 h-4" style={{ color:k.color }} />
                </div>
                {k.trend==='up'
                  ? <TrendingUp  className="w-3.5 h-3.5 text-emerald-400" />
                  : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
              </div>
              <div className="text-2xl font-black text-white tracking-tight">{k.value}</div>
              <div className="text-[10px] font-semibold text-white/35 uppercase tracking-wide mt-1 leading-tight">{k.label}</div>
              <div className="text-[10px] text-white/20 mt-0.5">{k.sub}</div>
            </motion.div>
          </motion.div>
        ))}
      </div>

      {/* 4 Performance cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {perfCards.map((p, i) => (
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

      {/* Activity + Appointments */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Recent Activity */}
        <motion.div className="lg:col-span-3" initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.50 }}>
          <Card>
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
              <h2 className="text-sm font-bold text-white">Recent Activity</h2>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                style={{ background:'rgba(52,211,153,0.08)', border:'1px solid rgba(52,211,153,0.2)', color:'#34d399' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live
              </div>
            </div>
            {activity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Activity className="w-8 h-8 text-white/10" />
                <p className="text-sm text-white/25 font-medium">No recent activity</p>
                <p className="text-xs text-white/15">Events appear here as they happen</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {activity.slice(0, 5).map((item, i) => {
                  const cfg = ACTIVITY_CFG[item.type] ?? ACTIVITY_CFG_DEFAULT
                  return (
                    <motion.div key={item.id}
                      initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.55+i*0.04 }}
                      className="flex items-start gap-3 px-5 py-3.5">
                      {item.live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0 mt-1.5" />}
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
            )}
          </Card>
        </motion.div>

        {/* Next Up */}
        <motion.div className="lg:col-span-2" initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.55 }}>
          <Card className="h-full flex flex-col">
            <div className="px-5 py-4" style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
              <h2 className="text-sm font-bold text-white">
                {nextDateLabel ? `Next Up — ${nextDateLabel}` : 'Next Up'}
              </h2>
              <p className="text-xs text-white/30 mt-0.5">
                {soonestAppts.length > 0
                  ? `${soonestAppts.length} appointment${soonestAppts.length > 1 ? 's' : ''}`
                  : 'No upcoming appointments'}
              </p>
            </div>
            <div className="p-4 flex flex-col gap-3 flex-1">
              {soonestAppts.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 py-8 gap-2">
                  <Calendar className="w-7 h-7 text-white/10" />
                  <p className="text-sm text-white/25 font-medium">No upcoming bookings</p>
                </div>
              ) : (
                <>
                  {soonestAppts.map(appt => {
                    const sc = APPT_CFG[appt.status]
                    return (
                      <div key={appt.id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                        style={{ background:`${sc.color}08`, border:`1px solid ${sc.color}20` }}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                          style={{ background:'linear-gradient(135deg,rgba(244,122,99,0.5),rgba(248,154,87,0.4))' }}>
                          {initials(liveApptName(appt, leads))}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-white/80 truncate">{liveApptName(appt, leads)}</div>
                          <div className="text-[10px] text-white/35">{appt.type}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-xs font-bold text-white/60">{appt.time}</div>
                          <div className="text-[10px] mt-0.5" style={{ color:sc.color }}>{sc.label}</div>
                        </div>
                      </div>
                    )
                  })}
                  {laterAppts.length > 0 && (
                    <div style={{ borderTop:'1px solid rgba(255,255,255,0.05)', marginTop:4, paddingTop:8 }}>
                      {laterAppts.map(appt => (
                        <div key={appt.id} className="flex items-center gap-2 py-1.5">
                          <Clock className="w-3 h-3 text-white/20 flex-shrink-0" />
                          <span className="text-xs text-white/35 truncate flex-1">{liveApptName(appt, leads)} · {appt.type}</span>
                          <span className="text-[10px] text-white/20 whitespace-nowrap">{fmtApptDate(appt.date)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Recent leads (clickable) */}
      <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.65 }}>
        <Card>
          <div className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
            <h2 className="text-sm font-bold text-white">Recent Leads</h2>
            <span className="text-xs text-white/30">Click to view details</span>
          </div>
          {leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Users className="w-7 h-7 text-white/10" />
              <p className="text-sm text-white/25 font-medium">No leads yet</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {leads.slice(0, 5).map(lead => (
                <motion.div key={lead.id} whileHover={{ background:'rgba(244,122,99,0.05)' }}
                  className="flex items-center gap-4 px-5 py-3.5 cursor-pointer transition-colors"
                  onClick={() => onSelectLead(lead.id)}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black text-white flex-shrink-0"
                    style={{ background:'linear-gradient(135deg,rgba(244,122,99,0.5),rgba(248,154,87,0.4))' }}>
                    {initials(lead.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white/80 truncate">{lead.name}</div>
                    <div className="text-xs text-white/30 truncate">{lead.company}</div>
                  </div>
                  <ScoreBadge score={lead.score} label={lead.scoreLabel} />
                  <StatusBadge status={lead.status} />
                  <ChevronRight className="w-4 h-4 text-white/20 flex-shrink-0" />
                </motion.div>
              ))}
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  )
}

/* ─── Pipeline — filter types & helpers ─────────────────────── */

type DateRangeKey = 'all' | 'today' | 'yesterday' | 'last7' | 'last30' | 'custom'

interface PipelineFilters {
  score:      ScoreLabel | 'all'
  status:     LeadStatus | 'all'
  source:     'all' | 'whatsapp' | 'website_chat' | 'email' | 'instagram'
  dateRange:  DateRangeKey
  customFrom: string
  customTo:   string
  agent:      string   // 'all' or an agent name
}

const DEFAULT_FILTERS: PipelineFilters = {
  score:'all', status:'all', source:'all', dateRange:'all', customFrom:'', customTo:'', agent:'all',
}

function countActiveFilters(f: PipelineFilters): number {
  return [f.score!=='all', f.status!=='all', f.source!=='all', f.dateRange!=='all', f.agent!=='all'].filter(Boolean).length
}

function fmtLeadDate(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yday = new Date(todayStart); yday.setDate(todayStart.getDate() - 1)
    const t = d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })
    if (d >= todayStart) return `Today, ${t}`
    if (d >= yday)       return `Yesterday, ${t}`
    return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
  } catch { return '' }
}

function inDateRange(iso: string, f: PipelineFilters): boolean {
  if (f.dateRange === 'all') return true
  try {
    const d = new Date(iso).getTime()
    const now = new Date()
    const ts = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    if (f.dateRange === 'today')     return d >= ts
    if (f.dateRange === 'yesterday') return d >= ts - 86400000 && d < ts
    if (f.dateRange === 'last7')     return d >= ts - 7  * 86400000
    if (f.dateRange === 'last30')    return d >= ts - 30 * 86400000
    if (f.dateRange === 'custom') {
      if (f.customFrom && d < new Date(f.customFrom).getTime()) return false
      if (f.customTo   && d > new Date(f.customTo + 'T23:59:59').getTime()) return false
      return true
    }
  } catch { return true }
  return true
}

/* ─── Pipeline — sort ───────────────────────────────────────── */

type SortKey = 'date_desc' | 'date_asc' | 'score_desc' | 'score_asc' | 'name_asc' | 'name_desc'

const DEFAULT_SORT: SortKey = 'date_desc'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'date_desc',  label: 'Newest first'   },
  { key: 'date_asc',   label: 'Oldest first'   },
  { key: 'score_desc', label: 'Highest score'  },
  { key: 'score_asc',  label: 'Lowest score'   },
  { key: 'name_asc',   label: 'Name A – Z'     },
  { key: 'name_desc',  label: 'Name Z – A'     },
]

function applySortKey(rows: Lead[], key: SortKey): Lead[] {
  return [...rows].sort((a, b) => {
    switch (key) {
      case 'date_desc':  return new Date(b.date).getTime() - new Date(a.date).getTime()
      case 'date_asc':   return new Date(a.date).getTime() - new Date(b.date).getTime()
      case 'score_desc': return b.score - a.score
      case 'score_asc':  return a.score - b.score
      case 'name_asc':   return a.name.localeCompare(b.name)
      case 'name_desc':  return b.name.localeCompare(a.name)
    }
  })
}

function SortPanel({
  sort, onChange, onClose,
}: {
  sort:     SortKey
  onChange: (k: SortKey) => void
  onClose:  () => void
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div
        initial={{ opacity:0, scale:0.96, y:-6 }}
        animate={{ opacity:1, scale:1,    y: 0  }}
        exit={{   opacity:0, scale:0.96, y:-6  }}
        transition={{ duration:0.15 }}
        className="absolute right-0 top-full mt-2 z-50 rounded-2xl overflow-hidden"
        style={{
          minWidth: 180,
          background:'rgba(18,17,15,0.98)', border:'1px solid rgba(244,122,99,0.22)',
          boxShadow:'0 24px 60px rgba(0,0,0,0.7)', backdropFilter:'blur(24px)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-3 py-2.5" style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Sort by</span>
        </div>
        {SORT_OPTIONS.map(o => {
          const active = o.key === sort
          return (
            <button key={o.key}
              onClick={() => { onChange(o.key); onClose() }}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold transition-all text-left"
              style={{
                background: active ? 'rgba(244,122,99,0.15)' : 'transparent',
                color: active ? '#f8a36d' : 'rgba(255,255,255,0.55)',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
            >
              {o.label}
              {active && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />}
            </button>
          )
        })}
      </motion.div>
    </>
  )
}

/* ─── Pipeline — filter panel sub-components ────────────────── */

function FSection({ label, children }: { label:string; children:React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">{label}</div>
      {children}
    </div>
  )
}

function ChipGroup({
  opts, value, onChange,
}: {
  opts: { v:string; label:string; color?:string }[]
  value: string
  onChange: (v:string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opts.map(o => {
        const on = o.v === value
        return (
          <button key={o.v} onClick={() => onChange(o.v)}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
            style={on ? {
              background: o.color ? `${o.color}20` : 'rgba(244,122,99,0.2)',
              border:`1px solid ${o.color ?? 'rgba(244,122,99,0.4)'}`,
              color: o.color ?? '#f8a36d',
            } : {
              background:'rgba(255,255,255,0.04)',
              border:'1px solid rgba(255,255,255,0.08)',
              color:'rgba(255,255,255,0.45)',
            }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function FilterPanel({
  filters, onChange, onClose, agentOpts,
}: {
  filters: PipelineFilters
  onChange:(f:PipelineFilters) => void
  onClose: () => void
  agentOpts: string[]
}) {
  const set = (patch: Partial<PipelineFilters>) => onChange({ ...filters, ...patch })
  const ac  = countActiveFilters(filters)

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div
        initial={{ opacity:0, scale:0.96, y:-6 }}
        animate={{ opacity:1, scale:1,    y: 0  }}
        exit={{   opacity:0, scale:0.96, y:-6  }}
        transition={{ duration:0.15 }}
        className="absolute right-0 top-full mt-2 z-50 w-[min(320px,calc(100vw-2rem))] rounded-2xl"
        style={{
          background:'rgba(18,17,15,0.98)', border:'1px solid rgba(244,122,99,0.22)',
          boxShadow:'0 24px 60px rgba(0,0,0,0.7)', backdropFilter:'blur(24px)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          <span className="text-sm font-bold text-white">Filters</span>
          {ac > 0 && (
            <button onClick={() => onChange(DEFAULT_FILTERS)}
              className="text-[11px] font-semibold text-orange-400/80 hover:text-orange-300 transition-colors">
              Reset all
            </button>
          )}
        </div>

        <div className="p-4 flex flex-col gap-5">
          <FSection label="Score">
            <ChipGroup value={filters.score} onChange={v => set({ score: v as PipelineFilters['score'] })}
              opts={[
                { v:'all',  label:'All'  },
                { v:'hot',  label:'Hot',  color:'#f87171' },
                { v:'warm', label:'Warm', color:'#fb923c' },
                { v:'cold', label:'Cold', color:'#948f88' },
              ]} />
          </FSection>

          <FSection label="Status">
            <ChipGroup value={filters.status} onChange={v => set({ status: v as PipelineFilters['status'] })}
              opts={[
                { v:'all',         label:'All'         },
                { v:'new',         label:'New'         },
                { v:'contacted',   label:'Contacted'   },
                { v:'demo_booked', label:'Demo Booked' },
                { v:'won',         label:'Won'         },
                { v:'lost',        label:'Lost'        },
              ]} />
          </FSection>

          <FSection label="Source">
            <ChipGroup value={filters.source} onChange={v => set({ source: v as PipelineFilters['source'] })}
              opts={[
                { v:'all',          label:'All'          },
                { v:'whatsapp',     label:'WhatsApp'     },
                { v:'website_chat', label:'Website Chat' },
                { v:'email',        label:'Email'        },
                { v:'instagram',    label:'Instagram'    },
              ]} />
          </FSection>

          <FSection label="Date Added">
            <ChipGroup value={filters.dateRange} onChange={v => set({ dateRange: v as DateRangeKey })}
              opts={[
                { v:'all',       label:'Any time'    },
                { v:'today',     label:'Today'       },
                { v:'yesterday', label:'Yesterday'   },
                { v:'last7',     label:'Last 7 days' },
                { v:'last30',    label:'Last 30 days'},
                { v:'custom',    label:'Custom'      },
              ]} />
            {filters.dateRange === 'custom' && (
              <div className="flex items-center gap-2 mt-2.5">
                <input type="date" value={filters.customFrom}
                  onChange={e => set({ customFrom: e.target.value })}
                  className="flex-1 px-2 py-1.5 rounded-lg text-xs text-white/70 outline-none"
                  style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', colorScheme:'dark' }} />
                <span className="text-white/30 text-xs">–</span>
                <input type="date" value={filters.customTo}
                  onChange={e => set({ customTo: e.target.value })}
                  className="flex-1 px-2 py-1.5 rounded-lg text-xs text-white/70 outline-none"
                  style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', colorScheme:'dark' }} />
              </div>
            )}
          </FSection>

          {agentOpts.length > 1 && (
            <FSection label="Assigned Agent">
              <ChipGroup value={filters.agent} onChange={v => set({ agent: v })}
                opts={[{ v:'all', label:'All' }, ...agentOpts.map(a => ({ v:a, label:a.split(' ')[0] }))]} />
            </FSection>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderTop:'1px solid rgba(255,255,255,0.06)' }}>
          <span className="text-[11px] text-white/30">
            {ac > 0 ? `${ac} filter${ac > 1 ? 's' : ''} active` : 'No filters active'}
          </span>
          <button onClick={onClose}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
            style={{ background:'rgba(244,122,99,0.15)', border:'1px solid rgba(244,122,99,0.3)', color:'#f8a36d' }}>
            Done
          </button>
        </div>
      </motion.div>
    </>
  )
}

/* ─── Pipeline ───────────────────────────────────────────────── */

function PipelineSection({ onSelectLead, leads, newLeadIds = new Set<string>(), onAddLead, teamMembers = [] }: { onSelectLead:(id:string)=>void; leads:Lead[]; newLeadIds?: Set<string>; onAddLead?: () => void; teamMembers?: TeamMember[] }) {
  // v2 — sort feature active. Check browser console for this log to confirm latest build.
  console.log('[PipelineSection] sort feature v2 loaded, leads:', leads.length)
  const [search,     setSearch]     = useState('')
  const [filters,    setFilters]    = useState<PipelineFilters>(DEFAULT_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)
  const [sort,       setSort]       = useState<SortKey>(DEFAULT_SORT)
  const [sortOpen,   setSortOpen]   = useState(false)

  const ac = countActiveFilters(filters)
  const sortLabel = SORT_OPTIONS.find(o => o.key === sort)?.label ?? 'Sort'

  // Unique agent names for the filter: active team members first, then any from leads
  const agentOpts = useMemo(() => {
    const fromTeam  = teamMembers.filter(m => m.status === 'active').map(m => m.name)
    const fromLeads = leads.map(l => l.assignedAgent).filter(a => a && a !== 'Unassigned')
    return [...new Set([...fromTeam, ...fromLeads])].sort()
  }, [teamMembers, leads])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    const rows = leads.filter(l => {
      if (filters.score !== 'all' && l.scoreLabel !== filters.score) return false
      if (filters.status !== 'all' && l.status !== filters.status) return false
      if (filters.source !== 'all') {
        const norm = l.source.toLowerCase().replace(/[\s-]+/g, '_')
        if (norm !== filters.source) return false
      }
      if (filters.agent !== 'all' && l.assignedAgent !== filters.agent) return false
      if (!inDateRange(l.date, filters)) return false
      if (q) {
        const haystack = [
          l.name, l.company, l.interest, l.source, l.assignedAgent,
          l.email ?? '', l.phone ?? '',
          ...Object.values(l.metadata ?? {})
            .filter(v => typeof v === 'string' || typeof v === 'number')
            .map(String),
        ]
        if (!haystack.some(s => s.toLowerCase().includes(q))) return false
      }
      return true
    })
    return applySortKey(rows, sort)
  }, [leads, search, filters, sort])

  const clearAll = () => { setSearch(''); setFilters(DEFAULT_FILTERS); setSort(DEFAULT_SORT) }

  return (
    <Card>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 flex-wrap"
        style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
        <h2 className="text-sm font-bold text-white">
          Lead Pipeline <span className="font-normal text-white/30">({filtered.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          {onAddLead && (
            <button onClick={onAddLead}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={{ background:'rgba(244,122,99,0.12)', border:'1px solid rgba(244,122,99,0.3)', color:'#f8a36d' }}>
              <Plus className="w-3.5 h-3.5" />Add Lead
            </button>
          )}
          <ExportButton />
        </div>
      </div>

      {/* Search + Filter bar */}
      <div className="flex items-center gap-2 px-5 py-3"
        style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
          <input type="text"
            placeholder="Search name, email, phone, city, budget, any field…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all"
            style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)' }}
            onFocus={e=>{ e.currentTarget.style.border='1px solid rgba(244,122,99,0.4)' }}
            onBlur={e=>{  e.currentTarget.style.border='1px solid rgba(255,255,255,0.08)' }}
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Sort button — always visible */}
        <div className="relative flex-shrink-0">
          <button onClick={() => { setSortOpen(v => !v); setFilterOpen(false) }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap"
            style={sort !== DEFAULT_SORT || sortOpen ? {
              background:'rgba(244,122,99,0.15)', border:'1px solid rgba(244,122,99,0.35)', color:'#f8a36d',
            } : {
              background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.5)',
            }}>
            <ArrowUpDown className="w-3.5 h-3.5" />
            {sort !== DEFAULT_SORT ? sortLabel : 'Sort'}
          </button>

          <AnimatePresence>
            {sortOpen && (
              <SortPanel
                sort={sort}
                onChange={setSort}
                onClose={() => setSortOpen(false)}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Filter button */}
        <div className="relative flex-shrink-0">
          <button onClick={() => { setFilterOpen(v => !v); setSortOpen(false) }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap"
            style={ac > 0 || filterOpen ? {
              background:'rgba(244,122,99,0.15)', border:'1px solid rgba(244,122,99,0.35)', color:'#f8a36d',
            } : {
              background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.5)',
            }}>
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filter
            {ac > 0 && (
              <span className="flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-black text-white"
                style={{ background:'#171412' }}>
                {ac}
              </span>
            )}
          </button>

          <AnimatePresence>
            {filterOpen && (
              <FilterPanel
                filters={filters}
                onChange={setFilters}
                onClose={() => setFilterOpen(false)}
                agentOpts={agentOpts}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Mobile card list (hidden sm+) ──────────────────── */}
      <div className="sm:hidden">
        {leads.length === 0 ? (
          <div className="px-5 py-16 text-center flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background:'rgba(244,122,99,0.08)', border:'1px solid rgba(244,122,99,0.15)' }}>
              <Users className="w-5 h-5 text-orange-400/40" />
            </div>
            <p className="text-sm font-semibold text-white/30">No leads yet</p>
            <p className="text-xs text-white/20 max-w-[240px] leading-relaxed">
              New captured leads will appear here automatically.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-white/25">No leads match your filters</p>
            <button onClick={clearAll} className="text-xs text-orange-400 mt-2 block mx-auto">
              Clear all filters
            </button>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filtered.map((lead, i) => {
              const isNew = newLeadIds.has(lead.id) || (Date.now() - new Date(lead.date).getTime() < 10 * 60 * 1000)
              return (
                <motion.div key={lead.id}
                  initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                  transition={{ delay: isNew ? 0 : i * 0.02 }}
                  onClick={() => onSelectLead(lead.id)}
                  className="flex items-center gap-3 px-4 py-3.5 cursor-pointer border-b border-white/[0.04]"
                  style={{ background: isNew ? 'rgba(52,211,153,0.04)' : 'transparent' }}>
                  <div className="relative flex-shrink-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black text-white"
                      style={{ background: isNew ? 'linear-gradient(135deg,rgba(52,211,153,0.6),rgba(16,185,129,0.5))' : 'linear-gradient(135deg,rgba(244,122,99,0.5),rgba(248,154,87,0.4))' }}>
                      {initials(lead.name)}
                    </div>
                    {isNew && (
                      <motion.span initial={{ scale:0 }} animate={{ scale:1 }}
                        className="absolute -top-1.5 -right-1.5 text-[7px] font-black px-1 py-0.5 rounded-full"
                        style={{ background:'#34d399', color:'#fff' }}>NEW</motion.span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white/85 truncate">{lead.name}</div>
                    <div className="text-xs text-white/35 truncate">{lead.company || lead.source}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <ScoreBadge score={lead.score} label={lead.scoreLabel} />
                    <StatusBadge status={lead.status} />
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/20 flex-shrink-0" />
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
      </div>

      {/* ── Desktop table (hidden on mobile) ───────────────── */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full" style={{ minWidth:1040 }}>
          <thead>
            <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
              {['Lead / Company','Source','Interest','Agent','Score','Status','Added','Follow-up'].map(col => (
                <th key={col} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/25">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            <AnimatePresence initial={false}>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                        style={{ background:'rgba(244,122,99,0.08)', border:'1px solid rgba(244,122,99,0.15)' }}>
                        <Users className="w-5 h-5 text-orange-400/40" />
                      </div>
                      <p className="text-sm font-semibold text-white/30">No leads yet</p>
                      <p className="text-xs text-white/18 max-w-[260px] leading-relaxed">
                        New captured leads will appear here automatically as they come in through your integrations.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center">
                    <p className="text-sm text-white/25">No leads match your filters</p>
                    <button onClick={clearAll} className="text-xs text-orange-400 mt-2">
                      Clear all filters
                    </button>
                  </td>
                </tr>
              ) : filtered.map((lead, i) => {
                const isNew = newLeadIds.has(lead.id) || (Date.now() - new Date(lead.date).getTime() < 10 * 60 * 1000)
                return (
                <motion.tr key={lead.id}
                  initial={{ opacity:0, y:-10, scale:0.99 }} animate={{ opacity:1, y:0, scale:1 }} exit={{ opacity:0 }}
                  transition={{ delay: isNew ? 0 : i*0.025, type: isNew ? 'spring' : 'tween', stiffness: 320, damping: 28 }}
                  onClick={() => onSelectLead(lead.id)}
                  className="cursor-pointer group"
                  style={{ background: isNew ? 'rgba(52,211,153,0.04)' : 'transparent' }}
                  onMouseEnter={e=>(e.currentTarget.style.background='rgba(244,122,99,0.04)')}
                  onMouseLeave={e=>(e.currentTarget.style.background= isNew ? 'rgba(52,211,153,0.04)' : 'transparent')}>

                  {/* Lead / Company */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="relative flex-shrink-0">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black text-white"
                          style={{ background: isNew ? 'linear-gradient(135deg,rgba(52,211,153,0.6),rgba(16,185,129,0.5))' : 'linear-gradient(135deg,rgba(244,122,99,0.5),rgba(248,154,87,0.4))' }}>
                          {initials(lead.name)}
                        </div>
                        {isNew && (
                          <motion.span
                            initial={{ scale:0 }} animate={{ scale:1 }} transition={{ type:'spring', stiffness:400, damping:20 }}
                            className="absolute -top-1.5 -right-1.5 text-[8px] font-black px-1 py-0.5 rounded-full"
                            style={{ background:'#34d399', color:'#fff' }}>
                            NEW
                          </motion.span>
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white/80 group-hover:text-white transition-colors whitespace-nowrap">
                          {lead.name}
                        </div>
                        <div className="text-xs text-white/30 truncate max-w-[120px]">{lead.company}</div>
                      </div>
                    </div>
                  </td>

                  {/* Source */}
                  <td className="px-4 py-3.5">
                    <span className="text-xs text-white/50 bg-white/5 px-2 py-1 rounded-lg whitespace-nowrap">
                      {lead.source}
                    </span>
                  </td>

                  {/* Interest */}
                  <td className="px-4 py-3.5 text-xs text-white/55 whitespace-nowrap">{lead.interest}</td>

                  {/* Agent */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black text-white flex-shrink-0"
                        style={{ background:'linear-gradient(135deg,rgba(244,122,99,0.5),rgba(248,154,87,0.5))' }}>
                        {agentInitials(lead.assignedAgent)}
                      </div>
                      <span className="text-xs text-white/55 whitespace-nowrap">{lead.assignedAgent}</span>
                    </div>
                  </td>

                  {/* Score */}
                  <td className="px-4 py-3.5"><ScoreBadge score={lead.score} label={lead.scoreLabel} /></td>

                  {/* Status */}
                  <td className="px-4 py-3.5"><StatusBadge status={lead.status} /></td>

                  {/* Added */}
                  <td className="px-4 py-3.5">
                    <span className="text-xs text-white/40 whitespace-nowrap">{fmtLeadDate(lead.date)}</span>
                  </td>

                  {/* Follow-up */}
                  <td className="px-4 py-3.5"><AutoDots auto={lead.auto} /></td>
                </motion.tr>
              )
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>{/* end hidden sm:block */}

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3"
        style={{ borderTop:'1px solid rgba(255,255,255,0.05)' }}>
        <span className="text-xs text-white/20">
          Showing {filtered.length} of {leads.length} · click a row to view details
        </span>
        <div className="flex gap-4 text-[10px]">
          {(['hot','warm','cold'] as ScoreLabel[]).map(s => (
            <span key={s} style={{ color:SCORE_CFG[s].color }}>
              {leads.filter(l => l.scoreLabel===s).length} {SCORE_CFG[s].label}
            </span>
          ))}
        </div>
      </div>
    </Card>
  )
}

/* ─── Supabase row shapes (snake_case from realtime payloads) ── */

// Flexible — matches both the AI chat schema (business_id column) and
// the older ingest schema (client_id column). All optional fields safe-default in mapLeadRow.
interface RawLeadRow {
  id: string
  business_id?:    string | null
  client_id?:      string | null
  name: string
  company?:        string | null
  email?:          string | null
  phone?:          string | null
  source?:         string | null
  interest?:       string | null
  conversation_id?: string | null
  assigned_agent?: string | null
  score?:          number | null
  score_label?:    string | null
  status?:         string | null
  ai_sms?:         string | null
  email_seq?:      string | null
  nurture?:        string | null
  smart_assign?:   string | null
  auto_call?:      string | null
  metadata?:       Record<string, unknown> | null
  created_at: string
  updated_at?: string
}
interface RawActivityRow {
  id: string; business_id?: string; lead_id: string | null
  type: string; title: string; description: string | null; created_at: string
}
interface RawAppointmentRow {
  id: string; business_id?: string; client_id?: string; lead_id: string | null
  lead_name: string | null; lead_company?: string | null
  type?: string; scheduled_at: string; status: string; created_at: string
  notes?: string | null
}

/* ─── Client-side mappers (mirror db.ts without server imports) ── */

function mapLeadRow(r: RawLeadRow): Lead {
  return {
    id:              r.id,
    name:            r.name,
    company:         r.company        ?? '',
    email:           r.email          ?? undefined,
    phone:           r.phone          ?? undefined,
    source:          r.source         ?? 'website_chat',
    interest:        r.interest       ?? '',
    assignedAgent:   r.assigned_agent ?? 'Unassigned',
    score:           r.score          ?? 0,
    scoreLabel:     (r.score_label    as ScoreLabel) ?? 'cold',
    status:         (r.status         as LeadStatus) ?? 'new',
    date:            r.created_at,
    conversation_id: r.conversation_id ?? null,
    metadata:        r.metadata       ?? undefined,
    auto: {
      aiSms:       (r.ai_sms       as AutoState['aiSms'])       ?? 'off',
      emailSeq:    (r.email_seq    as AutoState['emailSeq'])    ?? 'not_started',
      nurture:     (r.nurture      as AutoState['nurture'])     ?? 'not_started',
      smartAssign: (r.smart_assign as AutoState['smartAssign']) ?? 'unassigned',
      autoCall:    (r.auto_call    as AutoState['autoCall'])    ?? 'off',
    },
  }
}
function mapActivityRow(r: RawActivityRow): ActivityItem {
  const diff = Date.now() - new Date(r.created_at).getTime()
  const mins = Math.floor(diff / 60000); const hours = Math.floor(mins / 60); const days = Math.floor(hours / 24)
  const time = mins < 1 ? 'Just now' : mins < 60 ? `${mins} min ago` : hours < 24 ? `${hours} hour${hours>1?'s':''} ago` : `${days} day${days>1?'s':''} ago`
  return { id: r.id, type: (r.type as ActivityType) ?? 'email', text: r.title, sub: r.description ?? '', time }
}
function mapAppointmentRow(r: RawAppointmentRow): Appointment {
  const dt = new Date(r.scheduled_at)
  return {
    id:       r.id,
    name:     r.lead_name    ?? 'Unknown',
    company:  r.lead_company ?? '',
    type:     (r.type ?? 'viewing').replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase()),
    date:     dt.toISOString().split('T')[0],
    time:     dt.toTimeString().slice(0, 5),
    status:  (r.status as ApptStatus) ?? 'pending',
    upcoming: dt > new Date(),
    leadId:   r.lead_id ?? undefined,
    notes:    r.notes   ?? undefined,
  }
}

/* ─── Real-time Activity Feed ────────────────────────────────── */

function ActivitySection({ feed }: { feed: ActivityItem[] }) {
  return (
    <Card>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <h2 className="text-sm font-bold text-white">Live Activity Feed</h2>
          <p className="text-xs text-white/30 mt-0.5">
            {feed.length > 0 ? `${feed.length} events · updating in real time` : 'Waiting for events'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold"
          style={{ background:'rgba(52,211,153,0.08)', border:'1px solid rgba(52,211,153,0.2)', color:'#34d399' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live
        </div>
      </div>
      {feed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <Activity className="w-7 h-7 text-white/10" />
          <p className="text-sm text-white/25 font-medium">No activity yet</p>
          <p className="text-xs text-white/15">Events appear here as leads interact with your automations</p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          <AnimatePresence initial={false}>
            {feed.map(item => {
              const cfg = ACTIVITY_CFG[item.type] ?? ACTIVITY_CFG_DEFAULT
              return (
                <motion.div key={item.id}
                  initial={{ opacity:0, y:-16, scale:0.98 }} animate={{ opacity:1, y:0, scale:1 }} exit={{ opacity:0 }}
                  transition={{ duration:0.35 }}
                  className="flex items-start gap-4 px-5 py-4 transition-colors"
                  style={{ background: item.live ? 'rgba(52,211,153,0.03)' : 'transparent' }}
                  onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.015)')}
                  onMouseLeave={e=>(e.currentTarget.style.background=item.live?'rgba(52,211,153,0.03)':'transparent')}>
                  {item.live && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0 mt-1.5" />}
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background:cfg.bg, border:`1px solid ${cfg.color}25` }}>
                    <DataIcon icon={cfg.Icon} className="w-4 h-4" style={{ color:cfg.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white/80">{item.text}</div>
                    <div className="text-xs text-white/35 mt-0.5">{item.sub}</div>
                  </div>
                  <div className="text-xs whitespace-nowrap flex-shrink-0 pt-0.5" style={{ color: item.live ? '#34d399' : 'rgba(255,255,255,0.25)' }}>
                    {item.time}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </Card>
  )
}

/* ─── Appointments — date picker ─────────────────────────────── */

function WeekDatePicker({
  anchorDate,
  onSelect,
  onClose,
}: {
  anchorDate: Date        // first day of the 7-day window
  onSelect:   (d: Date) => void
  onClose:    () => void
}) {
  const [viewYear,  setViewYear]  = useState(anchorDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(anchorDate.getMonth())

  const todayISO = new Date().toISOString().split('T')[0]

  const firstOfMonth = new Date(viewYear, viewMonth, 1)
  const firstDow     = firstOfMonth.getDay()
  const offset       = firstDow === 0 ? 6 : firstDow - 1   // Mon-based
  const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate()
  const totalCells   = Math.ceil((offset + daysInMonth) / 7) * 7

  // All 7 days of the currently viewed window (for highlight)
  const anchorWeekSet = new Set(
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(anchorDate)
      d.setDate(anchorDate.getDate() + i)
      return d.toISOString().split('T')[0]
    })
  )

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const DAY_HDR = ['M','T','W','T','F','S','S']

  return (
    <>
      {/* Transparent backdrop to close picker */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <motion.div
        initial={{ opacity:0, scale:0.95, y:-8 }}
        animate={{ opacity:1, scale:1,    y: 0 }}
        exit={{   opacity:0, scale:0.95, y:-8 }}
        transition={{ duration:0.15 }}
        className="absolute left-0 top-full mt-2 z-50 w-72 rounded-2xl overflow-hidden"
        style={{
          background:    'rgba(18,17,15,0.98)',
          border:        '1px solid rgba(244,122,99,0.25)',
          boxShadow:     '0 24px 60px rgba(0,0,0,0.7)',
          backdropFilter:'blur(24px)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Month navigation */}
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={prevMonth}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 transition-colors"
            style={{ background:'rgba(255,255,255,0.04)' }}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold text-white">
            {firstOfMonth.toLocaleDateString('en-GB', { month:'long', year:'numeric' })}
          </span>
          <button onClick={nextMonth}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 transition-colors"
            style={{ background:'rgba(255,255,255,0.04)' }}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 px-3 pt-2 pb-1">
          {DAY_HDR.map((l, i) => (
            <div key={i} className="h-7 flex items-center justify-center text-[10px] font-bold text-white/25">{l}</div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 px-3 pb-3 gap-y-0.5">
          {Array.from({ length: totalCells }, (_, i) => {
            const dayNum = i - offset + 1
            if (dayNum < 1 || dayNum > daysInMonth) return <div key={i} className="h-8" />

            const d   = new Date(viewYear, viewMonth, dayNum)
            const iso = d.toISOString().split('T')[0]
            const isToday    = iso === todayISO
            const inWeek     = anchorWeekSet.has(iso)
            const isWeekend  = (i % 7 >= 5)

            return (
              <button key={i}
                onClick={() => { onSelect(d); onClose() }}
                className="h-8 w-8 mx-auto flex items-center justify-center rounded-lg text-xs font-semibold transition-all hover:bg-orange-500/20"
                style={{
                  background: inWeek   ? 'rgba(244,122,99,0.22)'
                            : isToday  ? 'rgba(244,122,99,0.10)'
                            :            'transparent',
                  color:      inWeek   ? '#f8a36d'
                            : isToday  ? '#f8a36d'
                            : isWeekend? 'rgba(255,255,255,0.22)'
                            :            'rgba(255,255,255,0.60)',
                  border:     isToday && !inWeek ? '1px solid rgba(244,122,99,0.35)' : '1px solid transparent',
                }}>
                {dayNum}
              </button>
            )
          })}
        </div>
      </motion.div>
    </>
  )
}

/* ─── Appointments ───────────────────────────────────────────── */

function AppointmentsSection({
  appointments, leads, onSelectLead, onApptUpdated, onAddAppointment, actorName = 'Alex Thompson',
}: {
  appointments:     Appointment[]
  leads:            Lead[]
  onSelectLead:     (id: string) => void
  onApptUpdated?:   (patch: { id:string; type:string; date:string; time:string; status:ApptStatus; notes?:string; leadId?:string }) => void
  onAddAppointment?: () => void
  actorName?:        string
}) {
  const [dayOffset,    setDayOffset]    = useState(0)       // offset in days from today
  const [selectedAppt, setSelectedAppt] = useState<DrawerAppointment | null>(null)
  const [pickerOpen,   setPickerOpen]   = useState(false)
  const [draggingId,   setDraggingId]   = useState<string | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)

  // Open the full LeadPanel when the appointment has a linked lead; otherwise
  // fall back to the lightweight ApptDrawer for appointment-only context.
  function handleApptClick(appt: Appointment) {
    if (appt.leadId && leads.some(l => l.id === appt.leadId)) {
      onSelectLead(appt.leadId)
    } else {
      setSelectedAppt(toDrawer(appt))
    }
  }

  // ── Anchor date = today + dayOffset ────────────────────────────
  const now      = new Date()
  const todayISO = now.toISOString().split('T')[0]

  const baseToday = new Date(now)
  baseToday.setHours(0, 0, 0, 0)

  const anchorDate = new Date(baseToday)
  anchorDate.setDate(baseToday.getDate() + dayOffset)

  // ── 7-day window: anchorDate … anchorDate + 6 ──────────────────
  const viewDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(anchorDate)
    d.setDate(anchorDate.getDate() + i)
    const iso = d.toISOString().split('T')[0]
    return {
      label:   d.toLocaleDateString('en-GB', { weekday:'short' }),  // "Mon"
      dateNum: d.toLocaleDateString('en-GB', { day:'numeric', month:'short' }), // "22 May"
      iso,
      today:   iso === todayISO,
    }
  })

  const windowIsoSet = new Set(viewDays.map(d => d.iso))
  const rangeLabel   = `${viewDays[0].dateNum}–${viewDays[6].dateNum} ${anchorDate.getFullYear()}`

  // ── Navigate to a specific day (from date picker) ──────────────
  function goToDay(d: Date) {
    const t = new Date(d); t.setHours(0, 0, 0, 0)
    const diff = Math.round((t.getTime() - baseToday.getTime()) / 86400000)
    setDayOffset(diff)
  }

  // ── Convert Appointment → DrawerAppointment ────────────────────
  function toDrawer(a: Appointment): DrawerAppointment {
    return { id:a.id, name:a.name, company:a.company, type:a.type,
             date:a.date, time:a.time, status:a.status, leadId:a.leadId, notes:a.notes }
  }

  // ── Drag-drop: move appointment to a new day, preserve time ────
  async function dropOnDate(targetDate: string) {
    if (!draggingId || !onApptUpdated) return
    const appt = appointments.find(a => a.id === draggingId)
    if (!appt || appt.date === targetDate) return
    const newScheduledAt = new Date(`${targetDate}T${appt.time}:00`).toISOString()
    onApptUpdated({ id: appt.id, type: appt.type, date: targetDate, time: appt.time, status: appt.status, notes: appt.notes, leadId: appt.leadId })
    try {
      await fetch(`/api/appointments/${appt.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Actor-Name': actorName },
        body:    JSON.stringify({ scheduled_at: newScheduledAt, _drag: true }),
      })
    } catch { /* optimistic update already applied */ }
  }

  // ── Upcoming: beyond the 7-day window, not cancelled ──────────
  const lastWindowDate = viewDays[6].iso
  const upcoming = appointments
    .filter(a => a.date > lastWindowDate && a.status !== 'cancelled')
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))

  return (
    <>
      <div className="flex flex-col gap-5">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="relative">
            <button onClick={() => setPickerOpen(v => !v)}
              className="flex flex-col cursor-pointer hover:opacity-80 transition-opacity text-left">
              <h2 className="text-base font-bold text-white">Schedule</h2>
              <p className="text-xs text-white/30 mt-0.5 flex items-center gap-1">
                {rangeLabel}
                <ChevronRight className="w-3 h-3 opacity-50 rotate-90 inline" />
              </p>
            </button>
            <AnimatePresence>
              {pickerOpen && (
                <WeekDatePicker
                  anchorDate={anchorDate}
                  onSelect={goToDay}
                  onClose={() => setPickerOpen(false)}
                />
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-2">
            {dayOffset !== 0 && (
              <motion.button
                initial={{ opacity:0, scale:0.9 }} animate={{ opacity:1, scale:1 }}
                onClick={() => setDayOffset(0)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background:'rgba(244,122,99,0.12)', border:'1px solid rgba(244,122,99,0.25)', color:'#f8a36d' }}>
                Today
              </motion.button>
            )}
            <button onClick={() => setDayOffset(o => o - 1)}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white/40 hover:text-white/80 transition-colors"
              style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)' }}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setDayOffset(o => o + 1)}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white/40 hover:text-white/80 transition-colors"
              style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)' }}>
              <ChevronRight className="w-4 h-4" />
            </button>
            {onAddAppointment && (
              <button onClick={onAddAppointment}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={{ background:'rgba(52,211,153,0.10)', border:'1px solid rgba(52,211,153,0.25)', color:'#34d399' }}>
                <Plus className="w-3.5 h-3.5" /><span className="hidden sm:inline">Add Appointment</span><span className="sm:hidden">Add</span>
              </button>
            )}
            <ExportButton />
          </div>
        </div>

        {/* ── 7-day grid
              mobile  : 3 cols × 3 rows — each card is wide enough to read
              tablet  : 4 cols × 2 rows
              desktop : 7 cols × 1 row  (unchanged from previous desktop commit)
        ── */}
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {viewDays.map(day => {
            const dayAppts = appointments.filter(a => a.date === day.iso)
            const isDropTarget = dragOverDate === day.iso && draggingId !== null
            return (
              <Card key={day.iso}
                className={[
                  day.today ? 'ring-1 ring-orange-500/25' : '',
                  isDropTarget ? 'ring-1 ring-orange-400/50' : '',
                ].filter(Boolean).join(' ')}
                onDragOver={(e: React.DragEvent) => { e.preventDefault(); setDragOverDate(day.iso) }}
                onDragLeave={(e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverDate(null) }}
                onDrop={async (e: React.DragEvent) => { e.preventDefault(); setDragOverDate(null); await dropOnDate(day.iso) }}>
                {/* Day header */}
                <div className="flex items-center justify-between px-3 py-3"
                  style={{
                    borderBottom: dayAppts.length ? '1px solid rgba(255,255,255,0.07)' : 'none',
                    background:   isDropTarget ? 'rgba(244,122,99,0.12)' : day.today ? 'rgba(244,122,99,0.07)' : 'transparent',
                    transition:   'background 0.15s',
                  }}>
                  <div>
                    <div className="text-xs font-black text-white/70 uppercase tracking-wide">{day.label}</div>
                    <div className="text-[10px] text-white/35 mt-0.5 leading-tight">{day.dateNum}</div>
                  </div>
                  {day.today && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background:'rgba(244,122,99,0.22)', color:'#f8a36d', border:'1px solid rgba(244,122,99,0.35)' }}>
                      TODAY
                    </span>
                  )}
                </div>

                {/* Appointment cards / empty state */}
                {dayAppts.length > 0 ? (
                  <div className="p-2 flex flex-col gap-2">
                    {dayAppts.map(appt => {
                      const sc = APPT_CFG[appt.status]
                      const displayName = liveApptName(appt, leads)
                      return (
                        <motion.button key={appt.id}
                          draggable
                          onDragStart={() => setDraggingId(appt.id)}
                          onDragEnd={() => { setDraggingId(null); setDragOverDate(null) }}
                          whileHover={{ scale:1.02, boxShadow:`0 6px 16px ${sc.color}20` }}
                          whileTap={{ scale:0.98 }}
                          onClick={() => handleApptClick(appt)}
                          className="rounded-xl p-3 w-full text-left cursor-grab active:cursor-grabbing"
                          style={{
                            background: `${sc.color}10`,
                            border:     `1px solid ${sc.color}28`,
                            opacity:    draggingId === appt.id ? 0.45 : 1,
                          }}>
                          <div className="text-xs font-bold text-white/85 leading-snug truncate">{displayName}</div>
                          <div className="text-[10px] text-white/45 mt-1 truncate">{appt.type}</div>
                          <div className="flex items-center gap-1.5 text-[10px] text-white/35 mt-1.5">
                            <Clock className="w-3 h-3 flex-shrink-0" />{appt.time}
                          </div>
                        </motion.button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="py-8 text-center"
                    style={{ background: isDropTarget ? 'rgba(244,122,99,0.06)' : 'transparent', transition:'background 0.15s' }}>
                    <div className="text-[10px] text-white/15 font-medium">{isDropTarget ? 'Drop here' : 'Free'}</div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>

        {/* ── Upcoming list ───────────────────────────────────── */}
        <Card>
          <div className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
            <h2 className="text-sm font-bold text-white">Upcoming</h2>
            <span className="text-xs text-white/30">Beyond this view</span>
          </div>
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Calendar className="w-7 h-7 text-white/10" />
              <p className="text-sm text-white/25 font-medium">No upcoming appointments</p>
              <p className="text-xs text-white/15">Bookings beyond this window will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {upcoming.map((appt, i) => {
                const sc = APPT_CFG[appt.status]
                return (
                  <motion.div key={appt.id}
                    initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.05 }}
                    whileHover={{ background:'rgba(244,122,99,0.04)' }}
                    className="flex items-center gap-4 px-5 py-3.5 cursor-pointer transition-colors"
                    onClick={() => handleApptClick(appt)}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                      style={{ background:'linear-gradient(135deg,rgba(244,122,99,0.4),rgba(248,154,87,0.3))' }}>
                      {initials(liveApptName(appt, leads))}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-white/80">{liveApptName(appt, leads)}</div>
                      <div className="text-xs text-white/30">{appt.type} · {appt.company}</div>
                    </div>
                    <div className="text-right mr-2">
                      <div className="text-xs text-white/50">{fmtApptDate(appt.date)}</div>
                      <div className="text-[10px] text-white/30">{appt.time}</div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
                      style={{ color:sc.color, background:sc.bg }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background:sc.color }} />{sc.label}
                    </span>
                  </motion.div>
                )
              })}
            </div>
          )}
        </Card>

      </div>

      {selectedAppt && (
        <ApptDrawer appt={selectedAppt} onClose={() => setSelectedAppt(null)} />
      )}
    </>
  )
}

/* ─── Automation ─────────────────────────────────────────────── */

function AutomationSection({ leads, integrations = [], overviewMetrics }: { leads: Lead[]; integrations?: IntegrationRow[]; overviewMetrics?: OverviewMetrics }) {
  // Merge static display config with live stats from integrations_status table
  const enriched = AUTOMATIONS.map(a => {
    const row = integrations.find(r => r.integrationType === a.id)
    if (!row) return a
    const lastAct = relativeTime(row.lastActivityAt)
    const statsByType: Record<string, { s1: string; s2: string }> = {
      whatsapp: { s1: String(row.messagesWeek), s2: String(row.leadsCaptured) },
      webchat:  { s1: String(row.messagesWeek), s2: String(row.leadsCaptured) },
      email:    { s1: String(row.messagesWeek), s2: String(row.leadsCaptured) },
      crm:      { s1: String(row.leadsCaptured), s2: lastAct                  },
    }
    const stats = statsByType[a.id] ?? { s1: a.stat1Value, s2: a.stat2Value }
    return { ...a, status: (row.status as typeof a.status) ?? a.status, lastActivity: lastAct, stat1Value: stats.s1, stat2Value: stats.s2 }
  })

  const m = overviewMetrics
  const revenueStr = m && m.estimatedRevenue > 0
    ? m.estimatedRevenue >= 10000 ? `£${(m.estimatedRevenue / 1000).toFixed(1)}k` : `£${m.estimatedRevenue.toLocaleString()}`
    : '—'
  const perfCards: { label:string; value:string|number; sub:string; color:string; Icon:React.ComponentType<{className?:string;style?:React.CSSProperties}> }[] = [
    { label:'Conversion Lift',  value: (m?.conversionLiftPct ?? 0) > 0 ? `+${m!.conversionLiftPct}%` : '—', sub:'vs prior week',      color:'#34d399', Icon:TrendingUp  },
    { label:'Agent Time Saved', value: m ? `${m.agentTimeSavedHrs} hrs` : '—',                              sub:'this week (AI)',     color:'#948f88', Icon:Timer       },
    { label:'Monthly Deals',    value: m?.monthlyDeals ?? 0,                                                 sub:'closed this month', color:'#f8a36d', Icon:CheckCircle },
    { label:'Est. Revenue',     value: revenueStr,                                                           sub:'this month',        color:'#fbbf24', Icon:DollarSign  },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {perfCards.map((p,i) => (
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {enriched.map((a,i) => (
          <motion.div key={a.id} initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.07 }}>
            <motion.div whileHover={{ y:-2 }} className="rounded-2xl p-6 flex flex-col gap-4"
              style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background:`${a.color}18`, border:`1px solid ${a.color}30` }}>
                    <DataIcon icon={a.Icon} className="w-5 h-5" style={{ color:a.color }} />
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
              <div className="grid grid-cols-2 gap-3">
                {[{l:a.stat1Label,v:a.stat1Value},{l:a.stat2Label,v:a.stat2Value}].map(s=>(
                  <div key={s.l} className="rounded-xl px-4 py-3"
                    style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)' }}>
                    <div className="text-xl font-black text-white">{s.v}</div>
                    <div className="text-[10px] text-white/30 mt-0.5">{s.l}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="text-sm font-bold text-white">Follow-up Automation per Lead</h2>
          <div className="hidden sm:flex items-center gap-4 text-[10px]">
            {[['#34d399','Active'],['#fbbf24','Scheduled'],['rgba(255,255,255,0.25)','Off']].map(([c,l])=>(
              <span key={l as string} className="flex items-center gap-1.5" style={{ color:'rgba(255,255,255,0.35)' }}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ background:c as string }}/>{l}
              </span>
            ))}
          </div>
        </div>
        {/* Mobile: name + score + auto dots (hidden sm+) */}
        <div className="sm:hidden divide-y divide-white/[0.04]">
          {leads.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-white/25">No leads yet</p>
            </div>
          ) : leads.map(lead => (
            <div key={lead.id} className="flex items-center gap-3 px-4 py-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                style={{ background:'linear-gradient(135deg,rgba(244,122,99,0.5),rgba(248,154,87,0.4))' }}>
                {initials(lead.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white/80 truncate">{lead.name}</div>
                <div className="mt-1"><ScoreBadge score={lead.score} label={lead.scoreLabel} /></div>
              </div>
              <AutoDots auto={lead.auto} />
            </div>
          ))}
        </div>

        {/* Desktop table (hidden on mobile) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full" style={{ minWidth:700 }}>
            <thead><tr style={{ borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
              <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-white/25">Lead</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/25">Score</th>
              {AUTO_COLS.map(col=>(
                <th key={col.key} className="px-4 py-3 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <DataIcon icon={col.Icon} className="w-3.5 h-3.5 text-white/25" />
                    <span className="text-[9px] font-bold uppercase tracking-wide text-white/25 whitespace-nowrap">{col.label}</span>
                  </div>
                </th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.04]">
              {leads.map((lead,i)=>(
                <motion.tr key={lead.id} initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.03 }}
                  style={{ background:'transparent' }}
                  onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.02)')}
                  onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-black text-white flex-shrink-0"
                        style={{ background:'linear-gradient(135deg,rgba(244,122,99,0.5),rgba(248,154,87,0.4))' }}>
                        {initials(lead.name)}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-white/80 whitespace-nowrap">{lead.name}</div>
                        <div className="text-[10px] text-white/30 truncate max-w-[100px]">{lead.company}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><ScoreBadge score={lead.score} label={lead.scoreLabel} /></td>
                  {AUTO_COLS.map(col=>{
                    const status = lead.auto[col.key]; const color = AUTO_COLOR[status]||'rgba(255,255,255,0.15)'
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
        </div>{/* end hidden sm:block */}
      </Card>
    </div>
  )
}

/* ─── Settings ───────────────────────────────────────────────── */

const SETTING_PANELS: {label:string; sub:string; Icon:React.ComponentType<{className?:string;style?:React.CSSProperties}>}[] = [
  { Icon:Shield,    label:'Company Profile',           sub:'Business name, logo, contact details'  },
  { Icon:Bell,      label:'Notification Preferences',  sub:'Email alerts, SMS, push notifications' },
  { Icon:Link2,     label:'Integrations',              sub:'Connect CRM, calendar, and more'       },
  { Icon:BarChart2, label:'Analytics & Reporting',     sub:'Automated weekly performance reports'  },
]

function SettingsSection() {
  const [businessType, setBusinessType] = useState('')
  const [businessTypeLoaded, setBusinessTypeLoaded] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [rentalSettings, setRentalSettings] = useState<RentalSettings>({ cleaningBufferMinutes: 120, syncDirection: 'none', externalSyncEnabled: false, currency: 'PLN' })
  const [rentalSettingsStatus, setRentalSettingsStatus] = useState('')

  useEffect(() => {
    fetch('/api/business/settings')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        const normalized = normalizeBusinessType(data?.businessType)
        setBusinessType(normalized)
        localStorage.setItem('instantdesk_business_type', normalized)
      })
      .catch(() => {
        setBusinessType('general_service')
      })
      .finally(() => setBusinessTypeLoaded(true))
  }, [])

  useEffect(() => {
    if (businessType !== 'car_rental') return
    fetch('/api/rental/settings')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.settings) setRentalSettings(prev => ({ ...prev, ...data.settings }))
      })
      .catch(() => {})
  }, [businessType])

  async function updateBusinessType(nextRaw: string) {
    const next = normalizeBusinessType(nextRaw)
    const previous = businessType
    setBusinessType(next)
    setSaveState('saving')
    try {
      localStorage.setItem('instantdesk_business_type', next)
      const res = await fetch('/api/business/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessType: next }),
      })
      setSaveState(res.ok ? 'saved' : 'error')
      if (res.ok) {
        setTimeout(() => setSaveState('idle'), 2500)
      }
      if (next === 'car_rental' && previous !== 'car_rental' && localStorage.getItem('instantdesk_car_rental_onboarding_done') !== 'true') {
        window.location.href = '/onboarding/car-rental'
      }
    } catch {
      setSaveState('error')
    }
  }

  async function saveRentalSettingsFromSettings() {
    setRentalSettingsStatus('Saving rental settings...')
    const res = await fetch('/api/rental/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rentalSettings),
    })
    const data = await res.json().catch(() => ({}))
    setRentalSettingsStatus(res.ok ? 'Rental settings saved.' : data.error ?? 'Rental settings save failed.')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 px-1">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background:'rgba(244,122,99,0.12)', border:'1px solid rgba(244,122,99,0.2)' }}>
          <Settings className="w-4 h-4 text-orange-400" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Settings</h2>
          <p className="text-xs text-white/30">Full configuration coming soon</p>
        </div>
      </div>
      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Car className="h-4 w-4 text-[#f8a36d]" />
              <h3 className="text-sm font-semibold text-white">Business type</h3>
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-white/38">
              Select a niche to unlock operational tools while keeping the core website chat, live chat, CRM, and human handover system active.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={businessTypeLoaded ? businessType : ''}
              onChange={(event) => void updateBusinessType(event.target.value)}
              disabled={!businessTypeLoaded}
              className="h-11 min-w-[220px] rounded-xl border border-white/10 bg-black/30 px-3 text-sm font-medium text-white outline-none transition-colors focus:border-[#f8a36d]/55"
            >
              {!businessTypeLoaded && <option value="">Loading...</option>}
              {CANONICAL_BUSINESS_TYPES.map(type => (
                <option key={type} value={type}>{BUSINESS_TYPE_CONFIG[type].label}</option>
              ))}
            </select>
            <span className="text-[11px] font-semibold text-white/32">
              {!businessTypeLoaded ? 'Loading saved workspace type...' : saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Saved locally' : businessType === 'car_rental' ? 'Rental tools unlocked' : 'Core tools active'}
            </span>
          </div>
        </div>
      </Card>
      {saveState === 'saved' && (
        <div className="rounded-xl border border-[#f8a36d]/20 bg-[#f8a36d]/10 px-4 py-3 text-sm font-semibold text-[#f8a36d]">Saved</div>
      )}
      {businessType === 'car_rental' && (
        <Card className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Car Rental Settings</h3>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-white/38">Edit policies and operational rules after onboarding. These settings are used by availability checks and the AI rental prompt.</p>
            </div>
            <button onClick={() => void saveRentalSettingsFromSettings()} className="btn-primary">Save rental settings</button>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <input value={rentalSettings.companyName ?? ''} onChange={e => setRentalSettings(prev => ({ ...prev, companyName: e.target.value }))} placeholder="Company name" className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
            <input value={rentalSettings.companyPhone ?? ''} onChange={e => setRentalSettings(prev => ({ ...prev, companyPhone: e.target.value }))} placeholder="Phone" className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
            <input value={rentalSettings.companyWhatsapp ?? ''} onChange={e => setRentalSettings(prev => ({ ...prev, companyWhatsapp: e.target.value }))} placeholder="WhatsApp" className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
            <input value={rentalSettings.companyEmail ?? ''} onChange={e => setRentalSettings(prev => ({ ...prev, companyEmail: e.target.value }))} placeholder="Email" className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
            <input value={rentalSettings.companyWebsite ?? ''} onChange={e => setRentalSettings(prev => ({ ...prev, companyWebsite: e.target.value }))} placeholder="Website" className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
            <select value={rentalSettings.currency ?? 'PLN'} onChange={e => setRentalSettings(prev => ({ ...prev, currency: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55">
              {['PLN','EUR','USD','GBP'].map(currency => <option key={currency}>{currency}</option>)}
            </select>
            <input type="number" value={rentalSettings.cleaningBufferMinutes ?? 120} onChange={e => setRentalSettings(prev => ({ ...prev, cleaningBufferMinutes: Number(e.target.value) || 120 }))} placeholder="Buffer minutes" className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
            <input value={rentalSettings.minimumRentalDuration ?? ''} onChange={e => setRentalSettings(prev => ({ ...prev, minimumRentalDuration: e.target.value }))} placeholder="Minimum rental duration" className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
            <input value={rentalSettings.providerName ?? ''} onChange={e => setRentalSettings(prev => ({ ...prev, providerName: e.target.value }))} placeholder="Calendar provider" className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
            <input value={rentalSettings.apiUrl ?? ''} onChange={e => setRentalSettings(prev => ({ ...prev, apiUrl: e.target.value }))} placeholder="API URL" className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55 md:col-span-2" />
            <select value={rentalSettings.syncDirection ?? 'none'} onChange={e => setRentalSettings(prev => ({ ...prev, syncDirection: e.target.value as RentalSettings['syncDirection'] }))} className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55">
              <option value="none">Sync disabled</option>
              <option value="import">Import only</option>
              <option value="push">Push only</option>
              <option value="two_way">Two-way sync</option>
            </select>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {[
              ['Deposit policy', 'depositPolicy'],
              ['Pickup/drop-off rules', 'pickupDropoffRules'],
              ['Return policy', 'returnPolicy'],
              ['Required documents', 'requiredDocumentsText'],
              ['Insurance/extras notes', 'insuranceExtrasNotes'],
              ['Cancellation policy', 'cancellationPolicy'],
              ['Late return policy', 'lateReturnPolicy'],
              ['Fuel policy', 'fuelPolicy'],
              ['Mileage policy', 'mileagePolicy'],
              ['Cross-border policy', 'crossBorderPolicy'],
            ].map(([label, key]) => (
              <textarea key={key} value={String((rentalSettings as unknown as Record<string, unknown>)[key] ?? '')} onChange={e => setRentalSettings(prev => ({ ...prev, [key]: e.target.value }))} placeholder={label} rows={3} className="rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
            ))}
          </div>
          {rentalSettingsStatus && <p className="mt-4 text-sm font-semibold text-[#f8a36d]">{rentalSettingsStatus}</p>}
        </Card>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SETTING_PANELS.map((p,i)=>(
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
                style={{ background:'rgba(244,122,99,0.12)', color:'#f8a36d', border:'1px solid rgba(244,122,99,0.2)' }}>Soon</span>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function DeployCopyButton({ id, value, copied, onCopy }: { id: string; value: string; copied: string | null; onCopy: (id: string, value: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onCopy(id, value)}
      className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-white/72 transition-colors hover:text-white"
      style={{ background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.09)' }}
    >
      {copied === id ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
      {copied === id ? 'Copied' : 'Copy'}
    </button>
  )
}

function DeploySection({ businessId, selectedBotId }: { businessId: string; selectedBotId?: string | null }) {
  const [copied, setCopied] = useState<string | null>(null)
  const botId = selectedBotId ?? ''
  const origin = 'https://instantdesk.pl'
  const directLink = `${origin}/chat/${botId || businessId}`
  const scriptCode = `<script
  defer
  src="${origin}/embed.js"
  data-business-id="${businessId}"${botId ? `
  data-bot-id="${botId}"` : ''}
></script>`
  const iframeCode = `<iframe
  src="${origin}/embed/${businessId}?instantdesk_business_id=${businessId}${botId ? `&bot_id=${botId}` : ''}"
  width="400"
  height="600">
</iframe>`
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(directLink)}`
  const websiteMethods = [
    { id: 'script', title: 'Website Script', Icon: Code2, description: 'Install the floating InstantDesk widget on every page of your website.', code: scriptCode },
    { id: 'iframe', title: 'Iframe', Icon: FileText, description: 'Embed the open chat experience inside a page or support portal.', code: iframeCode },
  ]
  const channelCards = [
    { id: 'whatsapp', title: 'WhatsApp', action: 'Connect WhatsApp Business', Icon: MessageCircle },
    { id: 'messenger', title: 'Messenger', action: 'Connect Facebook Page', Icon: MessageSquare },
    { id: 'instagram', title: 'Instagram', action: 'Connect Instagram DM', Icon: Camera },
    { id: 'email', title: 'Email', action: 'Connect Gmail / Microsoft', Icon: Mail },
  ]

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // Clipboard permissions can be denied in automated or embedded contexts.
      // The UI still confirms the copy action so users get immediate feedback.
    }
    setCopied(key)
    window.setTimeout(() => setCopied(null), 1400)
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5">
      <section className="rounded-2xl p-5 sm:p-6" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.075)' }}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xl font-black text-white">Website Widget</div>
            <p className="text-sm text-white/45">Production website chat entry points for this InstantDesk bot.</p>
          </div>
          <span className="rounded-full px-3 py-1 text-xs font-bold text-emerald-200" style={{ background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.20)' }}>
            Active channel
          </span>
        </div>
        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)_220px] lg:items-center">
          <div className="flex h-40 items-center justify-center rounded-2xl" style={{ background: 'rgba(7,8,9,0.42)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="relative h-24 w-32 rounded-xl" style={{ background: 'rgba(148,145,140,0.12)', border: '1px solid rgba(148,145,140,0.18)' }}>
              <div className="absolute left-4 top-4 h-3 w-16 rounded bg-orange-300/70" />
              <div className="absolute left-4 top-10 h-7 w-24 rounded-lg bg-white/18" />
              <div className="absolute bottom-4 left-4 h-3 w-20 rounded bg-white/20" />
              <MessageSquare className="absolute bottom-3 right-3 h-5 w-5 text-orange-300" />
            </div>
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-xl font-black text-white">
              <Link2 className="h-5 w-5 text-orange-300" />
              Direct Link
            </div>
            <p className="mb-4 text-sm text-white/45">Share a hosted InstantDesk chat page directly with customers.</p>
            <div className="flex min-w-0 items-center gap-2 rounded-2xl px-4 py-3 font-mono text-sm text-white/82" style={{ background: 'rgba(7,8,9,0.54)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="min-w-0 flex-1 truncate">{directLink}</span>
              <DeployCopyButton id="direct" value={directLink} copied={copied} onCopy={(id, value) => void copy(id, value)} />
            </div>
          </div>
          <div className="flex flex-col items-center gap-3 rounded-2xl p-4" style={{ background: 'rgba(7,8,9,0.42)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <img src={qrUrl} alt="Direct chat QR code" className="h-36 w-36 rounded-xl bg-white p-2" />
            <a href={qrUrl} download={`instantdesk-${botId}-qr.png`} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-white" style={{ background: 'rgba(244,122,99,0.16)', border: '1px solid rgba(244,122,99,0.28)' }}>
              <Download className="h-4 w-4" />
              Download QR
            </a>
          </div>
        </div>
      </section>

      {websiteMethods.map(item => (
        <section key={item.id} className="rounded-2xl p-5 sm:p-6" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.075)' }}>
          <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center">
            <div className="flex h-40 items-center justify-center rounded-2xl" style={{ background: 'rgba(7,8,9,0.42)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <item.Icon className="h-14 w-14 text-orange-300/85" />
            </div>
            <div className="min-w-0">
              <div className="mb-1 text-xl font-black text-white">{item.title}</div>
              <p className="mb-4 text-sm text-white/45">{item.description}</p>
              <div className="rounded-2xl p-4" style={{ background: 'rgba(7,8,9,0.54)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-white/28">Production embed</span>
                  <DeployCopyButton id={item.id} value={item.code} copied={copied} onCopy={(id, value) => void copy(id, value)} />
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-white/78">{item.code}</pre>
              </div>
            </div>
          </div>
        </section>
      ))}

      <section className="rounded-2xl p-5 sm:p-6" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.075)' }}>
        <div className="mb-4">
          <div className="text-xl font-black text-white">Omnichannel Inbox</div>
          <p className="text-sm text-white/45">Future channels will share the same conversations, contacts, assignment, and message model.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {channelCards.map(channel => (
            <div key={channel.id} className="rounded-2xl p-4" style={{ background: 'rgba(7,8,9,0.42)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <channel.Icon className="mb-4 h-7 w-7 text-white/55" />
              <div className="mb-1 text-sm font-black text-white">{channel.title}</div>
              <p className="mb-4 min-h-10 text-xs leading-relaxed text-white/38">Connection workflow is prepared for provider OAuth/API setup.</p>
              <button
                type="button"
                disabled
                className="w-full cursor-not-allowed rounded-xl px-3 py-2 text-xs font-bold text-white/35"
                style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                {channel.action}
              </button>
              <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/22">Coming soon</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

type IntegrationStatus = 'active' | 'coming_soon' | 'requires_setup'
type IntegrationCardItem = {
  id: string
  title: string
  description: string
  status: IntegrationStatus
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  cta: string
  disabled?: boolean
  action?: 'deploy' | 'api'
}

const INTEGRATION_STATUS_STYLE: Record<IntegrationStatus, { label: string; color: string; bg: string; border: string }> = {
  active: { label: 'Active', color: '#86efac', bg: 'rgba(52,211,153,0.10)', border: 'rgba(52,211,153,0.22)' },
  coming_soon: { label: 'Coming soon', color: 'rgba(255,255,255,0.46)', bg: 'rgba(255,255,255,0.045)', border: 'rgba(255,255,255,0.075)' },
  requires_setup: { label: 'Requires setup', color: '#fbbf24', bg: 'rgba(251,191,36,0.09)', border: 'rgba(251,191,36,0.18)' },
}

function IntegrationStatusBadge({ status }: { status: IntegrationStatus }) {
  const cfg = INTEGRATION_STATUS_STYLE[status]
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  )
}

function IntegrationCard({
  item,
  onOpenDeploy,
  onOpenApi,
}: {
  item: IntegrationCardItem
  onOpenDeploy: () => void
  onOpenApi: () => void
}) {
  const active = item.status === 'active'
  const setup = item.status === 'requires_setup'
  return (
    <article
      className="group flex min-h-[240px] flex-col rounded-2xl p-5 transition-[transform,border-color,background-color] duration-150 hover:-translate-y-0.5"
      style={{
        background: active ? 'rgba(52,211,153,0.045)' : 'rgba(255,255,255,0.035)',
        border: `1px solid ${active ? 'rgba(52,211,153,0.16)' : 'rgba(255,255,255,0.075)'}`,
        boxShadow: '0 18px 48px rgba(0,0,0,0.20)',
      }}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: active ? 'rgba(52,211,153,0.10)' : 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.075)' }}>
          <item.Icon className="h-6 w-6" style={{ color: active ? '#86efac' : 'rgba(255,255,255,0.62)' }} />
        </div>
        <IntegrationStatusBadge status={item.status} />
      </div>
      <div className="text-lg font-black text-white">{item.title}</div>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-white/42">{item.description}</p>
      <button
        type="button"
        disabled={item.disabled}
        onClick={() => {
          if (item.action === 'deploy') onOpenDeploy()
          if (item.action === 'api') onOpenApi()
        }}
        className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black transition-colors disabled:cursor-not-allowed disabled:text-white/28"
        style={active || setup
          ? { background: active ? 'rgba(52,211,153,0.13)' : 'rgba(251,191,36,0.10)', border: `1px solid ${active ? 'rgba(52,211,153,0.25)' : 'rgba(251,191,36,0.18)'}`, color: active ? '#bbf7d0' : '#fde68a' }
          : { background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.075)' }}
      >
        {item.cta}
        {!item.disabled && item.action === 'deploy' && <MoveRight className="h-4 w-4" />}
      </button>
    </article>
  )
}

function IntegrationsSection({ businessId, selectedBotId, onOpenDeploy }: { businessId: string; selectedBotId?: string | null; onOpenDeploy: () => void }) {
  const [copied, setCopied] = useState<string | null>(null)
  const [apiOpen, setApiOpen] = useState(false)
  const [webhookSecretVersion, setWebhookSecretVersion] = useState(1)
  const origin = 'https://instantdesk.pl'
  const botParam = selectedBotId ? `&bot_id=${encodeURIComponent(selectedBotId)}` : ''
  const directLink = `${origin}/embed/${businessId}?instantdesk_business_id=${businessId}${botParam}&instantdesk_open=1`
  const testWidgetLink = `${origin}/?instantdesk_business_id=${businessId}${botParam}&instantdesk_open=1`
  const scriptCode = `<script
  defer
  src="${origin}/embed.js"
  data-business-id="${businessId}"${selectedBotId ? `
  data-bot-id="${selectedBotId}"` : ''}
></script>`
  const iframeCode = `<iframe
  src="${origin}/embed/${businessId}?instantdesk_business_id=${businessId}${botParam}&instantdesk_open=1"
  width="400"
  height="600">
</iframe>`
  const webhookEndpoint = `${origin}/api/webhooks/custom/${businessId}`
  const webhookSecret = `whsec_${businessId.slice(0, 8)}_${webhookSecretVersion.toString().padStart(2, '0')}_placeholder`
  const webhookEvents = [
    'conversation.created',
    'message.created',
    'lead.created',
    'customer.updated',
    'handover.requested',
    'conversation.resolved',
  ]
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(directLink)}`

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // Clipboard permissions can be denied in automated or embedded contexts.
      // The UI still confirms the copy action so users get immediate feedback.
    }
    setCopied(key)
    window.setTimeout(() => setCopied(null), 1400)
  }

  const groups: Array<{ title: string; description: string; items: IntegrationCardItem[] }> = [
    {
      title: 'Channels',
      description: 'Customer conversation entry points for the unified inbox.',
      items: [
        { id: 'website-widget', title: 'Website Widget', description: 'Embedded InstantDesk chat widget connected to Live Chat and customer profiles.', status: 'active', Icon: MessageSquare, cta: 'Open deploy', action: 'deploy' },
        { id: 'whatsapp', title: 'WhatsApp', description: 'Connect WhatsApp Business conversations to the same inbox and customer timeline.', status: 'coming_soon', Icon: MessageCircle, cta: 'Coming soon', disabled: true },
        { id: 'messenger', title: 'Messenger', description: 'Bring Facebook Page messages into InstantDesk when Meta providers are enabled.', status: 'coming_soon', Icon: MessagesSquare, cta: 'Coming soon', disabled: true },
        { id: 'instagram', title: 'Instagram', description: 'Route Instagram DMs into the unified inbox with identity matching.', status: 'coming_soon', Icon: Camera, cta: 'Coming soon', disabled: true },
        { id: 'telegram', title: 'Telegram', description: 'Prepare Telegram bot conversations for future omnichannel support.', status: 'coming_soon', Icon: MessageCircle, cta: 'Coming soon', disabled: true },
        { id: 'email', title: 'Email', description: 'Connect Gmail or Microsoft mailboxes for support conversations.', status: 'coming_soon', Icon: Mail, cta: 'Coming soon', disabled: true },
      ],
    },
    {
      title: 'Automation',
      description: 'Workflow tools and developer endpoints for operational automation.',
      items: [
        { id: 'make', title: 'Make', description: 'Trigger Make scenarios from conversations, leads and customer events.', status: 'coming_soon', Icon: Zap, cta: 'Coming soon', disabled: true },
        { id: 'zapier', title: 'Zapier', description: 'Send InstantDesk events to thousands of apps through Zapier.', status: 'coming_soon', Icon: RefreshCw, cta: 'Coming soon', disabled: true },
        { id: 'webhooks-api', title: 'Webhooks/API', description: 'Use outbound webhooks and API keys for custom backend integrations.', status: 'requires_setup', Icon: Code2, cta: 'View API setup', action: 'api' },
      ],
    },
    {
      title: 'Website/CMS',
      description: 'Install InstantDesk on popular website platforms.',
      items: [
        { id: 'wordpress', title: 'WordPress', description: 'Add the website widget to WordPress sites and landing pages.', status: 'coming_soon', Icon: Globe2, cta: 'Coming soon', disabled: true },
        { id: 'shopify', title: 'Shopify', description: 'Support ecommerce shoppers and sync future customer identity signals.', status: 'coming_soon', Icon: Database, cta: 'Coming soon', disabled: true },
        { id: 'wix', title: 'Wix', description: 'Install InstantDesk on Wix websites with guided setup.', status: 'coming_soon', Icon: Wrench, cta: 'Coming soon', disabled: true },
      ],
    },
  ]

  const setupSteps = [
    'Copy script',
    'Paste before closing </body>',
    'Test widget',
    'Manage conversations in Live Chat',
  ]

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-7">
      <section className="rounded-2xl p-5 sm:p-6" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.075)', boxShadow: '0 24px 80px rgba(0,0,0,0.22)' }}>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-200" style={{ background: 'rgba(52,211,153,0.09)', border: '1px solid rgba(52,211,153,0.18)' }}>
              <CheckCircle className="h-3.5 w-3.5" />
              Website Widget active
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-white">Website Widget deploy panel</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">Use this setup kit to install the active website channel. Future integrations will plug into the same inbox, customer identity and timeline model.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-200" style={{ background: 'rgba(52,211,153,0.09)', border: '1px solid rgba(52,211,153,0.18)' }}>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                Active
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/36" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                Not installed placeholder
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => window.open(testWidgetLink, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-black text-white/72 transition-colors hover:text-white" style={{ background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.09)' }}>
              Test widget
              <ExternalLink className="h-4 w-4" />
            </button>
            <button type="button" onClick={onOpenDeploy} className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-black text-emerald-100 transition-colors hover:text-white" style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)' }}>
              Open deploy
              <ExternalLink className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="grid gap-4">
            {[
              { id: 'integrations-direct', label: 'Direct link', value: directLink },
              { id: 'integrations-script', label: 'Script embed snippet', value: scriptCode },
              { id: 'integrations-iframe', label: 'Iframe snippet', value: iframeCode },
            ].map(item => (
              <div key={item.id} className="rounded-2xl p-4" style={{ background: 'rgba(7,8,9,0.46)', border: '1px solid rgba(255,255,255,0.075)' }}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-white/30">{item.label}</div>
                  <DeployCopyButton id={item.id} value={item.value} copied={copied} onCopy={(id, value) => void copy(id, value)} />
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-white/78">{item.value}</pre>
              </div>
            ))}
          </div>
          <div className="grid gap-4">
            <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl text-center" style={{ background: 'rgba(7,8,9,0.46)', border: '1px solid rgba(255,255,255,0.075)' }}>
              <img src={qrUrl} alt="Website widget direct link QR code" className="h-32 w-32 rounded-xl bg-white p-2" />
              <div className="mt-3 text-xs font-bold text-white/42">Business-specific QR</div>
            </div>
            <div className="rounded-2xl p-4" style={{ background: 'rgba(7,8,9,0.46)', border: '1px solid rgba(255,255,255,0.075)' }}>
              <div className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-white/30">Setup steps</div>
              <ol className="grid gap-2">
                {setupSteps.map((step, index) => (
                  <li key={step} className="flex items-center gap-3 text-sm text-white/62">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-black text-emerald-100" style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.20)' }}>{index + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {apiOpen && (
        <section className="rounded-2xl p-5 sm:p-6" style={{ background: 'rgba(251,191,36,0.045)', border: '1px solid rgba(251,191,36,0.14)', boxShadow: '0 24px 80px rgba(0,0,0,0.20)' }}>
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-amber-100" style={{ background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.18)' }}>
                <Code2 className="h-3.5 w-3.5" />
                Requires setup
              </div>
              <h2 className="mt-3 text-2xl font-black text-white">Webhooks/API setup</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">Developer foundation for sending InstantDesk events to your backend. Delivery workers and secret regeneration can be connected in the next backend phase.</p>
            </div>
            <button type="button" onClick={() => setApiOpen(false)} className="rounded-xl px-3 py-2 text-xs font-bold text-white/46 hover:text-white" style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.075)' }}>Close</button>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="grid gap-4">
              {[
                { id: 'webhook-endpoint', label: 'Public webhook endpoint placeholder', value: webhookEndpoint },
                { id: 'webhook-secret', label: 'Secret key placeholder', value: webhookSecret },
              ].map(item => (
                <div key={item.id} className="rounded-2xl p-4" style={{ background: 'rgba(7,8,9,0.46)', border: '1px solid rgba(255,255,255,0.075)' }}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-white/30">{item.label}</div>
                    <DeployCopyButton id={item.id} value={item.value} copied={copied} onCopy={(id, value) => void copy(id, value)} />
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-white/78">{item.value}</pre>
                </div>
              ))}
              <button type="button" onClick={() => setWebhookSecretVersion(value => value + 1)} className="inline-flex h-11 w-fit items-center gap-2 rounded-xl px-4 text-sm font-black text-amber-100" style={{ background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.18)' }}>
                Regenerate secret
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <div className="rounded-2xl p-4" style={{ background: 'rgba(7,8,9,0.46)', border: '1px solid rgba(255,255,255,0.075)' }}>
              <div className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-white/30">Events</div>
              <div className="grid gap-2">
                {webhookEvents.map(event => (
                  <div key={event} className="rounded-xl px-3 py-2 font-mono text-xs text-white/68" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>{event}</div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {groups.map(group => (
        <section key={group.title} className="grid gap-4">
          <div>
            <h2 className="text-xl font-black text-white">{group.title}</h2>
            <p className="mt-1 text-sm text-white/40">{group.description}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {group.items.map(item => (
              <IntegrationCard key={item.id} item={item} onOpenDeploy={onOpenDeploy} onOpenApi={() => setApiOpen(true)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function BotsSection({
  bots,
  selectedBotId,
  onSelectBot,
  onCreateBot,
  onSetDefault,
  onOpenSection,
}: {
  bots: DashboardBot[]
  selectedBotId: string | null
  onSelectBot: (botId: string) => void
  onCreateBot: (input: { name: string; business_type: string; model: string; tone: string }) => Promise<void>
  onSetDefault: (botId: string) => Promise<void>
  onOpenSection: (section: Section) => void
}) {
  const selected = bots.find(bot => bot.id === selectedBotId) ?? bots[0] ?? null
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    business_type: 'general_service',
    model: 'gemini-2.5-pro',
    tone: 'professional',
  })

  const quickActions = [
    { label: 'Test bot', section: 'ai_test' as Section, Icon: FlaskConical },
    { label: 'Edit instructions', section: 'ai_instructions' as Section, Icon: Brain },
    { label: 'Knowledge base', section: 'ai_knowledge' as Section, Icon: BookOpen },
    { label: 'Deploy / widget', section: 'deploy' as Section, Icon: Rocket },
    { label: 'Live chat', section: 'live_chat' as Section, Icon: Headphones },
    { label: 'Settings', section: 'settings' as Section, Icon: Settings },
  ]

  const submit = async () => {
    setError(null)
    setSaving(true)
    try {
      await onCreateBot(form)
      setCreating(false)
      setForm({ name: '', business_type: 'general_service', model: 'gemini-2.5-pro', tone: 'professional' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create bot')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 lg:grid-cols-[92px_minmax(0,1fr)]">
      <aside className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.075)' }}>
        <div className="grid gap-3">
          {bots.map(bot => {
            const active = bot.id === selected?.id
            return (
              <button
                key={bot.id}
                type="button"
                title={bot.name}
                onClick={() => onSelectBot(bot.id)}
                className="relative flex h-14 w-14 items-center justify-center rounded-full text-sm font-black transition-transform hover:scale-[1.03]"
                style={{
                  background: active ? 'rgba(52,211,153,0.16)' : 'rgba(255,255,255,0.055)',
                  border: `1px solid ${active ? 'rgba(52,211,153,0.34)' : 'rgba(255,255,255,0.09)'}`,
                  color: active ? '#bbf7d0' : 'rgba(255,255,255,0.62)',
                }}
              >
                {agentInitials(bot.name)}
                {bot.is_default_website_bot && <span className="absolute -right-0.5 -top-0.5 h-4 w-4 rounded-full bg-emerald-400 ring-4 ring-[#090909]" />}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setCreating(true)}
            title="Create bot"
            className="flex h-14 w-14 items-center justify-center rounded-full text-white/62 transition-colors hover:text-white"
            style={{ background: 'rgba(255,255,255,0.055)', border: '1px dashed rgba(255,255,255,0.18)' }}
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </aside>

      <main className="grid min-w-0 gap-5">
        <section className="rounded-2xl p-5 sm:p-6" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.075)', boxShadow: '0 24px 80px rgba(0,0,0,0.22)' }}>
          {selected ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-sm font-black text-emerald-100" style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.22)' }}>
                      {agentInitials(selected.name)}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-2xl font-black text-white">{selected.name}</h2>
                      <p className="mt-1 text-sm text-white/42">
                        {BUSINESS_TYPE_CONFIG[normalizeBusinessType(selected.business_type ?? null)].label} · {selected.model ?? 'model not set'} · {selected.tone ?? 'professional'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full px-3 py-1 text-xs font-bold text-emerald-200" style={{ background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.20)' }}>
                      {selected.active === false ? 'Inactive' : 'Active'}
                    </span>
                    {selected.is_default_website_bot && (
                      <span className="rounded-full px-3 py-1 text-xs font-bold text-white/72" style={{ background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.09)' }}>
                        Default website bot
                      </span>
                    )}
                    <span className="rounded-full px-3 py-1 font-mono text-[11px] font-bold text-white/36" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      {selected.id}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={selected.is_default_website_bot === true}
                  onClick={() => void onSetDefault(selected.id)}
                  className="rounded-xl px-4 py-3 text-sm font-black transition-colors disabled:cursor-not-allowed disabled:text-emerald-200/70"
                  style={{ background: 'rgba(52,211,153,0.11)', border: '1px solid rgba(52,211,153,0.22)', color: '#bbf7d0' }}
                >
                  {selected.is_default_website_bot ? 'Default website bot' : 'Set as default website bot'}
                </button>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {quickActions.map(action => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => onOpenSection(action.section)}
                    className="group flex items-center gap-3 rounded-2xl p-4 text-left transition-[transform,border-color,background-color] duration-150 hover:-translate-y-0.5"
                    style={{ background: 'rgba(7,8,9,0.42)', border: '1px solid rgba(255,255,255,0.075)' }}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <action.Icon className="h-5 w-5 text-white/60 group-hover:text-white/85" />
                    </div>
                    <div>
                      <div className="text-sm font-black text-white/82">{action.label}</div>
                      <div className="text-xs text-white/32">Uses selected bot context</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="py-10 text-center">
              <Bot className="mx-auto mb-4 h-12 w-12 text-white/30" />
              <h2 className="text-xl font-black text-white">No bots yet</h2>
              <p className="mt-2 text-sm text-white/42">Create the first bot for this business workspace.</p>
              <button type="button" onClick={() => setCreating(true)} className="mt-5 rounded-xl px-4 py-3 text-sm font-black text-white" style={{ background: 'rgba(52,211,153,0.13)', border: '1px solid rgba(52,211,153,0.24)' }}>
                Create bot
              </button>
            </div>
          )}
        </section>

        <section className="rounded-2xl p-5 sm:p-6" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.065)' }}>
          <div className="mb-4 text-sm font-black uppercase tracking-[0.14em] text-white/32">Workspace pages</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {AI_NAV_ITEMS.map(item => (
              <button key={item.id} type="button" onClick={() => onOpenSection(item.id)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-white/54 transition-colors hover:bg-white/[0.055] hover:text-white">
                <item.Icon className="h-4 w-4" />
                {item.label.replace('AI ', '')}
              </button>
            ))}
          </div>
        </section>
      </main>

      <AnimatePresence>
        {creating && (
          <motion.div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-xl" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
            <motion.div className="w-full max-w-xl rounded-3xl border border-white/10 bg-[#0d0d0c] p-6 shadow-2xl" initial={{ y:16, scale:0.98 }} animate={{ y:0, scale:1 }} exit={{ y:12, scale:0.98 }}>
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-white">Create bot</h3>
                  <p className="mt-1 text-sm text-white/38">Creates an isolated bot inside the current business only.</p>
                </div>
                <button onClick={() => setCreating(false)} className="icon-btn"><X className="h-4 w-4" /></button>
              </div>
              <div className="grid gap-3">
                <input value={form.name} onChange={event => setForm(prev => ({ ...prev, name: event.target.value }))} placeholder="Bot name" className="h-12 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-emerald-400/55" />
                <select value={form.business_type} onChange={event => setForm(prev => ({ ...prev, business_type: event.target.value }))} className="h-12 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-emerald-400/55">
                  {CANONICAL_BUSINESS_TYPES.map(type => (
                    <option key={type} value={type}>{BUSINESS_TYPE_CONFIG[type].label}</option>
                  ))}
                </select>
                <div className="grid gap-3 sm:grid-cols-2">
                  <select value={form.model} onChange={event => setForm(prev => ({ ...prev, model: event.target.value }))} className="h-12 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-emerald-400/55">
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-4o-mini">GPT-4o Mini</option>
                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  </select>
                  <select value={form.tone} onChange={event => setForm(prev => ({ ...prev, tone: event.target.value }))} className="h-12 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-emerald-400/55">
                    <option value="professional">Professional</option>
                    <option value="friendly">Friendly</option>
                    <option value="casual">Casual</option>
                    <option value="luxury">Luxury</option>
                  </select>
                </div>
                {error && <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</div>}
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={() => setCreating(false)} className="btn-muted">Cancel</button>
                <button type="button" disabled={saving} onClick={() => void submit()} className="btn-primary">{saving ? 'Creating...' : 'Create bot'}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Audio system ───────────────────────────────────────────── */

/**
 * Persistent AudioContext singleton.  Browsers require the context to be
 * created AND resumed inside a user gesture before any audio will play.
 * We create it once on first "Enable sound" click, then reuse it.
 */
let _audioCtx: AudioContext | null = null

function getOrCreateAudioCtx(): AudioContext | null {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    if (!_audioCtx) _audioCtx = new Ctx()
    return _audioCtx
  } catch { return null }
}

/**
 * Synchronous unlock — MUST stay synchronous so Safari accepts it within the
 * gesture call stack.  Never await before calling ctx.resume().
 * Called from document-level click/touchstart/keydown listeners AND from the
 * "Enable sound" button handler.
 */
function unlockAudioSync(): void {
  try {
    const ctx = getOrCreateAudioCtx()
    if (!ctx) return
    // Kick resume() without awaiting — Safari requires the call itself to happen
    // synchronously inside the gesture, the promise resolution can be async.
    if (ctx.state !== 'running') ctx.resume()
    // 1-frame silent buffer marks the context as user-gesture-unlocked
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start()
    console.log('[SOUND] unlocked, state:', ctx.state)
  } catch (e) {
    console.log('[SOUND] unlock error', e)
  }
}

/** Play the two-tone chime.  Caller is responsible for checking soundEnabled. */
async function playChime(label = 'notification'): Promise<void> {
  const ctx = _audioCtx
  console.log('[SOUND] AudioContext state:', ctx?.state ?? 'null', '— label:', label)
  if (!ctx) { console.log('[SOUND] no AudioContext'); return }
  try {
    if (ctx.state !== 'running') await ctx.resume()
    const now = ctx.currentTime
    function tone(freq: number, start: number, dur: number, vol: number) {
      const osc  = ctx!.createOscillator()
      const gain = ctx!.createGain()
      osc.connect(gain); gain.connect(ctx!.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + start)
      gain.gain.setValueAtTime(0.001, now + start)
      gain.gain.linearRampToValueAtTime(vol,   now + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur)
      osc.start(now + start); osc.stop(now + start + dur + 0.06)
    }
    tone(1047, 0,    0.50, 0.45)   // C6
    tone(1319, 0.14, 0.55, 0.40)   // E6
    console.log('[SOUND] playing', label)
  } catch (e) {
    console.log('[SOUND] play error', e)
  }
}

/** Fire a native browser notification if permission has been granted. */
function sendBrowserNotif(title: string, body: string): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  try { new Notification(title, { body, icon: '/favicon.ico', silent: true }) }
  catch { /* permission revoked mid-session */ }
}

/* ─── Toast component ────────────────────────────────────────── */

function ToastNotification({
  toast, onClose, onOpen,
}: {
  toast:   ToastItem
  onClose: () => void
  onOpen?: () => void
}) {
  useEffect(() => {
    const t = setTimeout(onClose, toast.duration ?? 5500)
    return () => clearTimeout(t)
  }, [onClose, toast.duration])

  const accent = toast.type === 'lead' ? '#f8a36d' : toast.type === 'appointment' ? '#34d399' : '#fbbf24'
  const Icon   = toast.type === 'lead' ? Users   : toast.type === 'appointment' ? Calendar : Volume2

  return (
    <motion.div
      layout
      initial={{ opacity:0, x:56, scale:0.95 }}
      animate={{ opacity:1, x:0,  scale:1    }}
      exit={{   opacity:0, x:56, scale:0.95  }}
      transition={{ type:'spring', stiffness:380, damping:34 }}
      className="pointer-events-auto relative flex items-start gap-3 px-4 py-3.5 rounded-2xl cursor-pointer select-none overflow-hidden"
      style={{
        background:     'rgba(9,9,26,0.97)',
        border:         `1px solid ${accent}28`,
        boxShadow:      `0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px ${accent}08`,
        backdropFilter: 'blur(24px)',
      }}
      onClick={() => { onOpen?.(); onClose() }}
    >
      {/* Accent stripe */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl"
        style={{ background:`linear-gradient(180deg,${accent},${accent}55)` }} />

      {/* Icon */}
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ml-1 mt-0.5"
        style={{ background:`${accent}15`, border:`1px solid ${accent}25` }}>
        <Icon className="w-4 h-4" style={{ color:accent }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[11px] font-black text-white/90 truncate">{toast.title}</span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap"
            style={{ background:`${toast.badgeColor}22`, color:toast.badgeColor, border:`1px solid ${toast.badgeColor}30` }}>
            {toast.badge}
          </span>
        </div>
        <div className="text-[11px] text-white/40 leading-snug truncate">{toast.sub}</div>
        {onOpen && (
          <div className="text-[10px] font-semibold mt-1.5" style={{ color:`${accent}85` }}>
            Tap to view →
          </div>
        )}
      </div>

      {/* Dismiss */}
      <button onClick={e => { e.stopPropagation(); onClose() }}
        className="w-6 h-6 rounded-lg flex items-center justify-center text-white/20 hover:text-white/60 transition-colors flex-shrink-0 mt-0.5">
        <X className="w-3.5 h-3.5" />
      </button>

      {/* Countdown bar */}
      <motion.div className="absolute bottom-0 left-0 right-0 h-[2px]"
        style={{ background:accent, opacity:0.30, transformOrigin:'left' }}
        initial={{ scaleX:1 }} animate={{ scaleX:0 }}
        transition={{ duration:5.5, ease:'linear' }} />
    </motion.div>
  )
}

/* ─── Sound toggle button ────────────────────────────────────── */

function SoundToggle({ enabled, onEnable, onDisable }: {
  enabled:   boolean
  onEnable:  () => void
  onDisable: () => void
}) {
  return (
    <button
      onClick={enabled ? onDisable : onEnable}
      title={enabled ? 'Sound alerts on — click to mute' : 'Enable sound alerts for new leads'}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
      style={enabled ? {
        background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399',
      } : {
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.35)',
      }}>
      {enabled
        ? <><Volume2  className="w-3.5 h-3.5" /><span className="hidden sm:inline">Sound on</span></>
        : <><VolumeX className="w-3.5 h-3.5" /><span className="hidden sm:inline">Enable sound</span></>}
    </button>
  )
}

/* ─── Test sound button ──────────────────────────────────────── */

function TestSoundButton() {
  const [fired, setFired] = useState(false)
  return (
    <button
      type="button"
      title="Test sound"
      onClick={() => {
        unlockAudioSync()
        void playChime('test')
        setFired(true)
        setTimeout(() => setFired(false), 1200)
      }}
      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
      style={fired ? {
        background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24',
      } : {
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)',
      }}>
      <Volume2 className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">{fired ? '♪' : 'Test'}</span>
    </button>
  )
}

/* ─── Audit Log ──────────────────────────────────────────────── */

interface LogEvent {
  id:          string
  type:        string
  title:       string
  description: string | null
  created_at:  string
  metadata:    Record<string, unknown> | null
}

type LogFilter = 'all' | 'leads' | 'appointments' | 'deletes' | 'edits' | 'undoable' | 'automation'

const FILTER_CFG: { id: LogFilter; label: string }[] = [
  { id: 'all',          label: 'All'          },
  { id: 'leads',        label: 'Leads'        },
  { id: 'appointments', label: 'Appointments' },
  { id: 'automation',   label: 'Automation'   },
  { id: 'deletes',      label: 'Deletes'      },
  { id: 'edits',        label: 'Edits'        },
  { id: 'undoable',     label: 'Undoable'     },
]

const LEAD_TYPES       = new Set(['lead_created','lead_deleted','lead_updated','lead_edited','status_changed','notes_changed','score_changed'])
const APPT_TYPES       = new Set(['appointment_created','appointment_deleted','appointment_updated','appointment_edited','appointment_moved'])
const DELETE_TYPES     = new Set(['lead_deleted','appointment_deleted'])
const EDIT_TYPES       = new Set(['lead_updated','lead_edited','status_changed','notes_changed','score_changed','appointment_updated','appointment_edited','appointment_moved'])
const AUTOMATION_TYPES = new Set(['follow_up_scheduled','follow_up_sent','follow_up_failed'])

function applyFilter(ev: LogEvent, filter: LogFilter, undoneIds: Set<string>): boolean {
  const type = (ev.metadata?._type as string) || ev.type
  if (filter === 'all')          return true
  if (filter === 'leads')        return LEAD_TYPES.has(type) || type.startsWith('undo_lead_') || type.startsWith('undo_status_') || type.startsWith('undo_notes_') || type.startsWith('undo_score_')
  if (filter === 'appointments') return APPT_TYPES.has(type) || type.startsWith('undo_appointment_')
  if (filter === 'automation')   return AUTOMATION_TYPES.has(type) || type.startsWith('follow_up_')
  if (filter === 'deletes')      return DELETE_TYPES.has(type)
  if (filter === 'edits')        return EDIT_TYPES.has(type)
  if (filter === 'undoable')     return !!(ev.metadata?.undoable) && !undoneIds.has(ev.id) && !(ev.metadata?.undone)
  return true
}

const LOG_TYPE_LABELS: Record<string, string> = {
  lead_created:              'Lead Created',
  lead_deleted:              'Lead Deleted',
  lead_edited:               'Lead Updated',
  lead_updated:              'Lead Updated',
  status_changed:            'Status Changed',
  notes_changed:             'Notes Updated',
  score_changed:             'Score Changed',
  appointment_created:       'Appt Scheduled',
  appointment_deleted:       'Appt Deleted',
  appointment_edited:        'Appt Updated',
  appointment_updated:       'Appt Updated',
  appointment_moved:         'Appt Moved',
  follow_up_scheduled:       'Follow-up Scheduled',
  follow_up_sent:            'Follow-up Sent',
  follow_up_failed:          'Follow-up Failed',
  undo_lead_created:         'Undone · Lead Create',
  undo_lead_deleted:         'Undone · Lead Delete',
  undo_lead_edited:          'Undone · Lead Update',
  undo_lead_updated:         'Undone · Lead Update',
  undo_status_changed:       'Undone · Status Change',
  undo_notes_changed:        'Undone · Notes Update',
  undo_score_changed:        'Undone · Score Change',
  undo_appointment_created:  'Undone · Appt Create',
  undo_appointment_deleted:  'Undone · Appt Delete',
  undo_appointment_edited:   'Undone · Appt Update',
  undo_appointment_updated:  'Undone · Appt Update',
  undo_appointment_moved:    'Undone · Appt Move',
}

type LogCfg = { color: string; bg: string; Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }
const UNDO_CFG: LogCfg = { color: '#f8a36d', bg: 'rgba(244,122,99,0.08)', Icon: Undo2 }

const LOG_CFG: Record<string, LogCfg> = {
  lead_created:         { color: '#34d399', bg: 'rgba(52,211,153,0.12)',   Icon: Users        },
  lead_deleted:         { color: '#f87171', bg: 'rgba(248,113,113,0.12)',  Icon: Trash2       },
  lead_edited:          { color: '#f8a36d', bg: 'rgba(244,122,99,0.12)',  Icon: Pencil       },
  lead_updated:         { color: '#f8a36d', bg: 'rgba(244,122,99,0.12)',  Icon: Pencil       },
  status_changed:       { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',   Icon: ArrowUpDown  },
  notes_changed:        { color: '#948f88', bg: 'rgba(148,145,140,0.12)',   Icon: ScrollText   },
  score_changed:        { color: '#fb923c', bg: 'rgba(251,146,60,0.12)',   Icon: TrendingUp   },
  appointment_created:  { color: '#34d399', bg: 'rgba(52,211,153,0.12)',   Icon: CalendarPlus },
  appointment_deleted:  { color: '#f87171', bg: 'rgba(248,113,113,0.12)',  Icon: Trash2       },
  appointment_edited:   { color: '#f8a36d', bg: 'rgba(244,122,99,0.12)',  Icon: Pencil       },
  appointment_updated:  { color: '#f8a36d', bg: 'rgba(244,122,99,0.12)',  Icon: Pencil       },
  appointment_moved:    { color: '#38bdf8', bg: 'rgba(56,189,248,0.12)',   Icon: MoveRight    },
  follow_up_scheduled:  { color: '#fbbf24', bg: 'rgba(251,191,36,0.10)',   Icon: Bot          },
  follow_up_sent:       { color: '#34d399', bg: 'rgba(52,211,153,0.10)',   Icon: Bot          },
  follow_up_failed:     { color: '#f87171', bg: 'rgba(248,113,113,0.10)',  Icon: Bot          },
}
const LOG_CFG_DEFAULT: LogCfg = { color: 'rgba(255,255,255,0.25)', bg: 'rgba(255,255,255,0.05)', Icon: Activity }

function getLogCfg(type: string): LogCfg {
  if (type.startsWith('undo_')) return UNDO_CFG
  return LOG_CFG[type] ?? LOG_CFG_DEFAULT
}

function ChangeDisplay({ ev }: { ev: LogEvent }) {
  const meta = ev.metadata
  if (!meta) return null
  const eventType = (meta._type as string) || ev.type
  // Don't render diffs for undo rows
  if (eventType.startsWith('undo_')) return null
  const old = meta.old_value as Record<string, unknown> | undefined
  const nw  = meta.new_value as Record<string, unknown> | undefined
  if (!old && !nw) return null

  const arrow   = <span className="text-white/20 mx-1.5 select-none">→</span>
  const fmtD    = (d: string) => { try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) } catch { return d } }
  const capType = (s: string) => (s ?? '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  switch (eventType) {
    case 'status_changed': {
      const oldS = old?.status as string | undefined
      const newS = nw?.status  as string | undefined
      if (!oldS || !newS) return null
      const oldCfg = STATUS_CFG[oldS as LeadStatus]
      const newCfg = STATUS_CFG[newS as LeadStatus]
      return (
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {oldCfg
            ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ color:oldCfg.color, background:oldCfg.bg, border:`1px solid ${oldCfg.border}` }}>{oldCfg.label}</span>
            : <span className="text-[10px] text-white/40">{oldS}</span>}
          {arrow}
          {newCfg
            ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ color:newCfg.color, background:newCfg.bg, border:`1px solid ${newCfg.border}` }}>{newCfg.label}</span>
            : <span className="text-[10px] text-white/40">{newS}</span>}
        </div>
      )
    }
    case 'score_changed': {
      const oldScore = old?.score as number | undefined
      const newScore = nw?.score  as number | undefined
      const oldLabel = old?.score_label as ScoreLabel | undefined
      const newLabel = nw?.score_label  as ScoreLabel | undefined
      if (oldScore === undefined && !oldLabel) return null
      const oldCfg = oldLabel ? SCORE_CFG[oldLabel] : undefined
      const newCfg = newLabel ? SCORE_CFG[newLabel] : undefined
      return (
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {oldCfg
            ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ color:oldCfg.color, background:oldCfg.bg, border:`1px solid ${oldCfg.border}` }}>
                {oldScore} · {oldCfg.label}
              </span>
            : <span className="text-[10px] text-white/40">{oldScore}</span>}
          {arrow}
          {newCfg
            ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ color:newCfg.color, background:newCfg.bg, border:`1px solid ${newCfg.border}` }}>
                {newScore} · {newCfg.label}
              </span>
            : <span className="text-[10px] text-white/40">{newScore}</span>}
        </div>
      )
    }
    case 'lead_edited':
    case 'lead_updated': {
      if (!old || !nw) return null
      const keys = Object.keys(old).filter(k => String(old[k]) !== String(nw[k]))
      if (keys.length === 0) return null
      const k   = keys[0]
      const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
      return (
        <div className="mt-1.5 text-[10px] text-white/45">
          {cap(k)}:{' '}
          <span className="text-white/55 line-through">{String(old[k])}</span>
          {arrow}
          <span className="text-emerald-400/75">{String(nw[k])}</span>
          {keys.length > 1 && <span className="text-white/25 ml-1.5">+{keys.length - 1} more</span>}
        </div>
      )
    }
    case 'appointment_moved': {
      const oldD = old?.scheduled_at as string | undefined
      const newD = nw?.scheduled_at  as string | undefined
      if (!oldD || !newD) return null
      return (
        <div className="mt-1.5 text-[10px] text-white/45">
          <span className="text-white/55">{fmtD(oldD)}</span>
          {arrow}
          <span className="text-emerald-400/75">{fmtD(newD)}</span>
        </div>
      )
    }
    case 'appointment_edited':
    case 'appointment_updated': {
      if (!old || !nw) return null
      if (old.scheduled_at !== nw.scheduled_at && old.scheduled_at && nw.scheduled_at) {
        return (
          <div className="mt-1.5 text-[10px] text-white/45">
            Date: <span className="text-white/55">{fmtD(old.scheduled_at as string)}</span>
            {arrow}
            <span className="text-emerald-400/75">{fmtD(nw.scheduled_at as string)}</span>
          </div>
        )
      }
      if (old.type !== nw.type && old.type && nw.type) {
        return (
          <div className="mt-1.5 text-[10px] text-white/45">
            Type: <span className="text-white/55">{capType(old.type as string)}</span>
            {arrow}
            <span className="text-emerald-400/75">{capType(nw.type as string)}</span>
          </div>
        )
      }
      if (old.status !== nw.status && old.status && nw.status) {
        return (
          <div className="mt-1.5 text-[10px] text-white/45">
            Status: <span className="text-white/55">{old.status as string}</span>
            {arrow}
            <span className="text-emerald-400/75">{nw.status as string}</span>
          </div>
        )
      }
      return null
    }
    default: return null
  }
}

const LOG_PAGE = 50

function LogSection({ onToast, can, actorName = 'Alex Thompson' }: { onToast: (title: string, sub: string, ok: boolean) => void; can?: Permissions; actorName?: string }) {
  const [events,        setEvents]        = useState<LogEvent[]>([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState('')
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  const [visibleCount,  setVisibleCount]  = useState(LOG_PAGE)
  const [filter,        setFilter]        = useState<LogFilter>('all')

  // ── Fetch ──────────────────────────────────────────────────────
  const fetchEvents = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setVisibleCount(LOG_PAGE) }
    try {
      const res = await fetch('/api/activity')
      const d   = await res.json() as { events?: LogEvent[] }
      setEvents(d.events ?? [])
      setError('')
    } catch {
      setError('Failed to load activity log')
    }
    if (!silent) setLoading(false)
  }, [])

  useEffect(() => { void fetchEvents() }, [fetchEvents])

  // Derive undone IDs relationally — scan undo_* events for original_event_id
  const undoneEventIds = useMemo(() => {
    const ids = new Set<string>()
    for (const ev of events) {
      const t = (ev.metadata?._type as string) || ev.type
      if (t.startsWith('undo_')) {
        const origId = ev.metadata?.original_event_id as string | undefined
        if (origId) ids.add(origId)
      }
    }
    return ids
  }, [events])

  // ── Optimistic undo with rollback ──────────────────────────────
  async function handleUndo(ev: LogEvent) {
    if (processingIds.has(ev.id)) return

    setProcessingIds(prev => new Set([...prev, ev.id]))

    // Optimistic: insert a synthetic undo row so isUndone triggers immediately
    const optimisticUndoRow: LogEvent = {
      id:          `optimistic_undo_${ev.id}`,
      type:        `undo_${(ev.metadata?._type as string) || ev.type}`,
      title:       `Undone: ${ev.title}`,
      description: null,
      created_at:  new Date().toISOString(),
      metadata:    {
        _type:              `undo_${(ev.metadata?._type as string) || ev.type}`,
        actor:              (ev.metadata?.actor as string) || 'Alex Thompson',
        undoable:           false,
        entity_name:        ev.metadata?.entity_name,
        original_event_id:  ev.id,
      },
    }
    setEvents(prev => [optimisticUndoRow, ...prev])

    try {
      const res  = await fetch(`/api/activity/${ev.id}/undo`, { method: 'POST', headers: { 'X-Actor-Name': actorName } })
      const data = await res.json() as { error?: string }
      if (!res.ok) {
        // Rollback: remove the optimistic row
        setEvents(prev => prev.filter(e => e.id !== optimisticUndoRow.id))
        onToast('Undo failed', data.error ?? 'Something went wrong', false)
      } else {
        const name = (ev.metadata?.entity_name as string) || ev.title
        onToast('Undone', name, true)
        // Silent resync to replace optimistic row with real DB row
        setTimeout(() => void fetchEvents(true), 1000)
      }
    } catch {
      setEvents(prev => prev.filter(e => e.id !== optimisticUndoRow.id))
      onToast('Undo failed', 'Network error — check your connection', false)
    }

    setProcessingIds(prev => { const s = new Set(prev); s.delete(ev.id); return s })
  }

  // ── Filter + pagination ────────────────────────────────────────
  const filteredEvents  = useMemo(
    () => events.filter(ev => applyFilter(ev, filter, undoneEventIds)),
    [events, filter, undoneEventIds],
  )
  const visibleEvents   = filteredEvents.slice(0, visibleCount)
  const remainingCount  = filteredEvents.length - visibleCount
  const schemaWarning   = events.length > 0 && events.every(e => e.metadata === null)

  // Filter badge counts (computed from unfiltered events)
  const filterCounts = useMemo(() => {
    const counts: Partial<Record<LogFilter, number>> = {}
    for (const f of FILTER_CFG) {
      if (f.id !== 'all') counts[f.id] = events.filter(ev => applyFilter(ev, f.id, undoneEventIds)).length
    }
    return counts
  }, [events, undoneEventIds])

  // Reset pagination when filter changes
  useEffect(() => { setVisibleCount(LOG_PAGE) }, [filter])

  // ── Loading skeleton ───────────────────────────────────────────
  if (loading) return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1 mb-1 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <div className="flex flex-col gap-1.5">
            <div className="h-3 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
            <div className="h-2 w-40 rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }} />
          </div>
        </div>
        <div className="h-7 w-20 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }} />
      </div>
      {/* Filter bar skeleton */}
      <div className="flex items-center gap-2 px-1 mb-1 animate-pulse">
        {[60,48,76,50,36,56].map((w, i) => (
          <div key={i} className="h-7 rounded-full flex-shrink-0" style={{ width: w, background: 'rgba(255,255,255,0.04)' }} />
        ))}
      </div>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="rounded-2xl px-4 py-3.5 flex items-start gap-3 animate-pulse"
          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)',
                   animationDelay: `${i * 60}ms` }}>
          <div className="w-9 h-9 rounded-xl flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="flex-1 flex flex-col gap-2 pt-0.5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="h-2 rounded-full w-20" style={{ background: 'rgba(255,255,255,0.07)' }} />
                <div className="h-2.5 rounded-full w-28" style={{ background: 'rgba(255,255,255,0.05)' }} />
              </div>
              <div className="h-2 rounded-full w-14" style={{ background: 'rgba(255,255,255,0.04)' }} />
            </div>
            <div className="h-2 rounded-full w-2/5" style={{ background: 'rgba(255,255,255,0.04)' }} />
            <div className="flex items-center justify-between gap-4 mt-0.5">
              <div className="h-2 rounded-full w-24" style={{ background: 'rgba(255,255,255,0.035)' }} />
              <div className="h-5 w-14 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )

  if (error) return (
    <div className="flex flex-col items-center gap-3 py-16">
      <AlertCircle className="w-8 h-8 text-red-400/40" />
      <p className="text-sm text-red-400">{error}</p>
      <button onClick={() => void fetchEvents()}
        className="text-xs text-orange-400 hover:text-orange-300 transition-colors">Retry</button>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">

      {/* Header */}
      <div className="flex items-center justify-between px-1 mb-1">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(244,122,99,0.12)', border: '1px solid rgba(244,122,99,0.2)' }}>
            <History className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Audit Log</h2>
            <p className="text-xs text-white/30">
              {events.length}{events.length === 200 ? ' (max)' : ''} total — immutable history of every action
            </p>
          </div>
        </div>
        <button onClick={() => void fetchEvents()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/30 hover:text-white/60 transition-colors"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <RefreshCw className="w-3.5 h-3.5" />Refresh
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap px-0.5 mb-0.5">
        {FILTER_CFG.map(f => {
          const active = filter === f.id
          const count  = f.id === 'all' ? events.length : (filterCounts[f.id] ?? 0)
          return (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all"
              style={{
                background: active ? 'rgba(244,122,99,0.18)' : 'rgba(255,255,255,0.04)',
                border:     active ? '1px solid rgba(244,122,99,0.35)' : '1px solid rgba(255,255,255,0.08)',
                color:      active ? '#f8a36d' : 'rgba(255,255,255,0.35)',
              }}>
              {f.label}
              {count > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{
                    background: active ? 'rgba(244,122,99,0.25)' : 'rgba(255,255,255,0.06)',
                    color:      active ? '#f8a36d' : 'rgba(255,255,255,0.25)',
                  }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Schema prerequisite warning */}
      {schemaWarning && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
          style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.18)' }}>
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-300">Undo disabled — SQL prerequisites not yet run</p>
            <p className="text-[10px] text-amber-300/60 mt-1">Run in Supabase SQL editor:</p>
            <code className="text-[10px] text-amber-200/55 mt-0.5 block leading-relaxed">
              ALTER TABLE activity_events DROP CONSTRAINT IF EXISTS activity_events_type_check;<br />
              ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS metadata JSONB;
            </code>
          </div>
        </div>
      )}

      {/* Empty state */}
      {filteredEvents.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 gap-3">
          <History className="w-8 h-8 text-white/10" />
          {events.length === 0 ? (
            <>
              <p className="text-sm text-white/25 font-medium">No activity yet</p>
              <p className="text-xs text-white/15">Create leads, schedule appointments — every action appears here</p>
            </>
          ) : (
            <>
              <p className="text-sm text-white/25 font-medium">No {filter} events</p>
              <button onClick={() => setFilter('all')} className="text-xs text-orange-400/60 hover:text-orange-400 transition-colors">
                Clear filter
              </button>
            </>
          )}
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {visibleEvents.map((ev, i) => {
              const meta         = ev.metadata ?? {}
              const eventType    = (meta._type as string) || ev.type
              const cfg          = getLogCfg(eventType)
              const typeLabel    = LOG_TYPE_LABELS[eventType]
                                 ?? eventType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
              const entityName   = meta.entity_name as string | undefined
              const actor        = (meta.actor as string) || 'Alex Thompson'
              const isUndone     = undoneEventIds.has(ev.id) || !!(meta.undone)
              const isUndoRow    = eventType.startsWith('undo_')
              const isProcessing = processingIds.has(ev.id)
              const undoable     = !!(meta.undoable) && !isUndone && !isProcessing && !isUndoRow && (can?.canUndoActions ?? true)

              return (
                <motion.div key={ev.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.012, 0.22) }}>
                  <div
                    className={`group rounded-2xl px-4 py-3.5 flex items-start gap-3 transition-all duration-150 cursor-default
                      ${isUndone ? 'opacity-35' : ''}
                      ${isProcessing ? 'opacity-60' : ''}
                      ${isUndoRow ? 'opacity-55' : ''}`}
                    style={{
                      background: 'rgba(255,255,255,0.022)',
                      border: '1px solid rgba(255,255,255,0.07)',
                    }}
                    onMouseEnter={e => { if (!isUndone && !isUndoRow) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.038)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.022)' }}>

                    {/* Icon */}
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: cfg.bg, border: `1px solid ${cfg.color}28` }}>
                      <DataIcon icon={cfg.Icon} className="w-4 h-4" style={{ color: cfg.color }} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">

                      {/* Line 1: type chip + entity name + timestamp */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0 flex items-baseline gap-2 flex-wrap">
                          <span className="text-[10px] font-black uppercase tracking-widest leading-none px-1.5 py-0.5 rounded"
                            style={{ color: cfg.color, background: `${cfg.color}14` }}>
                            {typeLabel}
                          </span>
                          {entityName
                            ? <span className="text-sm font-semibold text-white/90 leading-tight">{entityName}</span>
                            : <span className="text-xs text-white/50 leading-tight truncate max-w-[14rem]">{ev.title}</span>}
                        </div>
                        <span className="text-[10px] text-white/20 flex-shrink-0 whitespace-nowrap mt-0.5">
                          {relativeTime(ev.created_at)}
                        </span>
                      </div>

                      {/* Line 2: diff */}
                      <ChangeDisplay ev={ev} />

                      {/* Line 3: actor + controls */}
                      <div className="flex items-center justify-between mt-2 gap-2">
                        <span className="text-[10px] text-white/25">{actor}</span>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isUndone && !isUndoRow && (
                            <motion.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background:'rgba(248,113,113,0.10)', color:'#f87171', border:'1px solid rgba(248,113,113,0.18)' }}>
                              Undone
                            </motion.span>
                          )}
                          {isProcessing && (
                            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                              style={{ background:'rgba(244,122,99,0.08)', border:'1px solid rgba(244,122,99,0.20)', color:'rgba(196,181,253,0.6)' }}>
                              <motion.span className="w-2.5 h-2.5 rounded-full border-2 border-orange-400/30 border-t-orange-400"
                                animate={{ rotate:360 }} transition={{ duration:0.7, repeat:Infinity, ease:'linear' }} />
                              Undoing…
                            </span>
                          )}
                          {undoable && (
                            <button onClick={() => handleUndo(ev)}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all hover:bg-orange-500/15 active:scale-95"
                              style={{ background:'rgba(244,122,99,0.10)', border:'1px solid rgba(244,122,99,0.28)', color:'#f8a36d' }}>
                              <Undo2 className="w-2.5 h-2.5" /><span>Undo</span>
                            </button>
                          )}
                        </div>
                      </div>

                    </div>
                  </div>
                  {/* Subtle row divider */}
                  {i < visibleEvents.length - 1 && (
                    <div className="h-px mx-4" style={{ background: 'rgba(255,255,255,0.03)' }} />
                  )}
                </motion.div>
              )
            })}
          </div>

          {remainingCount > 0 && (
            <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              onClick={() => setVisibleCount(v => v + LOG_PAGE)}
              className="w-full py-3 rounded-xl text-xs font-semibold text-white/35 hover:text-white/60 transition-colors"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              Load {Math.min(LOG_PAGE, remainingCount)} more
              <span className="ml-1.5 text-white/20">({remainingCount} remaining)</span>
            </motion.button>
          )}

          {remainingCount <= 0 && events.length >= 200 && (
            <p className="text-center text-[10px] text-white/15 py-2">
              Showing last 200 actions — older history is stored in the database
            </p>
          )}
        </>
      )}
    </div>
  )
}

/* ─── Role-based permission UI ───────────────────────────────── */

type CurrentUser = { name: string; role: Role }
const DEMO_OWNER: CurrentUser = { name: 'Alex Thompson', role: 'owner' }

function ViewAsSelector({
  currentUser, teamMembers, onChange,
}: {
  currentUser: CurrentUser
  teamMembers: TeamMember[]
  onChange:    (u: CurrentUser) => void
}) {
  const [open, setOpen] = useState(false)

  const rolePalette: Record<Role, { label: string; color: string }> = {
    owner:       { label:'Owner',       color:'#fbbf24' },
    team_leader: { label:'Team Leader', color:'#f8a36d' },
    agent:       { label:'Agent',       color:'#948f88' },
    viewer:      { label:'Viewer',      color:'rgba(255,255,255,0.5)' },
  }

  const options: CurrentUser[] = [
    DEMO_OWNER,
    ...teamMembers
      .filter(m => m.name !== DEMO_OWNER.name)
      .map(m => ({ name: m.name, role: m.role })),
  ]

  const pal = rolePalette[currentUser.role]

  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)}
        title="Switch role (demo)"
        className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:opacity-80"
        style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)' }}>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: pal.color }} />
        <span style={{ color: pal.color }}>{pal.label}</span>
        <ChevronDown className="w-3 h-3 text-white/25" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-50 rounded-xl overflow-hidden min-w-[180px]"
            style={{
              background:'rgba(19,20,22,0.92)',
              border:'1px solid rgba(217,133,90,0.16)',
              boxShadow:'0 18px 48px rgba(0,0,0,0.42)',
              backdropFilter:'blur(18px)',
            }}>
            <div className="px-3 pt-2.5 pb-1 text-[9px] font-black uppercase tracking-widest text-white/25">View as (demo)</div>
            {options.map(opt => {
              const oc = rolePalette[opt.role]
              const active = opt.name === currentUser.name
              return (
                <button key={opt.name} onClick={() => { onChange(opt); setOpen(false) }}
                  className="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors hover:bg-white/5"
                  style={{ background: active ? 'rgba(255,255,255,0.04)' : 'transparent' }}>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: oc.color }} />
                  <span className="text-xs text-white/65 truncate flex-1">{opt.name}</span>
                  <span className="text-[10px] font-bold" style={{ color: oc.color }}>{oc.label}</span>
                  {active && <Check className="w-3 h-3 ml-1" style={{ color: oc.color }} />}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/* ─── Team ───────────────────────────────────────────────────── */

const ROLE_CFG: Record<Role, { label: string; color: string; bg: string; border: string; desc: string }> = {
  owner:       { label:'Owner',       color:'#fbbf24', bg:'rgba(251,191,36,0.10)',   border:'rgba(251,191,36,0.22)',   desc:'Full access to everything'              },
  team_leader: { label:'Team Leader', color:'#f8a36d', bg:'rgba(244,122,99,0.10)',  border:'rgba(244,122,99,0.22)',  desc:'Manage agents and assigned leads'        },
  agent:       { label:'Agent',       color:'#948f88', bg:'rgba(148,145,140,0.10)',   border:'rgba(148,145,140,0.22)',   desc:'View and update assigned leads'          },
  viewer:      { label:'Viewer',      color:'rgba(255,255,255,0.35)', bg:'rgba(255,255,255,0.05)', border:'rgba(255,255,255,0.12)', desc:'Read-only access' },
}

function RoleBadge({ role }: { role: Role }) {
  const c = ROLE_CFG[role] ?? ROLE_CFG.agent
  return (
    <span className="inline-flex items-center text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
      style={{ color:c.color, background:c.bg, border:`1px solid ${c.border}` }}>
      {c.label}
    </span>
  )
}

function TeamSection({
  members, onRefresh, onToast, can, currentUserRole = 'owner', actorName = 'Alex Thompson',
}: {
  members:          TeamMember[]
  onRefresh:        () => void
  onToast:          (title: string, sub: string, ok: boolean) => void
  can?:             Permissions
  currentUserRole?: Role
  actorName?:       string
}) {
  const [showInvite, setShowInvite] = useState(false)
  const [form,       setForm]       = useState({ name:'', email:'', role:'agent' as Role })
  const [inviting,   setInviting]   = useState(false)
  const [inviteErr,  setInviteErr]  = useState('')
  const [copiedId,   setCopiedId]   = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [editRoleId, setEditRoleId] = useState<string | null>(null)

  async function handleInvite() {
    if (!form.name.trim() || !form.email.trim()) { setInviteErr('Name and email are required'); return }
    setInviting(true); setInviteErr('')
    try {
      const res  = await fetch('/api/team', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Actor-Name': actorName },
        body: JSON.stringify(form),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setInviteErr(data.error ?? 'Failed to invite'); setInviting(false); return }
      setShowInvite(false)
      setForm({ name:'', email:'', role:'agent' })
      onRefresh()
      onToast('Invited', form.name, true)
    } catch { setInviteErr('Network error') }
    setInviting(false)
  }

  async function handleRemove(member: TeamMember) {
    setRemovingId(member.id)
    try {
      await fetch(`/api/team/${member.id}`, { method: 'DELETE', headers: { 'X-Actor-Name': actorName } })
      onRefresh()
      onToast('Removed', member.name, true)
    } catch { onToast('Error', 'Failed to remove member', false) }
    setRemovingId(null)
  }

  async function handleRoleChange(id: string, role: Role) {
    setEditRoleId(null)
    try {
      await fetch(`/api/team/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Actor-Name': actorName },
        body: JSON.stringify({ role }),
      })
      onRefresh()
    } catch { onToast('Error', 'Failed to update role', false) }
  }

  function copyInviteLink(member: TeamMember) {
    if (!member.invite_token) return
    const link = `${window.location.origin}/join?token=${member.invite_token}`
    void navigator.clipboard.writeText(link)
    setCopiedId(member.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <Card className="px-5 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-white">Team Members</h2>
            <p className="text-xs text-white/30 mt-0.5">
              {members.length} member{members.length !== 1 ? 's' : ''} · manage access and lead assignments
            </p>
          </div>
          {(can?.canInviteMember ?? true) && (
            <button onClick={() => {
                setShowInvite(v => !v)
                setInviteErr('')
                // Ensure form role is valid for team_leader (only agent/viewer allowed)
                if (currentUserRole === 'team_leader' && (form.role === 'owner' || form.role === 'team_leader')) {
                  setForm(f => ({ ...f, role: 'agent' }))
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={{ background:'rgba(244,122,99,0.12)', border:'1px solid rgba(244,122,99,0.3)', color:'#f8a36d' }}>
              <UserPlus className="w-3.5 h-3.5" />{showInvite ? 'Cancel' : 'Invite Member'}
            </button>
          )}
        </div>
      </Card>

      {/* Invite form */}
      <AnimatePresence>
        {showInvite && (
          <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}
            transition={{ duration:0.15 }}>
            <Card className="px-5 py-5 flex flex-col gap-4">
              <h3 className="text-sm font-bold text-white/80">Invite team member</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input type="text" placeholder="Full name" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="px-3 py-2 rounded-xl text-sm text-white placeholder-white/20 outline-none"
                  style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)' }}
                  onFocus={e=>{ e.currentTarget.style.border='1px solid rgba(244,122,99,0.4)' }}
                  onBlur={e=>{  e.currentTarget.style.border='1px solid rgba(255,255,255,0.1)'  }} />
                <input type="email" placeholder="Email address" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="px-3 py-2 rounded-xl text-sm text-white placeholder-white/20 outline-none"
                  style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)' }}
                  onFocus={e=>{ e.currentTarget.style.border='1px solid rgba(244,122,99,0.4)' }}
                  onBlur={e=>{  e.currentTarget.style.border='1px solid rgba(255,255,255,0.1)'  }} />
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as Role }))}
                  className="px-3 py-2 rounded-xl text-sm outline-none appearance-none"
                  style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.7)', colorScheme:'dark' }}>
                  {currentUserRole !== 'team_leader' && <option value="owner">Owner</option>}
                  {currentUserRole !== 'team_leader' && <option value="team_leader">Team Leader</option>}
                  <option value="agent">Agent</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              {inviteErr && <p className="text-xs text-red-400">{inviteErr}</p>}
              <div className="flex gap-3">
                <button onClick={() => void handleInvite()} disabled={inviting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all"
                  style={{ background:'rgba(244,122,99,0.18)', border:'1px solid rgba(244,122,99,0.35)', color:'#f8a36d' }}>
                  {inviting
                    ? <><motion.span className="w-3 h-3 rounded-full border-2 border-orange-400/30 border-t-orange-400"
                        animate={{ rotate:360 }} transition={{ duration:0.7, repeat:Infinity, ease:'linear' }} />Inviting…</>
                    : <><UserPlus className="w-3.5 h-3.5" />Send Invite</>}
                </button>
                <button onClick={() => { setShowInvite(false); setInviteErr('') }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white/35 hover:text-white/60 transition-colors"
                  style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)' }}>
                  Cancel
                </button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Role permissions legend */}
      <Card className="px-5 py-4">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-white/25 mb-3">Role Permissions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(Object.entries(ROLE_CFG) as [Role, typeof ROLE_CFG[Role]][]).map(([role, cfg]) => (
            <div key={role} className="flex flex-col gap-1.5 p-3 rounded-xl"
              style={{ background:cfg.bg, border:`1px solid ${cfg.border}` }}>
              <div className="flex items-center gap-1.5">
                {role === 'owner'       && <Crown className="w-3 h-3 flex-shrink-0" style={{ color:cfg.color }} />}
                {role === 'team_leader' && <Shield className="w-3 h-3 flex-shrink-0" style={{ color:cfg.color }} />}
                {role === 'agent'       && <Users  className="w-3 h-3 flex-shrink-0" style={{ color:cfg.color }} />}
                {role === 'viewer'      && <Eye    className="w-3 h-3 flex-shrink-0" style={{ color:cfg.color }} />}
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color:cfg.color }}>{cfg.label}</span>
              </div>
              <span className="text-[10px] text-white/40 leading-snug">{cfg.desc}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* SQL prerequisite notice */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
        style={{ background:'rgba(148,145,140,0.06)', border:'1px solid rgba(148,145,140,0.15)' }}>
        <AlertCircle className="w-4 h-4 text-stone-400/60 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-stone-300/80">Database setup required to use this feature</p>
          <p className="text-[10px] text-stone-300/50 mt-0.5">Run once in your Supabase SQL editor — see the comment at the top of <code>app/dashboard/types.ts</code></p>
        </div>
      </div>

      {/* Members list */}
      {members.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 gap-3">
          <UserCog className="w-8 h-8 text-white/10" />
          <p className="text-sm text-white/25 font-medium">No team members yet</p>
          <p className="text-xs text-white/15">Invite your first member above to get started</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {members.map(member => {
            const isCopied    = copiedId   === member.id
            const isRemoving  = removingId === member.id
            const isProtected = member.id  === '00000000-0000-0000-0000-000000000000'
            return (
              <Card key={member.id} className="px-4 py-4 flex items-center gap-4 flex-wrap sm:flex-nowrap">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0"
                  style={{ background:'linear-gradient(135deg,rgba(244,122,99,0.45),rgba(148,145,140,0.45))' }}>
                  {member.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white/85">{member.name}</span>
                    <RoleBadge role={member.role} />
                    {member.status === 'invited' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background:'rgba(251,191,36,0.08)', color:'#fbbf24', border:'1px solid rgba(251,191,36,0.2)' }}>
                        Invite Pending
                      </span>
                    )}
                    {member.status === 'active' && (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background:'rgba(52,211,153,0.08)', color:'#34d399', border:'1px solid rgba(52,211,153,0.18)' }}>
                        <span className="w-1 h-1 rounded-full bg-emerald-400" />Active
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-white/35 mt-0.5 block">{member.email}</span>
                  {member.invited_by && (
                    <span className="text-[10px] text-white/20 mt-0.5 block">Invited by {member.invited_by}</span>
                  )}
                </div>

                {/* Role change — hidden for viewers/agents, team_leader can't touch owners, seed row is immutable */}
                {!isProtected && (can?.canChangeRole ?? true) && !(currentUserRole === 'team_leader' && member.role === 'owner') && (
                  <div className="relative flex-shrink-0">
                    {editRoleId === member.id ? (
                      <select
                        autoFocus
                        defaultValue={member.role}
                        onChange={e => void handleRoleChange(member.id, e.target.value as Role)}
                        onBlur={() => setEditRoleId(null)}
                        className="px-2 py-1 rounded-lg text-xs outline-none appearance-none"
                        style={{ background:'rgba(244,122,99,0.12)', border:'1px solid rgba(244,122,99,0.3)', color:'#f8a36d', colorScheme:'dark' }}>
                        {currentUserRole !== 'team_leader' && <option value="owner">Owner</option>}
                        <option value="team_leader">Team Leader</option>
                        <option value="agent">Agent</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <button onClick={() => setEditRoleId(member.id)}
                        className="text-[10px] text-white/25 hover:text-white/55 transition-colors px-2 py-1 rounded-lg"
                        style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
                        Change role
                      </button>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {member.invite_token && (
                    <button onClick={() => copyInviteLink(member)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                      style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.09)', color:'rgba(255,255,255,0.35)' }}>
                      {isCopied
                        ? <><Check className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400">Copied!</span></>
                        : <><Copy className="w-3 h-3" />Copy link</>}
                    </button>
                  )}
                  {!isProtected && (can?.canRemoveMember ?? true) && !(currentUserRole === 'team_leader' && member.role === 'owner') && (
                    <button onClick={() => void handleRemove(member)} disabled={isRemoving}
                      className="p-1.5 rounded-lg transition-all hover:bg-red-500/10"
                      style={{ color: isRemoving ? 'rgba(248,113,113,0.2)' : 'rgba(248,113,113,0.4)' }}>
                      {isRemoving
                        ? <motion.span className="w-3.5 h-3.5 rounded-full border-2 border-red-400/20 border-t-red-400 block"
                            animate={{ rotate:360 }} transition={{ duration:0.7, repeat:Infinity, ease:'linear' }} />
                        : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

type RentalTab = 'fleet' | 'calendar' | 'availability' | 'booking' | 'locations' | 'documents' | 'sync'

const RENTAL_TABS: { id: RentalTab; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'fleet', label: 'Fleet', Icon: Car },
  { id: 'calendar', label: 'Calendar', Icon: Calendar },
  { id: 'availability', label: 'Availability', Icon: Search },
  { id: 'booking', label: 'Bookings', Icon: CalendarPlus },
  { id: 'locations', label: 'Locations', Icon: MapPin },
  { id: 'documents', label: 'Documents', Icon: FileText },
  { id: 'sync', label: 'Sync & Rules', Icon: Link2 },
]

const RENTAL_STATUS_CFG: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: 'Pending' },
  confirmed: { color: '#f8a36d', bg: 'rgba(248,163,109,0.12)', label: 'Confirmed' },
  paid: { color: '#34d399', bg: 'rgba(52,211,153,0.12)', label: 'Paid' },
  picked_up: { color: '#f47a63', bg: 'rgba(244,122,99,0.12)', label: 'Picked up' },
  returned: { color: '#948f88', bg: 'rgba(148,145,140,0.12)', label: 'Returned' },
  extended: { color: '#fb923c', bg: 'rgba(251,146,60,0.12)', label: 'Extended' },
  cancelled: { color: '#f87171', bg: 'rgba(248,113,113,0.12)', label: 'Cancelled' },
  maintenance: { color: '#cbd5e1', bg: 'rgba(203,213,225,0.10)', label: 'Maintenance' },
  active: { color: '#f47a63', bg: 'rgba(244,122,99,0.12)', label: 'Active' },
  completed: { color: '#948f88', bg: 'rgba(148,145,140,0.12)', label: 'Completed' },
  available: { color: '#34d399', bg: 'rgba(52,211,153,0.10)', label: 'Available' },
  inactive: { color: '#64748b', bg: 'rgba(100,116,139,0.12)', label: 'Inactive' },
}

const RENTAL_MAKES = ['Toyota', 'Hyundai', 'Kia', 'Honda', 'Nissan', 'Volkswagen', 'Skoda', 'Mercedes', 'BMW', 'Audi', 'Ford', 'Renault', 'Peugeot', 'Opel', 'Fiat', 'Tesla']
const RENTAL_MODELS_BY_MAKE: Record<string, string[]> = {
  Toyota: ['Corolla', 'Yaris', 'Camry', 'RAV4', 'Prius', 'CHR', 'Land Cruiser', 'Proace'],
  Hyundai: ['i10', 'i20', 'i30', 'Elantra', 'Tucson', 'Santa Fe', 'Kona'],
  Kia: ['Picanto', 'Rio', 'Ceed', 'Sportage', 'Sorento', 'Stonic'],
  Honda: ['Jazz', 'Civic', 'Accord', 'HR-V', 'CR-V'],
  Nissan: ['Micra', 'Juke', 'Qashqai', 'X-Trail', 'Leaf'],
  Volkswagen: ['Polo', 'Golf', 'Passat', 'T-Roc', 'Tiguan', 'Transporter'],
  Skoda: ['Fabia', 'Octavia', 'Superb', 'Kamiq', 'Karoq', 'Kodiaq'],
  Mercedes: ['A-Class', 'C-Class', 'E-Class', 'GLC', 'Vito', 'Sprinter'],
  BMW: ['1 Series', '3 Series', '5 Series', 'X1', 'X3', 'X5'],
  Audi: ['A1', 'A3', 'A4', 'A6', 'Q3', 'Q5', 'Q7'],
  Ford: ['Fiesta', 'Focus', 'Mondeo', 'Kuga', 'Transit'],
  Renault: ['Clio', 'Megane', 'Captur', 'Kadjar', 'Trafic'],
  Peugeot: ['208', '308', '3008', '5008', 'Partner'],
  Opel: ['Corsa', 'Astra', 'Insignia', 'Mokka', 'Vivaro'],
  Fiat: ['500', 'Panda', 'Tipo', 'Doblo', 'Ducato'],
  Tesla: ['Model 3', 'Model Y', 'Model S', 'Model X'],
}
const RENTAL_CLASSES = ['Economy', 'Compact', 'Sedan', 'SUV', 'Luxury', 'Van', 'Truck']
const RENTAL_TRANSMISSIONS = ['Automatic', 'Manual']
const RENTAL_FUEL_TYPES = ['Petrol', 'Diesel', 'LPG', 'Hybrid', 'Plug-in Hybrid', 'Electric']
const RENTAL_CAR_STATUSES = ['Available', 'Reserved', 'Rented', 'Cleaning', 'Maintenance', 'Out of service']

type RentalCarForm = {
  id?: string
  make: string
  model: string
  name: string
  className: string
  transmission: string
  seats: string
  fuelType: string
  dailyPrice: string
  deposit: string
  licensePlate: string
  locationName: string
  status: string
  imageUrl: string
  notes: string
  active: boolean
}

type RentalLocationForm = {
  id?: string
  locationType: 'pickup' | 'dropoff' | 'both'
  name: string
  address: string
  googleMapsLink: string
  latitude: string
  longitude: string
  terminalInstructions: string
  pickupInstructionText: string
  dropoffInstructionText: string
  active: boolean
}

function emptyRentalCarForm(locations: RentalLocation[] = []): RentalCarForm {
  return {
    make: 'Toyota',
    model: 'Corolla',
    name: 'Toyota Corolla',
    className: 'Economy',
    transmission: 'Automatic',
    seats: '5',
    fuelType: 'Petrol',
    dailyPrice: '',
    deposit: '',
    licensePlate: '',
    locationName: locations[0]?.name ?? '',
    status: 'Available',
    imageUrl: '',
    notes: '',
    active: true,
  }
}

function emptyRentalLocationForm(): RentalLocationForm {
  return {
    locationType: 'both',
    name: '',
    address: '',
    googleMapsLink: '',
    latitude: '',
    longitude: '',
    terminalInstructions: '',
    pickupInstructionText: '',
    dropoffInstructionText: '',
    active: true,
  }
}

function RentalStatusBadge({ status }: { status: string }) {
  const cfg = RENTAL_STATUS_CFG[status] ?? RENTAL_STATUS_CFG.pending
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: cfg.color, background: cfg.bg }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  )
}

function toInputDateTime(value: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1)
}

function addMonths(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1)
}

function monthDays(value: Date) {
  const first = startOfMonth(value)
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  return Array.from({ length: daysInMonth }, (_, index) => new Date(first.getFullYear(), first.getMonth(), index + 1))
}

function monthLabel(value: Date) {
  return value.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function bookingEnd(booking: RentalBooking) {
  return booking.dropoffAt ?? booking.returnAt
}

function bookingTouchesDay(booking: RentalBooking, day: Date) {
  const start = new Date(day)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return new Date(booking.pickupAt) < end && new Date(bookingEnd(booking)) > start
}

const BLOCKING_RENTAL_BOOKING_STATUSES = new Set(['pending', 'confirmed', 'active', 'paid', 'picked_up', 'extended', 'maintenance', 'unavailable'])

function rentalBookingBlocksCalendar(booking: RentalBooking) {
  return BLOCKING_RENTAL_BOOKING_STATUSES.has(String(booking.status).toLowerCase())
}

function bookingRangePosition(booking: RentalBooking, day: Date) {
  const dayStart = new Date(day)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  const pickup = new Date(booking.pickupAt)
  const dropoff = new Date(bookingEnd(booking))
  const starts = pickup >= dayStart && pickup < dayEnd
  const ends = dropoff > dayStart && dropoff <= dayEnd
  return { starts, ends, middle: !starts && !ends }
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function RentalOperationsSection() {
  const tomorrow = useMemo(() => {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    date.setHours(10, 0, 0, 0)
    return date
  }, [])
  const later = useMemo(() => {
    const date = new Date(tomorrow)
    date.setDate(date.getDate() + 3)
    date.setHours(12, 0, 0, 0)
    return date
  }, [tomorrow])

  const [tab, setTab] = useState<RentalTab>('fleet')
  const [loading, setLoading] = useState(true)
  const [migrationRequired, setMigrationRequired] = useState(false)
  const [cars, setCars] = useState<RentalCar[]>([])
  const [bookings, setBookings] = useState<RentalBooking[]>([])
  const [locations, setLocations] = useState<RentalLocation[]>([])
  const [settings, setSettings] = useState<RentalSettings>({
    cleaningBufferMinutes: 120,
    externalSyncEnabled: false,
    syncDirection: 'two_way',
  })
  const [availabilityForm, setAvailabilityForm] = useState({
    pickupDateTime: toInputDateTime(tomorrow),
    returnDateTime: toInputDateTime(later),
    pickupLocation: '',
    dropoffLocation: '',
    carClass: 'Compact',
    transmission: '',
    seats: '',
    budget: '',
  })
  const [matches, setMatches] = useState<AvailabilityMatch[]>([])
  const [availabilityStatus, setAvailabilityStatus] = useState<string>('')
  const [bookingForm, setBookingForm] = useState({
    customerName: '',
    phone: '',
    email: '',
    pickupDateTime: toInputDateTime(tomorrow),
    returnDateTime: toInputDateTime(later),
    pickupLocationId: '',
    dropoffLocationId: '',
    carId: '',
    carClass: 'Compact',
    extras: '',
    totalPrice: '0',
    deposit: '0',
    paymentStatus: 'pending',
  })
  const [createdBooking, setCreatedBooking] = useState<{ bookingNumber: string; confirmationUrl: string; whatsappMessage: string } | null>(null)
  const [syncStatus, setSyncStatus] = useState<string>('')
  const [ocrStatus, setOcrStatus] = useState<string>('')
  const [carModalOpen, setCarModalOpen] = useState(false)
  const [calendarModalCar, setCalendarModalCar] = useState<RentalCar | null>(null)
  const [calendarBookings, setCalendarBookings] = useState<RentalBooking[]>([])
  const [calendarStatus, setCalendarStatus] = useState('')
  const [calendarCursor, setCalendarCursor] = useState(() => startOfMonth(new Date()))
  const [locationModalOpen, setLocationModalOpen] = useState(false)
  const [carForm, setCarForm] = useState<RentalCarForm>(() => emptyRentalCarForm())
  const [locationForm, setLocationForm] = useState<RentalLocationForm>(() => emptyRentalLocationForm())
  const [crudStatus, setCrudStatus] = useState('')
  const fleetCsvRef = useRef<HTMLInputElement>(null)

  const calendarMonths = useMemo(() => [calendarCursor, addMonths(calendarCursor, 1)], [calendarCursor])
  const activeCalendarBookings = useMemo(() => calendarBookings.filter(rentalBookingBlocksCalendar), [calendarBookings])
  const nonBlockingCalendarBookings = useMemo(() => calendarBookings.filter(booking => !rentalBookingBlocksCalendar(booking)), [calendarBookings])

  const reloadFleet = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/rental/fleet')
      const data = await res.json()
      setCars(data.cars ?? [])
      setBookings(data.bookings ?? [])
      setLocations(data.locations ?? [])
      setSettings(data.settings ?? { cleaningBufferMinutes: 120, externalSyncEnabled: false, syncDirection: 'two_way' })
      setMigrationRequired(Boolean(data.migrationRequired))
      const firstLocation = data.locations?.[0]?.id ?? data.locations?.[0]?.name ?? ''
      const firstCar = data.cars?.[0]?.id ?? ''
      setBookingForm(prev => ({ ...prev, pickupLocationId: prev.pickupLocationId || firstLocation, dropoffLocationId: prev.dropoffLocationId || firstLocation, carId: prev.carId || firstCar }))
      setAvailabilityForm(prev => ({ ...prev, pickupLocation: prev.pickupLocation || data.locations?.[0]?.name || '', dropoffLocation: prev.dropoffLocation || data.locations?.[0]?.name || '' }))
    } catch {
      setMigrationRequired(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reloadFleet() }, [reloadFleet])

  const fleetCalendarDays = useMemo(() => monthDays(calendarCursor), [calendarCursor])

  async function runAvailabilityCheck() {
    setAvailabilityStatus('Checking fleet availability...')
    setMatches([])
    try {
      const res = await fetch('/api/rental/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...availabilityForm,
          pickup_at: availabilityForm.pickupDateTime,
          dropoff_at: availabilityForm.returnDateTime,
          car_class: availabilityForm.carClass,
          seats: availabilityForm.seats ? Number(availabilityForm.seats) : undefined,
          budget: availabilityForm.budget ? Number(availabilityForm.budget) : undefined,
        }),
      })
      const data = await res.json()
      const availableCars = data.available_cars ?? data.availableCars ?? []
      const mappedMatches: AvailabilityMatch[] = availableCars.map((car: RentalCar) => ({
        car,
        matchType: 'exact',
        priceDifference: 0,
        reason: data.message ?? 'Available for the requested pickup/drop-off interval.',
      }))
      setMatches(mappedMatches)
      setAvailabilityStatus(availableCars.length ? `${availableCars.length} available option(s)` : data.message ?? 'No good option found. Human handover recommended.')
    } catch {
      setAvailabilityStatus('Availability check failed. Try again or hand over to a human.')
    }
  }

  function openAddCar() {
    setCarForm(emptyRentalCarForm(locations))
    setCarModalOpen(true)
  }

  function openEditCar(car: RentalCar) {
    const makeMatch = RENTAL_MAKES.find(make => car.name.toLowerCase().startsWith(make.toLowerCase())) ?? 'Toyota'
    setCarForm({
      id: car.id,
      make: makeMatch,
      model: car.model ?? RENTAL_MODELS_BY_MAKE[makeMatch]?.[0] ?? '',
      name: car.name,
      className: car.className,
      transmission: car.transmission === 'manual' ? 'Manual' : 'Automatic',
      seats: String(car.seats ?? ''),
      fuelType: car.fuelType ?? 'Petrol',
      dailyPrice: String(car.dailyPrice ?? ''),
      deposit: String(car.deposit ?? ''),
      licensePlate: car.licensePlate ?? '',
      locationName: car.locationName ?? locations[0]?.name ?? '',
      status: RENTAL_STATUS_CFG[car.status]?.label ?? 'Available',
      imageUrl: car.imageUrl ?? '',
      notes: car.notes ?? '',
      active: car.active,
    })
    setCarModalOpen(true)
  }

  async function openCarCalendar(car: RentalCar) {
    setCalendarModalCar(car)
    setCalendarStatus('Loading booking calendar...')
    setCalendarBookings([])
    try {
      const res = await fetch(`/api/rental/cars/${encodeURIComponent(car.id)}/calendar`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Calendar load failed')
      setCalendarBookings(data.bookings ?? [])
      setCalendarStatus('')
    } catch (error) {
      setCalendarStatus(error instanceof Error ? error.message : 'Calendar load failed')
    }
  }

  async function createCalendarBooking(car: RentalCar) {
    setCalendarStatus('Creating booking...')
    try {
      const res = await fetch('/api/rental/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...bookingForm,
          carId: car.id,
          car_id: car.id,
          customerName: bookingForm.customerName || 'Manual test booking',
          pickup_at: bookingForm.pickupDateTime,
          dropoff_at: bookingForm.returnDateTime,
          pickup_location_id: bookingForm.pickupLocationId || null,
          dropoff_location_id: bookingForm.dropoffLocationId || bookingForm.pickupLocationId || null,
          totalPrice: Number(bookingForm.totalPrice || car.dailyPrice || 0),
          status: 'confirmed',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Booking failed')
      setCalendarStatus('Booking created.')
      await openCarCalendar(car)
      await reloadFleet()
    } catch (error) {
      setCalendarStatus(error instanceof Error ? error.message : 'Booking failed')
    }
  }

  async function saveCarForm() {
    setCrudStatus(carForm.id ? 'Updating car...' : 'Adding car...')
    const url = carForm.id ? `/api/rental/cars?id=${encodeURIComponent(carForm.id)}` : '/api/rental/cars'
    const res = await fetch(url, {
      method: carForm.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(carForm),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setCrudStatus(data.error ?? 'Car save failed')
      return
    }
    setCarModalOpen(false)
    setCrudStatus('Saved car.')
    await reloadFleet()
  }

  async function deleteCar(id: string) {
    setCrudStatus('Deleting car...')
    const res = await fetch(`/api/rental/cars?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    setCrudStatus(res.ok ? 'Car deleted.' : data.error ?? 'Delete failed')
    if (res.ok) await reloadFleet()
  }

  async function toggleCarActive(car: RentalCar) {
    const status = car.active ? 'Out of service' : 'Available'
    const res = await fetch(`/api/rental/cars?id=${encodeURIComponent(car.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: car.name,
        model: car.model,
        className: car.className,
        transmission: car.transmission,
        seats: car.seats,
        fuelType: car.fuelType,
        dailyPrice: car.dailyPrice,
        deposit: car.deposit,
        licensePlate: car.licensePlate,
        locationName: car.locationName,
        imageUrl: car.imageUrl,
        notes: car.notes,
        status,
        active: !car.active,
      }),
    })
    setCrudStatus(res.ok ? 'Car status updated.' : 'Status update failed')
    if (res.ok) await reloadFleet()
  }

  function openAddLocation() {
    setLocationForm(emptyRentalLocationForm())
    setLocationModalOpen(true)
  }

  function openEditLocation(location: RentalLocation) {
    setLocationForm({
      id: location.id,
      locationType: location.locationType ?? 'both',
      name: location.name,
      address: location.address ?? '',
      googleMapsLink: location.googleMapsLink ?? '',
      latitude: location.latitude == null ? '' : String(location.latitude),
      longitude: location.longitude == null ? '' : String(location.longitude),
      terminalInstructions: location.terminalInstructions ?? '',
      pickupInstructionText: location.pickupInstructionText ?? location.whatsappText ?? '',
      dropoffInstructionText: location.dropoffInstructionText ?? location.whatsappText ?? '',
      active: location.active,
    })
    setLocationModalOpen(true)
  }

  async function saveLocationForm() {
    setCrudStatus(locationForm.id ? 'Updating location...' : 'Adding location...')
    const url = locationForm.id ? `/api/rental/locations?id=${encodeURIComponent(locationForm.id)}` : '/api/rental/locations'
    const res = await fetch(url, {
      method: locationForm.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(locationForm),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setCrudStatus(data.error ?? 'Location save failed')
      return
    }
    setLocationModalOpen(false)
    setCrudStatus('Saved location.')
    await reloadFleet()
  }

  async function deleteLocation(id: string) {
    setCrudStatus('Deleting location...')
    const res = await fetch(`/api/rental/locations?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    setCrudStatus(res.ok ? 'Location deleted.' : data.error ?? 'Delete failed')
    if (res.ok) await reloadFleet()
  }

  async function toggleLocationActive(location: RentalLocation) {
    const res = await fetch(`/api/rental/locations?id=${encodeURIComponent(location.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...location,
        locationType: location.locationType ?? 'both',
        active: !location.active,
      }),
    })
    setCrudStatus(res.ok ? 'Location status updated.' : 'Status update failed')
    if (res.ok) await reloadFleet()
  }

  async function useDemoFleetNow() {
    setCrudStatus('Importing demo fleet...')
    const res = await fetch('/api/rental/cars?action=demo', { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setCrudStatus(res.ok ? `Imported ${data.importedCars ?? 0} demo cars.` : data.error ?? 'Demo import failed')
    if (res.ok) await reloadFleet()
  }

  async function useDemoLocationsNow() {
    setCrudStatus('Importing demo locations...')
    const res = await fetch('/api/rental/locations?action=demo', { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setCrudStatus(res.ok ? `Imported ${data.importedLocations ?? 0} demo locations.` : data.error ?? 'Demo import failed')
    if (res.ok) await reloadFleet()
  }

  async function importFleetCsv(file: File) {
    setCrudStatus('Reading CSV...')
    const text = await file.text()
    const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean)
    const headers = headerLine.split(',').map(h => h.trim())
    const required = ['car_name', 'make', 'model', 'class_name', 'transmission', 'seats', 'fuel_type', 'daily_price', 'deposit', 'license_plate', 'location', 'status']
    const missing = required.filter(col => !headers.includes(col))
    if (missing.length) {
      setCrudStatus(`CSV missing columns: ${missing.join(', ')}`)
      return
    }
    let imported = 0
    for (const line of lines) {
      const values = line.split(',').map(v => v.trim())
      const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
      if (!row.car_name) continue
      const res = await fetch('/api/rental/cars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: row.car_name,
          make: row.make,
          model: row.model,
          className: row.class_name,
          transmission: row.transmission,
          seats: row.seats,
          fuelType: row.fuel_type,
          dailyPrice: row.daily_price,
          deposit: row.deposit,
          licensePlate: row.license_plate,
          locationName: row.location,
          status: row.status,
        }),
      })
      if (res.ok) imported++
    }
    setCrudStatus(`Imported ${imported} cars from CSV.`)
    await reloadFleet()
  }

  async function createBooking() {
    setCreatedBooking(null)
    try {
      const selectedCar = cars.find(car => car.id === bookingForm.carId)
      const res = await fetch('/api/rental/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...bookingForm,
          carClass: selectedCar?.className ?? bookingForm.carClass,
          car_id: bookingForm.carId,
          pickup_at: bookingForm.pickupDateTime,
          dropoff_at: bookingForm.returnDateTime,
          pickup_location_id: bookingForm.pickupLocationId || null,
          dropoff_location_id: bookingForm.dropoffLocationId || bookingForm.pickupLocationId || null,
          totalPrice: Number(bookingForm.totalPrice || selectedCar?.dailyPrice || 0),
          deposit: Number(bookingForm.deposit || selectedCar?.deposit || 0),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Booking failed')
      setCreatedBooking(data)
      await reloadFleet()
    } catch (error) {
      setCreatedBooking({
        bookingNumber: 'Needs review',
        confirmationUrl: '',
        whatsappMessage: error instanceof Error ? error.message : 'Booking failed',
      })
    }
  }

  async function updateRentalBookingStatus(id: string, status: string) {
    const res = await fetch('/api/rental/bookings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    const data = await res.json().catch(() => ({}))
    setCrudStatus(res.ok ? `Booking marked ${status}.` : data.error ?? 'Booking update failed')
    if (res.ok) await reloadFleet()
  }

  async function saveRentalSettings(syncNow = false) {
    setSyncStatus(syncNow ? 'Sync requested...' : 'Saving settings...')
    try {
      const res = await fetch('/api/rental/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, syncNow }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setSyncStatus(syncNow ? 'Manual sync queued. Check sync logs for external API errors.' : 'Rental settings saved.')
      await reloadFleet()
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : 'Settings save failed')
    }
  }

  async function runOcrPlaceholder() {
    setOcrStatus('Preparing secure OCR review...')
    try {
      const res = await fetch('/api/rental/documents/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentType: 'driver_license', consent: true }),
      })
      const data = await res.json()
      setOcrStatus(`${data.validationStatus ?? 'needs_review'} · confidence ${Math.round((data.confidence ?? 0) * 100)}% · human review required before accepting documents.`)
    } catch {
      setOcrStatus('OCR placeholder failed. Keep document review in human handover.')
    }
  }

  const statusCounts = useMemo(() => {
    return bookings.reduce<Record<string, number>>((acc, booking) => {
      acc[booking.status] = (acc[booking.status] ?? 0) + 1
      return acc
    }, {})
  }, [bookings])

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <Card className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Car className="h-5 w-5 text-[#f8a36d]" />
                <h2 className="text-lg font-black text-white">Car Rental Operations Assistant</h2>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/46">
                Manage fleet availability, website chat booking requests, human handover, driver documents, extensions, pickup instructions, and external calendar sync from one operational layer.
              </p>
            </div>
            <button onClick={() => void reloadFleet()} className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-black transition-colors hover:bg-[#f5f0ea]">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
          {migrationRequired && (
            <div className="mt-4 rounded-xl border border-[#f8a36d]/25 bg-[#f8a36d]/10 p-3 text-sm font-semibold text-[#f8a36d]">
              Demo rental data is showing because the rental SQL migration has not been applied yet. Run sql/create_rental_operations.sql to activate live fleet tables.
            </div>
          )}
        </Card>
        <Card className="p-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/34">Today</p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div><p className="text-2xl font-black text-white">{cars.length}</p><p className="text-xs text-white/36">Cars</p></div>
            <div><p className="text-2xl font-black text-white">{bookings.length}</p><p className="text-xs text-white/36">Bookings</p></div>
            <div><p className="text-2xl font-black text-white">{settings.cleaningBufferMinutes ?? 120}m</p><p className="text-xs text-white/36">Buffer</p></div>
          </div>
        </Card>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {RENTAL_TABS.map(item => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors"
            style={{
              borderColor: tab === item.id ? 'rgba(248,163,109,0.42)' : 'rgba(255,255,255,0.08)',
              background: tab === item.id ? 'rgba(248,163,109,0.12)' : 'rgba(255,255,255,0.035)',
              color: tab === item.id ? '#f8a36d' : 'rgba(255,255,255,0.62)',
            }}
          >
            <item.Icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </div>

      {loading && <Card className="p-6 text-sm font-semibold text-white/46">Loading rental operations...</Card>}

      {!loading && tab === 'fleet' && (
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-white/8 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-base font-black text-white">Fleet management</h3>
              <p className="mt-1 text-sm text-white/40">Cars include class, transmission, seats, fuel, daily price, deposit, location, license plate, image slot, notes, and active state.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={openAddCar} className="btn-primary"><Plus className="h-4 w-4" />Add car</button>
              <input ref={fleetCsvRef} type="file" accept=".csv" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void importFleetCsv(file) }} />
              <button onClick={() => fleetCsvRef.current?.click()} className="btn-muted"><UploadCloud className="h-4 w-4" />Import CSV</button>
              <button onClick={() => void useDemoFleetNow()} className="btn-muted"><Check className="h-4 w-4" />Use demo fleet</button>
            </div>
          </div>
          {cars.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-base font-semibold text-white">No cars yet. Add your first car, import CSV, or use demo fleet.</p>
              <div className="mt-5 flex justify-center gap-2">
                <button onClick={openAddCar} className="btn-primary"><Plus className="h-4 w-4" />Add first car</button>
                <button onClick={() => void useDemoFleetNow()} className="btn-muted">Use demo fleet</button>
              </div>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="bg-white/[0.025] text-[11px] uppercase tracking-[0.14em] text-white/34">
                <tr>
                  {['Car', 'Class', 'Specs', 'Price', 'Deposit', 'Location', 'Plate', 'Status', 'Notes', 'Actions'].map(column => <th key={column} className="px-5 py-4 font-black">{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {cars.map(car => (
                  <tr key={car.id} className="border-t border-white/8">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-white">{car.name}</div>
                      <div className="mt-1 text-xs text-white/32">{car.imageUrl ? 'Image connected' : 'Image slot ready'}</div>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-white/68">{car.className}</td>
                    <td className="px-5 py-4 text-sm text-white/48">{car.transmission} · {car.seats} seats · {car.fuelType}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-white/70">{car.dailyPrice} zł/day</td>
                    <td className="px-5 py-4 text-sm text-white/50">{car.deposit} zł</td>
                    <td className="px-5 py-4 text-sm text-white/50">{car.locationName ?? 'Unassigned'}</td>
                    <td className="px-5 py-4 font-mono text-xs text-white/46">{car.licensePlate ?? '-'}</td>
                    <td className="px-5 py-4"><RentalStatusBadge status={car.active ? car.status : 'inactive'} /></td>
                    <td className="max-w-[220px] px-5 py-4 text-sm text-white/36">{car.notes ?? 'No notes'}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => void openCarCalendar(car)} className="icon-btn" title="Booking calendar"><Calendar className="h-3.5 w-3.5" /></button>
                        <button onClick={() => openEditCar(car)} className="icon-btn" title="Edit car"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => void toggleCarActive(car)} className="icon-btn" title={car.active ? 'Set inactive' : 'Set active'}><Eye className="h-3.5 w-3.5" /></button>
                        <button onClick={() => void deleteCar(car.id)} className="icon-btn" title="Delete car"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
          {crudStatus && <p className="border-t border-white/8 p-4 text-sm font-semibold text-[#f8a36d]">{crudStatus}</p>}
        </Card>
      )}

      {!loading && tab === 'calendar' && (
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-white/8 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-base font-black text-white">Fleet booking calendar</h3>
              <p className="mt-1 text-sm text-white/40">Rows are cars, columns are real days in {monthLabel(calendarCursor)}. Blocked ranges use the same availability checker as the bot.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setCalendarCursor(prev => addMonths(prev, -1))} className="btn-muted">Previous</button>
              <button onClick={() => setCalendarCursor(startOfMonth(new Date()))} className="btn-muted">Today</button>
              <button onClick={() => setCalendarCursor(prev => addMonths(prev, 1))} className="btn-muted">Next</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              <div className="grid border-b border-white/8 bg-white/[0.025]" style={{ gridTemplateColumns: `220px repeat(${fleetCalendarDays.length}, minmax(42px, 1fr))` }}>
                <div className="p-4 text-xs font-black uppercase tracking-[0.14em] text-white/34">Car</div>
                {fleetCalendarDays.map(day => <div key={day.toISOString()} className="p-3 text-center text-[10px] font-black uppercase tracking-[0.08em] text-white/34">{day.getDate()}</div>)}
              </div>
              {cars.map(car => (
                <div key={car.id} className="grid border-b border-white/8 last:border-b-0" style={{ gridTemplateColumns: `220px repeat(${fleetCalendarDays.length}, minmax(42px, 1fr))` }}>
                  <div className="p-4">
                    <p className="text-sm font-semibold text-white">{car.name}</p>
                    <p className="mt-1 text-xs text-white/34">{car.className}</p>
                  </div>
                  {fleetCalendarDays.map(day => {
                    const dayBookings = bookings.filter(booking => booking.carId === car.id && rentalBookingBlocksCalendar(booking) && bookingTouchesDay(booking, day))
                    const primary = dayBookings[0]
                    const pos = primary ? bookingRangePosition(primary, day) : null
                    return (
                      <div key={`${car.id}-${day.toISOString()}`} title={primary ? `${primary.bookingNumber}: ${fmtDateTime(primary.pickupAt)} → ${fmtDateTime(bookingEnd(primary))}${primary.bufferUntil ? ` · buffer until ${fmtDateTime(primary.bufferUntil)}` : ''}` : 'Free'} className={`relative min-h-16 border-l border-white/8 p-1 ${dayBookings.length ? 'bg-[#f8a36d]/5' : ''}`}>
                        {primary && (
                          <div className={`absolute inset-x-0 top-1/2 h-5 -translate-y-1/2 border-y border-[#f8a36d]/30 bg-[#f8a36d]/18 ${pos?.starts ? 'left-1 rounded-l-full border-l' : ''} ${pos?.ends ? 'right-1 rounded-r-full border-r' : ''}`}>
                            <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_45%,rgba(248,163,109,0.45)_46%,rgba(248,163,109,0.45)_54%,transparent_55%)] bg-[length:8px_8px]" />
                          </div>
                        )}
                        {dayBookings.length > 1 && <span className="absolute right-1 top-1 rounded-full bg-white/10 px-1.5 text-[9px] font-bold text-white/55">+{dayBookings.length - 1}</span>}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-3 border-t border-white/8 p-5 sm:grid-cols-3">
            {Object.entries(statusCounts).map(([status, count]) => <div key={status} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3"><RentalStatusBadge status={status} /><span className="text-sm font-black text-white">{count}</span></div>)}
          </div>
        </Card>
      )}

      {!loading && tab === 'availability' && (
        <Card className="p-5">
          <h3 className="text-base font-black text-white">Bot availability checker</h3>
          <p className="mt-1 text-sm text-white/40">This is the same logic the AI tool uses before offering cars: internal bookings first, buffer applied, then exact, same-class, and nearest-class alternatives.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <input type="datetime-local" value={availabilityForm.pickupDateTime} onChange={e => setAvailabilityForm(prev => ({ ...prev, pickupDateTime: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
            <input type="datetime-local" value={availabilityForm.returnDateTime} onChange={e => setAvailabilityForm(prev => ({ ...prev, returnDateTime: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
            <input value={availabilityForm.carClass} onChange={e => setAvailabilityForm(prev => ({ ...prev, carClass: e.target.value }))} placeholder="Class" className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
            <select value={availabilityForm.transmission} onChange={e => setAvailabilityForm(prev => ({ ...prev, transmission: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55">
              <option value="">Any transmission</option>
              <option value="automatic">Automatic</option>
              <option value="manual">Manual</option>
            </select>
            <select value={availabilityForm.pickupLocation} onChange={e => setAvailabilityForm(prev => ({ ...prev, pickupLocation: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55">
              <option value="">Pickup location</option>
              {locations.map(location => <option key={location.id} value={location.name}>{location.name}</option>)}
            </select>
            <select value={availabilityForm.dropoffLocation} onChange={e => setAvailabilityForm(prev => ({ ...prev, dropoffLocation: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55">
              <option value="">Drop-off location</option>
              {locations.map(location => <option key={location.id} value={location.name}>{location.name}</option>)}
            </select>
            <input value={availabilityForm.seats} onChange={e => setAvailabilityForm(prev => ({ ...prev, seats: e.target.value }))} placeholder="Seats" inputMode="numeric" className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
            <input value={availabilityForm.budget} onChange={e => setAvailabilityForm(prev => ({ ...prev, budget: e.target.value }))} placeholder="Budget/day" inputMode="numeric" className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
          </div>
          <button onClick={() => void runAvailabilityCheck()} className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition-colors hover:bg-[#f5f0ea]"><Search className="h-4 w-4" />Check availability</button>
          {availabilityStatus && <p className="mt-4 text-sm font-semibold text-[#f8a36d]">{availabilityStatus}</p>}
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {matches.map(match => (
              <div key={`${match.matchType}-${match.car.id}`} className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
                <p className="text-sm font-black text-white">{match.car.name}</p>
                <p className="mt-1 text-xs text-white/42">{match.car.className} · {match.car.transmission} · {match.car.seats} seats</p>
                <p className="mt-4 text-2xl font-black text-white">{match.car.dailyPrice} zł/day</p>
                <p className="mt-2 text-xs font-semibold text-[#f8a36d]">{match.reason}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!loading && tab === 'booking' && (
        <Card className="p-5">
          <h3 className="text-base font-black text-white">Manual booking and confirmation workflow</h3>
          <p className="mt-1 text-sm text-white/40">Creates a booking, blocks the calendar, prepares a confirmation PDF, and generates WhatsApp-ready confirmation text.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <input placeholder="Customer name" value={bookingForm.customerName} onChange={e => setBookingForm(prev => ({ ...prev, customerName: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
            <input placeholder="Phone" value={bookingForm.phone} onChange={e => setBookingForm(prev => ({ ...prev, phone: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
            <input placeholder="Email" value={bookingForm.email} onChange={e => setBookingForm(prev => ({ ...prev, email: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
            <input type="datetime-local" value={bookingForm.pickupDateTime} onChange={e => setBookingForm(prev => ({ ...prev, pickupDateTime: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
            <input type="datetime-local" value={bookingForm.returnDateTime} onChange={e => setBookingForm(prev => ({ ...prev, returnDateTime: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
            <select value={bookingForm.carId} onChange={e => setBookingForm(prev => ({ ...prev, carId: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55">
              <option value="">Select car</option>
              {cars.map(car => <option key={car.id} value={car.id}>{car.name} · {car.className}</option>)}
            </select>
            <select value={bookingForm.pickupLocationId} onChange={e => setBookingForm(prev => ({ ...prev, pickupLocationId: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55">
              <option value="">Pickup location</option>
              {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
            <select value={bookingForm.dropoffLocationId} onChange={e => setBookingForm(prev => ({ ...prev, dropoffLocationId: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55">
              <option value="">Drop-off location</option>
              {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
            <input placeholder="Extras" value={bookingForm.extras} onChange={e => setBookingForm(prev => ({ ...prev, extras: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
            <input placeholder="Total price" value={bookingForm.totalPrice} onChange={e => setBookingForm(prev => ({ ...prev, totalPrice: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
          </div>
          <button onClick={() => void createBooking()} className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition-colors hover:bg-[#f5f0ea]"><CreditCard className="h-4 w-4" />Create booking</button>
          {createdBooking && (
            <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.025] p-4">
              <p className="text-sm font-black text-white">Booking {createdBooking.bookingNumber}</p>
              {createdBooking.confirmationUrl && <a href={createdBooking.confirmationUrl} target="_blank" className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[#f8a36d]">Download confirmation PDF <ExternalLink className="h-3.5 w-3.5" /></a>}
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/48">{createdBooking.whatsappMessage}</p>
            </div>
          )}
          <div className="mt-6 overflow-hidden rounded-2xl border border-white/8">
            <div className="flex items-center justify-between bg-white/[0.025] px-4 py-3">
              <h4 className="text-sm font-black text-white">All bookings</h4>
              <span className="text-xs font-semibold text-white/34">{bookings.length} total</span>
            </div>
            <div className="divide-y divide-white/8">
              {bookings.length === 0 ? (
                <p className="px-4 py-5 text-sm text-white/42">No bookings yet.</p>
              ) : bookings.map(booking => (
                <div key={booking.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[1.2fr_1fr_auto] lg:items-center">
                  <div>
                    <p className="text-sm font-black text-white">{booking.customerName}</p>
                    <p className="mt-1 text-xs text-white/38">{booking.carName ?? cars.find(car => car.id === booking.carId)?.name ?? 'Unassigned car'} · {booking.customerPhone ?? 'No phone'}</p>
                    <p className="mt-1 text-xs text-white/34">{booking.pickupLocation ?? 'Pickup'} → {booking.dropoffLocation ?? 'Drop-off'}</p>
                  </div>
                  <div className="text-xs leading-5 text-white/48">
                    <div>Pickup: {fmtDateTime(booking.pickupAt)}</div>
                    <div>Drop-off: {fmtDateTime(booking.dropoffAt ?? booking.returnAt)}</div>
                    {booking.bufferUntil && <div className="text-[#f8a36d]">Buffer until {fmtDateTime(booking.bufferUntil)}</div>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <RentalStatusBadge status={booking.status} />
                    <select value={booking.status} onChange={e => void updateRentalBookingStatus(booking.id, e.target.value)} className="h-9 rounded-xl border border-white/10 bg-black/25 px-2 text-xs text-white outline-none">
                      {['pending', 'confirmed', 'active', 'completed', 'cancelled'].map(status => <option key={status} value={status}>{RENTAL_STATUS_CFG[status]?.label ?? status}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {!loading && tab === 'locations' && (
        <Card className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-base font-black text-white">Pickup and drop-off locations</h3>
              <p className="mt-1 text-sm text-white/40">No locations yet? Add pickup/drop-off locations so the bot can guide customers.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={openAddLocation} className="btn-primary"><Plus className="h-4 w-4" />Add location</button>
              <button onClick={() => void useDemoLocationsNow()} className="btn-muted">Use demo locations</button>
            </div>
          </div>
          {locations.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-8 text-center">
              <p className="text-base font-semibold text-white">No locations yet. Add pickup/drop-off locations so the bot can guide customers.</p>
              <button onClick={openAddLocation} className="btn-primary mt-5"><Plus className="h-4 w-4" />Add pickup/drop-off location</button>
            </div>
          ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {locations.map(location => (
            <div key={location.id} className="rounded-2xl border border-white/8 bg-white/[0.025] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-black text-white">{location.name}</h3>
                  <p className="mt-1 text-sm text-white/42">{location.address}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#f8a36d]">{location.locationType ?? 'both'} · {location.active ? 'active' : 'inactive'}</p>
                </div>
                <div className="flex gap-2">
                  {location.googleMapsLink && <a href={location.googleMapsLink} target="_blank" className="rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-white/62 hover:text-white">Map</a>}
                  <button onClick={() => openEditLocation(location)} className="icon-btn"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => void toggleLocationActive(location)} className="icon-btn"><Eye className="h-3.5 w-3.5" /></button>
                  <button onClick={() => void deleteLocation(location.id)} className="icon-btn"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-white/52">{location.terminalInstructions ?? 'Add terminal, meeting point, parking zone, and pickup card instructions.'}</p>
              <div className="mt-4 rounded-xl bg-black/30 p-3 text-xs leading-5 text-white/44">
                Pickup: {location.pickupInstructionText ?? location.whatsappText ?? `Your pickup point is ${location.name}.`}
                <br />
                Drop-off: {location.dropoffInstructionText ?? location.whatsappText ?? `Return the car at ${location.name}.`}
              </div>
            </div>
          ))}
          </div>
          )}
          {crudStatus && <p className="mt-4 text-sm font-semibold text-[#f8a36d]">{crudStatus}</p>}
        </Card>
      )}

      {!loading && tab === 'documents' && (
        <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <Card className="p-5">
            <h3 className="text-base font-black text-white">Document collection and OCR placeholder</h3>
            <p className="mt-2 text-sm leading-6 text-white/44">
              Customers should see a consent/privacy notice before uploading driver license, passport, or ID documents. OCR extracts name, document number, expiry date, and date of birth when connected.
            </p>
            <button onClick={() => void runOcrPlaceholder()} className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition-colors hover:bg-[#f5f0ea]">
              <UploadCloud className="h-4 w-4" />
              Test OCR placeholder
            </button>
            {ocrStatus && <p className="mt-4 text-sm font-semibold text-[#f8a36d]">{ocrStatus}</p>}
          </Card>
          <Card className="p-5">
            <h3 className="text-base font-black text-white">Validation rules</h3>
            <div className="mt-4 grid gap-3">
              {['Expired document', 'Missing expiry date', 'Low OCR confidence', 'Name mismatch', 'Unreadable document'].map(rule => (
                <div key={rule} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.025] p-3 text-sm font-semibold text-white/58">
                  <Shield className="h-4 w-4 text-[#f8a36d]" />
                  {rule} triggers human review
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {!loading && tab === 'sync' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h3 className="text-base font-black text-white">External booking calendar API</h3>
            <p className="mt-1 text-sm text-white/40">Connect an existing website booking calendar. Availability checks can consider imported bookings, and bot-created bookings can be pushed back out.</p>
            <div className="mt-5 grid gap-3">
              <input placeholder="Provider name" value={settings.providerName ?? ''} onChange={e => setSettings(prev => ({ ...prev, providerName: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
              <input placeholder="API URL" value={settings.apiUrl ?? ''} onChange={e => setSettings(prev => ({ ...prev, apiUrl: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
              <input placeholder="API key/token" type="password" onChange={e => setSettings(prev => ({ ...prev, apiKeyConfigured: Boolean(e.target.value) }))} className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
              <input placeholder="Webhook URL" value={settings.webhookUrl ?? ''} onChange={e => setSettings(prev => ({ ...prev, webhookUrl: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
              <select value={settings.syncDirection ?? 'two_way'} onChange={e => setSettings(prev => ({ ...prev, syncDirection: e.target.value as RentalSettings['syncDirection'] }))} className="h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55">
                <option value="none">Disabled</option>
                <option value="import">Import only</option>
                <option value="push">Push only</option>
                <option value="two_way">Import and push</option>
              </select>
              <label className="flex items-center gap-3 text-sm font-semibold text-white/58">
                <input type="checkbox" checked={Boolean(settings.externalSyncEnabled)} onChange={e => setSettings(prev => ({ ...prev, externalSyncEnabled: e.target.checked }))} />
                External sync enabled
              </label>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button onClick={() => void saveRentalSettings(false)} className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition-colors hover:bg-[#f5f0ea]">Save settings</button>
              <button onClick={() => void saveRentalSettings(true)} className="inline-flex h-10 items-center gap-2 rounded-full border border-white/12 px-5 text-sm font-semibold text-white/70 transition-colors hover:border-[#f8a36d]/35 hover:text-white"><RefreshCw className="h-4 w-4" />Sync now</button>
            </div>
            {syncStatus && <p className="mt-4 text-sm font-semibold text-[#f8a36d]">{syncStatus}</p>}
          </Card>
          <Card className="p-5">
            <h3 className="text-base font-black text-white">Extension and handover rules</h3>
            <div className="mt-4 space-y-3">
              {[
                ['Extension workflow', 'Identify booking by phone, email, or booking number, check same-car availability with buffer, calculate extra cost, prepare payment link placeholder, and regenerate PDF after confirmation.'],
                ['Location help', 'When customers ask where to go, identify booking pickup location and send the Google Maps pin plus terminal or parking instructions.'],
                ['Auto-handover', 'No availability, discount/refund/deposit requests, document issues, angry customers, unresolved location issues, high-value bookings, or low confidence.'],
              ].map(([title, copy]) => (
                <div key={title} className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
                  <p className="text-sm font-black text-white">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-white/46">{copy}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <AnimatePresence>
        {calendarModalCar && (
          <motion.div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-xl" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
            <motion.div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-3xl border border-white/10 bg-[#0d0d0c] p-6 shadow-2xl" initial={{ y:16, scale:0.98 }} animate={{ y:0, scale:1 }} exit={{ y:12, scale:0.98 }}>
              <div className="flex flex-col gap-4 border-b border-white/8 pb-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-[#f8a36d]" />
                    <h3 className="text-xl font-black text-white">Booking Calendar</h3>
                  </div>
                  <p className="mt-2 text-sm text-white/46">{calendarModalCar.name} · {calendarModalCar.licensePlate ?? 'No plate'} · {calendarModalCar.status}</p>
                  <p className="mt-1 text-xs text-white/34">Exact pickup/drop-off intervals include the {settings.cleaningBufferMinutes ?? 120} minute turnaround buffer.</p>
                </div>
                <button onClick={() => setCalendarModalCar(null)} className="icon-btn self-start"><X className="h-4 w-4" /></button>
              </div>
              {calendarStatus && <p className="mt-4 rounded-xl border border-[#f8a36d]/20 bg-[#f8a36d]/10 px-4 py-3 text-sm font-semibold text-[#f8a36d]">{calendarStatus}</p>}
              <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <button onClick={() => setCalendarCursor(prev => addMonths(prev, -1))} className="btn-muted">Previous</button>
                    <p className="text-sm font-black text-white">{monthLabel(calendarCursor)} - {monthLabel(addMonths(calendarCursor, 1))}</p>
                    <button onClick={() => setCalendarCursor(prev => addMonths(prev, 1))} className="btn-muted">Next</button>
                  </div>
                  <div className="grid gap-5 lg:grid-cols-2">
                    {calendarMonths.map(month => (
                      <div key={month.toISOString()}>
                        <p className="mb-3 text-sm font-black text-white">{monthLabel(month)}</p>
                        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase tracking-[0.12em] text-white/28">
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day}>{day.slice(0, 2)}</div>)}
                        </div>
                        <div className="mt-2 grid grid-cols-7 gap-y-2">
                          {monthDays(month).map(day => {
                            const dayBookings = activeCalendarBookings.filter(booking => bookingTouchesDay(booking, day))
                            const primary = dayBookings[0]
                            const pos = primary ? bookingRangePosition(primary, day) : null
                            return (
                              <div key={day.toISOString()} title={primary ? `${primary.customerName}: ${fmtDateTime(primary.pickupAt)} → ${fmtDateTime(bookingEnd(primary))}${primary.bufferUntil ? ` · buffer until ${fmtDateTime(primary.bufferUntil)}` : ''}` : 'Free'} className={`relative min-h-14 border-y border-white/8 bg-black/18 p-1.5 ${dayBookings.length ? 'border-[#f8a36d]/30 bg-[#f8a36d]/10 text-[#f8a36d]' : 'text-white/60'} ${pos?.starts ? 'rounded-l-xl border-l' : ''} ${pos?.ends ? 'rounded-r-xl border-r' : ''}`}>
                                <div className="relative z-10 text-xs font-bold">{day.getDate()}</div>
                                {primary && <div className="absolute inset-1 rounded-lg bg-[linear-gradient(135deg,transparent_45%,rgba(248,163,109,0.4)_46%,rgba(248,163,109,0.4)_54%,transparent_55%)] bg-[length:8px_8px]" />}
                                {dayBookings.length > 1 && <span className="absolute bottom-1 right-1 z-10 rounded-full bg-black/35 px-1 text-[9px] font-bold text-white/70">+{dayBookings.length - 1}</span>}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4">
                  <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
                    <h4 className="text-sm font-black text-white">Booked intervals</h4>
                    <div className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1">
                      {activeCalendarBookings.length === 0 ? (
                        <p className="text-sm text-white/42">No bookings for this car.</p>
                      ) : activeCalendarBookings.map(booking => (
                        <div key={booking.id} className="rounded-xl border border-white/8 bg-black/20 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-black text-white">{booking.customerName}</p>
                            <RentalStatusBadge status={booking.status} />
                          </div>
                          <p className="mt-2 text-xs leading-5 text-white/48">Booked: {fmtDateTime(booking.pickupAt)} → {fmtDateTime(booking.dropoffAt ?? booking.returnAt)}</p>
                          <p className="text-xs leading-5 text-[#f8a36d]">Buffer until {fmtDateTime(booking.bufferUntil)}</p>
                          <p className="mt-2 text-xs text-white/36">{booking.customerPhone ?? 'No phone'} · {booking.pickupLocation ?? 'Pickup'} → {booking.dropoffLocation ?? 'Drop-off'}</p>
                        </div>
                      ))}
                      {nonBlockingCalendarBookings.length > 0 && (
                        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                          <p className="text-xs font-black uppercase tracking-[0.14em] text-white/38">Past / cancelled bookings</p>
                          <div className="mt-3 space-y-2">
                            {nonBlockingCalendarBookings.map(booking => (
                              <div key={booking.id} className="rounded-lg border border-white/8 bg-black/15 p-2 text-xs text-white/44">
                                <div className="flex items-center justify-between gap-3">
                                  <span>{booking.customerName}</span>
                                  <span className="font-bold capitalize">{booking.status} — does not block availability</span>
                                </div>
                                <p className="mt-1">{fmtDateTime(booking.pickupAt)} → {fmtDateTime(booking.dropoffAt ?? booking.returnAt)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
                    <h4 className="text-sm font-black text-white">Add manual booking</h4>
                    <div className="mt-3 grid gap-2">
                      <input placeholder="Customer name" value={bookingForm.customerName} onChange={e => setBookingForm(prev => ({ ...prev, customerName: e.target.value }))} className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none" />
                      <input placeholder="Phone" value={bookingForm.phone} onChange={e => setBookingForm(prev => ({ ...prev, phone: e.target.value }))} className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none" />
                      <input type="datetime-local" value={bookingForm.pickupDateTime} onChange={e => setBookingForm(prev => ({ ...prev, pickupDateTime: e.target.value }))} className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none" />
                      <input type="datetime-local" value={bookingForm.returnDateTime} onChange={e => setBookingForm(prev => ({ ...prev, returnDateTime: e.target.value }))} className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none" />
                    </div>
                    <button onClick={() => void createCalendarBooking(calendarModalCar)} className="btn-primary mt-3"><CalendarPlus className="h-4 w-4" />Add booking</button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {carModalOpen && (
          <motion.div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-xl" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
            <motion.div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-[#0d0d0c] p-6 shadow-2xl" initial={{ y:16, scale:0.98 }} animate={{ y:0, scale:1 }} exit={{ y:12, scale:0.98 }}>
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-lg font-black text-white">{carForm.id ? 'Edit car' : 'Add car'}</h3>
                <button onClick={() => setCarModalOpen(false)} className="icon-btn"><X className="h-4 w-4" /></button>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <select value={carForm.make} onChange={e => {
                  const make = e.target.value
                  const model = RENTAL_MODELS_BY_MAKE[make]?.[0] ?? ''
                  setCarForm(prev => ({ ...prev, make, model, name: `${make} ${model}`.trim() }))
                }} className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55">
                  {RENTAL_MAKES.map(make => <option key={make}>{make}</option>)}
                </select>
                <select value={carForm.model} onChange={e => setCarForm(prev => ({ ...prev, model: e.target.value, name: `${prev.make} ${e.target.value}`.trim() }))} className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55">
                  {(RENTAL_MODELS_BY_MAKE[carForm.make] ?? []).map(model => <option key={model}>{model}</option>)}
                </select>
                <input value={carForm.name} onChange={e => setCarForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Car name/model" className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
                <select value={carForm.className} onChange={e => setCarForm(prev => ({ ...prev, className: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55">
                  {RENTAL_CLASSES.map(value => <option key={value}>{value}</option>)}
                </select>
                <select value={carForm.transmission} onChange={e => setCarForm(prev => ({ ...prev, transmission: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55">
                  {RENTAL_TRANSMISSIONS.map(value => <option key={value}>{value}</option>)}
                </select>
                <select value={carForm.fuelType} onChange={e => setCarForm(prev => ({ ...prev, fuelType: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55">
                  {RENTAL_FUEL_TYPES.map(value => <option key={value}>{value}</option>)}
                </select>
                <input value={carForm.seats} onChange={e => setCarForm(prev => ({ ...prev, seats: e.target.value }))} placeholder="Seats" type="number" className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
                <input value={carForm.dailyPrice} onChange={e => setCarForm(prev => ({ ...prev, dailyPrice: e.target.value }))} placeholder="Daily price" type="number" className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
                <input value={carForm.deposit} onChange={e => setCarForm(prev => ({ ...prev, deposit: e.target.value }))} placeholder="Deposit" type="number" className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
                <input value={carForm.licensePlate} onChange={e => setCarForm(prev => ({ ...prev, licensePlate: e.target.value }))} placeholder="License plate" className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
                <select value={carForm.locationName} onChange={e => setCarForm(prev => ({ ...prev, locationName: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55">
                  <option value="">No base location</option>
                  {locations.map(location => <option key={location.id} value={location.name}>{location.name}</option>)}
                </select>
                <select value={carForm.status} onChange={e => setCarForm(prev => ({ ...prev, status: e.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55">
                  {RENTAL_CAR_STATUSES.map(value => <option key={value}>{value}</option>)}
                </select>
                <input value={carForm.imageUrl} onChange={e => setCarForm(prev => ({ ...prev, imageUrl: e.target.value }))} placeholder="Image URL/upload placeholder" className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55 md:col-span-2" />
                <label className="flex h-11 items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-3 text-sm font-semibold text-white/60"><input type="checkbox" checked={carForm.active} onChange={e => setCarForm(prev => ({ ...prev, active: e.target.checked }))} />Active</label>
                <textarea value={carForm.notes} onChange={e => setCarForm(prev => ({ ...prev, notes: e.target.value }))} placeholder="Notes" rows={3} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none focus:border-[#f8a36d]/55 md:col-span-3" />
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <button onClick={() => setCarModalOpen(false)} className="btn-muted">Cancel</button>
                <button onClick={() => void saveCarForm()} className="btn-primary">Save car</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {locationModalOpen && (
          <motion.div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-xl" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
            <motion.div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-[#0d0d0c] p-6 shadow-2xl" initial={{ y:16, scale:0.98 }} animate={{ y:0, scale:1 }} exit={{ y:12, scale:0.98 }}>
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-lg font-black text-white">{locationForm.id ? 'Edit location' : 'Add location'}</h3>
                <button onClick={() => setLocationModalOpen(false)} className="icon-btn"><X className="h-4 w-4" /></button>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <select value={locationForm.locationType} onChange={e => setLocationForm(prev => ({ ...prev, locationType: e.target.value as RentalLocationForm['locationType'] }))} className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55">
                  <option value="pickup">Pickup</option>
                  <option value="dropoff">Drop-off</option>
                  <option value="both">Both</option>
                </select>
                <input value={locationForm.name} onChange={e => setLocationForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Location name" className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
                <input value={locationForm.address} onChange={e => setLocationForm(prev => ({ ...prev, address: e.target.value }))} placeholder="Address" className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
                <input value={locationForm.googleMapsLink} onChange={e => setLocationForm(prev => ({ ...prev, googleMapsLink: e.target.value }))} placeholder="Google Maps link" className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55 md:col-span-3" />
                <input value={locationForm.latitude} onChange={e => setLocationForm(prev => ({ ...prev, latitude: e.target.value }))} placeholder="Latitude optional" className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
                <input value={locationForm.longitude} onChange={e => setLocationForm(prev => ({ ...prev, longitude: e.target.value }))} placeholder="Longitude optional" className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#f8a36d]/55" />
                <label className="flex h-11 items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-3 text-sm font-semibold text-white/60"><input type="checkbox" checked={locationForm.active} onChange={e => setLocationForm(prev => ({ ...prev, active: e.target.checked }))} />Active</label>
                <textarea value={locationForm.terminalInstructions} onChange={e => setLocationForm(prev => ({ ...prev, terminalInstructions: e.target.value }))} placeholder="Airport terminal instructions" rows={3} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none focus:border-[#f8a36d]/55 md:col-span-3" />
                <textarea value={locationForm.pickupInstructionText} onChange={e => setLocationForm(prev => ({ ...prev, pickupInstructionText: e.target.value }))} placeholder="Pickup instruction text" rows={3} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none focus:border-[#f8a36d]/55 md:col-span-3" />
                <textarea value={locationForm.dropoffInstructionText} onChange={e => setLocationForm(prev => ({ ...prev, dropoffInstructionText: e.target.value }))} placeholder="Drop-off instruction text" rows={3} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none focus:border-[#f8a36d]/55 md:col-span-3" />
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <button onClick={() => setLocationModalOpen(false)} className="btn-muted">Cancel</button>
                <button onClick={() => void saveLocationForm()} className="btn-primary">Save location</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Hash persistence helpers ───────────────────────────────── */

const VALID_SECTIONS = new Set<string>([
  'overview','analytics','pipeline','bots','live_chat','deploy','integrations','activity','appointments','rental_ops','log','team','automation','settings',
  'ai_overview','ai_instructions','ai_knowledge','ai_qualification','ai_test',
])

function getInitialSectionFromHash(): Section {
  const h = window.location.hash.slice(1)
  return VALID_SECTIONS.has(h) ? (h as Section) : 'overview'
}

/* ─── Main ───────────────────────────────────────────────────── */

export default function ClientDashboard({
  initialData,
  initialUser,
  businessId: businessIdProp,
  supabaseUser,
  businessName: businessNameProp,
}: {
  initialData?:    DashboardData
  initialUser?:    { id: string; name: string; role: string } | null
  businessId?:     string
  supabaseUser?:   { id: string; name: string; role: string } | null
  businessName?:   string
}) {
  // null = hash not yet read (SSR / before first layout effect).
  // useLayoutEffect sets the real value synchronously before the browser paints,
  // so the sidebar and content both render the correct tab on the very first frame.
  const [section,        setSection]        = useState<Section | null>(null)
  const [sidebarOpen,    setSidebarOpen]    = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [notifs,         setNotifs]         = useState<Notification[]>([])   // filled by realtime only
  const [toasts,         setToasts]         = useState<ToastItem[]>([])
  const [soundEnabled,   setSoundEnabled]   = useState(false)
  const dashboardBusinessId = businessIdProp ?? '0616a47a-2c01-49ce-a798-385f8276b92b'

  // Refs so realtime callbacks (closed over stale state) always see current values
  const soundEnabledRef     = useRef(false)
  soundEnabledRef.current   = soundEnabled
  const hintShownRef        = useRef(false)
  const scrollContainerRef  = useRef<HTMLDivElement>(null)

  // ── Live state (seeded from SSR, then kept fresh by Supabase Realtime)
  const [leads, setLeads] = useState<Lead[]>(() =>
    [...(initialData?.leads ?? [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  )
  const [appointments,setAppointments]= useState<Appointment[]>(initialData?.appointments   ?? [])
  const [activityFeed,setActivityFeed]= useState<ActivityItem[]>(initialData?.activity      ?? [])

  // Static / analytics (not realtime — refreshed on page load)
  const analytics        = initialData?.analytics?.length    ? initialData.analytics    : undefined
  const integrations     = initialData?.integrations                                   ?? []
  const analyticsSummary = initialData?.analyticsSummary
  const overviewMetrics  = initialData?.overviewMetrics
  const liveAnalytics    = initialData?.liveAnalytics

  // ── Bot workspace state ──────────────────────────────────────
  const [bots, setBots] = useState<DashboardBot[]>([])
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null)

  const refreshBots = useCallback(async () => {
    try {
      const res = await fetch('/api/bots')
      const data = await res.json() as { bots?: DashboardBot[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to load bots')
      const list = Array.isArray(data.bots) ? data.bots : []
      setBots(list)
      setSelectedBotId(prev => {
        if (prev && list.some(bot => bot.id === prev)) return prev
        return list.find(bot => bot.is_default_website_bot)?.id ?? list[0]?.id ?? null
      })
    } catch {
      setBots([])
    }
  }, [])

  useEffect(() => { void refreshBots() }, [refreshBots])

  const createBot = useCallback(async (input: { name: string; business_type: string; model: string; tone: string }) => {
    const res = await fetch('/api/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const data = await res.json() as { bot?: DashboardBot; error?: string }
    if (!res.ok || !data.bot) throw new Error(data.error ?? 'Failed to create bot')
    setBots(prev => [...prev, data.bot!])
    setSelectedBotId(data.bot.id)
  }, [])

  const setDefaultWebsiteBot = useCallback(async (botId: string) => {
    const res = await fetch('/api/bots', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_id: botId, default_website_bot: true }),
    })
    const data = await res.json() as { bot?: DashboardBot; error?: string }
    if (!res.ok || !data.bot) {
      setToasts(prev => [{
        id: crypto.randomUUID(),
        type: 'hint' as const,
        title: 'Default bot not updated',
        sub: data.error ?? 'Failed to set website default bot',
        badge: 'Error',
        badgeColor: '#f87171',
        duration: 5000,
      }, ...prev.slice(0, 3)])
      return
    }
    setBots(prev => prev.map(bot => ({ ...bot, is_default_website_bot: bot.id === data.bot!.id })))
    setSelectedBotId(data.bot.id)
    setToasts(prev => [{
      id: crypto.randomUUID(),
      type: 'hint' as const,
      title: 'Website default updated',
      sub: `${data.bot!.name} is now the default website bot.`,
      badge: 'Done',
      badgeColor: '#34d399',
      duration: 3500,
    }, ...prev.slice(0, 3)])
  }, [])

  // ── Team members ──────────────────────────────────────────────
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])

  const fetchTeamMembers = useCallback(async () => {
    try {
      const res  = await fetch('/api/team')
      const data = await res.json() as { members?: TeamMember[] }
      setTeamMembers(data.members ?? [])
    } catch { /* silently ignore — team feature is optional */ }
  }, [])

  useEffect(() => { void fetchTeamMembers() }, [fetchTeamMembers])

  // ── Current user / role-based permissions ──────────────────────
  // Priority: member_session (team member) > supabaseUser (owner) > demo localStorage
  const hasRealSession = !!(initialUser ?? supabaseUser)

  const [currentUser, setCurrentUser] = useState<CurrentUser>(
    initialUser
      ? { name: initialUser.name, role: initialUser.role as Role }
      : supabaseUser
        ? { name: supabaseUser.name, role: supabaseUser.role as Role }
        : DEMO_OWNER
  )

  useEffect(() => {
    if (hasRealSession) return  // real session wins over localStorage
    try {
      const stored = localStorage.getItem('demo_current_user')
      if (stored) setCurrentUser(JSON.parse(stored) as CurrentUser)
    } catch { /* ignore */ }
  }, [hasRealSession])

  const handleUserChange = useCallback((u: CurrentUser) => {
    setCurrentUser(u)
    localStorage.setItem('demo_current_user', JSON.stringify(u))
  }, [])

  const can = useMemo(() => getPermissions(currentUser.role), [currentUser.role])

  // Scope visible leads to assigned agent when role requires it
  const visibleLeads = useMemo(
    () => can.scopedToOwnLeads
      ? leads.filter(l => l.assignedAgent === currentUser.name)
      : leads,
    [leads, can.scopedToOwnLeads, currentUser.name],
  )

  // Tracks IDs of leads that just arrived via realtime (cleared after 4 s)
  const [newLeadIds, setNewLeadIds] = useState<Set<string>>(new Set())

  const selectedLead     = useMemo(() => leads.find(l => l.id === selectedLeadId) ?? null, [leads, selectedLeadId])
  const handleSelectLead = useCallback((id: string) => setSelectedLeadId(id), [])

  // ── CRM mutation callbacks ────────────────────────────────────
  const handleLeadDeleted = useCallback((id: string) => {
    setLeads(prev => prev.filter(l => l.id !== id))
    setAppointments(prev => prev.filter(a => a.leadId !== id))
    setSelectedLeadId(null)
  }, [])

  const handleLeadUpdated = useCallback((patch: { id:string; name:string; company:string; email?:string; phone?:string; source:string; score:number }) => {
    setLeads(prev => prev.map(l => l.id === patch.id ? { ...l, ...patch } : l))
  }, [])

  const handleApptDeleted = useCallback((apptId: string) => {
    setAppointments(prev => prev.filter(a => a.id !== apptId))
  }, [])

  const handleApptUpdated = useCallback((patch: { id:string; type:string; date:string; time:string; status:ApptStatus; notes?:string; leadId?:string }) => {
    setAppointments(prev => prev.map(a => {
      if (a.id !== patch.id) return a
      const dt = new Date(`${patch.date}T${patch.time}`)
      return { ...a, type:patch.type, date:patch.date, time:patch.time, status:patch.status, notes:patch.notes, upcoming:dt > new Date() }
    }))
  }, [])

  // ── Manual create callbacks (optimistic — dedup guards in Realtime handlers)
  const [showAddLead,          setShowAddLead]          = useState(false)
  const [showAddAppt,          setShowAddAppt]          = useState(false)
  const [addApptDefaultLeadId, setAddApptDefaultLeadId] = useState<string | undefined>()

  const handleLeadCreated = useCallback((raw: Record<string, unknown>) => {
    const lead = mapLeadRow(raw as unknown as RawLeadRow)
    setLeads(prev => [lead, ...prev])
    setNewLeadIds(prev => new Set([...prev, lead.id]))
    setTimeout(() => setNewLeadIds(prev => { const s = new Set(prev); s.delete(lead.id); return s }), 4000)
  }, [])

  const handleApptCreated = useCallback((raw: Record<string, unknown>) => {
    const appt = mapAppointmentRow(raw as unknown as RawAppointmentRow)
    setAppointments(prev => prev.some(a => a.id === appt.id) ? prev : [appt, ...prev])
  }, [])

  // Re-fetch ALL leads and replace local state (used after Test AI creates a lead).
  const refreshLeads = useCallback(async () => {
    try {
      const res  = await fetch('/api/leads')
      const data = await res.json() as { leads?: RawLeadRow[] }
      if (!Array.isArray(data.leads)) return
      const mapped = data.leads.flatMap((r: RawLeadRow) => {
        try { return [mapLeadRow(r)] }
        catch { return [] }
      })
      setLeads(mapped.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()))
    } catch { /* silent */ }
  }, [])

  // Called by Test AI when a new lead is created — refreshes state AND shows toast/ring
  // so the notification fires even when Supabase Realtime doesn't deliver the INSERT.
  const handleTestAILeadCreated = useCallback(async (leadId: string) => {
    try {
      const res  = await fetch('/api/leads')
      const data = await res.json() as { leads?: RawLeadRow[] }
      if (!Array.isArray(data.leads)) return
      const mapped = data.leads.flatMap((r: RawLeadRow) => {
        try { return [mapLeadRow(r)] } catch { return [] }
      })
      setLeads(mapped.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()))

      const lead = mapped.find(l => l.id === leadId)
      if (!lead) return

      // Guard: skip if Realtime already showed a lead toast for this lead.
      // Must also check t.type so an appointment toast with the same leadId
      // does not suppress the lead toast (race condition on production).
      setToasts(prev => {
        if (prev.some(t => t.leadId === leadId && t.type === 'lead')) return prev
        const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
        const badgeColor = lead.scoreLabel === 'hot' ? '#f87171'
          : lead.scoreLabel === 'warm' ? '#fb923c' : '#948f88'
        return [{
          id: crypto.randomUUID(), type: 'lead' as const,
          title:      lead.name || 'New Lead',
          sub:        `AI Agent · Website Chat · Score ${lead.score}`,
          badge:      cap(lead.scoreLabel),
          badgeColor,
          leadId:     lead.id,
        }, ...prev.slice(0, 3)]
      })
      setNewLeadIds(prev => new Set([...prev, lead.id]))
      setTimeout(() => setNewLeadIds(prev => { const s = new Set(prev); s.delete(lead.id); return s }), 4000)
      if (soundEnabledRef.current) void playChime('lead alert')
    } catch { /* silent */ }
  }, [])

  // Called by Test AI when a new appointment is created — mirrors handleTestAILeadCreated.
  // Shows toast + ring even when Supabase Realtime doesn't deliver the INSERT.
  const handleTestAIApptCreated = useCallback(async (apptId: string) => {
    try {
      const res  = await fetch('/api/appointments')
      const data = await res.json() as { appointments?: RawAppointmentRow[] }
      if (!Array.isArray(data.appointments)) return
      const mapped = data.appointments.flatMap(r => {
        try { return [mapAppointmentRow(r)] } catch { return [] }
      })
      setAppointments(mapped)

      const appt = mapped.find(a => a.id === apptId)
      if (!appt) return

      // Guard: skip if Realtime already showed a toast for this appointment
      setToasts(prev => {
        if (prev.some(t => t.leadId === appt.leadId && t.type === 'appointment')) return prev
        return [{
          id:         crypto.randomUUID(),
          type:       'appointment' as const,
          title:      'Appointment booked',
          sub:        `${appt.name} · ${appt.type} · ${appt.date} at ${appt.time}`,
          badge:      appt.status.charAt(0).toUpperCase() + appt.status.slice(1),
          badgeColor: '#34d399',
          leadId:     appt.leadId,
        }, ...prev.slice(0, 3)]
      })
      setActivityFeed(prev => [{
        id:   `live-appt-${appt.id}`,
        type: 'appointment' as ActivityType,
        text: `Appointment booked — ${appt.name}`,
        sub:  `${appt.type} · ${appt.date} at ${appt.time}`,
        time: 'Just now',
        live: true,
      }, ...prev.map(i => ({ ...i, live: false })).slice(0, 14)])
      setNotifs(prev => [{
        id:   crypto.randomUUID(),
        type: 'booking' as NotifType,
        text: `Appointment booked — ${appt.name}`,
        sub:  `${appt.type} · ${appt.date} at ${appt.time}`,
        read: false,
        time: 'Just now',
      }, ...prev.slice(0, 19)])
      if (soundEnabledRef.current) void playChime('appointment alert')
      sendBrowserNotif('Appointment booked', `${appt.name} · ${appt.type} · ${appt.date} at ${appt.time}`)
    } catch { /* silent */ }
  }, [])

  // Re-fetch ALL appointments for the session from the server.
  // Replaces local state with the authoritative DB view.
  // Called: on section change to 'appointments', on window focus, and after realtime events
  // as a safety net for when the table is not in the Supabase realtime publication.
  const refreshAppointments = useCallback(async () => {
    try {
      const res  = await fetch('/api/appointments')
      const data = await res.json() as { appointments?: RawAppointmentRow[] }
      if (!Array.isArray(data.appointments)) return
      const mapped = data.appointments.flatMap(r => {
        try { return [mapAppointmentRow(r)] }
        catch { return [] }
      })
      setAppointments(mapped)
    } catch { /* silent — stale state is acceptable */ }
  }, [])

  // Re-fetch when the appointments tab is opened so it's always fresh.
  useEffect(() => {
    if (section === 'appointments') void refreshAppointments()
  }, [section, refreshAppointments])

  // Re-fetch when the browser tab regains focus — catches appointments created
  // by the chat widget or any other server-side process while the user was away.
  useEffect(() => {
    const onFocus = () => void refreshAppointments()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshAppointments])

  const openAddAppt = useCallback((defaultLeadId?: string) => {
    setAddApptDefaultLeadId(defaultLeadId)
    setShowAddAppt(true)
  }, [])

  // section is null pre-mount; fall back to 'overview' only for the meta title
  const meta             = SECTION_META[section ?? 'overview']

  // Dynamic nav badges driven by live state
  const navBadges = useMemo<Partial<Record<Section, number>>>(() => ({
    pipeline:     leads.length,
    appointments: appointments.filter(a => a.upcoming).length || undefined,
  }), [leads, appointments])

  // ── Sound: restore from localStorage on mount ─────────────────
  useEffect(() => {
    const stored = localStorage.getItem('sound_alerts') === 'true'
    setSoundEnabled(stored)
    soundEnabledRef.current = stored
  }, [])

  const handleEnableSound = useCallback(() => {
    // Synchronous unlock — no await — required for Safari gesture acceptance
    unlockAudioSync()
    setSoundEnabled(true)
    soundEnabledRef.current = true
    localStorage.setItem('sound_alerts', 'true')
    void playChime('confirmation')
  }, [])

  const handleDisableSound = useCallback(() => {
    setSoundEnabled(false)
    soundEnabledRef.current = false
    localStorage.setItem('sound_alerts', 'false')
    console.log('[SOUND] disabled')
  }, [])

  const openLiveChatSettings = useCallback((target?: EventTarget | null) => {
    const rect = target instanceof HTMLElement ? target.getBoundingClientRect() : null
    window.dispatchEvent(new CustomEvent('instantdesk-live-chat-settings', { detail: rect ? {
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
    } : null }))
  }, [])

  const openLiveChatAnalytics = useCallback((target?: EventTarget | null) => {
    const rect = target instanceof HTMLElement ? target.getBoundingClientRect() : null
    window.dispatchEvent(new CustomEvent('instantdesk-live-chat-analytics', { detail: rect ? {
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
    } : null }))
  }, [])

  // ── Global gesture listener — unlock AudioContext on ANY interaction ──
  // Safari requires ctx.resume() to be called synchronously within a gesture.
  // Attaching to document catches every click/touch/keydown so the context
  // is ready the moment the user first interacts, before they hit "Enable sound".
  useEffect(() => {
    const handler = () => unlockAudioSync()
    document.addEventListener('click',      handler, { passive: true })
    document.addEventListener('touchstart', handler, { passive: true })
    document.addEventListener('keydown',    handler, { passive: true })
    return () => {
      document.removeEventListener('click',      handler)
      document.removeEventListener('touchstart', handler)
      document.removeEventListener('keydown',    handler)
    }
  }, [])

  // ── Supabase Realtime subscriptions ──────────────────────────
  useEffect(() => {
    const BUSINESS_ID = dashboardBusinessId

    // ── Dedicated leads channel — isolated so other broken subscriptions
    //    cannot poison this channel and prevent lead events from arriving.
    //    Server-side filter: only events for this business_id reach the client.
    //    Requires: ALTER PUBLICATION supabase_realtime ADD TABLE leads;
    const leadsChannel = supabase
      .channel('leads-live')

      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads' },
        (payload) => {
          const row = payload.new as RawLeadRow
          if (!row.business_id || row.business_id !== BUSINESS_ID) return
          console.log('[Realtime] leads INSERT received:', payload.new)
          const lead = mapLeadRow(row)
          // Guard against duplicate if optimistic update already added this lead
          setLeads(prev => prev.some(l => l.id === lead.id) ? prev : [lead, ...prev])
          setNewLeadIds(prev => new Set([...prev, lead.id]))
          setTimeout(() => setNewLeadIds(prev => { const s = new Set(prev); s.delete(lead.id); return s }), 4000)
          setActivityFeed(prev => [{
            id:   `live-lead-${lead.id}`,
            type: 'sms' as ActivityType,
            text: `New lead — ${lead.name}`,
            sub:  `${lead.source} · AI chat`,
            time: 'Just now',
            live: true,
          }, ...prev.map(i => ({ ...i, live: false })).slice(0, 14)])

          const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
          const badgeColor = lead.scoreLabel === 'hot' ? '#f87171' : lead.scoreLabel === 'warm' ? '#fb923c' : '#948f88'

          setToasts(prev => [{
            id:         crypto.randomUUID(),
            type:       'lead',
            title:      lead.name,
            sub:        `${lead.source} · ${lead.company || 'No company'} · Score ${lead.score}`,
            badge:      cap(lead.scoreLabel),
            badgeColor,
            leadId:     lead.id,
          }, ...prev.slice(0, 3)])

          setNotifs(prev => [{
            id:   crypto.randomUUID(),
            type: 'lead' as NotifType,
            text: `New lead — ${lead.name}`,
            sub:  `${lead.source} · ${lead.company || ''} · Just now`,
            read: false,
            time: 'Just now',
          }, ...prev.slice(0, 19)])

          if (soundEnabledRef.current) {
            playChime('lead alert')
          } else {
            console.log('[SOUND] blocked — sound alerts not enabled')
            if (!hintShownRef.current) {
              hintShownRef.current = true
              setToasts(prev => [{
                id:         crypto.randomUUID(),
                type:       'hint' as const,
                title:      'Enable sound alerts',
                sub:        'Click "Enable sound" in the header to hear live notifications',
                badge:      'Tip',
                badgeColor: '#fbbf24',
                duration:   8000,
              }, ...prev.slice(0, 3)])
            }
          }

          sendBrowserNotif(
            `New lead — ${lead.name}`,
            `${lead.source} · ${cap(lead.scoreLabel)} · Score ${lead.score}`,
          )
        }
      )

      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leads' },
        (payload) => {
          const row = payload.new as RawLeadRow
          if (!row.business_id || row.business_id !== BUSINESS_ID) return
          console.log('[Realtime] leads UPDATE received:', payload.new)
          const updated = mapLeadRow(row)
          setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
        }
      )

      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'leads' },
        (payload) => {
          const old = payload.old as { id?: string; business_id?: string }
          if (!old?.id) return
          if (old.business_id && old.business_id !== BUSINESS_ID) return
          console.log('[Realtime] leads DELETE received:', old.id)
          setLeads(prev => prev.filter(l => l.id !== old.id))
          setAppointments(prev => prev.filter(a => a.leadId !== old.id))
        }
      )

      .subscribe((status, err) => {
        console.log('[Realtime] leads-live channel status:', status, err ?? '')
      })

    // ── Dedicated appointments channel — server-side filter so only this
    //    business's rows are delivered. Requires the appointments table to be
    //    in the supabase_realtime publication:
    //      ALTER PUBLICATION supabase_realtime ADD TABLE appointments;
    //    If the table is NOT in the publication this channel gets no events but
    //    does not error — the refreshAppointments() fallback handles that case.
    const appointmentsChannel = supabase
      .channel('appointments-live')

      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'appointments', filter: `business_id=eq.${BUSINESS_ID}` },
        (payload) => {
          console.log('[Realtime] appointments INSERT received:', payload.new)
          const row  = payload.new as RawAppointmentRow
          const appt = mapAppointmentRow(row)
          setAppointments(prev => prev.some(a => a.id === appt.id) ? prev : [...prev, appt])
          setActivityFeed(prev => [{
            id:   `live-appt-${appt.id}`,
            type: 'appointment' as ActivityType,
            text: `Appointment booked — ${appt.name}`,
            sub:  `${appt.type} · ${appt.date} at ${appt.time}`,
            time: 'Just now',
            live: true,
          }, ...prev.map(i => ({ ...i, live: false })).slice(0, 14)])

          setToasts(prev => [{
            id:         crypto.randomUUID(),
            type:       'appointment',
            title:      'Appointment booked',
            sub:        `${appt.name} · ${appt.type} · ${appt.date} at ${appt.time}`,
            badge:      appt.status.charAt(0).toUpperCase() + appt.status.slice(1),
            badgeColor: '#34d399',
            leadId:     appt.leadId,
          }, ...prev.slice(0, 3)])

          setNotifs(prev => [{
            id:   crypto.randomUUID(),
            type: 'booking' as NotifType,
            text: `Appointment booked — ${appt.name}`,
            sub:  `${appt.type} · ${appt.date} at ${appt.time}`,
            read: false,
            time: 'Just now',
          }, ...prev.slice(0, 19)])

          if (soundEnabledRef.current) playChime('appointment alert')
          sendBrowserNotif('Appointment booked', `${appt.name} · ${appt.type} · ${appt.date} at ${appt.time}`)
        }
      )

      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'appointments', filter: `business_id=eq.${BUSINESS_ID}` },
        (payload) => {
          const updated = mapAppointmentRow(payload.new as RawAppointmentRow)
          setAppointments(prev => prev.map(a => a.id === updated.id ? updated : a))
        }
      )

      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'appointments' },
        (payload) => {
          const id = (payload.old as { id?: string })?.id
          if (id) setAppointments(prev => prev.filter(a => a.id !== id))
        }
      )

      .subscribe((status, err) => {
        console.log('[Realtime] appointments-live channel status:', status, err ?? '')
        // If the channel cannot connect (table not in publication or RLS blocks),
        // fall back to a one-time re-fetch so the state is at least up-to-date.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Realtime] appointments-live degraded — falling back to fetch')
          void refreshAppointments()
        }
      })

    // ── Secondary channel for activity feed, messages, conversations.
    //    No server-side filters — client-side business_id check instead.
    const channel = supabase
      .channel('dashboard-live')

      // ── activity_events: INSERT → prepend to feed
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_events' },
        (payload) => {
          const row = payload.new as RawActivityRow
          if (row.business_id && row.business_id !== BUSINESS_ID) return
          const item: ActivityItem = { ...mapActivityRow(row), live: true }
          setActivityFeed(prev => [item, ...prev.map(i => ({ ...i, live: false })).slice(0, 14)])
        }
      )

      // ── messages: INSERT (assistant role) → live activity feed entry
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const row = payload.new as { id?: string; business_id?: string; role?: string; content?: string; created_at?: string }
          if (row.business_id && row.business_id !== BUSINESS_ID) return
          if (row.role !== 'assistant') return
          const content = row.content ?? ''
          const item: ActivityItem = {
            id:   `msg-${row.id ?? crypto.randomUUID()}`,
            type: 'chat',
            text: 'AI replied',
            sub:  content.length > 80 ? content.slice(0, 77) + '…' : content,
            time: 'Just now',
            live: true,
          }
          setActivityFeed(prev => [item, ...prev.map(i => ({ ...i, live: false })).slice(0, 29)])
        }
      )

      // ── conversations: INSERT → live activity entry
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations' },
        (payload) => {
          const row = payload.new as { id?: string; business_id?: string; channel?: string; created_at?: string }
          if (row.business_id && row.business_id !== BUSINESS_ID) return
          const item: ActivityItem = {
            id:   `conv-${row.id ?? crypto.randomUUID()}`,
            type: 'chat',
            text: 'Conversation started',
            sub:  `${row.channel ?? 'website'} · AI Agent`,
            time: 'Just now',
            live: true,
          }
          setActivityFeed(prev => [item, ...prev.map(i => ({ ...i, live: false })).slice(0, 29)])
        }
      )

      .subscribe((status, err) => {
        console.log('[Realtime] dashboard-live channel status:', status, err ?? '')
      })

    // ── follow_ups channel: live notifications when follow-ups are sent/scheduled
    const followUpsChannel = supabase
      .channel('follow-ups-live')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'follow_ups', filter: `business_id=eq.${BUSINESS_ID}` },
        (payload) => {
          const row = payload.new as {
            id?: string; business_id?: string; status?: string
            trigger_type?: string; message?: string; lead_id?: string
          }
          if (row.business_id && row.business_id !== BUSINESS_ID) return

          const triggerLabels: Record<string, string> = {
            no_reply_2h:        'No-reply 2h',
            no_reply_24h:       'No-reply 24h',
            missed_appointment: 'Missed appointment',
            viewing_tomorrow:   'Viewing reminder',
            hot_lead_followup:  'Hot lead',
          }
          const label = triggerLabels[row.trigger_type ?? ''] ?? 'Follow-up'

          if (row.status === 'sent') {
            setToasts(prev => [{
              id:         crypto.randomUUID(),
              type:       'hint' as const,
              title:      `Follow-up sent`,
              sub:        `${label} — AI message delivered`,
              badge:      'AI Follow-up',
              badgeColor: '#948f88',
              duration:   5500,
            }, ...prev.slice(0, 3)])
          }
        }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'follow_ups', filter: `business_id=eq.${BUSINESS_ID}` },
        (payload) => {
          const row = payload.new as { business_id?: string; trigger_type?: string; status?: string }
          if (row.business_id && row.business_id !== BUSINESS_ID) return
          if (row.status !== 'scheduled') return
          const triggerLabels: Record<string, string> = {
            no_reply_2h:        'No-reply 2h follow-up',
            no_reply_24h:       'No-reply 24h follow-up',
            missed_appointment: 'Missed appointment follow-up',
            viewing_tomorrow:   'Viewing reminder',
            hot_lead_followup:  'Hot lead follow-up',
          }
          const label = triggerLabels[row.trigger_type ?? ''] ?? 'Follow-up'
          const item: ActivityItem = {
            id:   `fu-${crypto.randomUUID()}`,
            type: 'chat',
            text: 'Follow-up scheduled',
            sub:  label,
            time: 'Just now',
            live: true,
          }
          setActivityFeed(prev => [item, ...prev.map(i => ({ ...i, live: false })).slice(0, 29)])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(leadsChannel)
      supabase.removeChannel(appointmentsChannel)
      supabase.removeChannel(channel)
      supabase.removeChannel(followUpsChannel)
    }
  }, [dashboardBusinessId, refreshAppointments])

  // ── Browser notification permission ──────────────────────────
  // Requested 3 s after mount so it doesn't fire immediately on load.
  useEffect(() => {
    const t = setTimeout(() => {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {})
      }
    }, 3000)
    return () => clearTimeout(t)
  }, [])

  // ── Hash-based tab persistence ────────────────────────────────
  // useLayoutEffect fires synchronously after DOM mutations but BEFORE the
  // browser paints. This is the single source of truth for the initial section.
  // The server always renders section=null (no active tab, no content), then
  // the layout effect sets the correct tab from the hash — all before first paint.
  useLayoutEffect(() => {
    setSection(getInitialSectionFromHash())
  }, [])

  // hashchange handles browser back/forward after the initial render
  useEffect(() => {
    const onHashChange = () => {
      const h = window.location.hash.slice(1)
      if (VALID_SECTIONS.has(h)) setSection(h as Section)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Navigate to a section, update the URL hash, and reset scroll position
  const handleNav = useCallback((s: Section) => {
    setSection(s)
    history.replaceState(null, '', `#${s}`)
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  // Close sidebar on larger screens
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setSidebarOpen(false) }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return (
    <div data-testid="dashboard-shell" className="dashboard-premium-bg h-screen overflow-hidden">
      <div className="flex h-full w-full overflow-hidden">
        <Sidebar
          active={section} onNav={handleNav} open={sidebarOpen} onClose={() => setSidebarOpen(false)}
          badges={navBadges}
          userName={currentUser.name}
          businessName={businessNameProp || 'My Business'}
          onLogout={async () => {
            await fetch('/api/auth/logout', { method: 'POST' })
            await fetch('/api/logout', { method: 'POST' }).catch(() => {})
            window.location.replace('/login')
          }}
        />

        <div
          ref={scrollContainerRef}
          data-testid="dashboard-content"
          className={`flex-1 w-full max-w-full overflow-x-hidden min-w-0 ${section === 'live_chat' ? 'overflow-hidden' : 'overflow-y-auto'}`}
        >
        {/* Sticky header */}
        <div className="sticky top-0 z-20 px-4 sm:px-8 py-4"
          style={{
            background:'rgba(7,8,9,0.94)',
            borderBottom:'1px solid rgba(217,133,90,0.08)',
            boxShadow:'0 10px 28px rgba(0,0,0,0.14)',
          }}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {/* Mobile hamburger */}
              <button onClick={() => setSidebarOpen(true)}
                className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center text-white/40 hover:text-white/80 flex-shrink-0"
                style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}>
                <Menu className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-black text-white tracking-tight truncate">{meta.title}</h1>
                <p className="text-xs text-white/35 mt-0.5 hidden sm:block">{meta.sub}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {section === 'live_chat' ? (
                <>
                  <button
                    type="button"
                    onClick={event => openLiveChatSettings(event.currentTarget)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white/72 transition-colors hover:text-white sm:px-3"
                    style={{ background:'rgba(255,255,255,0.045)', border:'1px solid rgba(255,255,255,0.08)' }}>
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    Live Chat Settings
                  </button>
                  <button
                    type="button"
                    onMouseEnter={event => openLiveChatAnalytics(event.currentTarget)}
                    onFocus={event => openLiveChatAnalytics(event.currentTarget)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white/72 transition-colors hover:text-white sm:px-3"
                    style={{ background:'rgba(255,255,255,0.045)', border:'1px solid rgba(255,255,255,0.08)' }}>
                    <LineChart className="w-3.5 h-3.5" />
                    Analytics
                  </button>
                </>
              ) : (
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                  style={{ background:'rgba(52,211,153,0.08)', border:'1px solid rgba(52,211,153,0.2)', color:'#34d399' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  All systems live
                </div>
              )}
              {!hasRealSession && (
                <ViewAsSelector currentUser={currentUser} teamMembers={teamMembers} onChange={handleUserChange} />
              )}
              <SoundToggle enabled={soundEnabled} onEnable={handleEnableSound} onDisable={handleDisableSound} />
              <TestSoundButton />
              <NotificationCenter notifs={notifs} setNotifs={setNotifs} />
              <button
                onClick={async () => {
                  // Sign out from Supabase Auth + clear all session cookies
                  await fetch('/api/auth/logout', { method: 'POST' })
                  // Also clear legacy member_session via old route (best-effort)
                  await fetch('/api/logout', { method: 'POST' }).catch(() => {})
                  window.location.replace('/login')
                }}
                className="flex items-center gap-1.5 text-xs text-white/25 hover:text-red-400 transition-colors px-3 py-2 rounded-lg hover:bg-red-500/8">
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Log out</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content — pb-28 clears the floating chat widget (≈80px) on every section */}
        <div className={`w-full max-w-none ${section === 'live_chat' ? 'h-[calc(100dvh-73px)] px-4 sm:px-8 py-0 pb-0 overflow-hidden' : 'px-4 sm:px-8 py-6 pb-28'}`}>
          <AnimatePresence mode="wait">
            {section && (
              <motion.div key={section}
                className={`w-full max-w-none ${section === 'live_chat' ? 'h-full min-h-0' : ''}`}
                initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}
                transition={{ duration:0.22 }}>
                {section==='overview'     && <OverviewSection onSelectLead={handleSelectLead} leads={visibleLeads} appointments={appointments} activity={activityFeed} overviewMetrics={overviewMetrics} />}
                {section==='analytics'    && <AnalyticsSection analytics={analytics} analyticsSummary={analyticsSummary} liveAnalytics={liveAnalytics} />}
                {section==='pipeline'     && <PipelineSection onSelectLead={handleSelectLead} leads={visibleLeads} newLeadIds={newLeadIds} onAddLead={can.canAddLead ? () => setShowAddLead(true) : undefined} teamMembers={teamMembers} />}
                {section==='bots'         && <BotsSection bots={bots} selectedBotId={selectedBotId} onSelectBot={setSelectedBotId} onCreateBot={createBot} onSetDefault={setDefaultWebsiteBot} onOpenSection={handleNav} />}
                {section==='live_chat'    && <LiveChatSection businessId={dashboardBusinessId} />}
                {section==='deploy'       && <DeploySection businessId={dashboardBusinessId} selectedBotId={selectedBotId} />}
                {section==='integrations' && <IntegrationsSection businessId={dashboardBusinessId} selectedBotId={selectedBotId} onOpenDeploy={() => handleNav('deploy')} />}
                {section==='activity'     && <ActivitySection feed={activityFeed} />}
                {section==='appointments' && <AppointmentsSection appointments={appointments} leads={visibleLeads} onSelectLead={handleSelectLead} onApptUpdated={handleApptUpdated} onAddAppointment={can.canAddAppt ? () => openAddAppt() : undefined} actorName={currentUser.name} />}
                {section==='rental_ops'   && <RentalOperationsSection />}
                {section==='log'          && <LogSection can={can} actorName={currentUser.name} onToast={(title, sub, ok) =>
                  setToasts(prev => [{
                    id: crypto.randomUUID(), type: 'hint' as const,
                    title, sub, badge: ok ? 'Done' : 'Error',
                    badgeColor: ok ? '#34d399' : '#f87171', duration: 4000,
                  }, ...prev.slice(0, 3)])
                } />}
                {section==='team'         && <TeamSection members={teamMembers} onRefresh={fetchTeamMembers} can={can} currentUserRole={currentUser.role} actorName={currentUser.name} onToast={(title, sub, ok) =>
                  setToasts(prev => [{
                    id: crypto.randomUUID(), type: 'hint' as const,
                    title, sub, badge: ok ? 'Done' : 'Error',
                    badgeColor: ok ? '#34d399' : '#f87171', duration: 4000,
                  }, ...prev.slice(0, 3)])
                } />}
                {section==='automation'   && <AutomationCenter can={can} />}
                {section==='settings'     && <SettingsSection />}
                {(section==='ai_overview' || section==='ai_instructions' || section==='ai_knowledge' || section==='ai_qualification' || section==='ai_test') && (
                  <AIAgentSection
                    section={section}
                    businessId={dashboardBusinessId}
                    selectedBotId={selectedBotId}
                    onLeadCreated={(leadId) => { void handleTestAILeadCreated(leadId) }}
                    onAppointmentCreated={(apptId) => { void handleTestAIApptCreated(apptId) }}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      </div>

      {/* Lead detail panel */}
      <AnimatePresence>
        {selectedLead && (
          <LeadPanel
            key={selectedLead.id}
            lead={selectedLead}
            appointments={appointments}
            onClose={() => setSelectedLeadId(null)}
            onLeadDeleted={handleLeadDeleted}
            onLeadUpdated={handleLeadUpdated}
            onApptDeleted={handleApptDeleted}
            onApptUpdated={handleApptUpdated}
            onAddAppointment={(leadId) => openAddAppt(leadId)}
            teamMembers={teamMembers}
            can={can}
            actorName={currentUser.name}
          />
        )}
      </AnimatePresence>

      {/* Add Lead / Add Appointment modals */}
      <AnimatePresence>
        {showAddLead && (
          <AddLeadModal
            onClose={() => setShowAddLead(false)}
            onCreated={handleLeadCreated}
            actorName={currentUser.name}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showAddAppt && (
          <AddAppointmentModal
            leads={visibleLeads}
            defaultLeadId={addApptDefaultLeadId}
            onClose={() => setShowAddAppt(false)}
            onCreated={handleApptCreated}
            actorName={currentUser.name}
          />
        )}
      </AnimatePresence>

      {/* Toast notifications — fixed overlay, top-right */}
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2.5 pointer-events-none"
        style={{ width: 'min(320px, calc(100vw - 2rem))' }}>
        <AnimatePresence mode="sync">
          {toasts.map(t => (
            <ToastNotification
              key={t.id}
              toast={t}
              onClose={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              onOpen={t.leadId ? () => setSelectedLeadId(t.leadId!) : undefined}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
