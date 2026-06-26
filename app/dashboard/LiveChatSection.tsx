'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Bot, CheckCircle, Clock, Headphones, Mail, MessageSquare, Phone,
  RefreshCw, Send, ShieldCheck, User, Zap,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

type ConversationStatus = 'ai_active' | 'handover_requested' | 'live_chat' | 'resolved'

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
  channel: string
  status: ConversationStatus
  last_message_at: string | null
  unread_count: number
  last_message_preview: string
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

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'ai' | 'human' | 'system'
  content: string
  created_at: string
  metadata?: Record<string, unknown> | null
}

const STATUS_STYLE: Record<ConversationStatus, { label: string; color: string; bg: string; icon: typeof Bot }> = {
  ai_active: { label: 'AI Active', color: '#948f88', bg: 'rgba(148,145,140,0.12)', icon: Bot },
  handover_requested: { label: 'Handover Requested', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', icon: Headphones },
  live_chat: { label: 'Live Chat', color: '#34d399', bg: 'rgba(52,211,153,0.12)', icon: MessageSquare },
  resolved: { label: 'Resolved', color: 'rgba(255,255,255,0.38)', bg: 'rgba(255,255,255,0.06)', icon: CheckCircle },
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

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors"
      style={{ background: checked ? 'rgba(52,211,153,0.09)' : 'rgba(255,255,255,0.04)', border: `1px solid ${checked ? 'rgba(52,211,153,0.22)' : 'rgba(255,255,255,0.07)'}` }}
    >
      <span className="text-xs font-semibold text-white/70">{label}</span>
      <span className="relative h-5 w-9 rounded-full" style={{ background: checked ? '#34d399' : 'rgba(255,255,255,0.12)' }}>
        <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all" style={{ left: checked ? 18 : 2 }} />
      </span>
    </button>
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

export default function LiveChatSection({ businessId }: { businessId: string }) {
  const [settings, setSettings] = useState<LiveChatSettings | null>(null)
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [sending, setSending] = useState(false)

  const selected = useMemo(
    () => conversations.find(c => c.id === selectedId) ?? conversations[0] ?? null,
    [conversations, selectedId],
  )

  const loadSettings = useCallback(async () => {
    const res = await fetch('/api/live-chat/settings')
    if (!res.ok) return
    const data = await res.json() as { settings: LiveChatSettings }
    setSettings(data.settings)
  }, [])

  const loadConversations = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/live-chat/conversations')
    if (res.ok) {
      const data = await res.json() as { conversations: ConversationItem[] }
      setConversations(data.conversations)
      setSelectedId(prev => prev ?? data.conversations[0]?.id ?? null)
    }
    setLoading(false)
  }, [])

  const loadMessages = useCallback(async (conversationId: string) => {
    const res = await fetch(`/api/live-chat/conversations/${conversationId}/messages`)
    if (!res.ok) return
    const data = await res.json() as { messages: ChatMessage[] }
    setMessages(data.messages)
    setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, unread_count: 0 } : c))
  }, [])

  useEffect(() => {
    void loadSettings()
    void loadConversations()
  }, [loadSettings, loadConversations])

  useEffect(() => {
    if (selected?.id) void loadMessages(selected.id)
  }, [selected?.id, loadMessages])

  useEffect(() => {
    const channel = supabase
      .channel(`live-chat-${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        void loadConversations()
        if (selected?.id) void loadMessages(selected.id)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        void loadConversations()
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [businessId, loadConversations, loadMessages, selected?.id])

  const saveSettings = async (next: LiveChatSettings) => {
    setSettings(next)
    setSavingSettings(true)
    const res = await fetch('/api/live-chat/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    })
    if (res.ok) {
      const data = await res.json() as { settings: LiveChatSettings }
      setSettings(data.settings)
    }
    setSavingSettings(false)
  }

  const updateStatus = async (status: ConversationStatus) => {
    if (!selected) return
    await fetch(`/api/live-chat/conversations/${selected.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await loadConversations()
    await loadMessages(selected.id)
  }

  const sendReply = async () => {
    if (!selected || !reply.trim() || sending) return
    setSending(true)
    const text = reply.trim()
    setReply('')
    const res = await fetch(`/api/live-chat/conversations/${selected.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    })
    if (res.ok) {
      await loadConversations()
      await loadMessages(selected.id)
    } else {
      setReply(text)
    }
    setSending(false)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 lg:grid-cols-[1fr_1.35fr]">
        <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-black text-white">Live chat settings</div>
              <div className="text-xs text-white/30">Control AI, handover and availability.</div>
            </div>
            {savingSettings && <RefreshCw className="h-4 w-4 animate-spin text-white/30" />}
          </div>
          {settings && (
            <div className="grid gap-2 sm:grid-cols-3">
              <Toggle label="AI auto-replies" checked={settings.ai_auto_replies_enabled} onChange={v => void saveSettings({ ...settings, ai_auto_replies_enabled: v })} />
              <Toggle label="Live chat" checked={settings.live_chat_enabled} onChange={v => void saveSettings({ ...settings, live_chat_enabled: v })} />
              <Toggle label="Human handover" checked={settings.human_handover_enabled} onChange={v => void saveSettings({ ...settings, human_handover_enabled: v })} />
              <Toggle label="AI cannot answer" checked={settings.trigger_ai_cannot_answer} onChange={v => void saveSettings({ ...settings, trigger_ai_cannot_answer: v })} />
              <Toggle label="Customer asks human" checked={settings.trigger_customer_asks_human} onChange={v => void saveSettings({ ...settings, trigger_customer_asks_human: v })} />
              <Toggle label="Availability hours" checked={settings.availability_enabled} onChange={v => void saveSettings({ ...settings, availability_enabled: v })} />
              <div className="sm:col-span-3 grid gap-2 sm:grid-cols-[1fr_120px_120px]">
                <input
                  value={settings.trigger_phrases.join(', ')}
                  onChange={e => setSettings({ ...settings, trigger_phrases: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  onBlur={() => void saveSettings(settings)}
                  className="rounded-xl px-3 py-2 text-xs text-white/70 outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                />
                <input type="time" value={settings.availability_start} onChange={e => void saveSettings({ ...settings, availability_start: e.target.value })} className="rounded-xl px-3 py-2 text-xs text-white/70 outline-none" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }} />
                <input type="time" value={settings.availability_end} onChange={e => void saveSettings({ ...settings, availability_end: e.target.value })} className="rounded-xl px-3 py-2 text-xs text-white/70 outline-none" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }} />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Open handovers', value: conversations.filter(c => c.status === 'handover_requested').length, Icon: Headphones, color: '#fbbf24' },
            { label: 'Live chats', value: conversations.filter(c => c.status === 'live_chat').length, Icon: MessageSquare, color: '#34d399' },
            { label: 'Unread', value: conversations.reduce((sum, c) => sum + c.unread_count, 0), Icon: Clock, color: '#948f88' },
          ].map(({ label, value, Icon, color }) => (
            <div key={label} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <Icon className="mb-3 h-4 w-4" style={{ color }} />
              <div className="text-2xl font-black text-white">{value}</div>
              <div className="text-xs text-white/30">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid min-h-[620px] overflow-hidden rounded-2xl lg:grid-cols-[320px_minmax(0,1fr)_300px]" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <aside className="border-b border-white/8 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between p-4">
            <div className="text-sm font-black text-white">Conversations</div>
            <button onClick={() => void loadConversations()} className="rounded-lg p-2 text-white/35 hover:text-white/70">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            {loading ? (
              <div className="p-4 text-sm text-white/30">Loading conversations...</div>
            ) : conversations.length === 0 ? (
              <div className="p-4 text-sm text-white/30">No conversations yet.</div>
            ) : conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => setSelectedId(conversation.id)}
                className="block w-full border-t border-white/[0.05] p-4 text-left transition-colors hover:bg-white/[0.035]"
                style={{ background: selected?.id === conversation.id ? 'rgba(244,122,99,0.08)' : 'transparent' }}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-bold text-white/85">{conversation.lead?.name || 'Website visitor'}</div>
                  <div className="text-[10px] text-white/25">{relative(conversation.last_message_at)}</div>
                </div>
                <div className="mb-2 truncate text-xs text-white/35">{conversation.last_message_preview || 'No messages yet'}</div>
                <div className="flex items-center justify-between">
                  <StatusPill status={conversation.status} />
                  {conversation.unread_count > 0 && (
                    <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-black text-white">{conversation.unread_count}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex min-h-[620px] flex-col">
          {selected ? (
            <>
              <div className="flex items-center justify-between border-b border-white/[0.06] p-4">
                <div>
                  <div className="text-sm font-black text-white">{selected.lead?.name || 'Website visitor'}</div>
                  <div className="text-xs text-white/30">{selected.channel} channel</div>
                </div>
                <StatusPill status={selected.status} />
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {messages.map((message) => {
                  const isCustomer = message.role === 'user'
                  const isSystem = message.role === 'system'
                  const isHuman = message.role === 'human' || message.metadata?.sender_type === 'human'
                  return (
                    <motion.div key={message.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={isSystem ? 'flex justify-center' : `flex ${isCustomer ? 'justify-start' : 'justify-end'}`}>
                      <div
                        className={isSystem ? 'max-w-[80%] rounded-full px-3 py-1.5 text-center text-[11px] text-white/35' : 'max-w-[72%] rounded-2xl px-4 py-3 text-sm leading-relaxed'}
                        style={isSystem
                          ? { background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.06)' }
                          : isCustomer
                            ? { background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.78)' }
                            : { background: isHuman ? 'rgba(52,211,153,0.13)' : 'rgba(148,145,140,0.13)', border: `1px solid ${isHuman ? 'rgba(52,211,153,0.25)' : 'rgba(148,145,140,0.23)'}`, color: 'rgba(255,255,255,0.86)' }}
                      >
                        {!isSystem && <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/30">{isCustomer ? 'Customer' : isHuman ? 'Human' : 'AI'}</div>}
                        {message.content}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
              <div className="border-t border-white/[0.06] p-4">
                <div className="flex gap-2">
                  <input
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void sendReply() }}
                    placeholder="Reply as human..."
                    className="flex-1 rounded-xl px-4 py-3 text-sm text-white outline-none"
                    style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.08)' }}
                  />
                  <button onClick={() => void sendReply()} disabled={sending || !reply.trim()} className="rounded-xl px-4 text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg,#171412,#f89a57)' }}>
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-white/30">Select a conversation.</div>
          )}
        </main>

        <aside className="border-t border-white/[0.06] p-5 lg:border-l lg:border-t-0">
          {selected ? (
            <div className="space-y-5">
              <div>
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: 'rgba(244,122,99,0.14)' }}>
                  <User className="h-5 w-5 text-orange-300" />
                </div>
                <div className="text-lg font-black text-white">{selected.lead?.name || 'Website visitor'}</div>
                <div className="text-xs text-white/30">Conversation details</div>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-white/45"><Mail className="h-4 w-4" />{selected.lead?.email || 'No email yet'}</div>
                <div className="flex items-center gap-2 text-white/45"><Phone className="h-4 w-4" />{selected.lead?.phone || 'No phone yet'}</div>
                <div className="flex items-center gap-2 text-white/45"><Zap className="h-4 w-4" />{selected.lead?.interest || 'Interest unknown'}</div>
                <div className="flex items-center gap-2 text-white/45"><ShieldCheck className="h-4 w-4" />Score {selected.lead?.score ?? 0} · {selected.lead?.score_label || 'cold'}</div>
              </div>
              <div className="space-y-2">
                <button onClick={() => void updateStatus('live_chat')} className="w-full rounded-xl px-4 py-3 text-sm font-bold text-white" style={{ background: 'rgba(52,211,153,0.14)', border: '1px solid rgba(52,211,153,0.25)' }}>Take Over</button>
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
