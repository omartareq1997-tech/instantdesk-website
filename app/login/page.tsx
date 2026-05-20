'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Zap, ArrowLeft, Mail, Lock, Eye, EyeOff, ArrowRight, Calendar } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    /* No backend yet — visual feedback only */
    setTimeout(() => setLoading(false), 1800)
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden px-4 py-16"
      style={{ background: '#050510' }}
    >
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <div
          className="absolute inset-0 opacity-[0.06]"
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
        <div className="absolute top-0 left-1/4 w-80 h-80 rounded-full bg-violet-700/8 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full bg-blue-700/8 blur-3xl" />
      </div>

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
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg,#7c3aed,#2563eb)',
              boxShadow: '0 0 24px rgba(124,58,237,0.5)',
            }}
          >
            <Zap className="w-4.5 h-4.5 text-white" style={{ width: '18px', height: '18px' }} />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">
            Instant<span
              style={{
                background: 'linear-gradient(135deg,#818cf8,#60a5fa)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >Desk</span>
          </span>
        </div>

        {/* Glass card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: 'rgba(255,255,255,0.03)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-2xl font-black text-white mb-1.5 tracking-tight">
              Welcome back
            </h1>
            <p className="text-sm text-white/40">
              Sign in to your InstantDesk dashboard
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">
                Email address
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none"
                />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all duration-200"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.border = '1px solid rgba(139,92,246,0.45)'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.1)'
                  }}
                  onBlur={e => {
                    e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">
                Password
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none"
                />
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-11 py-3 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all duration-200"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.border = '1px solid rgba(139,92,246,0.45)'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.1)'
                  }}
                  onBlur={e => {
                    e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw
                    ? <EyeOff className="w-4 h-4" />
                    : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.985 }}
              className="relative w-full py-3.5 rounded-xl text-sm font-bold text-white mt-2 overflow-hidden transition-all duration-300 disabled:opacity-70"
              style={{
                background: 'linear-gradient(135deg,#7c3aed 0%,#4f46e5 50%,#2563eb 100%)',
                boxShadow: '0 8px 24px rgba(99,102,241,0.35)',
              }}
            >
              {/* Shine sweep */}
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
                    Signing in…
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </span>
            </motion.button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[11px] text-white/20 font-medium">or</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          {/* Book demo instead */}
          <a
            href="#demo"
            onClick={e => { e.preventDefault(); window.location.href = '/#demo' }}
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-sm font-semibold text-white/60 hover:text-white transition-all duration-200 group"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <Calendar className="w-4 h-4 group-hover:text-violet-400 transition-colors" />
            Book a demo instead
          </a>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-white/20 mt-6 leading-relaxed">
          By signing in you agree to our{' '}
          <span className="text-white/35 hover:text-white/60 cursor-pointer transition-colors">Terms</span>
          {' & '}
          <span className="text-white/35 hover:text-white/60 cursor-pointer transition-colors">Privacy Policy</span>
        </p>
      </motion.div>
    </div>
  )
}
