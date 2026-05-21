'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap, Search, X, ExternalLink, Mail, Phone, Globe,
  Users, CalendarCheck, Target, Calendar,
  ArrowLeft, Clock, CheckCircle, AlertCircle,
  BarChart2, ChevronDown, Loader2, RefreshCw,
} from 'lucide-react'
import { updateLeadStatus } from './actions'

/* ─── Types ─────────────────────────────────────────────── */

export type Status = 'new' | 'contacted' | 'demo_booked' | 'won' | 'lost'

export type Lead = {
  id: string
  fullName: string
  businessName: string
  email: string
  phone: string
  website: string
  message: string
  source: string
  submittedAt: string
  status: Status
}

/* ─── Config ─────────────────────────────────────────────── */

export const STATUS: Record<Status, { label: string; color: string; bg: string; border: string }> = {
  new:         { label: 'New',         color: '#a78bfa', bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.25)' },
  contacted:   { label: 'Contacted',   color: '#60a5fa', bg: 'rgba(96,165,250,0.10)',  border: 'rgba(96,165,250,0.25)'  },
  demo_booked: { label: 'Demo Booked', color: '#fbbf24', bg: 'rgba(251,191,36,0.10)',  border: 'rgba(251,191,36,0.25)'  },
  won:         { label: 'Won',         color: '#34d399', bg: 'rgba(52,211,153,0.10)',  border: 'rgba(52,211,153,0.25)'  },
  lost:        { label: 'Lost',        color: '#f87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.25)' },
}

const SOURCE: Record<string, string> = {
  hero: 'Hero', cta: 'CTA', navbar: 'Navbar',
  pricing: 'Pricing', general: 'Direct', instantdesk_website: 'Website',
}

/* ─── Helpers ────────────────────────────────────────────── */

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Yesterday'
  return `${d}d ago`
}

function absTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

/* ─── Status badge ───────────────────────────────────────── */

function StatusBadge({ status }: { status: Status }) {
  const s = STATUS[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
      {s.label}
    </span>
  )
}

/* ─── KPI card ───────────────────────────────────────────── */

function KpiCard({
  icon: Icon, label, value, sub, color, delay,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  value: string | number
  sub: string
  color: string
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45 }}
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white/35 uppercase tracking-widest">{label}</span>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: `${color}18`, border: `1px solid ${color}30` }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <div>
        <div className="text-3xl font-black text-white tracking-tight">{value}</div>
        <div className="text-xs text-white/30 mt-0.5">{sub}</div>
      </div>
    </motion.div>
  )
}

/* ─── Lead detail modal ──────────────────────────────────── */

