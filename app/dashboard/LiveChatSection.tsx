'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Bot, Check, CheckCheck, CheckCircle, Clock, FileText, Headphones,
  Camera, Globe2, Image as ImageIcon, Mail, MessageCircle, MessageSquare,
  MessagesSquare, Monitor, Paperclip, Pencil, Phone, RefreshCw, Search, Send,
  ShieldCheck, Smile, StickyNote, Tag, Trash2, User, UserCheck, X, Zap,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

type ConversationStatus = 'ai_active' | 'handover_requested' | 'live_chat' | 'resolved'
type ConversationChannel = 'website' | 'whatsapp' | 'messenger' | 'instagram' | 'email'

interface LiveChatSettings {
  ai_auto_replies_enabled: boolean
  live_chat_enabled: boolean
  human_handover_enabled: boolean
  trigger_ai_cannot_answer: boolean
  trigger_customer_asks_human: boolean
  trigger_phrases: string[]
  availability_enabled: boolean
  availability_timezone: string
  availability_start: string
  availability_end: string
}

interface ConversationItem {
  id: string
  business_id?: string
  customer_id?: string | null
  channel: ConversationChannel
  status: ConversationStatus
  last_message_at: string | null
  unread_count: number
  last_message_preview: string
  last_message_role?: string | null
  assigned_to?: string | null
  visitor_context?: Record<string, unknown> | null
  tags?: string[]
  customer: CustomerSummary | null
  lead: {
    id: string
    name: string | null
    email: string | null
    phone: string | null
    interest: string | null
    score: number | null
    score_label: string | null
    metadata: Record<string, unknown> | null
  } | null
}

interface CustomerSummary {
  id: string
  display_name: string | null
  primary_email: string | null
  primary_phone: string | null
  avatar?: string | null
  company?: string | null
  country?: string | null
  language?: string | null
  timezone?: string | null
  lead_score?: number | null
  lifetime_value?: number | null
  first_seen_at?: string | null
  last_seen_at?: string | null
  conversation_count?: number
  channel_count?: number
  channels?: string[]
}

interface CustomerProfileData {
  customer: CustomerSummary & { notes?: string | null }
  identities: Array<{ id: string; channel: string; external_identifier: string; verified: boolean; confidence_score: number }>
  channels: string[]
  status: 'Verified' | 'Partial' | 'Unknown'
  conversation_count: number
  lifetime_messages: number
  first_seen_at: string | null
  last_active_at: string | null
  timeline: Array<{ id: string; type: string; label: string; channel: string; content?: string | null; created_at: string }>
  duplicate_suggestions: Array<{ id: string; source_customer_id: string; target_customer_id: string; reason: string; confidence_score: number; status: string }>
  merge_history: Array<{ id: string; reason: string | null; created_at: string | null }>
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'ai' | 'human' | 'system'
  content: string
  created_at: string
  read_at?: string | null
  delivery_status?: 'sent' | 'delivered' | 'seen' | 'failed' | null
  metadata?: Record<string, unknown> | null
}

interface Attachment {
  name: string
  type: string
  size: number
  dataUrl: string
  kind?: 'image' | 'file'
}

type ConversationFilter = 'all' | 'unassigned' | 'mine' | 'open' | 'resolved'
type ChannelFilter = 'all' | ConversationChannel
type AdvancedFilter = 'all' | 'assigned' | 'unread' | 'today' | 'yesterday' | 'ai' | 'human'
type TeamMember = { id: string; name: string; role: string; status: string }
type PopoverAnchor = { left: number; top: number }
type IncomingAlert = { conversationId: string; title: string; status: ConversationStatus; createdAt: number }
type EditableCustomerField = 'display_name' | 'primary_email' | 'primary_phone' | 'company' | 'country' | 'language' | 'timezone'

const STATUS_STYLE: Record<ConversationStatus, { label: string; color: string; bg: string; icon: typeof Bot }> = {
  ai_active: { label: 'AI Active', color: '#948f88', bg: 'rgba(148,145,140,0.12)', icon: Bot },
  handover_requested: { label: 'Handover Requested', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', icon: Headphones },
  live_chat: { label: 'Live Chat', color: '#34d399', bg: 'rgba(52,211,153,0.12)', icon: MessageSquare },
  resolved: { label: 'Resolved', color: '#34d399', bg: 'rgba(52,211,153,0.12)', icon: CheckCircle },
}

const CHANNEL_STYLE: Record<ConversationChannel, { label: string; Icon: typeof Globe2; color: string; bg: string }> = {
  website: { label: 'Website', Icon: Globe2, color: '#cbd5e1', bg: 'rgba(148,163,184,0.11)' },
  whatsapp: { label: 'WhatsApp', Icon: MessageCircle, color: '#34d399', bg: 'rgba(52,211,153,0.10)' },
  messenger: { label: 'Messenger', Icon: MessagesSquare, color: '#60a5fa', bg: 'rgba(96,165,250,0.10)' },
  instagram: { label: 'Instagram', Icon: Camera, color: '#f0abfc', bg: 'rgba(240,171,252,0.10)' },
  email: { label: 'Email', Icon: Mail, color: '#facc15', bg: 'rgba(250,204,21,0.10)' },
}

function normalizeChannel(channel: string | null | undefined): ConversationChannel {
  if (channel === 'whatsapp' || channel === 'messenger' || channel === 'instagram' || channel === 'email') return channel
  return 'website'
}

function ChannelPill({ channel }: { channel: string | null | undefined }) {
  const normalized = normalizeChannel(channel)
  const cfg = CHANNEL_STYLE[normalized]
  const Icon = cfg.Icon
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: cfg.color, background: cfg.bg }}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  )
}

function relative(iso: string | null) {
  if (!iso) return 'recently'
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function dateTime(iso: string | null) {
  if (!iso) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function advancedDateMatch(iso: string | null, mode: AdvancedFilter) {
  if (mode !== 'today' && mode !== 'yesterday') return true
  if (!iso) return false
  const value = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  return dayKey(value) === dayKey(mode === 'today' ? today : yesterday)
}

function contextValue(context: Record<string, unknown> | null | undefined, key: string) {
  const value = context?.[key]
  return typeof value === 'string' && value ? value : 'Unknown'
}

function visitorId(conversation: ConversationItem) {
  const source = conversation.lead?.id || conversation.id
  let hash = 0
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(i)) >>> 0
  }
  return `VIS-${hash.toString(36).toUpperCase().slice(0, 6).padStart(6, '0')}`
}

function customerDisplayName(conversation: ConversationItem) {
  return conversation.customer?.display_name || conversation.lead?.name || 'Website visitor'
}

function conversationSearchText(conversation: ConversationItem, tags: string[] = []) {
  return [
    conversation.customer?.display_name,
    conversation.customer?.primary_email,
    conversation.customer?.primary_phone,
    conversation.customer?.company,
    conversation.lead?.name,
    conversation.lead?.email,
    conversation.lead?.phone,
    visitorId(conversation),
    conversation.last_message_preview,
    conversation.assigned_to,
    tags.join(' '),
  ].filter(Boolean).join(' ').toLowerCase()
}

function mergeConversationSnapshot(current: ConversationItem, incoming: ConversationItem): ConversationItem {
  return {
    ...current,
    ...incoming,
    customer_id: incoming.customer_id ?? current.customer_id,
    customer: incoming.customer ?? current.customer,
    lead: incoming.lead ?? current.lead,
    assigned_to: incoming.assigned_to ?? null,
    tags: incoming.tags ?? current.tags,
  }
}

function profileField(value: string | number | null | undefined, fallback = 'Unknown') {
  if (value === null || value === undefined || value === '') return fallback
  return String(value)
}

function connectedChannels(conversation: ConversationItem, profile: CustomerProfileData | null) {
  const values = profile?.channels?.length ? profile.channels : conversation.customer?.channels?.length ? conversation.customer.channels : [conversation.channel]
  return Array.from(new Set(values.map(value => normalizeChannel(value))))
}

function canEditStaffMessage(message: ChatMessage, now = Date.now()) {
  const internalNote = message.role === 'system' && message.metadata?.internal_note === true
  if (message.role !== 'assistant' && message.role !== 'human' && !internalNote) return false
  if (message.metadata?.sender_type !== 'human') return false
  return now - new Date(message.created_at).getTime() <= 2 * 60 * 1000
}

function canDeleteInternalNote(message: ChatMessage) {
  return message.role === 'system' && message.metadata?.internal_note === true && message.metadata?.sender_type === 'human'
}

function attachmentFrom(message: ChatMessage): Attachment | null {
  const raw = message.metadata?.attachment
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Partial<Attachment>
  if (typeof a.name !== 'string' || typeof a.type !== 'string' || typeof a.dataUrl !== 'string') return null
  return {
    name: a.name,
    type: a.type,
    size: typeof a.size === 'number' ? a.size : 0,
    dataUrl: a.dataUrl,
    kind: a.kind === 'image' ? 'image' : 'file',
  }
}

function formatBytes(size: number) {
  if (!size) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function deliveryState(message: ChatMessage) {
  if (message.read_at) return 'seen'
  if (message.delivery_status) return message.delivery_status
  if (typeof message.metadata?.delivery_status === 'string') return message.metadata.delivery_status
  if (message.id.startsWith('pending-')) return 'sent'
  return 'delivered'
}

function DeliveryTicks({ state }: { state: string }) {
  if (state === 'sent') return <Check className="h-3.5 w-3.5 text-white/28" />
  return <CheckCheck className="h-3.5 w-3.5" style={{ color: state === 'seen' ? '#34d399' : 'rgba(255,255,255,0.32)' }} />
}

function SettingsControls({
  settings,
  saveSettings,
  setSettings,
}: {
  settings: LiveChatSettings
  saveSettings: (settings: LiveChatSettings) => void
  setSettings: (settings: LiveChatSettings) => void
}) {
  return (
    <div className="grid gap-2">
      <div className="grid gap-2">
        <Toggle label="AI auto-replies" checked={settings.ai_auto_replies_enabled} onChange={v => saveSettings({ ...settings, ai_auto_replies_enabled: v })} />
        <Toggle label="Live chat" checked={settings.live_chat_enabled} onChange={v => saveSettings({ ...settings, live_chat_enabled: v })} />
        <Toggle label="Human handover" checked={settings.human_handover_enabled} onChange={v => saveSettings({ ...settings, human_handover_enabled: v })} />
        <Toggle label="Availability hours" checked={settings.availability_enabled} onChange={v => saveSettings({ ...settings, availability_enabled: v })} />
        {settings.ai_auto_replies_enabled && (
          <>
            <Toggle label="AI cannot answer" checked={settings.trigger_ai_cannot_answer} onChange={v => saveSettings({ ...settings, trigger_ai_cannot_answer: v })} />
            <Toggle label="Customer asks human" checked={settings.trigger_customer_asks_human} onChange={v => saveSettings({ ...settings, trigger_customer_asks_human: v })} />
          </>
        )}
      </div>
      <div className="grid gap-2">
        <input
          value={settings.trigger_phrases.join(', ')}
          onChange={e => setSettings({ ...settings, trigger_phrases: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
          onBlur={() => saveSettings(settings)}
          aria-label="Trigger phrases"
          className="rounded-xl px-3 py-2 text-xs text-white/70 outline-none"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
        />
        <div className="grid grid-cols-2 gap-2">
          <input type="time" aria-label="Availability start" value={settings.availability_start} onChange={e => saveSettings({ ...settings, availability_start: e.target.value })} className="min-w-0 rounded-xl px-3 py-2 text-xs text-white/70 outline-none" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }} />
          <input type="time" aria-label="Availability end" value={settings.availability_end} onChange={e => saveSettings({ ...settings, availability_end: e.target.value })} className="min-w-0 rounded-xl px-3 py-2 text-xs text-white/70 outline-none" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }} />
        </div>
      </div>
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors"
      style={{ background: checked ? 'rgba(52,211,153,0.09)' : 'rgba(255,255,255,0.04)', border: `1px solid ${checked ? 'rgba(52,211,153,0.22)' : 'rgba(255,255,255,0.07)'}` }}
    >
      <span className="min-w-0 text-xs font-semibold text-white/70">{label}</span>
      <span className="relative h-5 w-9 rounded-full" style={{ background: checked ? '#34d399' : 'rgba(255,255,255,0.12)' }}>
        <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all" style={{ left: checked ? 18 : 2 }} />
      </span>
    </button>
  )
}

