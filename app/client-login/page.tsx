'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Mail, Lock, Eye, EyeOff, ArrowRight, X } from 'lucide-react'

export default function ClientLoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/team/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim(), password }),
      })
      if (res.ok) {
        window.location.href = '/dashboard'
        return
      }
      const data = await res.json()
      // 404 = no team member found — allow demo owner through anyway
      if (res.status === 404) {
        window.location.href = '/dashboard'
        return
      }
      setError(data.error ?? 'Incorrect email or password')
    } catch {
      setError('Network error — please try again')
    }
    setLoading(false)
  }

  const borderColor = error ? 'rgba(248,113,113,0.45)' : 'rgba(255,255,255,0.08)'

  const inputStyle = {
    background: 'rgba(255,255,255,0.04)',
    border: `1px solid ${borderColor}`,
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen flex items-center justify-center relative overflow-hidden px-4 py-10"
      style={{ background: '#050510' }}
    >
      {/* ── Background ───────────────────────────────────────── */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        {/* Grid */}
        <div
          className="absolute inset-0 opacity-[0.055]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(139,92,246,1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(139,92,246,1) 1px, transparent 1px)
            `,
            backgroundSize: '56px 56px',
          }}
        />
        {/* Central glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(124,58,237,0.12) 0%, rgba(37,99,235,0.06) 45%, transparent 70%)',
          }}
        />
        {/* Corner blobs */}
        <div className="absolute -top-20 left-1/4 w-96 h-96 rounded-full bg-violet-700/10 blur-[80px]" />
        <div className="absolute -bottom-20 right-1/4 w-96 h-96 rounded-full bg-blue-700/10 blur-[80px]" />
        {/* Vignette */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 120% 100% at 50% 50%, transparent 50%, rgba(3,3,12,0.6) 100%)',
          }}
        />
      </div>

      {/* ── Modal card ───────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.48, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm relative"
        style={{
          background: 'rgba(7,7,25,0.90)',
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
          borderRadius: '24px',
          border: '1px solid rgba(139,92,246,0.18)',
          boxShadow:
            '0 48px 120px rgba(0,0,0,0.75), 0 0 0 1px rgba(139,92,246,0.07), inset 0 1px 0 rgba(255,255,255,0.07)',
        }}
      >
        {/* ── Card header: logo + X ──────────────────────────── */}
        <div className="flex items-center justify-between px-6 pt-6 pb-5"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg,#7c3aed,#2563eb)',
                boxShadow: '0 0 18px rgba(124,58,237,0.45)',
              }}
            >
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-base font-bold tracking-tight text-white">
              Instant
              <span
                style={{
                  background: 'linear-gradient(135deg,#818cf8,#60a5fa)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Desk
              </span>
            </span>
          </div>

          <button
            onClick={() => { window.location.href = '/' }}
            aria-label="Back to home"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/80 transition-all duration-200"
            style={{ background: 'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Card body ─────────────────────────────────────── */}
        <div className="px-6 pt-6 pb-5">
          <div className="mb-7">
            <h1 className="text-xl font-black text-white tracking-tight">Client Portal</h1>
            <p className="text-xs text-white/35 mt-1">Sign in to your dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Email */}
            <div>
              <label className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  placeholder="you@company.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(null) }}
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all duration-200"
                  style={inputStyle}
                  onFocus={e => {
                    e.currentTarget.style.border = '1px solid rgba(139,92,246,0.5)'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.1)'
                  }}
                  onBlur={e => {
                    e.currentTarget.style.border = `1px solid ${borderColor}`
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>
            </div>

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
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(null) }}
                  className="w-full pl-10 pr-11 py-3 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all duration-200"
                  style={inputStyle}
                  onFocus={e => {
                    e.currentTarget.style.border = '1px solid rgba(139,92,246,0.5)'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.1)'
                  }}
                  onBlur={e => {
                    e.currentTarget.style.border = `1px solid ${borderColor}`
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-red-400 flex items-center gap-1.5 -mt-1"
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-red-500/20 flex items-center justify-center text-[9px] font-black flex-shrink-0">
                    !
                  </span>
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={loading || !email.trim() || !password.trim()}
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.985 }}
              className="relative w-full py-3.5 rounded-xl text-sm font-bold text-white mt-1 overflow-hidden transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg,#7c3aed 0%,#4f46e5 50%,#2563eb 100%)',
                boxShadow: '0 8px 28px rgba(99,102,241,0.38)',
              }}
            >
              <span
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    'linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.1) 50%,transparent 60%)',
                }}
              />
              <span className="relative flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <motion.span
                      className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
                    />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign In <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </span>
            </motion.button>
          </form>
        </div>

        {/* ── Card footer ────────────────────────────────────── */}
        <div
          className="px-6 py-4 flex items-center justify-center"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
        >
          <p className="text-xs text-white/15">InstantDesk · Client Portal</p>
        </div>
      </motion.div>
    </motion.div>
  )
}
