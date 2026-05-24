'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Lock, Eye, EyeOff, CheckCircle, ArrowRight, Shield } from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  owner:       'Owner',
  team_leader: 'Team Leader',
  agent:       'Agent',
  viewer:      'Viewer',
}

const ROLE_COLORS: Record<string, string> = {
  owner:       '#fbbf24',
  team_leader: '#a78bfa',
  agent:       '#60a5fa',
  viewer:      'rgba(255,255,255,0.5)',
}

function strength(pw: string): 0 | 1 | 2 | 3 {
  let score = 0
  if (pw.length >= 8)  score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score++
  return score as 0 | 1 | 2 | 3
}

const STRENGTH_LABEL = ['', 'Weak', 'Fair', 'Strong'] as const
const STRENGTH_COLOR = ['', '#f87171', '#fbbf24', '#34d399'] as const

export default function JoinFlow({
  token, memberName, memberEmail, memberRole, invitedBy,
}: {
  token:       string
  memberName:  string
  memberEmail: string
  memberRole:  string
  invitedBy:   string
}) {
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [showConf,  setShowConf]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [done,      setDone]      = useState(false)

  const pw_strength = strength(password)
  const mismatch    = confirm.length > 0 && confirm !== password
  const roleLabel   = ROLE_LABELS[memberRole] ?? memberRole
  const roleColor   = ROLE_COLORS[memberRole] ?? '#60a5fa'

  const inputBase = {
    background: 'rgba(255,255,255,0.04)',
    border:     '1px solid rgba(255,255,255,0.08)',
  } as const

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/team/accept', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to accept invite')
        setLoading(false)
        return
      }
      setDone(true)
      setTimeout(() => { window.location.href = '/dashboard' }, 2000)
    } catch {
      setError('Network error — please check your connection and try again')
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden"
      style={{ background: '#050510' }}
    >
      {/* Background */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div
          className="absolute inset-0 opacity-[0.045]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(139,92,246,1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(139,92,246,1) 1px, transparent 1px)
            `,
            backgroundSize: '56px 56px',
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(124,58,237,0.10) 0%, rgba(37,99,235,0.05) 50%, transparent 70%)',
          }}
        />
      </div>

      <AnimatePresence mode="wait">
        {done ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm rounded-2xl px-8 py-12 flex flex-col items-center gap-5 text-center"
            style={{
              background: 'rgba(7,7,25,0.95)',
              border:     '1px solid rgba(52,211,153,0.25)',
              boxShadow:  '0 32px 80px rgba(0,0,0,0.7)',
            }}
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)' }}
            >
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </motion.div>
            <div>
              <h1 className="text-xl font-black text-white">Welcome, {memberName.split(' ')[0]}!</h1>
              <p className="text-sm text-white/40 mt-1.5 leading-relaxed">
                Your account is ready. Redirecting to your dashboard…
              </p>
            </div>
            <motion.div
              className="w-40 h-1 rounded-full overflow-hidden"
              style={{ background: 'rgba(52,211,153,0.12)' }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ background: '#34d399' }}
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 1.8, ease: 'linear' }}
              />
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-sm"
            style={{
              background:         'rgba(7,7,25,0.92)',
              backdropFilter:     'blur(32px)',
              WebkitBackdropFilter: 'blur(32px)',
              borderRadius:       '24px',
              border:             '1px solid rgba(139,92,246,0.18)',
              boxShadow:          '0 48px 120px rgba(0,0,0,0.75)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-6 pt-6 pb-5"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'linear-gradient(135deg,#7c3aed,#2563eb)',
                    boxShadow:  '0 0 18px rgba(124,58,237,0.45)',
                  }}
                >
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <span className="text-base font-bold tracking-tight text-white">
                  Instant
                  <span
                    style={{
                      background:             'linear-gradient(135deg,#818cf8,#60a5fa)',
                      WebkitBackgroundClip:   'text',
                      WebkitTextFillColor:    'transparent',
                      backgroundClip:         'text',
                    }}
                  >
                    Desk
                  </span>
                </span>
              </div>
              <span
                className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                style={{ background: `${roleColor}18`, border: `1px solid ${roleColor}35`, color: roleColor }}
              >
                {roleLabel}
              </span>
            </div>

            {/* Body */}
            <div className="px-6 pt-6 pb-5">
              {/* Invite context */}
              <div
                className="rounded-xl px-4 py-3 mb-6 flex items-start gap-3"
                style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}
              >
                <Shield className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-white/70">
                    <span className="text-violet-300">{invitedBy}</span> invited you to join InstantDesk
                  </p>
                  <p className="text-[11px] text-white/30 mt-0.5">{memberEmail}</p>
                </div>
              </div>

              <div className="mb-6">
                <h1 className="text-xl font-black text-white tracking-tight">Set your password</h1>
                <p className="text-xs text-white/35 mt-1">Choose a secure password for your account.</p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {/* Password */}
                <div>
                  <label className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                    <input
                      type={showPw ? 'text' : 'password'}
                      required
                      autoFocus
                      autoComplete="new-password"
                      placeholder="••••••••••••"
                      value={password}
                      onChange={e => { setPassword(e.target.value); setError(null) }}
                      className="w-full pl-10 pr-11 py-3 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all"
                      style={{ ...inputBase, borderColor: error ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.08)' }}
                      onFocus={e => { e.currentTarget.style.border = '1px solid rgba(139,92,246,0.5)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.08)' }}
                      onBlur={e => { e.currentTarget.style.border = `1px solid ${error ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.08)'}` ; e.currentTarget.style.boxShadow = 'none' }}
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Strength bar */}
                  {password.length > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 flex gap-1">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300"
                            style={{ background: pw_strength >= i ? STRENGTH_COLOR[pw_strength] : 'rgba(255,255,255,0.08)' }} />
                        ))}
                      </div>
                      <span className="text-[10px] font-semibold transition-colors"
                        style={{ color: STRENGTH_COLOR[pw_strength] }}>
                        {STRENGTH_LABEL[pw_strength]}
                      </span>
                    </div>
                  )}
                </div>

                {/* Confirm */}
                <div>
                  <label className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                    <input
                      type={showConf ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      placeholder="••••••••••••"
                      value={confirm}
                      onChange={e => { setConfirm(e.target.value); setError(null) }}
                      className="w-full pl-10 pr-11 py-3 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all"
                      style={{ ...inputBase, borderColor: mismatch ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.08)' }}
                      onFocus={e => { e.currentTarget.style.border = '1px solid rgba(139,92,246,0.5)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.08)' }}
                      onBlur={e => { e.currentTarget.style.border = `1px solid ${mismatch ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.08)'}` ; e.currentTarget.style.boxShadow = 'none' }}
                    />
                    <button type="button" onClick={() => setShowConf(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors">
                      {showConf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {mismatch && (
                    <p className="text-[10px] text-red-400 mt-1.5 font-medium">Passwords do not match</p>
                  )}
                </div>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="text-xs text-red-400 flex items-center gap-1.5 -mt-1"
                    >
                      <span className="w-3.5 h-3.5 rounded-full bg-red-500/20 flex items-center justify-center text-[9px] font-black flex-shrink-0">!</span>
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* Submit */}
                <motion.button
                  type="submit"
                  disabled={loading || password.length < 8 || mismatch || confirm === ''}
                  whileHover={{ scale: 1.015 }}
                  whileTap={{ scale: 0.985 }}
                  className="relative w-full py-3.5 rounded-xl text-sm font-bold text-white mt-1 overflow-hidden transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: 'linear-gradient(135deg,#7c3aed 0%,#4f46e5 50%,#2563eb 100%)',
                    boxShadow:  '0 8px 28px rgba(99,102,241,0.38)',
                  }}
                >
                  <span className="relative flex items-center justify-center gap-2">
                    {loading ? (
                      <>
                        <motion.span
                          className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
                        />
                        Setting up account…
                      </>
                    ) : (
                      <>
                        Create Account <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </span>
                </motion.button>
              </form>
            </div>

            {/* Footer */}
            <div
              className="px-6 py-4 flex items-center justify-center"
              style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
            >
              <p className="text-xs text-white/15">InstantDesk · Secure team invite</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
