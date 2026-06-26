'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, UserPlus } from 'lucide-react'

type LeadStatus = 'new' | 'contacted' | 'demo_booked' | 'won' | 'lost'

const SOURCES = [
  'manual', 'whatsapp', 'web_chat', 'email',
  'referral', 'instagram', 'facebook', 'google', 'other',
]
const STATUSES: { value: LeadStatus; label: string }[] = [
  { value: 'new',         label: 'New'         },
  { value: 'contacted',   label: 'Contacted'   },
  { value: 'demo_booked', label: 'Demo Booked' },
  { value: 'won',         label: 'Won'         },
  { value: 'lost',        label: 'Lost'        },
]

function scoreLabel(s: number): 'hot' | 'warm' | 'cold' {
  if (s >= 80) return 'hot'
  if (s >= 50) return 'warm'
  return 'cold'
}

function scoreLabelColor(s: number) {
  const l = scoreLabel(s)
  return l === 'hot' ? '#f87171' : l === 'warm' ? '#fb923c' : '#948f88'
}

const inputBase = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
} as const

function focusViolet(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = 'rgba(244,122,99,0.5)'
}
function blurDefault(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
}

export default function AddLeadModal({
  onClose, onCreated, actorName = 'Alex Thompson',
}: {
  onClose:     () => void
  onCreated:   (raw: Record<string, unknown>) => void
  actorName?:  string
}) {
  const [name,    setName]    = useState('')
  const [company, setCompany] = useState('')
  const [phone,   setPhone]   = useState('')
  const [email,   setEmail]   = useState('')
  const [source,  setSource]  = useState('manual')
  const [score,   setScore]   = useState(0)
  const [status,  setStatus]  = useState<LeadStatus>('new')
  const [notes,   setNotes]   = useState('')
  const [tags,    setTags]    = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      const metadata: Record<string, unknown> = {}
      if (notes.trim()) metadata.notes = notes.trim()
      if (tags.trim())  metadata.tags  = tags.split(',').map(t => t.trim()).filter(Boolean)

      const res = await fetch('/api/leads', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Actor-Name': actorName },
        body: JSON.stringify({
          name:        trimmed,
          company:     company.trim(),
          phone:       phone.trim()  || null,
          email:       email.trim()  || null,
          source,
          score,
          score_label: scoreLabel(score),
          status,
          ...(Object.keys(metadata).length ? { metadata } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to create lead'); setSaving(false); return }
      onCreated(data.lead as Record<string, unknown>)
      onClose()
    } catch {
      setError('Network error — please try again')
      setSaving(false)
    }
  }

  return (
    <>
      <motion.div
        key="add-lead-bd"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80]"
        style={{ background: 'rgba(0,0,0,0.75)' }}
        onClick={() => !saving && onClose()}
      />
      <motion.div
        key="add-lead-modal"
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{   opacity: 0, scale: 0.95, y: 16 }}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[90] w-[min(480px,calc(100vw-2rem))] rounded-2xl flex flex-col max-h-[90vh]"
        style={{ background: 'rgba(18,17,15,0.99)', border: '1px solid rgba(244,122,99,0.25)', boxShadow: '0 32px 80px rgba(0,0,0,0.8)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(244,122,99,0.12)', border: '1px solid rgba(244,122,99,0.25)' }}>
              <UserPlus className="w-[18px] h-[18px] text-orange-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Add Lead</div>
              <div className="text-xs text-white/35">Create a manual lead record</div>
            </div>
          </div>
          <button onClick={() => !saving && onClose()} className="text-white/25 hover:text-white/60 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-4">

          {/* Name + Company */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-wide">
                Full Name <span className="text-red-400 normal-case tracking-normal">*</span>
              </label>
              <input
                value={name} onChange={e => { setName(e.target.value); setError('') }}
                placeholder="Jane Smith" autoFocus
                className="w-full px-3 py-2 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all"
                style={{ ...inputBase, borderColor: error && !name.trim() ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.08)' }}
                onFocus={focusViolet} onBlur={blurDefault}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-wide">Company</label>
              <input
                value={company} onChange={e => setCompany(e.target.value)}
                placeholder="Acme Ltd"
                className="w-full px-3 py-2 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all"
                style={inputBase} onFocus={focusViolet} onBlur={blurDefault}
              />
            </div>
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-wide">Phone</label>
              <input
                value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+44 7700 000000" type="tel"
                className="w-full px-3 py-2 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all"
                style={inputBase} onFocus={focusViolet} onBlur={blurDefault}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-wide">Email</label>
              <input
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="jane@example.com" type="email"
                className="w-full px-3 py-2 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all"
                style={inputBase} onFocus={focusViolet} onBlur={blurDefault}
              />
            </div>
          </div>

          {/* Source + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-wide">Source</label>
              <select
                value={source} onChange={e => setSource(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none transition-all appearance-none cursor-pointer"
                style={inputBase} onFocus={focusViolet} onBlur={blurDefault}>
                {SOURCES.map(s => (
                  <option key={s} value={s} style={{ background: '#121416' }}>
                    {s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-wide">Status</label>
              <select
                value={status} onChange={e => setStatus(e.target.value as LeadStatus)}
                className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none transition-all appearance-none cursor-pointer"
                style={inputBase} onFocus={focusViolet} onBlur={blurDefault}>
                {STATUSES.map(s => (
                  <option key={s.value} value={s.value} style={{ background: '#121416' }}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Score slider */}
          <div>
            <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-wide">
              Score{' '}
              <span className="normal-case tracking-normal font-normal text-white/30">
                {score} — {scoreLabel(score)}
              </span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range" min="0" max="100" value={score}
                onChange={e => setScore(Number(e.target.value))}
                className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                style={{ accentColor: scoreLabelColor(score) }}
              />
              <input
                type="number" min="0" max="100" value={score}
                onChange={e => setScore(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                className="w-14 text-center px-2 py-1.5 rounded-lg text-sm text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-wide">Notes</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Any additional context…" rows={3}
              className="w-full px-3 py-2 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all resize-none"
              style={inputBase} onFocus={focusViolet} onBlur={blurDefault}
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-wide">
              Tags{' '}
              <span className="normal-case tracking-normal font-normal text-white/30">comma separated</span>
            </label>
            <input
              value={tags} onChange={e => setTags(e.target.value)}
              placeholder="vip, urgent, referral"
              className="w-full px-3 py-2 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all"
              style={inputBase} onFocus={focusViolet} onBlur={blurDefault}
            />
          </div>

          {error && <p className="text-xs text-red-400 font-medium">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button onClick={() => !saving && onClose()} disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.45)' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
            style={{ background: 'rgba(244,122,99,0.18)', border: '1px solid rgba(244,122,99,0.4)', color: '#f8a36d' }}>
            {saving
              ? <motion.span className="w-4 h-4 rounded-full border-2 border-orange-400/30 border-t-orange-400"
                  animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
              : <UserPlus className="w-3.5 h-3.5" />}
            {saving ? 'Adding…' : 'Add Lead'}
          </button>
        </div>
      </motion.div>
    </>
  )
}
