'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Zap, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'

function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

function LoginForm() {
  const searchParams  = useSearchParams()
  const nextPath      = searchParams.get('next') ?? '/dashboard'
  const authError     = searchParams.get('error')
  const status        = searchParams.get('status')

  const [mode,     setMode]     = useState<'login' | 'signup'>('login')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(
    authError === 'auth_callback_failed'
      ? 'The sign-in link is invalid or has expired. Please try again.'
      : null,
  )
  const [message,  setMessage]  = useState<string | null>(
    status === 'password_updated'
      ? 'Your password has been updated. Sign in with your new password.'
      : null,
  )

  useEffect(() => {
    // If user is already logged in, redirect immediately
    const sb = createClient()
    sb.auth.getUser().then(({ data: { user } }) => {
      if (user) window.location.replace(nextPath)
    })
  }, [nextPath])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return
    setLoading(true)
    setError(null)
    setMessage(null)

    const sb = createClient()

    if (mode === 'signup') {
      const { error: signUpError } = await sb.auth.signUp({
        email:    email.trim(),
        password,
        options:  { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      setLoading(false)
      if (signUpError) {
        setError(signUpError.message)
      } else {
        setMessage('Check your email for a confirmation link.')
      }
      return
    }

    // Login
    const { error: signInError } = await sb.auth.signInWithPassword({
      email:    email.trim(),
      password,
    })
    setLoading(false)
    if (signInError) {
      setError(signInError.message)
      return
    }
    window.location.replace(nextPath)
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="w-8 h-8 bg-[#7C3AED] rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-bold text-xl tracking-tight">InstantDesk</span>
        </div>

        {/* Card */}
        <div className="bg-[#111] border border-white/10 rounded-2xl p-8">
          <h1 className="text-white text-2xl font-bold mb-1">
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </h1>
          <p className="text-white/40 text-sm mb-6">
            {mode === 'login'
              ? 'Enter your credentials to access your dashboard.'
              : 'Set up your InstantDesk account.'}
          </p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
              {error}
            </div>
          )}

          {message && (
            <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded-lg px-4 py-3 mb-4">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#7C3AED]/60 focus:ring-1 focus:ring-[#7C3AED]/30"
              />
            </div>

            {/* Password */}
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-10 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#7C3AED]/60 focus:ring-1 focus:ring-[#7C3AED]/30"
              />
              <button
                type="button"
                onClick={() => setShowPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {mode === 'login' && (
              <div className="-mt-1 text-right">
                <Link href="/forgot-password" className="text-xs text-[#7C3AED] hover:text-[#9F5FFF]">
                  Forgot password?
                </Link>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Sign in' : 'Create account'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-white/40">
            {mode === 'login' ? (
              <>
                No account?{' '}
                <button onClick={() => { setMode('signup'); setError(null); setMessage(null) }} className="text-[#7C3AED] hover:text-[#9F5FFF]">
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button onClick={() => { setMode('login'); setError(null); setMessage(null) }} className="text-[#7C3AED] hover:text-[#9F5FFF]">
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>

        {/* Legacy team login link */}
        <p className="text-center text-white/20 text-xs mt-4">
          Team member?{' '}
          <a href="/client-login" className="underline hover:text-white/40">Use team login</a>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <span className="w-6 h-6 border-2 border-white/20 border-t-[#7C3AED] rounded-full animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