function EditableProfileField({
  icon: Icon,
  label,
  field,
  value,
  fallback,
  saving,
  onSave,
}: {
  icon: typeof Mail
  label: string
  field: EditableCustomerField
  value: string | null | undefined
  fallback: string
  saving: boolean
  onSave: (field: EditableCustomerField, value: string) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  useEffect(() => {
    if (!editing) setDraft(value ?? '')
  }, [editing, value])

  const save = async () => {
    const ok = await onSave(field, draft.trim())
    if (ok) setEditing(false)
  }

  if (editing) {
    return (
      <div className="grid gap-1.5 rounded-xl p-2" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <label className="text-[10px] font-bold uppercase tracking-wide text-white/30" htmlFor={`customer-${field}`}>{label}</label>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 flex-shrink-0 text-white/35" />
          <input
            id={`customer-${field}`}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
            style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)' }}
          />
          <button type="button" onClick={() => { setEditing(false); setDraft(value ?? '') }} className="rounded-lg p-1.5 text-white/35 hover:text-white/75" aria-label={`Cancel ${label.toLowerCase()} edit`}>
            <X className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg p-1.5 text-emerald-100 disabled:opacity-40" style={{ background: 'rgba(52,211,153,0.14)' }} aria-label={`Save ${label.toLowerCase()}`}>
            <Check className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex min-w-0 items-center gap-2 text-white/45">
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="min-w-0 flex-1 truncate">{profileField(value, fallback)}</span>
      <button type="button" onClick={() => setEditing(true)} className="rounded-md p-1 text-white/24 opacity-0 transition-opacity hover:text-white/70 group-hover:opacity-100" aria-label={`Edit customer ${label.toLowerCase()}`}>
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function StatusPill({ status }: { status: ConversationStatus }) {
  const cfg = STATUS_STYLE[status]
  const Icon = cfg.icon
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ color: cfg.color, background: cfg.bg }}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  )
}

