'use client'

/**
 * AutomationCenter — Make.com scenario control center.
 *
 * Architecture:
 *   This component stores and displays automation configuration.
 *   Make.com reads these settings from Supabase before executing each scenario.
 *   Make.com writes execution results to /api/automation-logs.
 *   InstantDesk does NOT send WhatsApp/SMS/Email directly — Make.com is the executor.
 *
 *   When migrating away from Make.com, replace the execution layer without
 *   changing this UI or the automation_settings schema.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  UserX, CalendarClock, UserMinus, Star, RefreshCw, Flame,
  MessageCircle, MessageSquare, Mail,
  Bot, Clock3, SlidersHorizontal, Webhook,
  CheckCircle2, XCircle, AlertTriangle,
  X, ChevronRight, ToggleLeft, ToggleRight,
  Shield, Timer, Eye,
} from 'lucide-react'
import type { Permissions } from '../lib/permissions'

/* ─── Types ──────────────────────────────────────────────────── */

type AutomationType =
  | 'missed_lead_recovery'
  | 'appointment_reminder'
  | 'no_show_recovery'
  | 'review_request'
  | 'lead_reengagement'
  | 'hot_lead_alert'

type Channel = 'whatsapp' | 'sms' | 'email'
type LogStatus = 'success' | 'failure' | 'skipped'

interface AutoConfig {
  ai_message:          boolean
  business_hours_only: boolean
  assigned_agent_only: boolean
}

interface AutoSetting {
  id:               string | null
  automation_type:  AutomationType
  enabled:          boolean
  channel:          Channel
  delay_minutes:    number
  config:           AutoConfig
  message_template: string
  last_run:         string | null
  success_count:    number
  failure_count:    number
  updated_at:       string | null
}

interface AutoLog {
  id:              string
  automation_type: AutomationType
  lead_id:         string | null
  appointment_id:  string | null
  status:          LogStatus
  message:         string | null
  created_at:      string
}

/* ─── Preset metadata ────────────────────────────────────────── */

interface Preset {
  label:       string
  description: string
  icon:        React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  color:       string
  triggerNote: string  // human-readable trigger description shown in the card
}

const PRESETS: Record<AutomationType, Preset> = {
  missed_lead_recovery: {
    label:       'Missed Lead Recovery',
    description: 'Follow up automatically with new leads who haven\'t had a response within the set delay.',
    icon:        UserX,
    color:       '#f87171',
    triggerNote: 'After new lead created',
  },
  appointment_reminder: {
    label:       'Appointment Reminder',
    description: 'Send timely reminders before scheduled appointments to reduce no-shows.',
    icon:        CalendarClock,
    color:       '#34d399',
    triggerNote: 'Before appointment time',
  },
  no_show_recovery: {
    label:       'No-Show Recovery',
    description: 'Re-engage leads who missed their scheduled appointment and offer to reschedule.',
    icon:        UserMinus,
    color:       '#fbbf24',
    triggerNote: 'After missed appointment',
  },
  review_request: {
    label:       'Review Request',
    description: 'Request a review from clients after a successful appointment or deal closure.',
    icon:        Star,
    color:       '#fb923c',
    triggerNote: 'After appointment completed',
  },
  lead_reengagement: {
    label:       'Lead Re-engagement',
    description: 'Win back cold leads who have gone quiet after the set inactivity period.',
    icon:        RefreshCw,
    color:       '#a78bfa',
    triggerNote: 'After lead inactivity',
  },
  hot_lead_alert: {
    label:       'Hot Lead Alert',
    description: 'Instantly notify your team when a lead score spikes or shows strong buying signals.',
    icon:        Flame,
    color:       '#f97316',
    triggerNote: 'When lead score is hot',
  },
}

const ALL_TYPES: AutomationType[] = [
  'missed_lead_recovery',
  'appointment_reminder',
  'no_show_recovery',
  'review_request',
  'lead_reengagement',
  'hot_lead_alert',
]

