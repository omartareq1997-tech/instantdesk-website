'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageCircle, Clock, CalendarClock, Flame, UserX,
  CheckCircle2, XCircle, AlertTriangle, X, ChevronRight,
  SlidersHorizontal, Send, Timer, Bot, Eye,
  RefreshCw, Zap, Ban,
} from 'lucide-react'

/* ─── Types ──────────────────────────────────────────────────── */

type TriggerType =
  | 'no_reply_2h'
  | 'no_reply_24h'
  | 'missed_appointment'
  | 'viewing_tomorrow'
  | 'hot_lead_followup'

type FollowUpStatus = 'scheduled' | 'sent' | 'cancelled' | 'failed'

interface FollowUpSetting {
  id:            string | null
  trigger_type:  TriggerType
  enabled:       boolean
  delay_hours:   number
  tone:          string
  custom_prompt: string | null
  updated_at:    string | null
}

interface FollowUpRow {
  id:              string
  business_id:     string
  lead_id:         string | null
  conversation_id: string | null
  trigger_type:    string
  scheduled_for:   string
  status:          FollowUpStatus
  message:         string | null
  created_at:      string
  sent_at:         string | null
}

/* ─── Rule metadata ──────────────────────────────────────────── */

interface RuleMeta {
  label:       string
  description: string
  icon:        React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  color:       string
  delayLabel:  string
}

const RULES: Record<TriggerType, RuleMeta> = {
  no_reply_2h: {
    label:       'No Reply — 2h',
    description: 'Sends a warm check-in if the lead has not replied within the delay window.',
    icon:        MessageCircle,
    color:       '#60a5fa',
    delayLabel:  'hours after last bot message',
  },
  no_reply_24h: {
    label:       'No Reply — 24h',
    description: 'Re-engages leads who went quiet after the initial conversation.',
    icon:        Clock,
    color:       '#a78bfa',
    delayLabel:  'hours after last bot message',
  },
  missed_appointment: {
    label:       'Missed Appointment',
    description: 'Follows up after an appointment passes with no confirmation.',
    icon:        CalendarClock,
    color:       '#f87171',
    delayLabel:  'hours after appointment time',
  },
  viewing_tomorrow: {
    label:       'Viewing Reminder',
    description: 'Reminds the lead about their upcoming appointment.',
    icon:        CalendarClock,
    color:       '#34d399',
    delayLabel:  'hours before appointment',
  },
  hot_lead_followup: {
    label:       'Hot Lead Follow-up',
    description: 'Triggers when a lead shares their name and contact — moves them to the next step.',
    icon:        Flame,
    color:       '#fb923c',
    delayLabel:  'hours after qualifying',
  },
}

const ALL_TRIGGERS: TriggerType[] = [
  'no_reply_2h',
  'no_reply_24h',
  'missed_appointment',
  'viewing_tomorrow',
  'hot_lead_followup',
]

const TONES = [
  { id: 'friendly',     label: 'Friendly'     },
  { id: 'professional', label: 'Professional' },
  { id: 'casual',       label: 'Casual'       },
  { id: 'urgent',       label: 'Urgent'       },
]

/* ─── Helpers ────────────────────────────────────────────────── */