function CustomerProfilePanel({
  selected,
  profile,
  savingField,
  editNotice,
  onOpenMerge,
  onSaveField,
  onSuggestionAction,
}: {
  selected: ConversationItem
  profile: CustomerProfileData | null
  savingField: EditableCustomerField | null
  editNotice: { type: 'success' | 'error'; message: string } | null
  onOpenMerge: () => void
  onSaveField: (field: EditableCustomerField, value: string) => Promise<boolean>
  onSuggestionAction: (suggestionId: string, action: 'accept' | 'reject' | 'ignore') => void
}) {
  const customer = profile?.customer ?? selected.customer
  const channels = connectedChannels(selected, profile)
  const status = profile?.status ?? (customer?.primary_email || customer?.primary_phone ? 'Partial' : 'Unknown')
  const conversationCount = profile?.conversation_count ?? customer?.conversation_count ?? 1
  const channelCount = profile?.channels?.length ?? customer?.channel_count ?? channels.length

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-3 flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl" style={{ background: 'rgba(148,163,184,0.12)' }}>
          {customer?.avatar ? <img src={customer.avatar} alt="" className="h-full w-full object-cover" /> : <User className="h-5 w-5 text-white/55" />}
        </div>
        <div className="group flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate text-lg font-black text-white">{profileField(customer?.display_name, customerDisplayName(selected))}</div>
          <button type="button" onClick={() => document.getElementById('customer-display-name-inline')?.focus()} className="hidden" aria-hidden="true" />
        </div>
        <div className="text-xs text-white/30">Customer Profile</div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">Visitor ID: {visitorId(selected)}</div>
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: status === 'Verified' ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.05)', color: status === 'Verified' ? '#86efac' : 'rgba(255,255,255,0.42)' }}>
          <ShieldCheck className="h-3 w-3" />
          {status}
        </div>
        <div className="mt-3">
          <EditableProfileField icon={User} label="Name" field="display_name" value={customer?.display_name ?? customerDisplayName(selected)} fallback="Website visitor" saving={savingField === 'display_name'} onSave={onSaveField} />
        </div>
        {editNotice && (
          <div className={`mt-2 text-[11px] font-semibold ${editNotice.type === 'success' ? 'text-emerald-200/75' : 'text-red-200/80'}`}>
            {editNotice.message}
          </div>
        )}
      </div>

      {conversationCount > 1 && (
        <div className="rounded-2xl p-3 text-xs font-semibold leading-relaxed text-white/48" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}>
          This customer has contacted you {conversationCount} times across {channelCount} channel{channelCount === 1 ? '' : 's'}.
        </div>
      )}

      <div className="space-y-3 text-sm">
        <EditableProfileField icon={Mail} label="Email" field="primary_email" value={customer?.primary_email ?? selected.lead?.email} fallback="No email yet" saving={savingField === 'primary_email'} onSave={onSaveField} />
        <EditableProfileField icon={Phone} label="Phone" field="primary_phone" value={customer?.primary_phone ?? selected.lead?.phone} fallback="No phone yet" saving={savingField === 'primary_phone'} onSave={onSaveField} />
        <EditableProfileField icon={UserCheck} label="Company" field="company" value={customer?.company} fallback="No company yet" saving={savingField === 'company'} onSave={onSaveField} />
        <EditableProfileField icon={Globe2} label="Country" field="country" value={customer?.country} fallback="Country unknown" saving={savingField === 'country'} onSave={onSaveField} />
        <EditableProfileField icon={MessageSquare} label="Language" field="language" value={customer?.language} fallback="Language unknown" saving={savingField === 'language'} onSave={onSaveField} />
        <EditableProfileField icon={Clock} label="Timezone" field="timezone" value={customer?.timezone} fallback="Timezone unknown" saving={savingField === 'timezone'} onSave={onSaveField} />
        <div className="flex items-center gap-2 text-white/45"><Zap className="h-4 w-4" />Score {customer?.lead_score ?? selected.lead?.score ?? 0}</div>
        <div className="flex items-center gap-2 text-white/45"><ShieldCheck className="h-4 w-4" />Lifetime value {customer?.lifetime_value ? `$${customer.lifetime_value}` : 'not tracked yet'}</div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-black uppercase tracking-wide text-white/36">Channels connected</div>
        <div className="flex flex-wrap gap-1.5">
          {(['website', 'whatsapp', 'messenger', 'instagram', 'email'] as ConversationChannel[]).map(channel => (
            <span key={channel} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold" style={{ background: channels.includes(channel) ? CHANNEL_STYLE[channel].bg : 'rgba(255,255,255,0.035)', color: channels.includes(channel) ? CHANNEL_STYLE[channel].color : 'rgba(255,255,255,0.24)' }}>
              {CHANNEL_STYLE[channel].label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl p-2" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-white/28">Conversations</div>
          <div className="mt-1 font-black text-white/76">{conversationCount}</div>
        </div>
        <div className="rounded-xl p-2" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-white/28">Messages</div>
          <div className="mt-1 font-black text-white/76">{profile?.lifetime_messages ?? '—'}</div>
        </div>
        <div className="rounded-xl p-2" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-white/28">First seen</div>
          <div className="mt-1 truncate font-bold text-white/58">{dateTime(profile?.first_seen_at ?? customer?.first_seen_at ?? selected.last_message_at)}</div>
        </div>
        <div className="rounded-xl p-2" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-white/28">Last active</div>
          <div className="mt-1 truncate font-bold text-white/58">{dateTime(profile?.last_active_at ?? customer?.last_seen_at ?? selected.last_message_at)}</div>
        </div>
      </div>

      {customer?.id && (
        <button type="button" onClick={onOpenMerge} className="w-full rounded-xl px-3 py-2 text-xs font-bold text-white/62 hover:text-white" style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.08)' }}>
          Merge Customers
        </button>
      )}

      {Boolean(profile?.duplicate_suggestions?.filter(item => item.status === 'pending').length) && (
        <div className="space-y-2 rounded-2xl p-3" style={{ background: 'rgba(250,204,21,0.055)', border: '1px solid rgba(250,204,21,0.13)' }}>
          <div className="text-xs font-black text-amber-100/75">Possible duplicate</div>
          {profile!.duplicate_suggestions.filter(item => item.status === 'pending').slice(0, 2).map(suggestion => (
            <div key={suggestion.id} className="space-y-2">
              <div className="text-xs text-white/45">{suggestion.reason} · {suggestion.confidence_score}% confidence</div>
              <div className="flex gap-1">
                <button type="button" onClick={() => onSuggestionAction(suggestion.id, 'accept')} className="rounded-lg px-2 py-1 text-[10px] font-bold text-emerald-100" style={{ background: 'rgba(52,211,153,0.12)' }}>Accept</button>
                <button type="button" onClick={() => onSuggestionAction(suggestion.id, 'reject')} className="rounded-lg px-2 py-1 text-[10px] font-bold text-white/48" style={{ background: 'rgba(255,255,255,0.05)' }}>Reject</button>
                <button type="button" onClick={() => onSuggestionAction(suggestion.id, 'ignore')} className="rounded-lg px-2 py-1 text-[10px] font-bold text-white/35" style={{ background: 'rgba(255,255,255,0.035)' }}>Ignore</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function normalizedSearch(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

function mergeSearchScore(customer: CustomerSummary, query: string) {
  const q = normalizedSearch(query)
  const email = normalizedSearch(customer.primary_email)
  const phone = normalizedSearch(customer.primary_phone).replace(/[^\d+]/g, '')
  const qPhone = q.replace(/[^\d+]/g, '')
  const name = normalizedSearch(customer.display_name)
  const company = normalizedSearch(customer.company)

  if (!q) return 999
  if ((email && email === q) || (phone && qPhone && phone === qPhone)) return 0
  if (name && name === q) return 1
  if ((name && name.startsWith(q)) || (email && email.startsWith(q)) || (phone && qPhone && phone.startsWith(qPhone))) return 2
  if ((name && name.includes(q)) || (email && email.includes(q)) || (phone && qPhone && phone.includes(qPhone))) return 3
  if (company && (company.startsWith(q) || company.includes(q))) return 4
  return 5
}

function highlightMatch(value: string | null | undefined, query: string) {
  const text = value ?? ''
  const q = query.trim()
  if (!text || !q) return text
  const index = text.toLowerCase().indexOf(q.toLowerCase())
  if (index < 0) return text
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-yellow-300/25 px-0.5 text-yellow-100">{text.slice(index, index + q.length)}</mark>
      {text.slice(index + q.length)}
    </>
  )
}

function MergeCustomersModal({
  source,
  onClose,
  onMerged,
}: {
  source: CustomerSummary
  onClose: () => void
  onMerged: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CustomerSummary[]>([])
  const [target, setTarget] = useState<CustomerSummary | null>(null)
  const [reason, setReason] = useState('Manual duplicate merge')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (query.trim().length < 1) {
      setResults([])
      return
    }
    const controller = new AbortController()
    const run = async () => {
      const res = await fetch(`/api/customers/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
      if (!res.ok) return
      const data = await res.json() as { customers?: CustomerSummary[] }
      setResults((data.customers ?? [])
        .filter(customer => customer.id !== source.id)
        .sort((a, b) => mergeSearchScore(a, query) - mergeSearchScore(b, query)))
    }
    void run().catch(() => undefined)
    return () => controller.abort()
  }, [query, source.id])

  const merge = async () => {
    if (!target) return
    setSaving(true)
    setError(null)
    const res = await fetch('/api/customers/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_customer_id: source.id, target_customer_id: target.id, reason }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string }
      setError(body.error ?? 'Merge failed')
      setSaving(false)
      return
    }
    setSaving(false)
    onMerged()
  }

  const conflicts = target ? [
    ['Name', source.display_name, target.display_name],
    ['Email', source.primary_email, target.primary_email],
    ['Phone', source.primary_phone, target.primary_phone],
    ['Company', source.company, target.company],
  ].filter(([, left, right]) => left && right && left !== right) : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-2xl rounded-2xl p-5 shadow-2xl" style={{ background: 'rgba(18,16,14,0.98)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-lg font-black text-white">Merge Customers</div>
            <div className="text-xs text-white/36">Search, preview conflicts, then merge into the selected target profile.</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/40 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search customer by name, email, phone, or company" className="mb-3 w-full rounded-xl px-3 py-3 text-sm text-white outline-none" style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.08)' }} />
        <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {results.map(customer => (
              <button key={customer.id} type="button" onClick={() => setTarget(customer)} className="w-full rounded-xl px-3 py-2 text-left text-xs hover:bg-white/8" style={{ background: target?.id === customer.id ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.055)' }}>
                <div className="font-bold text-white/70">{highlightMatch(profileField(customer.display_name, 'Unnamed customer'), query)}</div>
                <div className="truncate text-white/32">{highlightMatch(customer.primary_email || customer.primary_phone || 'No contact data', query)}</div>
              </button>
            ))}
            {!results.length && <div className="rounded-xl p-3 text-xs text-white/30" style={{ background: 'rgba(255,255,255,0.025)' }}>Search for another customer to merge.</div>}
          </div>
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {[source, target].map((customer, index) => (
                <div key={index} className="rounded-2xl p-3 text-xs" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="mb-2 font-black text-white/70">{index === 0 ? 'Source' : 'Target'}</div>
                  <div className="font-bold text-white/70">{profileField(customer?.display_name, 'Select target')}</div>
                  <div className="text-white/36">{profileField(customer?.primary_email, 'No email')}</div>
                  <div className="text-white/36">{profileField(customer?.primary_phone, 'No phone')}</div>
                  <div className="text-white/36">{profileField(customer?.company, 'No company')}</div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl p-3 text-xs" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="mb-2 font-black text-white/60">Conflicts</div>
              {conflicts.length ? conflicts.map(([label, left, right]) => (
                <div key={label} className="grid grid-cols-[70px_1fr] gap-2 py-1 text-white/38">
                  <span>{label}</span>
                  <span className="truncate">{String(left)} → {String(right)}</span>
                </div>
              )) : <div className="text-white/30">No direct conflicts detected.</div>}
            </div>
            <input value={reason} onChange={event => setReason(event.target.value)} className="w-full rounded-xl px-3 py-2 text-xs text-white outline-none" style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.08)' }} />
            {error && <div className="text-xs text-red-200/80">{error}</div>}
            <button type="button" onClick={() => void merge()} disabled={!target || saving} className="w-full rounded-xl px-4 py-3 text-sm font-bold text-white disabled:opacity-35" style={{ background: 'rgba(52,211,153,0.18)', border: '1px solid rgba(52,211,153,0.28)' }}>Merge</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LiveChatSection({ businessId }: { businessId: string }) {
  const [settings, setSettings] = useState<LiveChatSettings | null>(null)
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messageCache, setMessageCache] = useState<Record<string, ChatMessage[]>>({})
  const [reply, setReply] = useState('')
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [filter, setFilter] = useState<ConversationFilter>('open')
  const [advancedFilter, setAdvancedFilter] = useState<AdvancedFilter>('all')
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('all')
  const [tagsByConversation, setTagsByConversation] = useState<Record<string, string[]>>({})
  const [tagDraft, setTagDraft] = useState('')
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [assignOpen, setAssignOpen] = useState(false)
  const [quickRepliesOpen, setQuickRepliesOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [currentStaffName, setCurrentStaffName] = useState('You')
  const [loading, setLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [sending, setSending] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all')
  const [settingsAnchor, setSettingsAnchor] = useState<PopoverAnchor>({ left: 840, top: 80 })
  const [analyticsAnchor, setAnalyticsAnchor] = useState<PopoverAnchor>({ left: 980, top: 80 })
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [composeMode, setComposeMode] = useState<'reply' | 'note'>('reply')
  const [visitorTyping, setVisitorTyping] = useState(false)
  const [typingByConversation, setTypingByConversation] = useState<Record<string, boolean>>({})
  const [showThreadNewMessage, setShowThreadNewMessage] = useState(false)
  const [customerProfile, setCustomerProfile] = useState<CustomerProfileData | null>(null)
  const [customerProfileId, setCustomerProfileId] = useState<string | null>(null)
  const [savingCustomerField, setSavingCustomerField] = useState<EditableCustomerField | null>(null)
  const [customerEditNotice, setCustomerEditNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [incomingAlerts, setIncomingAlerts] = useState<IncomingAlert[]>([])
  const typingStopRef = useRef<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const messagePaneRef = useRef<HTMLDivElement>(null)
  const wasAtThreadBottomRef = useRef(true)
  const previousSelectedIdRef = useRef<string | null>(null)
  const previousLastMessageIdRef = useRef<string | null>(null)
  const activeProfileRequestRef = useRef<string | null>(null)
  const messageCacheRef = useRef<Record<string, ChatMessage[]>>({})
  const conversationsRef = useRef<ConversationItem[]>([])
  const alertWatermarkRef = useRef(Date.now())
  const dismissedIncomingAlertRef = useRef<Record<string, string | null>>({})
  const selectedIdRef = useRef<string | null>(null)
  const filterRef = useRef(filter)
  const channelFilterRef = useRef(channelFilter)
  const advancedFilterRef = useRef(advancedFilter)
  const searchRef = useRef(search)
  const tagFilterRef = useRef(tagFilter)
  const tagsByConversationRef = useRef(tagsByConversation)

  const selected = useMemo(
    () => conversations.find(c => c.id === selectedId) ?? conversations.find(c => c.status !== 'resolved') ?? conversations[0] ?? null,
    [conversations, selectedId],
  )
  const selectedMessageId = selected?.id ?? null
  const messages = useMemo(
    () => selectedMessageId ? (messageCache[selectedMessageId] ?? []).filter(message => message.metadata?.deleted !== true) : [],
    [messageCache, selectedMessageId],
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isThreadAtBottom = useCallback(() => {
    const node = messagePaneRef.current
    if (!node) return true
    return node.scrollHeight - node.scrollTop - node.clientHeight < 48
  }, [])
  const scrollThreadToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const node = messagePaneRef.current
    if (!node) return
    node.scrollTo({ top: node.scrollHeight, behavior })
    wasAtThreadBottomRef.current = true
    setShowThreadNewMessage(false)
  }, [])
  const handleThreadScroll = useCallback(() => {
    const atBottom = isThreadAtBottom()
    wasAtThreadBottomRef.current = atBottom
    if (atBottom) setShowThreadNewMessage(false)
  }, [isThreadAtBottom])
  const mergeMessages = useCallback((conversationId: string, nextMessages: ChatMessage[]) => {
    setMessageCache(prev => {
      const byId = new Map((prev[conversationId] ?? []).map(message => [message.id, message]))
      for (const message of nextMessages) byId.set(message.id, message)
      const next = {
        ...prev,
        [conversationId]: [...byId.values()].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
      }
      messageCacheRef.current = next
      return next
    })
  }, [])
  const isTakenOver = selected?.status === 'live_chat'
  const metrics = useMemo(() => [
    { label: 'Open handovers', value: conversations.filter(c => c.status === 'handover_requested').length, Icon: Headphones, color: '#fbbf24' },
    { label: 'Live chats', value: conversations.filter(c => c.status === 'live_chat').length, Icon: MessageSquare, color: '#34d399' },
    { label: 'Unread', value: conversations.reduce((sum, c) => sum + c.unread_count, 0), Icon: Clock, color: '#948f88' },
  ], [conversations])
  const allTags = useMemo(() => Array.from(new Set(Object.values(tagsByConversation).flat())).sort((a, b) => a.localeCompare(b)), [tagsByConversation])
  const filteredConversations = useMemo(() => conversations.filter((conversation) => {
    if (channelFilter !== 'all' && normalizeChannel(conversation.channel) !== channelFilter) return false
    const tags = tagsByConversation[conversation.id] ?? conversation.tags ?? []
    if (tagFilter !== 'all' && !tags.includes(tagFilter)) return false
    if (advancedFilter === 'assigned' && !conversation.assigned_to) return false
    if (advancedFilter === 'unread' && conversation.unread_count <= 0) return false
    if ((advancedFilter === 'today' || advancedFilter === 'yesterday') && !advancedDateMatch(conversation.last_message_at, advancedFilter)) return false
    if (advancedFilter === 'ai' && conversation.last_message_role !== 'assistant') return false
    if (advancedFilter === 'human' && conversation.assigned_to === null) return false
    const haystack = conversationSearchText(conversation, tags)
    if (search.trim() && !haystack.includes(search.trim().toLowerCase())) return false
    if (filter === 'all') return true
    if (filter === 'unassigned') return !conversation.assigned_to && conversation.status !== 'resolved'
    if (filter === 'mine') return conversation.assigned_to === currentStaffName && conversation.status !== 'resolved'
    if (filter === 'open') return conversation.status !== 'resolved'
    return conversation.status === 'resolved'
  }), [advancedFilter, channelFilter, conversations, currentStaffName, filter, search, tagFilter, tagsByConversation])
  const selectedAssignedElsewhere = Boolean(selected?.assigned_to && selected.assigned_to !== currentStaffName)
  const newOpenAlertCount = incomingAlerts.filter(alert => alert.status !== 'resolved').length
  const newAllAlertCount = incomingAlerts.length

  const matchesCurrentFilterSnapshot = useCallback((conversation: ConversationItem) => {
    const activeChannel = channelFilterRef.current
    const activeAdvanced = advancedFilterRef.current
    const activeTag = tagFilterRef.current
    const activeFilter = filterRef.current
    const activeSearch = searchRef.current
    const tags = tagsByConversationRef.current[conversation.id] ?? conversation.tags ?? []
    if (activeChannel !== 'all' && normalizeChannel(conversation.channel) !== activeChannel) return false
    if (activeTag !== 'all' && !tags.includes(activeTag)) return false
    if (activeAdvanced === 'assigned' && !conversation.assigned_to) return false
    if (activeAdvanced === 'unread' && conversation.unread_count <= 0) return false
    if ((activeAdvanced === 'today' || activeAdvanced === 'yesterday') && !advancedDateMatch(conversation.last_message_at, activeAdvanced)) return false
    if (activeAdvanced === 'ai' && conversation.last_message_role !== 'assistant') return false
    if (activeAdvanced === 'human' && conversation.assigned_to === null) return false
    if (activeSearch.trim() && !conversationSearchText(conversation, tags).includes(activeSearch.trim().toLowerCase())) return false
    if (activeFilter === 'all') return true
    if (activeFilter === 'unassigned') return !conversation.assigned_to && conversation.status !== 'resolved'
    if (activeFilter === 'mine') return conversation.assigned_to === currentStaffName && conversation.status !== 'resolved'
    if (activeFilter === 'open') return conversation.status !== 'resolved'
    return conversation.status === 'resolved'
  }, [currentStaffName])

  const addIncomingAlert = useCallback((conversation: ConversationItem, kind: 'conversation' | 'message') => {
    const visibleInCurrentFilter = matchesCurrentFilterSnapshot(conversation)
    if (conversation.id === selectedIdRef.current && visibleInCurrentFilter) return
    if (visibleInCurrentFilter) return
    if (dismissedIncomingAlertRef.current[conversation.id] === conversation.last_message_at) return
    const name = customerDisplayName(conversation)
    const title = kind === 'conversation'
      ? `New live chat from ${name}`
      : `New message from ${name}`
    setIncomingAlerts(prev => {
      const next = prev.filter(alert => alert.conversationId !== conversation.id)
      return [{ conversationId: conversation.id, title, status: conversation.status, createdAt: Date.now() }, ...next].slice(0, 5)
    })
  }, [matchesCurrentFilterSnapshot])

  useEffect(() => {
    if (!filteredConversations.length) return
    if (!selectedId || !filteredConversations.some(conversation => conversation.id === selectedId)) {
      const nextId = filteredConversations[0].id
      setSelectedId(nextId)
      selectedIdRef.current = nextId
    }
  }, [filteredConversations, selectedId])

  const loadSettings = useCallback(async () => {
    const res = await fetch('/api/live-chat/settings')
    if (!res.ok) return
    const data = await res.json() as { settings: LiveChatSettings; current_user?: { name?: string } }
    setSettings(data.settings)
    if (data.current_user?.name) setCurrentStaffName(data.current_user.name)
  }, [])

  const loadTeamMembers = useCallback(async () => {
    const res = await fetch('/api/team')
    if (!res.ok) return
    const data = await res.json() as { members?: TeamMember[] }
    const members = (data.members ?? []).filter(member => member.status === 'active')
    setTeamMembers(members)
    setCurrentStaffName(prev => prev === 'You' ? members[0]?.name ?? prev : prev)
  }, [])

  const loadMessages = useCallback(async (conversationId: string, delta = false) => {
    const cached = messageCacheRef.current[conversationId] ?? []
    const since = delta && cached.length ? `?since=${encodeURIComponent(cached[cached.length - 1].created_at)}` : ''
    const res = await fetch(`/api/live-chat/conversations/${conversationId}/messages${since}`)
    if (!res.ok) return
    const data = await res.json() as { messages: ChatMessage[] }
    if (delta) mergeMessages(conversationId, data.messages)
    else {
      setMessageCache(prev => {
        const next = { ...prev, [conversationId]: data.messages }
        messageCacheRef.current = next
        return next
      })
    }
    setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, unread_count: 0 } : c))
  }, [mergeMessages])

  const openIncomingAlert = useCallback((alert: IncomingAlert) => {
    const conversation = conversationsRef.current.find(item => item.id === alert.conversationId)
    if (conversation) dismissedIncomingAlertRef.current[conversation.id] = conversation.last_message_at
    setFilter(alert.status === 'resolved' ? 'resolved' : 'open')
    setSelectedId(alert.conversationId)
    selectedIdRef.current = alert.conversationId
    setIncomingAlerts(prev => prev.filter(item => item.conversationId !== alert.conversationId))
    void loadMessages(alert.conversationId, Boolean(messageCacheRef.current[alert.conversationId]?.length))
  }, [loadMessages])

  const selectConversation = useCallback((conversationId: string) => {
    setSelectedId(conversationId)
    selectedIdRef.current = conversationId
    setShowThreadNewMessage(false)
    wasAtThreadBottomRef.current = true
    void loadMessages(conversationId, Boolean(messageCacheRef.current[conversationId]?.length))
  }, [loadMessages])

  const loadConversations = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    const res = await fetch('/api/live-chat/conversations')
    if (res.ok) {
      const data = await res.json() as { conversations: ConversationItem[] }
      const normalized = data.conversations.map(conversation => ({
        ...conversation,
        channel: normalizeChannel(conversation.channel),
      }))
      const previousById = new Map(conversationsRef.current.map(conversation => [conversation.id, conversation]))
      const merged = normalized.map(conversation => {
        const previous = previousById.get(conversation.id)
        return previous ? mergeConversationSnapshot(previous, conversation) : conversation
      })
      if (showLoading) alertWatermarkRef.current = Date.now()
      setConversations(merged)
      conversationsRef.current = merged
      if (!showLoading) {
        for (const conversation of merged) {
          const previous = previousById.get(conversation.id)
          const hasNewMessage = Boolean(previous && previous.last_message_at !== conversation.last_message_at)
          if (!previous || hasNewMessage) addIncomingAlert(conversation, previous ? 'message' : 'conversation')
        }
      }
      setSelectedId(prev => {
        const visibleConversation = merged.find(conversation => matchesCurrentFilterSnapshot(conversation))
        const next = prev ?? visibleConversation?.id ?? null
        selectedIdRef.current = next
        if (next && !messageCacheRef.current[next]) void loadMessages(next, false)
        return next
      })
      if (showLoading) setLoading(false)
      return normalized
    }
    if (showLoading) setLoading(false)
    return []
  }, [addIncomingAlert, loadMessages, matchesCurrentFilterSnapshot])

  useEffect(() => {
    void loadSettings()
    void loadTeamMembers()
    void loadConversations(true)
  }, [loadSettings, loadTeamMembers, loadConversations])

  useEffect(() => {
    selectedIdRef.current = selected?.id ?? null
  }, [selected?.id])

  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])

  useEffect(() => {
    for (const conversation of conversations) {
      const lastMessageAt = conversation.last_message_at ? new Date(conversation.last_message_at).getTime() : NaN
      if (!Number.isFinite(lastMessageAt) || lastMessageAt < alertWatermarkRef.current - 5000) continue
      if (!matchesCurrentFilterSnapshot(conversation)) addIncomingAlert(conversation, 'message')
    }
  }, [addIncomingAlert, conversations, matchesCurrentFilterSnapshot])

  useEffect(() => {
    filterRef.current = filter
    channelFilterRef.current = channelFilter
    advancedFilterRef.current = advancedFilter
    searchRef.current = search
    tagFilterRef.current = tagFilter
    tagsByConversationRef.current = tagsByConversation
  }, [advancedFilter, channelFilter, filter, search, tagFilter, tagsByConversation])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!editingMessageId) return
    const message = messages.find(item => item.id === editingMessageId)
    if (message && !canEditStaffMessage(message, now)) {
      setEditingMessageId(null)
      setEditDraft('')
    }
  }, [editingMessageId, messages, now])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTypingTarget = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
      if (event.key === 'Escape') {
        setAssignOpen(false)
        setQuickRepliesOpen(false)
        setEmojiOpen(false)
        setSettingsOpen(false)
        setAnalyticsOpen(false)
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        const searchInput = document.querySelector<HTMLInputElement>('[data-live-chat-search="true"]')
        searchInput?.focus()
      }
      if (!isTypingTarget && event.key.toLowerCase() === 'n') setComposeMode('note')
      if (!isTypingTarget && event.key.toLowerCase() === 'r') setComposeMode('reply')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useLayoutEffect(() => {
    const currentMessageId = messages[messages.length - 1]?.id ?? null
    const switchedConversation = selectedMessageId !== previousSelectedIdRef.current
    const newMessageInCurrentConversation = Boolean(currentMessageId && currentMessageId !== previousLastMessageIdRef.current)

    if (switchedConversation) {
      previousSelectedIdRef.current = selectedMessageId
      previousLastMessageIdRef.current = currentMessageId
      wasAtThreadBottomRef.current = true
      scrollThreadToBottom('auto')
      return
    }

    if (newMessageInCurrentConversation) {
      previousLastMessageIdRef.current = currentMessageId
      if (wasAtThreadBottomRef.current || isThreadAtBottom()) {
        scrollThreadToBottom('auto')
      } else {
        setShowThreadNewMessage(true)
      }
    }
  }, [isThreadAtBottom, messages, scrollThreadToBottom, selectedMessageId])

  useEffect(() => {
    if (!selected?.id || tagsByConversation[selected.id]) return
    const loadTags = async () => {
      const res = await fetch(`/api/live-chat/conversations/${selected.id}/tags`)
      if (!res.ok) return
      const data = await res.json() as { tags?: string[] }
      setTagsByConversation(prev => ({ ...prev, [selected.id]: data.tags ?? [] }))
    }
    void loadTags()
  }, [selected?.id, tagsByConversation])

  const loadCustomerProfile = useCallback(async (customerId: string) => {
    activeProfileRequestRef.current = customerId
    const res = await fetch(`/api/customers/${customerId}`)
    if (activeProfileRequestRef.current !== customerId) return
    if (!res.ok) {
      setCustomerProfile(null)
      setCustomerProfileId(null)
      return
    }
    const data = await res.json() as { profile?: CustomerProfileData }
    if (activeProfileRequestRef.current !== customerId) return
    setCustomerProfile(data.profile ?? null)
    setCustomerProfileId(data.profile?.customer?.id ?? customerId)
  }, [])

  useEffect(() => {
    const customerId = selected?.customer?.id ?? selected?.customer_id ?? null
    setMergeOpen(false)
    setCustomerProfile(null)
    setCustomerProfileId(customerId)
    activeProfileRequestRef.current = customerId
    if (!customerId) {
      setCustomerProfileId(null)
      return
    }
    void loadCustomerProfile(customerId)
  }, [loadCustomerProfile, selected?.customer?.id, selected?.customer_id])

  useEffect(() => {
    if (!selected?.id) return
    const pollTyping = async () => {
      try {
        const res = await fetch(`/api/live-chat/typing?conversation_id=${selected.id}`)
        if (!res.ok) return
        const data = await res.json() as { typing?: { actor_type?: string }[] }
        const isTyping = Boolean(data.typing?.some(item => item.actor_type === 'visitor'))
        setVisitorTyping(isTyping)
        setTypingByConversation(prev => ({ ...prev, [selected.id]: isTyping }))
      } catch { /* best-effort */ }
    }
    void pollTyping()
    const interval = window.setInterval(() => void pollTyping(), 1800)
    return () => window.clearInterval(interval)
  }, [selected?.id])

  useEffect(() => {
    const ids = filteredConversations.slice(0, 30).map(conversation => conversation.id)
    if (!ids.length) {
      setTypingByConversation({})
      return
    }
    const pollVisibleTyping = async () => {
      const entries = await Promise.all(ids.map(async id => {
        try {
          const res = await fetch(`/api/live-chat/typing?conversation_id=${id}`)
          if (!res.ok) return [id, false] as const
          const data = await res.json() as { typing?: { actor_type?: string }[] }
          return [id, Boolean(data.typing?.some(item => item.actor_type === 'visitor'))] as const
        } catch {
          return [id, false] as const
        }
      }))
      setTypingByConversation(prev => {
        const next = { ...prev }
        for (const [id, isTyping] of entries) next[id] = isTyping
        return next
      })
    }
    void pollVisibleTyping()
    const interval = window.setInterval(() => void pollVisibleTyping(), 2200)
    return () => window.clearInterval(interval)
  }, [filteredConversations])

  const anchorFromEvent = (event: Event, width: number, fallbackLeft: number): PopoverAnchor => {
    const detail = (event as CustomEvent<{ left: number; right: number; bottom: number } | null>).detail
    if (!detail || typeof window === 'undefined') return { left: fallbackLeft, top: 80 }
    return {
      left: Math.min(window.innerWidth - width - 16, Math.max(16, detail.left)),
      top: detail.bottom + 10,
    }
  }

  useEffect(() => {
    const openSettings = (event: Event) => {
      setSettingsAnchor(anchorFromEvent(event, 320, 840))
      setAnalyticsOpen(false)
      setSettingsOpen(true)
    }
    const openAnalytics = (event: Event) => {
      setAnalyticsAnchor(anchorFromEvent(event, 340, 980))
      setSettingsOpen(false)
      setAnalyticsOpen(true)
    }
    const closeAll = () => {
      setSettingsOpen(false)
      setAnalyticsOpen(false)
    }
    window.addEventListener('instantdesk-live-chat-settings', openSettings)
    window.addEventListener('instantdesk-live-chat-analytics', openAnalytics)
    window.addEventListener('instantdesk-live-chat-close-popovers', closeAll)
    return () => {
      window.removeEventListener('instantdesk-live-chat-settings', openSettings)
      window.removeEventListener('instantdesk-live-chat-analytics', openAnalytics)
      window.removeEventListener('instantdesk-live-chat-close-popovers', closeAll)
    }
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel(`live-chat-${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        const row = payload.new as ChatMessage & { conversation_id?: string } | null
        if (row?.conversation_id) {
          if (row.id && row.content !== undefined && row.created_at) mergeMessages(row.conversation_id, [row])
          else void loadMessages(row.conversation_id, true)
        }
        if (row?.conversation_id) {
          void loadConversations(false).then(next => {
            const conversation = next.find(item => item.id === row.conversation_id)
            if (conversation) addIncomingAlert(conversation, 'message')
          })
        } else {
          void loadConversations(false)
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, (payload) => {
        const row = payload.new as { id?: string; customer_id?: string | null; status?: ConversationStatus; unread_count?: number; last_message_at?: string; assigned_to?: string | null } | null
        if (selectedIdRef.current && row?.id === selectedIdRef.current) {
          setConversations(prev => prev.map(c => c.id === row.id ? {
            ...c,
            customer_id: row.customer_id ?? c.customer_id,
            status: row.status ?? c.status,
            assigned_to: row.assigned_to !== undefined ? row.assigned_to : c.assigned_to,
            unread_count: row.unread_count ?? c.unread_count,
            last_message_at: row.last_message_at ?? c.last_message_at,
          } : c))
        }
        if (row?.id) {
          void loadConversations(false).then(next => {
            const conversation = next.find(item => item.id === row.id)
            if (conversation) addIncomingAlert(conversation, 'conversation')
          })
        } else {
          void loadConversations(false)
        }
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [addIncomingAlert, businessId, loadConversations, loadMessages, mergeMessages])

  useEffect(() => {
    let ticks = 0
    const interval = window.setInterval(() => {
      ticks += 1
      void loadConversations(false)
      const current = selectedIdRef.current
      if (current) void loadMessages(current, ticks % 5 !== 0)
    }, 7000)
    return () => {
      window.clearInterval(interval)
    }
  }, [loadConversations, loadMessages])

  const normalizeSettings = (next: LiveChatSettings): LiveChatSettings => {
    if (next.ai_auto_replies_enabled) return next
    return {
      ...next,
      trigger_ai_cannot_answer: false,
      trigger_customer_asks_human: false,
    }
  }

  const saveSettings = async (next: LiveChatSettings) => {
    const normalized = normalizeSettings(next)
    setSettings(normalized)
    setSavingSettings(true)
    const res = await fetch('/api/live-chat/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalized),
    })
    if (res.ok) {
      const data = await res.json() as { settings: LiveChatSettings }
      setSettings(data.settings)
    }
    setSavingSettings(false)
  }

  const updateStatus = async (status: ConversationStatus, assignedTo?: string | null) => {
    if (!selected) return
    const conversationId = selected.id
    const previous = conversations
    const optimisticAssigned =
      status === 'resolved' || status === 'ai_active'
        ? null
        : assignedTo === undefined
          ? currentStaffName
          : assignedTo

    setStatusError(null)
    if (status === 'live_chat' && optimisticAssigned) setCurrentStaffName(optimisticAssigned)
    if (status === 'resolved') setFilter('resolved')
    setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, status, assigned_to: optimisticAssigned } : c))

    const res = await fetch(`/api/live-chat/conversations/${conversationId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, assigned_to: assignedTo === undefined ? undefined : assignedTo }),
    })
    if (!res.ok) {
      setConversations(previous)
      setStatusError('Status update failed. Please try again.')
      window.setTimeout(() => setStatusError(null), 3500)
      return
    }
    const data = await res.json().catch(() => ({})) as { assigned_to?: string | null }
    if (data.assigned_to) setCurrentStaffName(data.assigned_to)
    setConversations(prev => prev.map(c => c.id === conversationId ? {
      ...c,
      status,
      assigned_to: data.assigned_to !== undefined ? data.assigned_to : optimisticAssigned,
    } : c))
    await loadMessages(conversationId, true)
  }

  const saveCustomerField = async (field: EditableCustomerField, value: string) => {
    if (!selected) return false
    const customerId = selected.customer?.id ?? selected.customer_id
    if (!customerId) {
      setCustomerEditNotice({ type: 'error', message: 'Customer profile is not linked yet.' })
      return false
    }
    const previousConversations = conversationsRef.current
    const previousProfile = customerProfile
    const normalizedValue = value.trim()
    setSavingCustomerField(field)
    setCustomerEditNotice(null)

    setConversations(prev => prev.map(conversation => {
      if ((conversation.customer?.id ?? conversation.customer_id) !== customerId) return conversation
      return {
        ...conversation,
        customer: {
          ...(conversation.customer ?? {
            id: customerId,
            display_name: null,
            primary_email: null,
            primary_phone: null,
          }),
          [field]: normalizedValue || null,
        } as CustomerSummary,
      }
    }))
    setCustomerProfile(prev => prev && prev.customer.id === customerId ? {
      ...prev,
      customer: { ...prev.customer, [field]: normalizedValue || null },
    } : prev)

    const res = await fetch(`/api/customers/${customerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: normalizedValue }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string }
      setConversations(previousConversations)
      setCustomerProfile(previousProfile)
      setCustomerEditNotice({ type: 'error', message: body.error ?? 'Customer update failed.' })
      setSavingCustomerField(null)
      return false
    }
    const data = await res.json().catch(() => ({})) as { customer?: CustomerSummary }
    if (data.customer) {
      setConversations(prev => prev.map(conversation => {
        if ((conversation.customer?.id ?? conversation.customer_id) !== customerId) return conversation
        return { ...conversation, customer: { ...(conversation.customer ?? data.customer), ...data.customer } as CustomerSummary }
      }))
      setCustomerProfile(prev => prev && prev.customer.id === customerId ? { ...prev, customer: { ...prev.customer, ...data.customer } } : prev)
    }
    setCustomerEditNotice({ type: 'success', message: 'Customer profile saved.' })
    window.setTimeout(() => setCustomerEditNotice(null), 2400)
    setSavingCustomerField(null)
    return true
  }

  const sendReply = async () => {
    if (!selected || (!reply.trim() && !attachment) || sending) return
    if (selectedAssignedElsewhere && composeMode === 'reply') return
    setSending(true)
    const text = reply.trim()
    const mode = composeMode
    const pending: ChatMessage = {
      id: `pending-${Date.now()}`,
      role: mode === 'note' ? 'system' : 'assistant',
      content: text || attachment?.name || '',
      created_at: new Date().toISOString(),
      metadata: { sender_type: 'human', sender_name: currentStaffName, attachment, delivery_status: 'sent', internal_note: mode === 'note' },
    }
    mergeMessages(selected.id, [pending])
    setReply('')
    setAttachment(null)
    const res = await fetch(`/api/live-chat/conversations/${selected.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, attachment, type: mode }),
    })
    if (res.ok) {
      setUploadError(null)
      const data = await res.json() as { message: ChatMessage }
      setMessageCache(prev => {
        const next = {
          ...prev,
          [selected.id]: (prev[selected.id] ?? []).filter(message => message.id !== pending.id),
        }
        messageCacheRef.current = next
        return next
      })
      mergeMessages(selected.id, [data.message])
      if (mode === 'note') setComposeMode('reply')
      if (mode === 'reply') {
        setConversations(prev => prev.map(c => c.id === selected.id ? {
          ...c,
          status: 'live_chat',
          assigned_to: c.assigned_to ?? currentStaffName,
          last_message_at: data.message.created_at,
          last_message_preview: text || attachment?.name || '',
          last_message_role: data.message.role,
        } as ConversationItem : c))
      }
    } else {
      const errorBody = await res.json().catch(() => ({})) as { error?: string }
      setUploadError(errorBody.error ?? 'Upload failed. Please try again.')
      setReply(text)
      setAttachment(attachment)
      setMessageCache(prev => {
        const next = {
          ...prev,
          [selected.id]: (prev[selected.id] ?? []).filter(message => message.id !== pending.id),
        }
        messageCacheRef.current = next
        return next
      })
    }
    setSending(false)
  }

  const publishAgentTyping = useCallback((typing: boolean) => {
    if (!selectedMessageId) return
    void fetch('/api/live-chat/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: selectedMessageId,
        actor_type: 'agent',
        actor_name: currentStaffName,
        is_typing: typing,
      }),
    }).catch(() => undefined)
  }, [currentStaffName, selectedMessageId])

  const addTag = async () => {
    if (!selected || !tagDraft.trim()) return
    const tag = tagDraft.trim()
    setTagDraft('')
    setTagsByConversation(prev => ({ ...prev, [selected.id]: Array.from(new Set([...(prev[selected.id] ?? []), tag])) }))
    await fetch(`/api/live-chat/conversations/${selected.id}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag }),
    }).catch(() => undefined)
  }

  const removeTag = async (tag: string) => {
    if (!selected) return
    setTagsByConversation(prev => ({ ...prev, [selected.id]: (prev[selected.id] ?? []).filter(item => item !== tag) }))
    await fetch(`/api/live-chat/conversations/${selected.id}/tags`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag }),
    }).catch(() => undefined)
  }

  const handleSuggestionAction = async (suggestionId: string, action: 'accept' | 'reject' | 'ignore') => {
    const suggestion = customerProfile?.duplicate_suggestions.find(item => item.id === suggestionId)
    if (!suggestion) return
    const sourceCustomerId = selected?.customer?.id ?? selected?.customer_id ?? suggestion.source_customer_id
    const targetCustomerId = suggestion.source_customer_id === sourceCustomerId ? suggestion.target_customer_id : suggestion.source_customer_id
    const res = await fetch('/api/customers/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action === 'accept'
        ? { action: 'accept', suggestion_id: suggestionId, source_customer_id: sourceCustomerId, target_customer_id: targetCustomerId, reason: 'Accepted duplicate suggestion' }
        : { action, suggestion_id: suggestionId }),
    })
    if (res.ok && selected?.customer?.id) {
      await loadCustomerProfile(selected.customer.id)
      await loadConversations(false)
    }
  }

  const reactToMessage = (message: ChatMessage, reaction: string) => {
    if (!selected?.id) return
    const metadata = { ...(message.metadata ?? {}) }
    const reactions = Array.isArray(metadata.reactions) ? metadata.reactions as string[] : []
    metadata.reactions = Array.from(new Set([...reactions, reaction]))
    mergeMessages(selected.id, [{ ...message, metadata }])
    void fetch(`/api/live-chat/conversations/${selected.id}/messages`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: message.id, reaction }),
    }).catch(() => undefined)
  }

  const readAttachment = async (file: File): Promise<Attachment | null> => {
    const allowed = [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ]
    if (!allowed.includes(file.type)) {
      setUploadError('Upload an image, PDF, text, Word, Excel, or PowerPoint file.')
      return null
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File is too large. Maximum upload size is 10 MB.')
      return null
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    return { name: file.name, type: file.type, size: file.size, dataUrl, kind: file.type.startsWith('image/') ? 'image' : 'file' }
  }

  const chooseAttachment = async (file: File | undefined) => {
    setUploadError(null)
    if (!file) return
    const next = await readAttachment(file)
    if (next) setAttachment(next)
  }

  const startEditing = (message: ChatMessage) => {
    if (!canEditStaffMessage(message, now)) return
    setEditingMessageId(message.id)
    setEditDraft(message.content)
  }

  const cancelEditing = () => {
    setEditingMessageId(null)
    setEditDraft('')
  }

  const saveEdit = async () => {
    if (!selected || !editingMessageId || !editDraft.trim() || savingEdit) return
    setSavingEdit(true)
    const res = await fetch(`/api/live-chat/conversations/${selected.id}/messages`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: editingMessageId, message: editDraft.trim() }),
    })
    if (res.ok) {
      const data = await res.json() as { message: ChatMessage }
      mergeMessages(selected.id, [data.message])
      cancelEditing()
    }
    setSavingEdit(false)
  }

  const deleteMessage = async (message: ChatMessage) => {
    if (!selected || !canDeleteInternalNote(message)) return
    const deleted = {
      ...message,
      content: 'Message deleted',
      metadata: { ...(message.metadata ?? {}), deleted: true },
    }
    mergeMessages(selected.id, [deleted])
    const res = await fetch(`/api/live-chat/conversations/${selected.id}/messages`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: message.id }),
    })
    if (!res.ok) {
      await loadMessages(selected.id, false)
    }
  }

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      {statusError && (
        <div className="absolute right-4 top-6 z-40 rounded-xl px-3 py-2 text-xs font-semibold text-red-100" style={{ background: 'rgba(127,29,29,0.92)', border: '1px solid rgba(248,113,113,0.26)' }}>
          {statusError}
        </div>
      )}
      {mergeOpen && selected?.customer && (
        <MergeCustomersModal
          source={selected.customer}
          onClose={() => setMergeOpen(false)}
          onMerged={() => {
            setMergeOpen(false)
            void loadConversations(false)
            if (selected.customer?.id) void loadCustomerProfile(selected.customer.id)
          }}
        />
      )}
      {settingsOpen && settings && (
        <>
          <button type="button" aria-label="Dismiss settings popover" className="fixed inset-0 z-30 cursor-default" onClick={() => setSettingsOpen(false)} />
          <div
            className="fixed z-40 w-[min(320px,calc(100vw-2rem))] rounded-2xl p-4 shadow-2xl"
            style={{ left: settingsAnchor.left, top: settingsAnchor.top, background: 'rgba(18,16,14,0.98)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 20px 44px rgba(0,0,0,0.44)' }}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black text-white">Live Chat Settings</div>
                <div className="text-xs text-white/35">Human handover and AI reply controls</div>
              </div>
              <button type="button" onClick={() => setSettingsOpen(false)} className="rounded-lg p-2 text-white/35 hover:text-white/75" aria-label="Close live chat settings">
                <X className="h-4 w-4" />
              </button>
            </div>
            <SettingsControls settings={settings} saveSettings={(next) => void saveSettings(next)} setSettings={setSettings} />
            {savingSettings && <div className="mt-2 text-[11px] font-semibold text-white/32">Saving...</div>}
          </div>
        </>
      )}
      {analyticsOpen && (
        <div
          onMouseLeave={() => setAnalyticsOpen(false)}
          className="fixed z-40 w-[min(340px,calc(100vw-2rem))] rounded-2xl p-4 shadow-2xl"
          style={{ left: analyticsAnchor.left, top: analyticsAnchor.top, background: 'rgba(18,16,14,0.98)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 20px 44px rgba(0,0,0,0.44)' }}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-white">Live Chat Analytics</div>
              <div className="text-xs text-white/35">Current inbox load</div>
            </div>
            <button type="button" onClick={() => setAnalyticsOpen(false)} className="rounded-lg p-2 text-white/35 hover:text-white/75" aria-label="Close live chat analytics">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-2">
            {metrics.map(metric => (
              <div key={metric.label} className="flex items-center justify-between rounded-xl px-3 py-3" style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center gap-2 text-sm font-semibold text-white/72">
                  <metric.Icon className="h-4 w-4" style={{ color: metric.color }} />
                  {metric.label}
                </div>
                <div className="text-lg font-black text-white">{metric.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {incomingAlerts.length > 0 && (
        <div className="fixed right-6 top-24 z-40 grid w-[min(360px,calc(100vw-32px))] gap-2">
          {incomingAlerts.map(alert => (
            <div
              key={alert.conversationId}
              className="rounded-2xl p-3 shadow-2xl"
              style={{ background: 'rgba(18,16,14,0.98)', border: '1px solid rgba(250,204,21,0.22)' }}
            >
              <div className="flex items-start gap-3">
                <button type="button" onClick={() => openIncomingAlert(alert)} className="min-w-0 flex-1 text-left">
                  <div className="text-sm font-black text-white">{alert.title}</div>
                  <div className="mt-0.5 text-xs text-white/38">Click to open this conversation</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const conversation = conversationsRef.current.find(item => item.id === alert.conversationId)
                    if (conversation) dismissedIncomingAlertRef.current[conversation.id] = conversation.last_message_at
                    setIncomingAlerts(prev => prev.filter(item => item.conversationId !== alert.conversationId))
                  }}
                  className="rounded-lg p-1 text-white/35 hover:text-white/75"
                  aria-label="Dismiss live chat alert"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="grid h-full min-h-0 overflow-hidden rounded-2xl lg:grid-cols-[320px_minmax(0,1fr)_300px]" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <aside className="flex min-h-0 flex-col border-b border-white/8 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between p-4">
            <div className="text-sm font-black text-white">Conversations</div>
            <button onClick={() => void loadConversations()} className="rounded-lg p-2 text-white/35 hover:text-white/70">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-[1fr_1.35fr_.85fr_.72fr_1.18fr] gap-1 px-3 pb-3">
            {[
              ['open', 'Open'],
              ['unassigned', 'Unassigned'],
              ['mine', 'Mine'],
              ['all', 'All'],
              ['resolved', 'Resolved'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value as ConversationFilter)}
                className="relative min-w-0 rounded-lg px-1.5 py-1.5 text-[10px] font-bold transition-colors"
                style={{ background: filter === value ? 'rgba(244,122,99,0.16)' : 'rgba(255,255,255,0.04)', color: filter === value ? '#fff' : 'rgba(255,255,255,0.42)' }}
              >
                {label}
                {((value === 'open' && newOpenAlertCount > 0) || (value === 'all' && newAllAlertCount > 0)) && (
                  <span className="absolute -right-1 -top-1 min-w-4 rounded-full px-1 py-0.5 text-[9px] font-black leading-none text-black" style={{ background: '#facc15' }}>
                    {value === 'open' ? newOpenAlertCount : newAllAlertCount}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="px-3 pb-3">
            <label className="sr-only" htmlFor="live-chat-channel-filter">Channel</label>
            <select
              id="live-chat-channel-filter"
              value={channelFilter}
              onChange={event => setChannelFilter(event.target.value as ChannelFilter)}
              className="w-full rounded-lg px-2.5 py-2 text-[11px] font-bold text-white/58 outline-none transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <option value="all">All channels</option>
              <option value="website">Website</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="messenger">Messenger</option>
              <option value="instagram">Instagram</option>
              <option value="email">Email</option>
            </select>
          </div>
          <div className="grid gap-2 px-3 pb-3">
            <div className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <Search className="h-3.5 w-3.5 text-white/28" />
              <input
                data-live-chat-search="true"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search conversations"
                className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold text-white/62 outline-none placeholder:text-white/24"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={advancedFilter}
                onChange={event => setAdvancedFilter(event.target.value as AdvancedFilter)}
                aria-label="Advanced filter"
                className="min-w-0 rounded-lg px-2.5 py-2 text-[11px] font-bold text-white/58 outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <option value="all">All types</option>
                <option value="assigned">Assigned</option>
                <option value="unread">Unread</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="ai">AI</option>
                <option value="human">Human</option>
              </select>
              <select
                value={tagFilter}
                onChange={event => setTagFilter(event.target.value)}
                aria-label="Tag filter"
                className="min-w-0 rounded-lg px-2.5 py-2 text-[11px] font-bold text-white/58 outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <option value="all">All tags</option>
                {allTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
              </select>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-sm text-white/30">Loading conversations...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-4 text-sm text-white/30">No conversations yet.</div>
            ) : filteredConversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => selectConversation(conversation.id)}
                className="block w-full border-t border-white/[0.05] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.035]"
                style={{ background: selected?.id === conversation.id ? 'rgba(244,122,99,0.08)' : 'transparent' }}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 truncate text-[13px] font-bold leading-tight text-white/85">{customerDisplayName(conversation)}</div>
                  <div className="shrink-0 text-[10px] leading-none text-white/25">{relative(conversation.last_message_at)}</div>
                </div>
                <div className="mb-1 flex items-center justify-between gap-2 text-[10px] leading-tight">
                  <span className="truncate text-white/28">{dateTime(conversation.last_message_at)}</span>
                  <span className="shrink-0 font-semibold uppercase tracking-wide text-white/24">ID: {visitorId(conversation).replace('VIS-', '')}</span>
                </div>
                <div
                  className="mb-1.5 text-[11px] leading-snug text-white/35"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {typingByConversation[conversation.id] ? (
                    <span className="font-semibold text-emerald-300/75">typing...</span>
                  ) : conversation.last_message_preview || 'No messages yet'}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-1.5 text-[10px] leading-none text-white/30">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: conversation.status === 'resolved' ? 'rgba(255,255,255,0.24)' : '#34d399' }} />
                    <span className="truncate">{conversation.assigned_to ? `Assigned to ${conversation.assigned_to}` : 'Unassigned'}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <ChannelPill channel={conversation.channel} />
                    <StatusPill status={conversation.status} />
                  </div>
                  {conversation.unread_count > 0 && (
                    <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-black text-white">{conversation.unread_count}</span>
                  )}
                </div>
                {Boolean((tagsByConversation[conversation.id] ?? conversation.tags ?? []).length) && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(tagsByConversation[conversation.id] ?? conversation.tags ?? []).slice(0, 3).map(tag => (
                      <span key={tag} className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white/32" style={{ background: 'rgba(255,255,255,0.045)' }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        </aside>

        <main className="flex min-h-0 flex-col">
          {selected ? (
            <>
              <div className="flex items-center justify-between border-b border-white/[0.06] p-4">
                <div>
                  <div className="text-sm font-black text-white">{customerDisplayName(selected)}</div>
                  <div className="text-xs text-white/30">
                    {CHANNEL_STYLE[normalizeChannel(selected.channel)].label} channel · Visitor ID: {visitorId(selected)} · {selected.last_message_at && Date.now() - new Date(selected.last_message_at).getTime() < 5 * 60_000 ? 'Online' : `Last seen ${relative(selected.last_message_at)}`}
                  </div>
                  <div className="mt-1 text-[11px] font-semibold" style={{ color: selected.status === 'resolved' ? '#86efac' : 'rgba(255,255,255,0.35)' }}>
                    {typingByConversation[selected.id] || visitorTyping ? 'Visitor typing...' : selected.status === 'resolved' ? 'Resolved' : selected.assigned_to ? `Assigned to ${selected.assigned_to}` : 'Unassigned'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selected.status !== 'resolved' && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setAssignOpen(open => !open)}
                        className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-white/72"
                        style={{ background: assignOpen ? 'rgba(244,122,99,0.13)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                      >
                        <UserCheck className="h-4 w-4" />
                        Assign
                      </button>
                      {assignOpen && (
                        <div className="absolute right-0 top-11 z-30 w-56 rounded-xl p-2 shadow-2xl" style={{ background: 'rgba(18,16,14,0.98)', border: '1px solid rgba(255,255,255,0.09)' }}>
                          <button type="button" onClick={() => { setAssignOpen(false); void updateStatus('live_chat') }} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-white/70 hover:bg-white/8">Assign to me</button>
                          {teamMembers.map(member => (
                            <button key={member.id} type="button" onClick={() => { setAssignOpen(false); void updateStatus('live_chat', member.name) }} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-white/58 hover:bg-white/8">
                              Assign to {member.name}
                            </button>
                          ))}
                          <button type="button" onClick={() => { setAssignOpen(false); void updateStatus('handover_requested', null) }} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-white/42 hover:bg-white/8">Unassign</button>
                        </div>
                      )}
                    </div>
                  )}
                  <StatusPill status={selected.status} />
                </div>
              </div>
              <div ref={messagePaneRef} data-testid="live-chat-message-pane" onScroll={handleThreadScroll} className="relative min-h-0 flex-1 overflow-y-auto p-5">
                <div className="space-y-3">
                  {messages.map((message) => {
                    const isCustomer = message.role === 'user'
                    const isSystem = message.role === 'system'
                    const isHuman = message.role === 'human' || message.metadata?.sender_type === 'human'
                    const isEditing = editingMessageId === message.id
                    const editable = canEditStaffMessage(message, now)
                    const attached = attachmentFrom(message)
                    return (
                      <motion.div key={message.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={isSystem ? 'group flex justify-center' : `group flex ${isCustomer ? 'justify-start' : 'justify-end'}`}>
                      <div className={isSystem ? 'flex max-w-[80%] flex-col items-center' : `flex max-w-[72%] flex-col ${isCustomer ? 'items-start' : 'items-end'}`}>
                        <div
                          className={isSystem ? 'rounded-full px-3 py-1.5 text-center text-[11px] text-white/35' : 'rounded-2xl px-4 py-3 text-sm leading-relaxed'}
                          style={isSystem
                            ? message.metadata?.internal_note
                              ? { background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.16)', color: 'rgba(254,240,138,0.72)' }
                              : { background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.06)' }
                            : isCustomer
                              ? { background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.78)' }
                              : { background: isHuman ? 'rgba(52,211,153,0.13)' : 'rgba(148,145,140,0.13)', border: `1px solid ${isHuman ? 'rgba(52,211,153,0.25)' : 'rgba(148,145,140,0.23)'}`, color: 'rgba(255,255,255,0.86)' }}
                        >
                          {!isSystem && (
                            <div className="mb-1 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-wider text-white/30">
                              <span>{isCustomer ? 'Customer' : isHuman ? 'Human' : 'AI'}</span>
                              {editable && !isEditing && (
                                <button type="button" onClick={() => startEditing(message)} className="inline-flex items-center gap-1 normal-case tracking-normal text-white/32 opacity-0 transition-opacity hover:text-white/70 group-hover:opacity-100">
                                  <Pencil className="h-3 w-3" />
                                  Edit
                                </button>
                              )}
                            </div>
                          )}
                          {isSystem && Boolean(message.metadata?.internal_note) && (
                            <div className="mb-1 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wide">
                              <span className="inline-flex items-center gap-1">
                                <StickyNote className="h-3 w-3" />
                                Staff note
                              </span>
                              {!isEditing && (
                                <span className="inline-flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                  {editable && (
                                    <button type="button" onClick={() => startEditing(message)} className="rounded-md p-1 text-amber-100/45 hover:text-amber-100" aria-label="Edit internal note">
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  )}
                                  {canDeleteInternalNote(message) && (
                                    <button type="button" onClick={() => void deleteMessage(message)} className="rounded-md p-1 text-amber-100/35 hover:text-red-200" aria-label="Delete internal note">
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </span>
                              )}
                            </div>
                          )}
                          {isEditing ? (
                            <div className="space-y-2">
                              <textarea
                                value={editDraft}
                                onChange={e => setEditDraft(e.target.value)}
                                className="min-h-20 w-full resize-none rounded-xl px-3 py-2 text-sm text-white outline-none"
                                style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.1)' }}
                              />
                              <div className="flex justify-end gap-2">
                                <button type="button" onClick={cancelEditing} className="rounded-lg p-2 text-white/40 hover:text-white/75" aria-label="Cancel edit">
                                  <X className="h-4 w-4" />
                                </button>
                                <button type="button" onClick={() => void saveEdit()} disabled={savingEdit || !editDraft.trim()} className="rounded-lg p-2 text-emerald-100 disabled:opacity-35" style={{ background: 'rgba(52,211,153,0.16)' }} aria-label="Save edit">
                                  <Check className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {attached && (
                                <div className="overflow-hidden rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(0,0,0,0.14)' }}>
                                  {attached.kind === 'image' ? (
                                    <img src={attached.dataUrl} alt={attached.name} className="max-h-56 w-full object-cover" />
                                  ) : (
                                    <a href={attached.dataUrl} download={attached.name} className="flex items-center gap-2 px-3 py-2 text-xs text-white/72">
                                      <FileText className="h-4 w-4" />
                                      <span className="min-w-0 flex-1 truncate">{attached.name}</span>
                                      <span className="text-white/30">{formatBytes(attached.size)}</span>
                                    </a>
                                  )}
                                </div>
                              )}
                              {message.content && <div>{message.content}</div>}
                              {Boolean(message.metadata?.edited) && <span className="text-[10px] text-white/30">edited</span>}
                              {Array.isArray(message.metadata?.reactions) && (
                                <div className="flex gap-1 pt-1">
                                  {(message.metadata.reactions as string[]).map(reaction => (
                                    <span key={reaction} className="rounded-full px-1.5 py-0.5 text-[11px]" style={{ background: 'rgba(255,255,255,0.08)' }}>{reaction}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {!isSystem && (
                          <div className={`mt-1 flex items-center gap-1.5 text-[10px] text-white/28 ${isCustomer ? 'pl-1' : 'pr-1'}`}>
                            <span>{dateTime(message.created_at)}</span>
                            <DeliveryTicks state={deliveryState(message)} />
                            <div className="ml-1 hidden gap-1 group-hover:flex">
                              {['👍', '✅', '🙏'].map(reaction => (
                                <button key={reaction} type="button" onClick={() => reactToMessage(message, reaction)} className="rounded-full px-1 hover:bg-white/10" aria-label={`React ${reaction}`}>{reaction}</button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      </motion.div>
                    )
                  })}
                  {(typingByConversation[selected.id] || visitorTyping) && (
                    <div className="flex justify-start">
                      <div className="rounded-full px-3 py-2 text-xs font-semibold text-emerald-100/70" style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.16)' }}>
                        Customer typing...
                      </div>
                    </div>
                  )}
                </div>
                {showThreadNewMessage && (
                  <button
                    type="button"
                    onClick={() => scrollThreadToBottom('smooth')}
                    className="sticky bottom-3 left-1/2 z-20 mx-auto mt-3 block -translate-x-1/2 rounded-full px-3 py-1.5 text-xs font-black text-emerald-100 shadow-xl"
                    style={{ background: 'rgba(16,185,129,0.92)', border: '1px solid rgba(187,247,208,0.2)' }}
                  >
                    New message
                  </button>
                )}
              </div>
              <div className="sticky bottom-0 flex-shrink-0 border-t border-white/[0.06] p-4" style={{ background: 'rgba(15,15,14,0.98)' }}>
                {selectedAssignedElsewhere && (
                  <div className="mb-3 rounded-xl px-3 py-2 text-xs text-amber-100/75" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.16)' }}>
                    Occupied by {selected.assigned_to}. Take over before replying.
                  </div>
                )}
                {attachment && (
                  <div className="mb-3 flex items-center justify-between rounded-xl px-3 py-2 text-xs text-white/62" style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="flex min-w-0 items-center gap-2">
                      {attachment.kind === 'image' ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      <span className="truncate">{attachment.name}</span>
                      <span className="text-white/28">{formatBytes(attachment.size)}</span>
                    </div>
                    <button type="button" onClick={() => setAttachment(null)} className="text-white/35 hover:text-white/75"><X className="h-4 w-4" /></button>
                  </div>
                )}
                {uploadError && (
                  <div className="mb-3 rounded-xl px-3 py-2 text-xs text-red-200/80" style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
                    {uploadError}
                  </div>
                )}
                <div className="mb-2 flex items-center gap-2">
                  <input ref={fileInputRef} type="file" className="hidden" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={e => { void chooseAttachment(e.target.files?.[0]); e.currentTarget.value = '' }} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg p-2 text-white/35 hover:text-white/75" aria-label="Attach file"><Paperclip className="h-4 w-4" /></button>
                  <button
                    type="button"
                    onClick={() => setComposeMode(composeMode === 'reply' ? 'note' : 'reply')}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-bold"
                    style={{ background: composeMode === 'note' ? 'rgba(250,204,21,0.12)' : 'rgba(255,255,255,0.04)', color: composeMode === 'note' ? '#fde68a' : 'rgba(255,255,255,0.42)' }}
                  >
                    <StickyNote className="h-3.5 w-3.5" />
                    {composeMode === 'note' ? 'Internal note' : 'Note'}
                  </button>
                  <div className="relative">
                    <button type="button" onClick={() => setEmojiOpen(open => !open)} className="rounded-lg p-2 text-white/35 hover:text-white/75" aria-label="Emoji"><Smile className="h-4 w-4" /></button>
                    {emojiOpen && (
                      <div className="absolute bottom-10 left-0 z-20 flex gap-1 rounded-xl p-2" style={{ background: 'rgba(18,16,14,0.98)', border: '1px solid rgba(255,255,255,0.09)' }}>
                        {['👍', '🙏', '✅', '🙂', '🔥'].map(emoji => <button key={emoji} type="button" onClick={() => { setReply(prev => `${prev}${emoji}`); setEmojiOpen(false) }} className="rounded-lg px-2 py-1 hover:bg-white/10">{emoji}</button>)}
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <button type="button" onClick={() => setQuickRepliesOpen(open => !open)} className="rounded-lg px-2 py-2 text-xs font-bold text-white/42 hover:text-white/75">Templates</button>
                    {quickRepliesOpen && (
                      <div className="absolute bottom-10 left-0 z-20 grid w-64 gap-1 rounded-xl p-2" style={{ background: 'rgba(18,16,14,0.98)', border: '1px solid rgba(255,255,255,0.09)' }}>
                        {[
                          'Thanks, I am checking this for you now.',
                          'Could you share your email or phone number?',
                          'I have forwarded this to the right person.',
                        ].map(template => <button key={template} type="button" onClick={() => { setReply(template); setQuickRepliesOpen(false) }} className="rounded-lg px-2 py-2 text-left text-xs text-white/62 hover:bg-white/8">{template}</button>)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    value={reply}
                    onChange={e => {
                      setReply(e.target.value)
                      if (composeMode === 'reply') {
                        publishAgentTyping(true)
                        if (typingStopRef.current) window.clearTimeout(typingStopRef.current)
                        typingStopRef.current = window.setTimeout(() => publishAgentTyping(false), 1200)
                      }
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') void sendReply() }}
                    placeholder={composeMode === 'note' ? 'Add internal note...' : 'Reply as human...'}
                    disabled={selectedAssignedElsewhere && composeMode === 'reply'}
                    className="flex-1 rounded-xl px-4 py-3 text-sm text-white outline-none"
                    style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.08)' }}
                  />
                  <button onClick={() => void sendReply()} disabled={sending || (selectedAssignedElsewhere && composeMode === 'reply') || (!reply.trim() && !attachment)} aria-label="Send" className="rounded-xl px-4 text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg,#171412,#f89a57)' }}>
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-white/30">Select a conversation.</div>
          )}
        </main>

        <aside data-testid="customer-profile-panel" className="min-h-0 overflow-y-auto border-t border-white/[0.06] p-5 lg:border-l lg:border-t-0">
          {selected ? (
            <div className="space-y-5">
              <CustomerProfilePanel
                selected={selected}
                profile={customerProfileId === (selected.customer?.id ?? selected.customer_id ?? null) ? customerProfile : null}
                savingField={savingCustomerField}
                editNotice={customerEditNotice}
                onOpenMerge={() => setMergeOpen(true)}
                onSaveField={saveCustomerField}
                onSuggestionAction={handleSuggestionAction}
              />
              <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: selected.assigned_to ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.05)', color: selected.assigned_to ? '#86efac' : 'rgba(255,255,255,0.38)' }}>
                <UserCheck className="h-3 w-3" />
                {selected.status === 'resolved' ? 'Resolved' : selected.assigned_to ? `Assigned to ${selected.assigned_to}` : 'Unassigned'}
              </div>
              <div className="space-y-3 rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-white/36">
                  <Tag className="h-3.5 w-3.5" />
                  Tags
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(tagsByConversation[selected.id] ?? selected.tags ?? []).map(tag => (
                    <button key={tag} type="button" onClick={() => void removeTag(tag)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold text-white/58" style={{ background: 'rgba(255,255,255,0.055)' }}>
                      {tag}
                      <X className="h-3 w-3 text-white/30" />
                    </button>
                  ))}
                  {!(tagsByConversation[selected.id] ?? selected.tags ?? []).length && <div className="text-xs text-white/25">No tags yet</div>}
                </div>
                <div className="flex gap-2">
                  <input
                    value={tagDraft}
                    onChange={event => setTagDraft(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') void addTag() }}
                    placeholder="Add tag"
                    className="min-w-0 flex-1 rounded-lg px-2 py-2 text-xs text-white/70 outline-none"
                    style={{ background: 'rgba(0,0,0,0.16)', border: '1px solid rgba(255,255,255,0.07)' }}
                  />
                  <button type="button" onClick={() => void addTag()} className="rounded-lg px-2 text-xs font-bold text-white/62" style={{ background: 'rgba(255,255,255,0.06)' }}>Add</button>
                </div>
              </div>
              <div className="space-y-2 rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-white/36">
                  <Monitor className="h-3.5 w-3.5" />
                  Visitor info
                </div>
                {[
                  ['Browser', contextValue(selected.visitor_context, 'browser')],
                  ['OS', contextValue(selected.visitor_context, 'os')],
                  ['Country', contextValue(selected.visitor_context, 'country')],
                  ['Language', contextValue(selected.visitor_context, 'language')],
                  ['Timezone', contextValue(selected.visitor_context, 'timezone')],
                  ['Device', contextValue(selected.visitor_context, 'device')],
                  ['Screen', contextValue(selected.visitor_context, 'screen_size')],
                  ['Landing', contextValue(selected.visitor_context, 'landing_page')],
                  ['Current', contextValue(selected.visitor_context, 'current_page')],
                  ['Referrer', contextValue(selected.visitor_context, 'referrer')],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[70px_minmax(0,1fr)] gap-2 text-xs">
                    <span className="text-white/28">{label}</span>
                    <span className="truncate text-white/48" title={value}>{value}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-2 rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-white/36">
                  <Clock className="h-3.5 w-3.5" />
                  Visitor timeline
                </div>
                <div className="space-y-2">
                  <div className="text-xs text-white/42">First visit · {dateTime(selected.last_message_at)}</div>
                  {contextValue(selected.visitor_context, 'landing_page') !== 'Unknown' && <div className="truncate text-xs text-white/32">Page viewed · {contextValue(selected.visitor_context, 'landing_page')}</div>}
                  {messages.slice(-6).map(message => (
                    <div key={`timeline-${message.id}`} className="text-xs text-white/35">
                      {message.metadata?.internal_note ? 'Staff note' : message.role === 'user' ? 'Visitor message' : message.metadata?.event_type === 'human_takeover' ? 'Takeover' : message.metadata?.event_type === 'resolved' ? 'Resolved' : message.role === 'system' ? 'System event' : 'Staff message'} · {dateTime(message.created_at)}
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => void updateStatus('live_chat')}
                  disabled={selected.status === 'resolved' || (selected.assigned_to === currentStaffName && isTakenOver)}
                  className="w-full rounded-xl px-4 py-3 text-sm font-bold text-white transition-opacity disabled:cursor-default"
                  style={selected.assigned_to === currentStaffName && isTakenOver
                    ? { background: 'rgba(52,211,153,0.24)', border: '1px solid rgba(52,211,153,0.42)', color: '#bbf7d0' }
                    : { background: 'rgba(52,211,153,0.14)', border: '1px solid rgba(52,211,153,0.25)' }}
                >
                  {selected.assigned_to === currentStaffName && isTakenOver ? 'You took over' : 'Take Over'}
                </button>
                <button onClick={() => void updateStatus('ai_active')} className="w-full rounded-xl px-4 py-3 text-sm font-bold text-white" style={{ background: 'rgba(148,145,140,0.12)', border: '1px solid rgba(148,145,140,0.22)' }}>Return to AI</button>
                <button onClick={() => void updateStatus('resolved')} className="w-full rounded-xl px-4 py-3 text-sm font-bold text-white/70" style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.08)' }}>Mark Resolved</button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-white/30">No customer selected.</div>
          )}
        </aside>
      </div>
    </div>
  )
}
