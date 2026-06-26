'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Lock, Eye, EyeOff, ArrowRight, ShieldCheck } from 'lucide-react'
import { loginAction } from '../admin/auth-actions'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return
    setLoading(true)
    setError(null)

    try {
      const result = await loginAction(password)
      if (result.success) {
        window.location.href = '/admin'
      } else {
        setError(result.error ?? 'An unexpected error occurred.')
        setLoading(false)
      }
    } catch {
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div
      className="auth-premium-bg min-h-screen flex flex-col items-center justify-center px-4 py-16"
    >
      {/* Back to home */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="absolute top-6 left-6"
      >
        <Link
          href="/"
          className="flex items-center gap-2 text-sm text-white/35 hover:text-white/70 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to home
        </Link>
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex items-center justify-center mb-10">
          <img src="/assets/instantdesk-logo.png" alt="InstantDesk" className="h-9 w-auto" />
        </div>

        {/* Glass card */}
        <div
          className="auth-premium-card rounded-2xl p-8"
        >
          {/* Heading */}
          <div className="flex items-center gap-3 mb-8">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(244,122,99,0.12)', border: '1px solid rgba(244,122,99,0.2)' }}
            >
              <ShieldCheck className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">Admin Access</h1>
              <p className="text-xs text-white/35 mt-0.5">Enter your admin password to continue</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-[10px] font-bold text-white/35 uppercase tracking-widest mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  autoFocus
                  placeholder="••••••••••••"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(null) }}
                  className="w-full pl-10 pr-11 py-3 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all duration-200"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: error
                      ? '1px solid rgba(248,113,113,0.5)'
                      : '1px solid rgba(255,255,255,0.08)',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.border = error
                      ? '1px solid rgba(248,113,113,0.6)'
                      : '1px solid rgba(244,122,99,0.45)'
                    e.currentTarget.style.boxShadow = error
                      ? '0 0 0 3px rgba(248,113,113,0.1)'
                      : '0 0 0 3px rgba(244,122,99,0.1)'
                  }}
                  onBlur={e => {
                    e.currentTarget.style.border = error
                      ? '1px solid rgba(248,113,113,0.5)'
                      : '1px solid rgba(255,255,255,0.08)'
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

              {/* Error message */}
              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -4, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-xs text-red-400 mt-2 flex items-center gap-1.5"
                  >
                    <span className="w-3.5 h-3.5 rounded-full bg-red-500/20 flex items-center justify-center text-[9px] font-black flex-shrink-0">!</span>
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <motion.button
              type="submit"
              disabled={loading || !password.trim()}
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.985 }}
              className="relative w-full py-3.5 rounded-xl text-sm font-bold text-white mt-1 overflow-hidden transition-all duration-300 disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg,#171412 0%,#f47a63 50%,#f89a57 100%)',
                boxShadow: '0 8px 24px rgba(244,122,99,0.35)',
              }}
            >
              <span
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.1) 50%,transparent 60%)',
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
                    Verifying…
                  </>
                ) : (
                  <>
                    Enter Dashboard
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </span>
            </motion.button>
          </form>
        </div>

        <p className="text-center text-xs text-white/15 mt-6">
          InstantDesk · Admin access only
        </p>
      </motion.div>
    </div>
  )
}