/* ─── Channel config ─────────────────────────────────────────── */

const CHANNEL_CFG: Record<Channel, { label: string; color: string; icon: React.ComponentType<{className?:string;style?:React.CSSProperties}> }> = {
  whatsapp: { label: 'WhatsApp', color: '#34d399', icon: MessageCircle },
  sms:      { label: 'SMS',      color: '#60a5fa', icon: MessageSquare },
  email:    { label: 'Email',    color: '#fbbf24', icon: Mail          },
}

/* ─── Delay helpers ──────────────────────────────────────────── */

function formatDelay(minutes: number): string {
  if (minutes === 0)   return 'Immediately'
  if (minutes < 60)    return `${minutes} min`
  if (minutes < 1440)  return `${Math.round(minutes / 60)} hr`
  if (minutes < 10080) return `${Math.round(minutes / 1440)} day${Math.round(minutes / 1440) > 1 ? 's' : ''}`
  return `${Math.round(minutes / 10080)} wk`
}

function relTime(iso: string | null): string {
  if (!iso) return 'Never'
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)   return 'Just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function delayToInputs(minutes: number): { value: number; unit: 'min' | 'hr' | 'day' | 'wk' } {
  if (minutes === 0)   return { value: 0, unit: 'min' }
  if (minutes < 60)    return { value: minutes, unit: 'min' }
  if (minutes < 1440)  return { value: Math.round(minutes / 60), unit: 'hr' }
  if (minutes < 10080) return { value: Math.round(minutes / 1440), unit: 'day' }
  return { value: Math.round(minutes / 10080), unit: 'wk' }
}

function inputsToMinutes(value: number, unit: 'min' | 'hr' | 'day' | 'wk'): number {
  switch (unit) {
    case 'min': return value
    case 'hr':  return value * 60
    case 'day': return value * 1440
    case 'wk':  return value * 10080
  }
}

/* ─── ToggleSwitch ───────────────────────────────────────────── */

function ToggleSwitch({ enabled, onChange, size = 'md', disabled = false }: {
  enabled:   boolean
  onChange:  (v: boolean) => void
  size?:     'sm' | 'md'
  disabled?: boolean
}) {
  const w  = size === 'sm' ? 'w-8 h-4' : 'w-10 h-5'
  const dot = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'
  // CSS-only translate so touch events are never swallowed by Framer Motion
  const tx = enabled ? (size === 'sm' ? 17 : 21) : 2
  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation() // prevent bubbling into any parent click handler
        if (!disabled) onChange(!enabled)
      }}
      className={`relative ${w} rounded-full flex-shrink-0`}
      style={{
        background: enabled && !disabled ? '#34d399' : 'rgba(255,255,255,0.12)',
        opacity:    disabled ? 0.4 : 1,
        cursor:     disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.2s',
      }}
    >
      <span
        className={`absolute top-0.5 ${dot} rounded-full bg-white shadow`}
        style={{
          left:       0,
          transform:  `translateX(${tx}px)`,
          transition: 'transform 0.18s cubic-bezier(0.4,0,0.2,1)',
        }}
      />
    </button>
  )
}

/* ─── AutomationCard ─────────────────────────────────────────── */

