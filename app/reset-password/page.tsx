'use client'

import { FormEvent, Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Zap } from 'lucide-react'

function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
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
      setError(updateError.message)
      return
    }

    await supabase.auth.signOut()
    router.replace('/login?status=password_updated')
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="w-8 h-8 bg-[#7C3AED] rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-bold text-xl tracking-tight">InstantDesk</span>
        </div>

        <div className="bg-[#111] border border-white/10 rounded-2xl p-8">
          <Link href="/login" className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white/70 mb-6">
            <ArrowLeft className="w-4 h-4" />
            Back to sign in
          </Link>

          <h1 className="text-white text-2xl font-bold mb-1">Create new password</h1>
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
              <span className="w-5 h-5 border-2 border-white/20 border-t-[#7C3AED] rounded-full animate-spin" />
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
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-10 py-3 text-white placeholder-white/30 text-sm disabled:opacity-50 focus:outline-none focus:border-[#7C3AED]/60 focus:ring-1 focus:ring-[#7C3AED]/30"
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
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-white/30 text-sm disabled:opacity-50 focus:outline-none focus:border-[#7C3AED]/60 focus:ring-1 focus:ring-[#7C3AED]/30"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !canReset}
                className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2 transition-colors"
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
      <div className="min-h-screen bg-black flex items-center justify-center">
        <span className="w-6 h-6 border-2 border-white/20 border-t-[#7C3AED] rounded-full animate-spin" />
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  )
}
