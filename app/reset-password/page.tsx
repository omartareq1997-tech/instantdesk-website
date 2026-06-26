'use client'

import { FormEvent, Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock } from 'lucide-react'

function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

function friendlyResetError(message?: string) {
  const text = message ?? 'Password reset failed. Please try again.'
  const lower = text.toLowerCase()

  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many emails sent. Please wait a few minutes and try again.'
  }

  if (lower.includes('session') || lower.includes('expired') || lower.includes('invalid')) {
    return 'This password reset link is invalid or has expired. Request a new link.'
  }

  return text
}

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checkingLink, setCheckingLink] = useState(true)
  const [canReset, setCanReset] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function returnToSignIn() {
    const supabase = createClient()
    await supabase.auth.signOut().catch(error => {
      console.warn('[reset-password] failed to clear recovery session', {
        name: error instanceof Error ? error.name : 'UnknownError',
      })
    })
    router.replace('/login')
  }

  useEffect(() => {
    let mounted = true

    async function prepareRecoverySession() {
      const supabase = createClient()
      const code = searchParams.get('code')
      const tokenHash = searchParams.get('token_hash')
      const type = searchParams.get('type')

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (!mounted) return
        if (exchangeError) {
          setError('This password reset link is invalid or has expired. Request a new link.')
          setCheckingLink(false)
          return
        }
      } else if (window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.slice(1))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')

        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (!mounted) return
          if (sessionError) {
            setError('This password reset link is invalid or has expired. Request a new link.')
            setCheckingLink(false)
            return
          }
        }
      } else if (tokenHash && type === 'recovery') {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        })
        if (!mounted) return
        if (verifyError) {
          setError('This password reset link is invalid or has expired. Request a new link.')
          setCheckingLink(false)
          return
        }
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted) return

      if (!session) {
        setError('Open the password reset link from your email, or request a new link.')
        setCheckingLink(false)
        return
      }

      setCanReset(true)
      setCheckingLink(false)
    }

    prepareRecoverySession()

    return () => {
      mounted = false
    }
  }, [searchParams])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setLoading(false)
      setError(friendlyResetError(updateError.message))
      return
    }

    await supabase.auth.signOut()
    router.replace('/login?status=password_updated')
  }

  return (
    <div className="auth-premium-bg min-h-screen flex items-center justify-center p-4">
      <div className="relative w-full max-w-md">
        <div className="flex items-center justify-center mb-8">
          <img src="/assets/instantdesk-logo.png" alt="InstantDesk" className="h-9 w-auto" />
        </div>

        <div className="auth-premium-card rounded-2xl p-8">
          <button
            type="button"
            onClick={returnToSignIn}
            className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white/70 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to sign in
          </button>

          <h1 className="text-white text-2xl font-semibold mb-1">Create new password</h1>
          <p className="text-white/40 text-sm mb-6">
            Choose a new password for your InstantDesk account.
          </p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
              {error}
            </div>
          )}

          {checkingLink ? (
            <div className="flex items-center justify-center py-8">
              <span className="w-5 h-5 border-2 border-white/20 border-t-orange-300 rounded-full animate-spin" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="New password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  required
                  minLength={8}
                  disabled={!canReset}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-10 py-3 text-white placeholder-white/30 text-sm disabled:opacity-50 focus:outline-none focus:border-orange-300/60 focus:ring-1 focus:ring-orange-300/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(value => !value)}
                  disabled={!canReset}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 disabled:opacity-50"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  required
                  minLength={8}
                  disabled={!canReset}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-white/30 text-sm disabled:opacity-50 focus:outline-none focus:border-orange-300/60 focus:ring-1 focus:ring-orange-300/20"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !canReset}
                className="w-full bg-white text-neutral-950 hover:bg-orange-100 disabled:opacity-50 font-medium rounded-xl py-3 flex items-center justify-center gap-2 transition-colors"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Update password
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="auth-premium-bg min-h-screen flex items-center justify-center">
        <span className="w-6 h-6 border-2 border-white/20 border-t-orange-300 rounded-full animate-spin" />
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  )
}