function AutomationCard({
  setting, onToggle, onConfigure, canManage,
}: {
  setting:     AutoSetting
  onToggle:    (type: AutomationType, enabled: boolean) => void
  onConfigure: (type: AutomationType) => void
  canManage:   boolean
}) {
  const preset  = PRESETS[setting.automation_type]
  const channel = CHANNEL_CFG[setting.channel]
  const ChanIcon = channel.icon
  const PresetIcon = preset.icon

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="rounded-2xl p-5 flex flex-col gap-4 relative overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.025)',
        border:     `1px solid ${setting.enabled ? `${preset.color}28` : 'rgba(255,255,255,0.07)'}`,
        transition: 'border-color 0.25s',
      }}
    >
      {/* Subtle color wash when enabled */}
      {setting.enabled && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse 120% 60% at 10% 0%, ${preset.color}08 0%, transparent 70%)` }}
        />
      )}

      {/* Header row */}
      <div className="flex items-start justify-between gap-3 relative">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${preset.color}18`, border: `1px solid ${preset.color}30` }}
          >
            <PresetIcon className="w-5 h-5" style={{ color: preset.color }} />
          </div>
          <div>
            <div className="text-sm font-bold text-white leading-tight">{preset.label}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <ChanIcon className="w-3 h-3" style={{ color: channel.color }} />
              <span className="text-[10px] font-semibold" style={{ color: channel.color }}>{channel.label}</span>
            </div>
          </div>
        </div>

        <ToggleSwitch
          enabled={setting.enabled}
          onChange={v => onToggle(setting.automation_type, v)}
          disabled={!canManage}
        />
      </div>

      {/* Description */}
      <p className="text-xs text-white/40 leading-relaxed relative">{preset.description}</p>

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-2 relative">
        {/* Trigger timing */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <Timer className="w-3 h-3 text-white/30" />
          <span className="text-[10px] font-semibold text-white/50">{formatDelay(setting.delay_minutes)}</span>
        </div>

        {/* AI badge */}
        {setting.config.ai_message && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
            style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.18)' }}>
            <Bot className="w-3 h-3 text-blue-400" />
            <span className="text-[10px] font-semibold text-blue-400">AI</span>
          </div>
        )}

        {/* Business hours badge */}
        {setting.config.business_hours_only && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.18)' }}>
            <Clock3 className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] font-semibold text-amber-400">Biz hrs</span>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 relative">
        <div className="rounded-xl px-3 py-2.5"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-[10px] text-white/25 mb-0.5">Last run</div>
          <div className="text-xs font-bold text-white/60">{relTime(setting.last_run)}</div>
        </div>
        <div className="rounded-xl px-3 py-2.5"
          style={{ background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.10)' }}>
          <div className="text-[10px] text-emerald-400/50 mb-0.5">Success</div>
          <div className="text-xs font-bold text-emerald-400">{setting.success_count}</div>
        </div>
        <div className="rounded-xl px-3 py-2.5"
          style={{ background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.10)' }}>
          <div className="text-[10px] text-red-400/50 mb-0.5">Failed</div>
          <div className="text-xs font-bold text-red-400">{setting.failure_count}</div>
        </div>
      </div>

      {/* Configure / View button */}
      <button
        onClick={() => canManage && onConfigure(setting.automation_type)}
        disabled={!canManage}
        title={canManage ? undefined : 'Read-only — insufficient permissions'}
        className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all group relative"
        style={{
          background:    'rgba(255,255,255,0.04)',
          border:        '1px solid rgba(255,255,255,0.08)',
          color:         'rgba(255,255,255,0.5)',
          opacity:       canManage ? 1 : 0.45,
          cursor:        canManage ? 'pointer' : 'not-allowed',
        }}
        onMouseEnter={e => {
          if (!canManage) return
          e.currentTarget.style.background = `${preset.color}12`
          e.currentTarget.style.borderColor = `${preset.color}35`
          e.currentTarget.style.color = preset.color
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
          e.currentTarget.style.color = 'rgba(255,255,255,0.5)'
        }}
      >
        <span className="flex items-center gap-2">
          {canManage
            ? <SlidersHorizontal className="w-3.5 h-3.5" />
            : <Eye             className="w-3.5 h-3.5" />
          }
          {canManage ? 'Configure' : 'View only'}
        </span>
        {canManage && (
          <ChevronRight className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-transform" />
        )}
      </button>
    </motion.div>
  )
}

/* ─── ConfigureDrawer ────────────────────────────────────────── */