function LeadModal({
  lead,
  onClose,
  onStatusChange,
}: {
  lead: Lead
  onClose: () => void
  onStatusChange: (id: string, status: Status) => Promise<void>
}) {
  const [localStatus, setLocalStatus] = useState<Status>(lead.status)
  const [saving,    setSaving]   = useState(false)
  const [saved,     setSaved]    = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleSave = async () => {
    if (localStatus === lead.status && !saveError) {
      // No change — skip
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await onStatusChange(lead.id, localStatus)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setSaveError('Failed to update status. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        className="w-full max-w-2xl rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(7,7,20,0.98)',
          border: '1px solid rgba(139,92,246,0.2)',
          boxShadow: '0 40px 100px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)',
          maxHeight: '90dvh',
          overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start gap-4 p-6 sticky top-0 z-10"
          style={{ background: 'rgba(7,7,20,0.98)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black text-white flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#2563eb)' }}
          >
            {initials(lead.fullName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-bold text-white">{lead.fullName}</h2>
              <StatusBadge status={lead.status} />
            </div>
            <p className="text-sm text-white/40 mt-0.5">{lead.businessName}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-all flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Contact info */}
          <div className="flex flex-col gap-4">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/25">Contact Details</h3>

            <a href={`mailto:${lead.email}`} className="flex items-center gap-3 group">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}>
                <Mail className="w-4 h-4 text-blue-400" />
              </div>
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-wider text-white/25 mb-0.5">Email</div>
                <div className="text-sm text-white/70 group-hover:text-blue-400 transition-colors truncate">{lead.email}</div>
              </div>
            </a>

            <a href={`tel:${lead.phone}`} className="flex items-center gap-3 group">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)' }}>
                <Phone className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-white/25 mb-0.5">Phone</div>
                <div className="text-sm text-white/70 group-hover:text-emerald-400 transition-colors">{lead.phone}</div>
              </div>
            </a>

            {lead.website ? (
              <a href={lead.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 group">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)' }}>
                  <Globe className="w-4 h-4 text-violet-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] uppercase tracking-wider text-white/25 mb-0.5">Website</div>
                  <div className="text-sm text-white/70 group-hover:text-violet-400 transition-colors truncate flex items-center gap-1">
                    {lead.website.replace(/^https?:\/\//, '')}
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </div>
                </div>
              </a>
            ) : (
              <div className="flex items-center gap-3 opacity-40">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <Globe className="w-4 h-4 text-white/30" />
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-white/25 mb-0.5">Website</div>
                  <div className="text-sm text-white/30">Not provided</div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.2)' }}>
                <BarChart2 className="w-4 h-4 text-orange-400" />
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-white/25 mb-0.5">Source</div>
                <div className="text-sm text-white/70">{SOURCE[lead.source] ?? lead.source}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}>
                <Clock className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-white/25 mb-0.5">Submitted</div>
                <div className="text-sm text-white/70">{absTime(lead.submittedAt)}</div>
              </div>
            </div>
          </div>

          {/* Message */}
          <div className="flex flex-col gap-4">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/25">Message</h3>
            <div
              className="rounded-xl p-4 text-sm text-white/60 leading-relaxed flex-1"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', minHeight: '120px' }}
            >
              {lead.message || <span className="text-white/25 italic">No message provided</span>}
            </div>
          </div>
        </div>

        {/* Status update */}
        <div
          className="px-6 pb-6 pt-4 flex flex-col gap-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-[10px] uppercase tracking-widest text-white/25 mb-2">Update Status</label>
              <div className="relative">
                <select
                  value={localStatus}
                  onChange={e => { setLocalStatus(e.target.value as Status); setSaved(false); setSaveError(null) }}
                  disabled={saving}
                  className="w-full appearance-none pl-4 pr-10 py-2.5 rounded-xl text-sm font-semibold cursor-pointer outline-none transition-all disabled:opacity-50"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${STATUS[localStatus].border}`,
                    color: STATUS[localStatus].color,
                  }}
                >
                  {(Object.keys(STATUS) as Status[]).map(s => (
                    <option key={s} value={s} style={{ background: '#0a0a1a', color: STATUS[s].color }}>
                      {STATUS[s].label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: STATUS[localStatus].color }} />
              </div>
            </div>

            <motion.button
              onClick={handleSave}
              disabled={saving}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 disabled:opacity-60"
              style={saved ? {
                background: 'rgba(52,211,153,0.12)',
                border: '1px solid rgba(52,211,153,0.3)',
                color: '#34d399',
              } : {
                background: 'linear-gradient(135deg,#7c3aed,#2563eb)',
                color: '#fff',
                boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
              }}
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
              ) : saved ? (
                <><CheckCircle className="w-4 h-4" />Saved!</>
              ) : (
                'Save Status'
              )}
            </motion.button>
          </div>

          {/* Save error */}
          <AnimatePresence>
            {saveError && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-xs text-red-400 flex items-center gap-1.5"
              >
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {saveError}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ─── Dashboard ──────────────────────────────────────────── */

export default function AdminDashboard({
  initialLeads,
  fetchError,
}: {
  initialLeads: Lead[]
  fetchError?: string
}) {
  const [leads,         setLeads]         = useState<Lead[]>(initialLeads)
  const [search,        setSearch]        = useState('')
  const [statusFilter,  setStatusFilter]  = useState<Status | 'all'>('all')
  const [selectedLead,  setSelectedLead]  = useState<Lead | null>(null)

  /* KPIs */
  const today = new Date().toISOString().split('T')[0]
  const kpis = useMemo(() => {
    const total      = leads.length
    const todayCount = leads.filter(l => l.submittedAt.startsWith(today)).length
    const demos      = leads.filter(l => l.status === 'demo_booked').length
    const won        = leads.filter(l => l.status === 'won').length
    const rate       = total > 0 ? Math.round((won / total) * 100) : 0
    return { total, todayCount, demos, rate }
  }, [leads, today])

  /* Filtered */
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return leads
      .filter(l => {
        if (statusFilter !== 'all' && l.status !== statusFilter) return false
        if (!q) return true
        return (
          l.fullName.toLowerCase().includes(q) ||
          l.businessName.toLowerCase().includes(q) ||
          l.email.toLowerCase().includes(q) ||
          l.phone.includes(q)
        )
      })
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
  }, [leads, search, statusFilter])

  /* Tab counts */
  const tabCounts = useMemo(() => {
    const c: Record<string, number> = { all: leads.length }
    for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1
    return c
  }, [leads])

  /* Optimistic status update → server action */
  const handleStatusChange = async (id: string, newStatus: Status) => {
    const prev = leads.find(l => l.id === id)?.status
    // Optimistic update
    setLeads(ls => ls.map(l => l.id === id ? { ...l, status: newStatus } : l))
    setSelectedLead(sl => sl?.id === id ? { ...sl, status: newStatus } : sl)
    try {
      await updateLeadStatus(id, newStatus)
    } catch (err) {
      // Revert on failure
      if (prev) {
        setLeads(ls => ls.map(l => l.id === id ? { ...l, status: prev } : l))
        setSelectedLead(sl => sl?.id === id ? { ...sl, status: prev } : sl)
      }
      throw err
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#050510' }}>
      {/* Header */}
      <div
        className="sticky top-0 z-40 flex items-center justify-between px-6 py-4"
        style={{
          background: 'rgba(5,5,16,0.95)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#2563eb)', boxShadow: '0 0 16px rgba(124,58,237,0.4)' }}
          >
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-sm font-bold text-white">InstantDesk</span>
            <span className="text-sm text-white/30"> · Admin</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-xs text-white/35 hover:text-white/70 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to site
          </Link>
          <form action="/api/logout" method="post">
            <button
              type="submit"
              className="text-xs text-white/25 hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/8"
            >
              Log out
            </button>
          </form>
          {!fetchError && (
            <div
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold"
              style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Supabase live
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* Fetch error banner */}
        <AnimatePresence>
          {fetchError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 px-5 py-4 rounded-2xl mb-6 text-sm"
              style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', color: '#fca5a5' }}
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span><strong>Supabase error:</strong> {fetchError}</span>
              <span className="text-white/30 ml-auto">Check your env vars and &quot;leads&quot; table.</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Page title */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <h1 className="text-2xl font-black text-white mb-1">Lead Dashboard</h1>
          <p className="text-sm text-white/35">Track, manage and convert every demo request.</p>
        </motion.div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <KpiCard icon={Users}         label="Total Leads"   value={kpis.total}      sub={`${kpis.todayCount} new today`}   color="#a78bfa" delay={0.05} />
          <KpiCard icon={Calendar}      label="Today's Leads" value={kpis.todayCount} sub="last 24 hours"                    color="#60a5fa" delay={0.10} />
          <KpiCard icon={CalendarCheck} label="Demos Booked"  value={kpis.demos}      sub="awaiting session"                 color="#fbbf24" delay={0.15} />
          <KpiCard icon={Target}        label="Win Rate"      value={`${kpis.rate}%`} sub="leads converted to clients"      color="#34d399" delay={0.20} />
        </div>

        {/* Table card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.45 }}
          className="rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {/* Controls */}
          <div
            className="flex flex-col sm:flex-row items-start sm:items-center gap-3 px-5 py-4"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            {/* Search */}
            <div className="relative flex-1 w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
              <input
                type="text"
                placeholder="Search leads…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                onFocus={e => { e.currentTarget.style.border = '1px solid rgba(139,92,246,0.4)' }}
                onBlur={e =>  { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)' }}
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status tabs */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {(['all', 'new', 'contacted', 'demo_booked', 'won', 'lost'] as const).map(s => {
                const active = statusFilter === s
                const cfg    = s === 'all' ? null : STATUS[s]
                return (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-150"
                    style={active ? {
                      background: cfg ? cfg.bg : 'rgba(255,255,255,0.08)',
                      border: `1px solid ${cfg ? cfg.border : 'rgba(255,255,255,0.2)'}`,
                      color: cfg ? cfg.color : '#fff',
                    } : {
                      background: 'transparent',
                      border: '1px solid transparent',
                      color: 'rgba(255,255,255,0.35)',
                    }}
                  >
                    {s === 'all' ? 'All' : STATUS[s].label}
                    <span
                      className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                      style={{
                        background: active && cfg ? cfg.border : 'rgba(255,255,255,0.08)',
                        color:      active && cfg ? cfg.color  : 'rgba(255,255,255,0.35)',
                      }}
                    >
                      {tabCounts[s] ?? 0}
                    </span>
                  </button>
                )
              })}
            </div>

            <span className="text-xs text-white/20 ml-auto whitespace-nowrap hidden sm:block">
              {filtered.length} lead{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Empty state — no leads at all */}
          {leads.length === 0 && !fetchError && (
            <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}
              >
                <RefreshCw className="w-7 h-7 text-violet-400/50" />
              </div>
              <h3 className="text-base font-bold text-white/50 mb-2">No leads yet</h3>
              <p className="text-sm text-white/25 max-w-xs">
                Demo requests submitted via the website will appear here automatically once the Supabase
                &ldquo;leads&rdquo; table receives data from your Make webhook.
              </p>
            </div>
          )}

          {/* Table */}
          {leads.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ minWidth: '780px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    {['Lead', 'Email', 'Phone', 'Message', 'Submitted', 'Status'].map(col => (
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
                          <div className="flex flex-col items-center gap-3">
                            <AlertCircle className="w-8 h-8 text-white/15" />
                            <p className="text-sm text-white/25">No leads match your filters</p>
                            <button onClick={() => { setSearch(''); setStatusFilter('all') }} className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                              Clear filters
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : filtered.map((lead, i) => (
                      <motion.tr
                        key={lead.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: i * 0.03, duration: 0.25 }}
                        onClick={() => setSelectedLead(lead)}
                        className="cursor-pointer group transition-colors duration-150"
                        style={{ background: 'transparent' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black text-white flex-shrink-0"
                              style={{ background: 'linear-gradient(135deg,rgba(124,58,237,0.5),rgba(37,99,235,0.4))' }}
                            >
                              {initials(lead.fullName)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-white/80 truncate max-w-[140px] group-hover:text-white transition-colors">
                                {lead.fullName}
                              </div>
                              <div className="text-xs text-white/30 truncate max-w-[140px]">{lead.businessName}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-sm text-white/50 truncate max-w-[180px] block group-hover:text-white/70 transition-colors">
                            {lead.email}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-sm text-white/50 whitespace-nowrap">{lead.phone}</span>
                        </td>
                        <td className="px-5 py-3.5 max-w-[200px]">
                          <span className="text-xs text-white/35 truncate block">{lead.message}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="text-xs text-white/40 whitespace-nowrap">{relativeTime(lead.submittedAt)}</div>
                          <div className="text-[10px] text-white/20 whitespace-nowrap">{absTime(lead.submittedAt)}</div>
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={lead.status} />
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}

          {/* Table footer */}
          {leads.length > 0 && (
            <div
              className="flex items-center justify-between px-5 py-3"
              style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
            >
              <span className="text-xs text-white/20">
                Showing {filtered.length} of {leads.length} leads · Supabase
              </span>
              <div className="flex gap-4 text-[10px]">
                {(Object.keys(STATUS) as Status[]).map(s => (
                  <span key={s} style={{ color: STATUS[s].color + '99' }}>
                    {leads.filter(l => l.status === s).length} {STATUS[s].label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Lead detail modal */}
      <AnimatePresence>
        {selectedLead && (
          <LeadModal
            lead={selectedLead}
            onClose={() => setSelectedLead(null)}
            onStatusChange={handleStatusChange}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
