'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'

function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

function friendlyAuthError(message?: string) {
  const text = message ?? 'Authentication failed. Please try again.'
  const lower = text.toLowerCase()

  if (lower.includes('rate limit') || lower.includes('too many') || lower.includes('email rate limit')) {
    return 'Too many emails sent. Please wait a few minutes and try again.'
  }

  if (lower.includes('invalid login credentials')) {
    return 'Incorrect email or password.'
  }

  if (lower.includes('email not confirmed')) {
    return 'Please confirm your email before signing in.'
  }

  return text
}

function LoginForm() {
  const searchParams  = useSearchParams()
  const nextPath      = searchParams.get('next') ?? '/dashboard'
  const authError     = searchParams.get('error')
  const status        = searchParams.get('status')
  const initialMode   = searchParams.get('mode') === 'signup' ? 'signup' : 'login'

  const [mode,     setMode]     = useState<'login' | 'signup'>(initialMode)
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
    setMode(initialMode)
    setLoading(false)
    setError(authError === 'auth_callback_failed'
      ? 'The sign-in link is invalid or has expired. Please try again.'
      : null)
    setMessage(status === 'password_updated'
      ? 'Your password has been updated. Sign in with your new password.'
      : null)
    setPassword('')
  }, [authError, initialMode, status])

  useEffect(() => {
    // If user is already logged in, redirect immediately
    const sb = createClient()
    sb.auth.getUser().then(({ data: { user }, error: userError }) => {
      if (userError && userError.name !== 'AuthSessionMissingError') {
        console.warn('[login] existing session check failed', {
          name: userError.name,
          status: userError.status,
        })
      }
      if (user) window.location.replace(nextPath)
    })
  }, [nextPath])

  useEffect(() => {
    const clearTransientState = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      setLoading(false)
      if (!authError) setError(null)
      if (!status) setMessage(null)
    }

    window.addEventListener('pageshow', clearTransientState)
    return () => window.removeEventListener('pageshow', clearTransientState)
  }, [authError, status])

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
      if (signUpError) {
        setLoading(false)
        setError(friendlyAuthError(signUpError.message))
      } else {
        const requiresConfirmation = process.env.NEXT_PUBLIC_AUTH_REQUIRE_EMAIL_CONFIRMATION === 'true'
        if (requiresConfirmation) {
          setLoading(false)
          setMessage('Check your email for a confirmation link.')
          return
        }

        setMessage('Account created. Signing you in...')
        const response = await fetch('/api/auth/login', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email: email.trim(), password }),
        })

        if (response.ok) {
          window.location.replace(nextPath)
          return
        }

        const { data: sessionData, error: sessionError } = await sb.auth.getSession()
        if (sessionError) {
          console.warn('[signup] immediate session lookup failed', { name: sessionError.name, message: sessionError.message })
        }
        if (sessionData.session) {
          window.location.replace(nextPath)
          return
        }

        const data = await response.json().catch(() => ({} as { error?: string }))
        setLoading(false)
        setError(friendlyAuthError(data.error ?? 'Account was created, but automatic sign-in failed. Please sign in.'))
      }
      return
    }

    // Login through a route handler so Supabase auth cookies are set before
    // navigating to the dashboard guarded by the proxy.
    const response = await fetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: email.trim(), password }),
    })

    if (!response.ok) {
      setLoading(false)
      const data = await response.json().catch(() => ({} as { error?: string }))
      console.warn('[login] password sign-in rejected', { status: response.status })
      setError(friendlyAuthError(data.error))
      return
    }

    window.location.replace(nextPath)
  }

  return (
    <div className="auth-premium-bg min-h-screen flex items-center justify-center p-4">
      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center mb-8">
          <img src="/assets/instantdesk-logo.png" alt="InstantDesk" className="h-9 w-auto" />
        </div>

        {/* Card */}
        <div className="auth-premium-card rounded-2xl p-8">
          <h1 className="text-white text-2xl font-semibold mb-1">
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
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-orange-300/60 focus:ring-1 focus:ring-orange-300/20"
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
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-10 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-orange-300/60 focus:ring-1 focus:ring-orange-300/20"
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
                <Link href="/forgot-password" className="text-xs text-orange-300/80 hover:text-orange-200">
                  Forgot password?
                </Link>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-neutral-950 hover:bg-orange-100 disabled:opacity-50 font-medium rounded-xl py-3 flex items-center justify-center gap-2 transition-colors"
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
                <button onClick={() => { setMode('signup'); setError(null); setMessage(null) }} className="text-orange-300/80 hover:text-orange-200">
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button onClick={() => { setMode('login'); setError(null); setMessage(null) }} className="text-orange-300/80 hover:text-orange-200">
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
      <div className="auth-premium-bg min-h-screen flex items-center justify-center">
        <span className="w-6 h-6 border-2 border-white/20 border-t-orange-300 rounded-full animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