function relTime(iso: string | null): string {
  if (!iso) return '—'
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)   return 'Just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function futureTime(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'Due now'
  const m = Math.floor(ms / 60000)
  if (m < 60)  return `in ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24)  return `in ${h}h`
  return `in ${Math.floor(h / 24)}d`
}

/* ─── ToggleSwitch ───────────────────────────────────────────── */

function ToggleSwitch({ enabled, onChange, disabled = false }: {
  enabled:   boolean
  onChange:  (v: boolean) => void
  disabled?: boolean
}) {
  const tx = enabled ? 21 : 2
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); if (!disabled) onChange(!enabled) }}
      className="relative w-10 h-5 rounded-full flex-shrink-0"
      style={{
        background:  enabled && !disabled ? '#34d399' : 'rgba(255,255,255,0.12)',
        opacity:     disabled ? 0.4 : 1,
        cursor:      disabled ? 'not-allowed' : 'pointer',
        transition:  'background 0.2s',
      }}
    >
      <span
        className="absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow"
        style={{ left: 0, transform: `translateX(${tx}px)`, transition: 'transform 0.18s cubic-bezier(0.4,0,0.2,1)' }}
      />
    </button>
  )
}

/* ─── ConfigureDrawer ────────────────────────────────────────── */

function ConfigureDrawer({
  trigger, setting, onClose, onSave,
}: {
  trigger:  TriggerType
  setting:  FollowUpSetting
  onClose:  () => void
  onSave:   (patch: Partial<FollowUpSetting>) => Promise<void>
}) {
  const rule = RULES[trigger]
  const RuleIcon = rule.icon

  const [enabled,      setEnabled]      = useState(setting.enabled)
  const [delayHours,   setDelayHours]   = useState(setting.delay_hours)
  const [tone,         setTone]         = useState(setting.tone)
  const [customPrompt, setCustomPrompt] = useState(setting.custom_prompt ?? '')
  const [saving,       setSaving]       = useState(false)
  const [saveErr,      setSaveErr]      = useState<string | null>(null)

  const inputBase: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border:     '1px solid rgba(255,255,255,0.08)',
  }

  async function handleSave() {
    setSaving(true)
    setSaveErr(null)
    try {
      await onSave({ enabled, delay_hours: delayHours, tone, custom_prompt: customPrompt.trim() || null })
      onClose()
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={onClose} />

      <motion.div key="drawer"
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 36 }}
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col w-full sm:w-[440px]"
        style={{ background: 'rgba(6,6,22,0.98)', borderLeft: '1px solid rgba(255,255,255,0.07)', boxShadow: '-32px 0 80px rgba(0,0,0,0.5)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${rule.color}18`, border: `1px solid ${rule.color}30` }}>
              <RuleIcon className="w-[18px] h-[18px]" style={{ color: rule.color }} />
            </div>
            <div>
              <div className="text-sm font-bold text-white">{rule.label}</div>
              <div className="text-[10px] text-white/30">Configure rule</div>
            </div>
          </div>
          <button onClick={onClose} className="text-white/25 hover:text-white/70 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">
          {/* AI badge */}
          <div className="flex items-start gap-2.5 rounded-xl px-4 py-3"
            style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.12)' }}>
            <Bot className="w-3.5 h-3.5 text-blue-400/60 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-blue-300/50 leading-relaxed">
              <span className="font-semibold text-blue-300/70">AI-generated.</span>{' '}
              Messages are composed by the AI using conversation memory and lead context — they sound human and reference what the lead shared.
            </p>
          </div>

          {/* Toggle */}
          <div>
            <label className="block text-[11px] font-bold text-white/40 uppercase tracking-widest mb-3">Status</label>
            <div className="flex items-center justify-between px-4 py-3 rounded-xl"
              style={{
                background: enabled ? `${rule.color}12` : 'rgba(255,255,255,0.03)',
                border:     `1px solid ${enabled ? `${rule.color}30` : 'rgba(255,255,255,0.08)'}`,
                transition: 'background 0.2s, border-color 0.2s',
              }}>
              <span className="text-sm font-semibold" style={{ color: enabled ? rule.color : 'rgba(255,255,255,0.4)' }}>
                {enabled ? 'Enabled — will fire when triggered' : 'Disabled — paused'}
              </span>
              <ToggleSwitch enabled={enabled} onChange={setEnabled} />
            </div>
          </div>

          {/* Delay */}
          <div>
            <label className="block text-[11px] font-bold text-white/40 uppercase tracking-widest mb-3">
              Delay ({rule.delayLabel})
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number" min="0.25" max="168" step="0.25"
                value={delayHours}
                onChange={e => setDelayHours(Math.max(0.25, parseFloat(e.target.value) || 0))}
                className="flex-1 px-3 py-2.5 rounded-xl text-sm text-white outline-none"
                style={inputBase}
                onFocus={e => { e.currentTarget.style.border = '1px solid rgba(139,92,246,0.4)' }}
                onBlur={e =>  { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)' }}
              />
              <span className="text-sm text-white/40 px-2">hours</span>
            </div>
          </div>

          {/* Tone */}
          <div>
            <label className="block text-[11px] font-bold text-white/40 uppercase tracking-widest mb-3">Tone</label>
            <div className="grid grid-cols-2 gap-2">
              {TONES.map(t => (
                <button key={t.id} type="button"
                  onClick={() => setTone(t.id)}
                  className="py-2.5 px-3 rounded-xl text-xs font-semibold transition-all"
                  style={tone === t.id ? {
                    background: `${rule.color}14`, border: `1px solid ${rule.color}35`, color: rule.color,
                  } : {
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.35)',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom prompt */}
          <div>
            <label className="block text-[11px] font-bold text-white/40 uppercase tracking-widest mb-3">
              Custom Instructions <span className="normal-case font-normal opacity-50">(optional)</span>
            </label>
            <textarea
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              rows={4}
              placeholder="Override default instructions… e.g. 'Always mention our free valuation offer' or 'Offer a 10% discount'"
              className="w-full px-3.5 py-3 rounded-xl text-sm text-white placeholder-white/15 outline-none resize-none"
              style={inputBase}
              onFocus={e => { e.currentTarget.style.border = '1px solid rgba(139,92,246,0.4)' }}
              onBlur={e =>  { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)' }}
            />
            <p className="text-[10px] text-white/20 mt-1.5">
              Leave blank to use the default AI instructions based on conversation context.
            </p>
          </div>

          {saveErr && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold text-red-400"
              style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {saveErr}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.45)' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all"
            style={{ background: `${rule.color}18`, border: `1px solid ${rule.color}40`, color: rule.color }}>
            {saving
              ? <motion.span className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current"
                  animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
              : <CheckCircle2 className="w-3.5 h-3.5" />
            }
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </motion.div>
    </>
  )
}

/* ─── RuleCard ────────────────────────────────────────────────── */

function RuleCard({
  setting, queue, onToggle, onConfigure,
}: {
  setting:     FollowUpSetting
  queue:       FollowUpRow[]
  onToggle:    (trigger: TriggerType, enabled: boolean) => void
  onConfigure: (trigger: TriggerType) => void
}) {
  const rule = RULES[setting.trigger_type]
  const RuleIcon = rule.icon

  const pendingCount = queue.filter(q =>
    q.trigger_type === setting.trigger_type && q.status === 'scheduled'
  ).length
  const sentCount = queue.filter(q =>
    q.trigger_type === setting.trigger_type && q.status === 'sent'
  ).length

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="rounded-2xl p-5 flex flex-col gap-4 relative overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.025)',
        border:     `1px solid ${setting.enabled ? `${rule.color}28` : 'rgba(255,255,255,0.07)'}`,
        transition: 'border-color 0.25s',
      }}
    >
      {setting.enabled && (
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse 120% 60% at 10% 0%, ${rule.color}08 0%, transparent 70%)` }} />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3 relative">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${rule.color}18`, border: `1px solid ${rule.color}30` }}>
            <RuleIcon className="w-5 h-5" style={{ color: rule.color }} />
          </div>
          <div>
            <div className="text-sm font-bold text-white leading-tight">{rule.label}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <Bot className="w-3 h-3 text-blue-400/60" />
              <span className="text-[10px] font-semibold text-blue-400/60">AI-generated</span>
            </div>
          </div>
        </div>
        <ToggleSwitch enabled={setting.enabled} onChange={v => onToggle(setting.trigger_type, v)} />
      </div>

      <p className="text-xs text-white/40 leading-relaxed relative">{rule.description}</p>

      {/* Stats */}
      <div className="flex flex-wrap items-center gap-2 relative">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <Timer className="w-3 h-3 text-white/30" />
          <span className="text-[10px] font-semibold text-white/50">{setting.delay_hours}h</span>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <Clock className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] font-semibold text-amber-400">{pendingCount} scheduled</span>
          </div>
        )}
        {sentCount > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
            style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.18)' }}>
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] font-semibold text-emerald-400">{sentCount} sent</span>
          </div>
        )}
      </div>

      {/* Configure button */}
      <button onClick={() => onConfigure(setting.trigger_type)}
        className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all group relative"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
        onMouseEnter={e => {
          e.currentTarget.style.background  = `${rule.color}12`
          e.currentTarget.style.borderColor = `${rule.color}35`
          e.currentTarget.style.color       = rule.color
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background  = 'rgba(255,255,255,0.04)'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
          e.currentTarget.style.color       = 'rgba(255,255,255,0.5)'
        }}>
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Configure
        </span>
        <ChevronRight className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-transform" />
      </button>
    </motion.div>
  )
}