function ConfigureDrawer({
  type, setting, onClose, onSave, readOnly = false,
}: {
  type:      AutomationType
  setting:   AutoSetting
  onClose:   () => void
  onSave:    (type: AutomationType, patch: Partial<AutoSetting>) => Promise<void>
  readOnly?: boolean
}) {
  const preset = PRESETS[type]

  // Local form state — initialized from current setting
  const [enabled,         setEnabled]         = useState(setting.enabled)
  const [channel,         setChannel]         = useState<Channel>(setting.channel)
  const [aiMessage,       setAiMessage]       = useState(setting.config.ai_message)
  const [bizHours,        setBizHours]        = useState(setting.config.business_hours_only)
  const [agentOnly,       setAgentOnly]       = useState(setting.config.assigned_agent_only)
  const [template,        setTemplate]        = useState(setting.message_template)
  const [delayVal,        setDelayVal]        = useState(() => delayToInputs(setting.delay_minutes).value)
  const [delayUnit,       setDelayUnit]       = useState(() => delayToInputs(setting.delay_minutes).unit)
  const [saving,          setSaving]          = useState(false)
  const [saveError,       setSaveError]       = useState<string | null>(null)

  const drawerRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    const delay_minutes = inputsToMinutes(delayVal, delayUnit)
    const patch: Partial<AutoSetting> = {
      enabled,
      channel,
      delay_minutes,
      message_template: template,
      config: { ai_message: aiMessage, business_hours_only: bizHours, assigned_agent_only: agentOnly },
    }
    try {
      await onSave(type, patch)
      onClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const inputBase: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border:     '1px solid rgba(255,255,255,0.08)',
  }

  const PresetIcon = preset.icon

  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="drawer-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <motion.div
        key="drawer-panel"
        ref={drawerRef}
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 36 }}
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col w-full sm:w-[440px]"
        style={{
          background: 'rgba(6,6,22,0.98)',
          borderLeft: '1px solid rgba(255,255,255,0.07)',
          boxShadow:  '-32px 0 80px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${preset.color}18`, border: `1px solid ${preset.color}30` }}>
              <PresetIcon className="w-[18px] h-[18px]" style={{ color: preset.color }} />
            </div>
            <div>
              <div className="text-sm font-bold text-white">{preset.label}</div>
              <div className="text-[10px] text-white/30">
                {readOnly ? 'View only — insufficient permissions' : 'Configure scenario'}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-white/25 hover:text-white/70 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">

          {/* Make.com architecture note */}
          <div className="flex items-start gap-2.5 rounded-xl px-4 py-3"
            style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.12)' }}>
            <Webhook className="w-3.5 h-3.5 text-blue-400/60 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-blue-300/50 leading-relaxed">
              <span className="font-semibold text-blue-300/70">Make.com executes this scenario.</span>{' '}
              Changes here take effect on the next Make.com run. Make.com reads these settings from Supabase before each trigger.
            </p>
          </div>

          {/* Read-only notice */}
          {readOnly && (
            <div className="flex items-center gap-2.5 rounded-xl px-4 py-3"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Eye className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
              <p className="text-[10px] text-white/35">
                <span className="font-semibold text-white/50">View only.</span>{' '}
                Your role does not have permission to modify automation settings.
              </p>
            </div>
          )}

          {/* Enabled — outer element is a div, not a button, so ToggleSwitch button has no invalid ancestor */}
          <div>
            <label className="block text-[11px] font-bold text-white/40 uppercase tracking-widest mb-3">Status</label>
            <div
              className="flex items-center justify-between w-full px-4 py-3 rounded-xl"
              style={{
                background: enabled ? `${preset.color}12` : 'rgba(255,255,255,0.03)',
                border:     `1px solid ${enabled ? `${preset.color}30` : 'rgba(255,255,255,0.08)'}`,
                opacity:    readOnly ? 0.6 : 1,
                transition: 'background 0.2s, border-color 0.2s',
              }}
            >
              <div className="flex items-center gap-2.5 flex-1 min-w-0 select-none">
                {enabled
                  ? <ToggleRight className="w-4 h-4 flex-shrink-0" style={{ color: preset.color }} />
                  : <ToggleLeft  className="w-4 h-4 flex-shrink-0 text-white/25" />
                }
                <span className="text-sm font-semibold truncate" style={{ color: enabled ? preset.color : 'rgba(255,255,255,0.4)' }}>
                  {enabled ? 'Enabled — Make.com will run this scenario' : 'Disabled — scenario is paused'}
                </span>
              </div>
              <ToggleSwitch enabled={enabled} onChange={setEnabled} size="sm" disabled={readOnly} />
            </div>
          </div>

          {/* Channel */}
          <div>
            <label className="block text-[11px] font-bold text-white/40 uppercase tracking-widest mb-3">Channel</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(CHANNEL_CFG) as [Channel, typeof CHANNEL_CFG[Channel]][]).map(([ch, cfg]) => {
                const ChIcon = cfg.icon
                const active = channel === ch
                return (
                  <button key={ch} type="button"
                    onClick={() => { if (!readOnly) setChannel(ch) }}
                    disabled={readOnly}
                    className="flex flex-col items-center gap-2 py-3 rounded-xl text-xs font-semibold transition-all"
                    style={active ? {
                      background: `${cfg.color}14`,
                      border:     `1px solid ${cfg.color}35`,
                      color:      cfg.color,
                      opacity:    readOnly ? 0.5 : 1,
                      cursor:     readOnly ? 'default' : 'pointer',
                    } : {
                      background: 'rgba(255,255,255,0.03)',
                      border:     '1px solid rgba(255,255,255,0.07)',
                      color:      'rgba(255,255,255,0.3)',
                      opacity:    readOnly ? 0.4 : 1,
                      cursor:     readOnly ? 'default' : 'pointer',
                    }}>
                    <ChIcon className="w-4 h-4" />
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Delay */}
          <div>
            <label className="block text-[11px] font-bold text-white/40 uppercase tracking-widest mb-3">
              Delay After Trigger
            </label>
            <div className="flex gap-2">
              <input
                type="number" min="0" max="9999" value={delayVal}
                onChange={e => { if (!readOnly) setDelayVal(Math.max(0, parseInt(e.target.value) || 0)) }}
                readOnly={readOnly}
                className="flex-1 px-3 py-2.5 rounded-xl text-sm text-white outline-none transition-all"
                style={{ ...inputBase, opacity: readOnly ? 0.5 : 1, cursor: readOnly ? 'default' : 'text' }}
                onFocus={e => { if (!readOnly) e.currentTarget.style.border = '1px solid rgba(139,92,246,0.4)' }}
                onBlur={e =>  { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)' }}
              />
              <select
                value={delayUnit}
                onChange={e => { if (!readOnly) setDelayUnit(e.target.value as typeof delayUnit) }}
                disabled={readOnly}
                className="px-3 py-2.5 rounded-xl text-sm text-white outline-none transition-all appearance-none"
                style={{ ...inputBase, paddingRight: '2rem', opacity: readOnly ? 0.5 : 1, cursor: readOnly ? 'default' : 'pointer' }}
              >
                <option value="min" style={{ background: '#0a0a1e' }}>min</option>
                <option value="hr"  style={{ background: '#0a0a1e' }}>hours</option>
                <option value="day" style={{ background: '#0a0a1e' }}>days</option>
                <option value="wk"  style={{ background: '#0a0a1e' }}>weeks</option>
              </select>
            </div>
            <p className="text-[10px] text-white/25 mt-1.5">
              {delayVal === 0 ? 'Runs immediately when triggered.' : `Runs ${formatDelay(inputsToMinutes(delayVal, delayUnit))} after trigger.`}
            </p>
          </div>

          {/* Toggles */}
          <div>
            <label className="block text-[11px] font-bold text-white/40 uppercase tracking-widest mb-3">Options</label>
            <div className="flex flex-col gap-0.5">
              {[
                { label: 'AI-generated message',   sub: 'Make.com generates a personalised message via AI instead of the template below', value: aiMessage,  set: setAiMessage },
                { label: 'Business hours only',    sub: 'Make.com skips runs outside 09:00–18:00 Mon–Fri',                                value: bizHours,   set: setBizHours  },
                { label: 'Assigned agent only',    sub: 'Only runs for leads that have an assigned agent',                                value: agentOnly,  set: setAgentOnly },
              ].map(row => (
                <div key={row.label}
                  className="flex items-start justify-between gap-4 px-4 py-3.5 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', opacity: readOnly ? 0.6 : 1 }}>
                  <div>
                    <div className="text-xs font-semibold text-white/70">{row.label}</div>
                    <div className="text-[10px] text-white/25 mt-0.5">{row.sub}</div>
                  </div>
                  <ToggleSwitch enabled={row.value} onChange={row.set} size="sm" disabled={readOnly} />
                </div>
              ))}
            </div>
          </div>

          {/* Message template */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-[11px] font-bold text-white/40 uppercase tracking-widest">
                Message Template
              </label>
              {aiMessage && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-400/60">
                  <Bot className="w-3 h-3" />AI override active
                </span>
              )}
            </div>
            <textarea
              value={template}
              onChange={e => { if (!readOnly) setTemplate(e.target.value) }}
              readOnly={readOnly}
              rows={5}
              placeholder="Enter your message template…"
              className="w-full px-3.5 py-3 rounded-xl text-sm text-white placeholder-white/15 outline-none transition-all resize-none"
              style={{
                ...inputBase,
                opacity: readOnly || aiMessage ? 0.5 : 1,
                cursor:  readOnly ? 'default' : 'text',
              }}
              onFocus={e => { if (!readOnly) e.currentTarget.style.border = '1px solid rgba(139,92,246,0.4)' }}
              onBlur={e =>  { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)' }}
            />
            <p className="text-[10px] text-white/20 mt-1.5">
              Available tokens: {'{{lead_name}}'}, {'{{company}}'}, {'{{service}}'}, {'{{time}}'}, {'{{score}}'}
            </p>
          </div>

          {saveError && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold text-red-400"
              style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {saveError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.45)' }}>
            {readOnly ? 'Close' : 'Cancel'}
          </button>
          {!readOnly && (
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
              style={{
                background: `${preset.color}18`,
                border:     `1px solid ${preset.color}40`,
                color:      preset.color,
              }}>
              {saving
                ? <motion.span className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current"
                    animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
                : <Shield className="w-3.5 h-3.5" />
              }
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          )}
        </div>
      </motion.div>
    </>
  )
}

/* ─── RecentLogs ─────────────────────────────────────────────── */

function RecentLogs({ logs }: { logs: AutoLog[] }) {
  const STATUS_CFG: Record<LogStatus, { color: string; icon: React.ComponentType<{className?:string;style?:React.CSSProperties}>; label: string }> = {
    success: { color: '#34d399', icon: CheckCircle2, label: 'Success' },
    failure: { color: '#f87171', icon: XCircle,      label: 'Failed'  },
    skipped: { color: '#fbbf24', icon: AlertTriangle, label: 'Skipped' },
  }

  if (logs.length === 0) {
    return (
      <div className="rounded-2xl flex flex-col items-center justify-center py-12 gap-3"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <Webhook className="w-5 h-5 text-white/15" />
        </div>
        <p className="text-sm font-semibold text-white/20">No runs yet</p>
        <p className="text-xs text-white/15 text-center max-w-[260px]">
          Make.com will log execution results here after each scenario run.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="px-5 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <span className="text-xs font-bold text-white/50">Recent Executions</span>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {logs.slice(0, 20).map((log, i) => {
          const preset = PRESETS[log.automation_type]
          const stat   = STATUS_CFG[log.status]
          const StatIcon = stat.icon
          return (
            <motion.div key={log.id}
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-center gap-3 px-5 py-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: `${preset.color}15`, border: `1px solid ${preset.color}25` }}>
                <preset.icon className="w-3.5 h-3.5" style={{ color: preset.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white/70 truncate">{preset.label}</div>
                {log.message && (
                  <div className="text-[10px] text-white/30 truncate mt-0.5">{log.message}</div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="flex items-center gap-1"
                  style={{ color: stat.color }}>
                  <StatIcon className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-semibold">{stat.label}</span>
                </div>
                <span className="text-[10px] text-white/20">{relTime(log.created_at)}</span>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── AutomationCenter ───────────────────────────────────────── */

export default function AutomationCenter({ can }: { can: Permissions }) {
  const canManage = can.canManageAutomations

  const [settings,     setSettings]     = useState<AutoSetting[]>([])
  const [logs,         setLogs]         = useState<AutoLog[]>([])
  const [loading,      setLoading]      = useState(true)
  const [drawerType,   setDrawerType]   = useState<AutomationType | null>(null)
  const [togglingType, setTogglingType] = useState<AutomationType | null>(null)
  const [fetchError,   setFetchError]   = useState<string | null>(null)

  const drawerSetting = drawerType ? (settings.find(s => s.automation_type === drawerType) ?? null) : null

  /* ── Fetch on mount ─────────────────────────────────── */

  const fetchAll = useCallback(async () => {
    try {
      const [sRes, lRes] = await Promise.all([
        fetch('/api/automations'),
        fetch('/api/automation-logs?limit=50'),
      ])
      const [sData, lData] = await Promise.all([sRes.json(), lRes.json()])

      if (!sRes.ok) throw new Error((sData as { error?: string }).error ?? 'Failed to load')

      setSettings((sData as { settings: AutoSetting[] }).settings)
      setLogs((lData as { logs?: AutoLog[] }).logs ?? [])
      setFetchError(null)
    } catch (err) {
      console.error('[AutomationCenter] fetch error:', err)
      setFetchError('Could not load automation settings. Run the SQL migration first.')
      // Still populate defaults so UI renders
      setSettings(ALL_TYPES.map(type => ({
        id: null, automation_type: type,
        enabled: false, channel: 'whatsapp' as Channel,
        delay_minutes: 0,
        config: { ai_message: false, business_hours_only: false, assigned_agent_only: false },
        message_template: '',
        last_run: null, success_count: 0, failure_count: 0, updated_at: null,
      })))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchAll() }, [fetchAll])

  /* ── Toggle enable/disable ──────────────────────────── */

  const handleToggle = useCallback(async (type: AutomationType, enabled: boolean) => {
    // Optimistic update
    setSettings(prev => prev.map(s =>
      s.automation_type === type ? { ...s, enabled } : s
    ))
    setTogglingType(type)

    const current = settings.find(s => s.automation_type === type)

    try {
      if (current?.id) {
        // Row exists — PATCH
        await fetch(`/api/automations/${current.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ enabled }),
        })
      } else {
        // No row yet — POST to create with defaults
        const res  = await fetch('/api/automations', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ ...(current ?? {}), automation_type: type, enabled }),
        })
        if (res.ok) {
          const data = await res.json() as { setting: { id: string } }
          setSettings(prev => prev.map(s =>
            s.automation_type === type ? { ...s, id: data.setting.id } : s
          ))
        }
      }
    } catch (err) {
      // Revert on error
      console.error('[AutomationCenter] toggle error:', err)
      setSettings(prev => prev.map(s =>
        s.automation_type === type ? { ...s, enabled: !enabled } : s
      ))
    } finally {
      setTogglingType(null)
    }
  }, [settings])

  /* ── Save from configure drawer ─────────────────────── */

  const handleSave = useCallback(async (type: AutomationType, patch: Partial<AutoSetting>) => {
    const current = settings.find(s => s.automation_type === type)

    let savedId = current?.id ?? null

    if (savedId) {
      const res = await fetch(`/api/automations/${savedId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? 'Save failed')
      }
    } else {
      const res = await fetch('/api/automations', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...current, automation_type: type, ...patch }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? 'Save failed')
      }
      const data = await res.json() as { setting: { id: string } }
      savedId = data.setting.id
    }

    setSettings(prev => prev.map(s =>
      s.automation_type === type ? { ...s, ...patch, id: savedId } : s
    ))
  }, [settings])

  /* ── Summary stats ──────────────────────────────────── */

  const enabledCount  = settings.filter(s => s.enabled).length
  const totalSuccess  = settings.reduce((a, s) => a + s.success_count, 0)
  const totalFailures = settings.reduce((a, s) => a + s.failure_count, 0)

  return (
    <div className="flex flex-col gap-6">

      {/* Summary row — 3 equal columns on all widths */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { label: 'Active',    fullLabel: 'Active Scenarios', value: enabledCount,   color: '#34d399', icon: ToggleRight },
          { label: 'Successes', fullLabel: 'Total Successes',  value: totalSuccess,   color: '#60a5fa', icon: CheckCircle2 },
          { label: 'Failures',  fullLabel: 'Total Failures',   value: totalFailures,  color: '#f87171', icon: XCircle     },
        ].map((card, i) => {
          const CardIcon = card.icon
          return (
            <motion.div key={card.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className="rounded-2xl px-2 py-3 sm:p-5 flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-4"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {/* Icon — visible only sm+ */}
              <div className="hidden sm:flex w-10 h-10 rounded-xl items-center justify-center flex-shrink-0"
                style={{ background: `${card.color}15`, border: `1px solid ${card.color}28` }}>
                <CardIcon className="w-5 h-5" style={{ color: card.color }} />
              </div>
              {/* Colored dot visible on mobile instead */}
              <div className="sm:hidden w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: card.color }} />
              <div className="text-center sm:text-left">
                <div className="text-xl sm:text-2xl font-black text-white leading-none">{card.value}</div>
                <div className="text-[9px] sm:text-[10px] font-semibold text-white/40 mt-1 leading-tight">
                  <span className="sm:hidden">{card.label}</span>
                  <span className="hidden sm:inline">{card.fullLabel}</span>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Architecture callout */}
      <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl"
        style={{ background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.1)' }}>
        <Webhook className="w-4 h-4 text-blue-400/50 flex-shrink-0 mt-0.5" />
        <div>
          <span className="text-xs font-semibold text-blue-300/60">Make.com Execution Layer</span>
          <p className="text-[10px] text-blue-300/35 mt-0.5 leading-relaxed">
            InstantDesk stores and displays automation configuration. Make.com reads these settings from Supabase
            and handles all WhatsApp/SMS/Email delivery. To migrate to native execution later, replace the
            Make.com webhook layer — this UI and schema stay unchanged.
          </p>
        </div>
      </div>

      {/* Preset cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ALL_TYPES.map(type => (
            <div key={type} className="rounded-2xl h-64 animate-pulse"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {settings.map((setting, i) => (
            <motion.div key={setting.automation_type}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              style={{ opacity: togglingType === setting.automation_type ? 0.7 : 1, transition: 'opacity 0.2s' }}>
              <AutomationCard
                setting={setting}
                onToggle={handleToggle}
                onConfigure={setDrawerType}
                canManage={canManage}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* Recent logs */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-bold text-white">Execution Log</h2>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white/30"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
            Written by Make.com
          </span>
        </div>
        <RecentLogs logs={logs} />
      </div>

      {/* Configure drawer */}
      <AnimatePresence>
        {drawerType && drawerSetting && (
          <ConfigureDrawer
            key={drawerType}
            type={drawerType}
            setting={drawerSetting}
            onClose={() => setDrawerType(null)}
            onSave={handleSave}
            readOnly={!canManage}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
