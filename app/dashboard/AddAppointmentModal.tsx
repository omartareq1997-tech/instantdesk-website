'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, CalendarPlus, Search } from 'lucide-react'

type ApptStatus = 'confirmed' | 'pending' | 'completed' | 'cancelled'

const APPT_TYPES = [
  { value: 'demo_call',      label: 'Demo Call'      },
  { value: 'discovery_call', label: 'Discovery Call' },
  { value: 'onboarding',     label: 'Onboarding'     },
  { value: 'follow_up',      label: 'Follow Up'      },
]
const APPT_STATUSES: { value: ApptStatus; label: string }[] = [
  { value: 'pending',   label: 'Pending'   },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const inputBase = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
} as const

function focusGreen(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = 'rgba(52,211,153,0.5)'
}
function blurDefault(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
}

export default function AddAppointmentModal({
  leads, defaultLeadId, onClose, onCreated, actorName = 'Alex Thompson',
}: {
  leads:          { id: string; name: string; company: string }[]
  defaultLeadId?: string
  onClose:        () => void
  onCreated:      (raw: Record<string, unknown>) => void
  actorName?:     string
}) {
  const defaultLead = leads.find(l => l.id === defaultLeadId)

  const [leadSearch,     setLeadSearch]     = useState(defaultLead?.name ?? '')
  const [selectedLeadId, setSelectedLeadId] = useState(defaultLeadId ?? '')
  const [dropOpen,       setDropOpen]       = useState(false)
  const [apptType,       setApptType]       = useState('demo_call')
  const [date,           setDate]           = useState('')
  const [time,           setTime]           = useState('09:00')
  const [apptStatus,     setApptStatus]     = useState<ApptStatus>('pending')
  const [notes,          setNotes]          = useState('')
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')

  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dropOpen) return
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropOpen])

  const filteredLeads = useMemo(() => {
    const q = leadSearch.toLowerCase()
    return leads
      .filter(l => l.name.toLowerCase().includes(q) || l.company.toLowerCase().includes(q))
      .slice(0, 8)
  }, [leads, leadSearch])

  function selectLead(l: { id: string; name: string }) {
    setSelectedLeadId(l.id)
    setLeadSearch(l.name)
    setDropOpen(false)
    setError('')
  }

  async function handleSave() {
    if (!selectedLeadId) { setError('Please select a lead'); return }
    if (!date)           { setError('Please pick a date');   return }
    setSaving(true); setError('')
    try {
      // Build scheduled_at using the local-time Date constructor to avoid
      // timezone ambiguity with the "YYYY-MM-DDTHH:MM" string form.
      const [yr, mo, dy] = date.split('-').map(Number)
      const [hr, mn]     = time.split(':').map(Number)
      const dt = new Date(yr, (mo ?? 1) - 1, dy ?? 1, hr ?? 9, mn ?? 0, 0, 0)
      const scheduled_at = dt.toISOString()

      const lead     = leads.find(l => l.id === selectedLeadId)
      const clientId = process.env.NEXT_PUBLIC_DEMO_CLIENT_ID ?? '00000000-0000-0000-0000-000000000001'

      const payload = {
        client_id:    clientId,
        lead_id:      selectedLeadId,
        lead_name:    lead?.name    ?? '',
        lead_company: lead?.company ?? '',
        type:         apptType,
        scheduled_at,
        status:       apptStatus,
        notes:        notes.trim() || undefined,
      }
      console.log('[AddAppointmentModal] POST /api/appointments', payload)

      const res  = await fetch('/api/appointments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Actor-Name': actorName },
        body:    JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) {
        const detail = [data.error, data.hint].filter(Boolean).join(' — ')
        console.error('[AddAppointmentModal] API error:', data)
        setError(detail || 'Failed to create appointment')
        setSaving(false)
        return
      }

      onCreated(data.appointment as Record<string, unknown>)
      onClose()
    } catch (err) {
      console.error('[AddAppointmentModal] Network error:', err)
      setError('Network error — check console for details')
      setSaving(false)
    }
  }

  const isLocked = !!defaultLeadId

  return (
    <>
      <motion.div
        key="add-appt-bd"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80]"
        style={{ background: 'rgba(0,0,0,0.75)' }}
        onClick={() => !saving && onClose()}
      />
      <motion.div
        key="add-appt-modal"
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{   opacity: 0, scale: 0.95, y: 16 }}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[90] w-[min(440px,calc(100vw-2rem))] rounded-2xl flex flex-col max-h-[90vh]"
        style={{ background: 'rgba(10,10,30,0.99)', border: '1px solid rgba(52,211,153,0.2)', boxShadow: '0 32px 80px rgba(0,0,0,0.8)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.2)' }}>
              <CalendarPlus className="w-[18px] h-[18px] text-emerald-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Add Appointment</div>
              <div className="text-xs text-white/35">Schedule a call or session</div>
            </div>
          </div>
          <button onClick={() => !saving && onClose()} className="text-white/25 hover:text-white/60 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-4">

          {/* Lead search / lock */}
          <div>
            <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-wide">
              Linked Lead <span className="text-red-400 normal-case tracking-normal">*</span>
            </label>
            <div ref={dropRef} className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none z-10" />
              <input
                value={leadSearch}
                onChange={e => {
                  if (isLocked) return
                  setLeadSearch(e.target.value)
                  setSelectedLeadId('')
                  setDropOpen(true)
                  setError('')
                }}
                onFocus={isLocked ? undefined : e => { setDropOpen(true); e.currentTarget.style.borderColor = 'rgba(52,211,153,0.5)' }}
                onBlur={isLocked ? undefined : e => {
                  e.currentTarget.style.borderColor = error && !selectedLeadId ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.08)'
                }}
                placeholder="Search leads by name or company…"
                readOnly={isLocked}
                className="w-full pl-9 pr-3 py-2 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all"
                style={{
                  ...inputBase,
                  borderColor: error && !selectedLeadId ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.08)',
                  cursor: isLocked ? 'default' : 'text',
                  opacity: isLocked ? 0.7 : 1,
                }}
              />

              {dropOpen && !isLocked && filteredLeads.length > 0 && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden z-20"
                  style={{ background: 'rgba(12,12,32,0.99)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 16px 40px rgba(0,0,0,0.7)' }}>
                  {filteredLeads.map(l => (
                    <button key={l.id} type="button" onMouseDown={() => selectLead(l)}
                      className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-white/5 transition-colors">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-black text-white flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg,rgba(124,58,237,0.5),rgba(37,99,235,0.4))' }}>
                        {l.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-white">{l.name}</div>
                        {l.company && <div className="text-[10px] text-white/35">{l.company}</div>}
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}

              {dropOpen && !isLocked && filteredLeads.length === 0 && leadSearch.trim() && (
                <div className="absolute left-0 right-0 top-full mt-1 rounded-xl px-4 py-3 text-xs text-white/30"
                  style={{ background: 'rgba(12,12,32,0.99)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  No leads match &ldquo;{leadSearch}&rdquo;
                </div>
              )}
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-wide">Appointment Type</label>
            <div className="grid grid-cols-2 gap-2">
              {APPT_TYPES.map(t => (
                <button key={t.value} type="button" onClick={() => setApptType(t.value)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all"
                  style={apptType === t.value ? {
                    background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.35)', color: '#34d399',
                  } : {
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.40)',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-wide">
                Date <span className="text-red-400 normal-case tracking-normal">*</span>
              </label>
              <input
                type="date" value={date} onChange={e => { setDate(e.target.value); setError('') }}
                className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none transition-all"
                style={{ ...inputBase, borderColor: error && !date ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.08)', colorScheme: 'dark' }}
                onFocus={focusGreen} onBlur={blurDefault}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-wide">Time</label>
              <input
                type="time" value={time} onChange={e => setTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none transition-all"
                style={{ ...inputBase, colorScheme: 'dark' }}
                onFocus={focusGreen} onBlur={blurDefault}
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-wide">Status</label>
            <div className="flex gap-2 flex-wrap">
              {APPT_STATUSES.map(s => (
                <button key={s.value} type="button" onClick={() => setApptStatus(s.value)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                  style={apptStatus === s.value ? {
                    background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.35)', color: '#34d399',
                  } : {
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.40)',
                  }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-wide">Notes</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Any context for this appointment…" rows={3}
              className="w-full px-3 py-2 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all resize-none"
              style={inputBase} onFocus={focusGreen} onBlur={blurDefault}
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
          <button onClick={handleSave} disabled={saving || !selectedLeadId || !date}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
            style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.35)', color: '#34d399' }}>
            {saving
              ? <motion.span className="w-4 h-4 rounded-full border-2 border-emerald-400/30 border-t-emerald-400"
                  animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
              : <CalendarPlus className="w-3.5 h-3.5" />}
            {saving ? 'Scheduling…' : 'Add Appointment'}
          </button>
        </div>
      </motion.div>
    </>
  )
}