/* ─── QueuePanel ─────────────────────────────────────────────── */

const STATUS_CFG: Record<FollowUpStatus, { color: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string }> = {
  scheduled: { color: '#fbbf24', icon: Clock,        label: 'Scheduled' },
  sent:      { color: '#34d399', icon: CheckCircle2, label: 'Sent'      },
  cancelled: { color: '#6b7280', icon: Ban,          label: 'Cancelled' },
  failed:    { color: '#f87171', icon: XCircle,      label: 'Failed'    },
}

function QueuePanel({
  queue, onCancel,
}: {
  queue:    FollowUpRow[]
  onCancel: (id: string) => void
}) {
  const [filter, setFilter] = useState<FollowUpStatus | 'all'>('all')

  const filtered = filter === 'all' ? queue : queue.filter(q => q.status === filter)

  if (queue.length === 0) {
    return (
      <div className="rounded-2xl flex flex-col items-center justify-center py-12 gap-3"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <Send className="w-5 h-5 text-white/15" />
        </div>
        <p className="text-sm font-semibold text-white/20">No follow-ups yet</p>
        <p className="text-xs text-white/15 text-center max-w-[260px]">
          Enable rules above. Follow-ups will appear here as leads come in via chat.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filter pills */}
      <div className="flex items-center gap-2">
        {(['all', 'scheduled', 'sent', 'failed', 'cancelled'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className="px-3 py-1 rounded-full text-[11px] font-semibold transition-all"
            style={filter === s ? {
              background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)', color: '#a78bfa',
            } : {
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)',
            }}>
            {s === 'all' ? 'All' : STATUS_CFG[s as FollowUpStatus]?.label ?? s}
          </button>
        ))}
      </div>

      {/* Rows */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {filtered.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-white/20">No {filter} follow-ups</div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {filtered.map((row, i) => {
              const rule   = RULES[row.trigger_type as TriggerType] ?? { label: row.trigger_type, color: '#60a5fa', icon: MessageCircle }
              const RuleIcon = rule.icon
              const stat   = STATUS_CFG[row.status]
              const StatIcon = stat.icon
              return (
                <motion.div key={row.id}
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-start gap-3 px-5 py-3.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: `${rule.color}15`, border: `1px solid ${rule.color}25` }}>
                    <RuleIcon className="w-3.5 h-3.5" style={{ color: rule.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-xs font-semibold text-white/70">{rule.label}</div>
                      <div className="flex items-center gap-1" style={{ color: stat.color }}>
                        <StatIcon className="w-3 h-3" />
                        <span className="text-[10px] font-semibold">{stat.label}</span>
                      </div>
                    </div>
                    {row.message && (
                      <p className="text-[11px] text-white/35 mt-1 leading-relaxed line-clamp-2">{row.message}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[10px] text-white/20">
                        {row.status === 'scheduled'
                          ? futureTime(row.scheduled_for)
                          : row.sent_at ? relTime(row.sent_at) : relTime(row.created_at)
                        }
                      </span>
                    </div>
                  </div>
                  {row.status === 'scheduled' && (
                    <button onClick={() => onCancel(row.id)}
                      className="ml-auto flex-shrink-0 text-white/20 hover:text-red-400 transition-colors mt-0.5"
                      title="Cancel this follow-up">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── FollowUpCenter ─────────────────────────────────────────── */

export default function FollowUpCenter() {
  const [settings,     setSettings]     = useState<FollowUpSetting[]>([])
  const [queue,        setQueue]        = useState<FollowUpRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [activeTab,    setActiveTab]    = useState<'rules' | 'queue'>('rules')
  const [drawerTrigger, setDrawerTrigger] = useState<TriggerType | null>(null)
  const [workerRunning, setWorkerRunning] = useState(false)
  const [workerResult,  setWorkerResult]  = useState<string | null>(null)

  const drawerSetting = drawerTrigger
    ? (settings.find(s => s.trigger_type === drawerTrigger) ?? null)
    : null

  /* ── Fetch ───────────────────────────────────────────── */

  const fetchAll = useCallback(async () => {
    try {
      const [sRes, qRes] = await Promise.all([
        fetch('/api/follow-ups/settings'),
        fetch('/api/follow-ups?limit=200'),
      ])
      const [sData, qData] = await Promise.all([sRes.json(), qRes.json()])
      setSettings((sData as { settings?: FollowUpSetting[] }).settings ?? [])
      setQueue((qData as { follow_ups?: FollowUpRow[] }).follow_ups ?? [])
    } catch (err) {
      console.error('[FollowUpCenter] fetch error:', err)
      // Render defaults
      setSettings(ALL_TRIGGERS.map(t => ({
        id: null, trigger_type: t, enabled: false,
        delay_hours: 2, tone: 'friendly', custom_prompt: null, updated_at: null,
      })))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchAll() }, [fetchAll])

  /* ── Toggle ──────────────────────────────────────────── */

  const handleToggle = useCallback(async (trigger: TriggerType, enabled: boolean) => {
    setSettings(prev => prev.map(s => s.trigger_type === trigger ? { ...s, enabled } : s))
    try {
      await fetch('/api/follow-ups/settings', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ trigger_type: trigger, enabled }),
      })
    } catch {
      setSettings(prev => prev.map(s => s.trigger_type === trigger ? { ...s, enabled: !enabled } : s))
    }
  }, [])

  /* ── Save from drawer ────────────────────────────────── */

  const handleSave = useCallback(async (patch: Partial<FollowUpSetting>) => {
    if (!drawerTrigger) return
    const res = await fetch('/api/follow-ups/settings', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ trigger_type: drawerTrigger, ...patch }),
    })
    if (!res.ok) {
      const d = await res.json() as { error?: string }
      throw new Error(d.error ?? 'Save failed')
    }
    setSettings(prev => prev.map(s =>
      s.trigger_type === drawerTrigger ? { ...s, ...patch } : s
    ))
  }, [drawerTrigger])

  /* ── Cancel follow-up ────────────────────────────────── */

  const handleCancel = useCallback(async (id: string) => {
    setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'cancelled' as const } : q))
    await fetch(`/api/follow-ups/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'cancelled' }),
    })
  }, [])

  /* ── Manual worker trigger ───────────────────────────── */

  async function runWorker() {
    setWorkerRunning(true)
    setWorkerResult(null)
    try {
      const res = await fetch('/api/follow-ups/worker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json() as { sent?: number; failed?: number; cancelled?: number; detected?: number }
      setWorkerResult(`Sent: ${data.sent ?? 0} · Failed: ${data.failed ?? 0} · Cancelled: ${data.cancelled ?? 0} · Detected: ${data.detected ?? 0}`)
      void fetchAll()
    } catch {
      setWorkerResult('Worker error — check server logs')
    } finally {
      setWorkerRunning(false)
    }
  }

  /* ── Stats ───────────────────────────────────────────── */

  const enabledCount   = settings.filter(s => s.enabled).length
  const scheduledCount = queue.filter(q => q.status === 'scheduled').length
  const sentToday      = queue.filter(q => {
    if (q.status !== 'sent' || !q.sent_at) return false
    return new Date(q.sent_at).toDateString() === new Date().toDateString()
  }).length

  return (
    <div className="flex flex-col gap-6">

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { label: 'Active Rules',  value: enabledCount,   color: '#34d399', icon: Zap          },
          { label: 'Scheduled',     value: scheduledCount, color: '#fbbf24', icon: Clock        },
          { label: 'Sent Today',    value: sentToday,      color: '#60a5fa', icon: CheckCircle2 },
        ].map((card, i) => {
          const CardIcon = card.icon
          return (
            <motion.div key={card.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className="rounded-2xl px-2 py-3 sm:p-5 flex flex-col sm:flex-row items-center gap-1.5 sm:gap-4"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="hidden sm:flex w-10 h-10 rounded-xl items-center justify-center flex-shrink-0"
                style={{ background: `${card.color}15`, border: `1px solid ${card.color}28` }}>
                <CardIcon className="w-5 h-5" style={{ color: card.color }} />
              </div>
              <div className="sm:hidden w-1.5 h-1.5 rounded-full" style={{ background: card.color }} />
              <div className="text-center sm:text-left">
                <div className="text-xl sm:text-2xl font-black text-white leading-none">{card.value}</div>
                <div className="text-[9px] sm:text-[10px] font-semibold text-white/40 mt-1">{card.label}</div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Tabs + worker button */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {(['rules', 'queue'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={activeTab === tab ? {
                background: 'rgba(139,92,246,0.2)', color: '#a78bfa',
              } : {
                color: 'rgba(255,255,255,0.35)',
              }}>
              {tab === 'rules' ? 'Rules' : `Queue${scheduledCount > 0 ? ` (${scheduledCount})` : ''}`}
            </button>
          ))}
        </div>

        <button onClick={runWorker} disabled={workerRunning}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
          style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.18)', color: '#60a5fa' }}>
          {workerRunning
            ? <motion.span className="w-3.5 h-3.5 rounded-full border-2 border-current/30 border-t-current"
                animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
            : <RefreshCw className="w-3.5 h-3.5" />
          }
          {workerRunning ? 'Running…' : 'Run Now'}
        </button>
      </div>

      {workerResult && (
        <div className="px-4 py-2.5 rounded-xl text-xs font-semibold text-emerald-400"
          style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.18)' }}>
          Worker complete — {workerResult}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ALL_TRIGGERS.map(t => (
            <div key={t} className="rounded-2xl h-52 animate-pulse"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }} />
          ))}
        </div>
      ) : activeTab === 'rules' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {settings.map((setting, i) => (
            <motion.div key={setting.trigger_type}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}>
              <RuleCard
                setting={setting}
                queue={queue}
                onToggle={handleToggle}
                onConfigure={setDrawerTrigger}
              />
            </motion.div>
          ))}
        </div>
      ) : (
        <QueuePanel queue={queue} onCancel={handleCancel} />
      )}

      {/* Configure drawer */}
      <AnimatePresence>
        {drawerTrigger && drawerSetting && (
          <ConfigureDrawer
            key={drawerTrigger}
            trigger={drawerTrigger}
            setting={drawerSetting}
            onClose={() => setDrawerTrigger(null)}
            onSave={handleSave}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
