'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import { ArrowLeft, ArrowRight, Mail, Zap } from 'lucide-react'

const PASSWORD_RESET_REDIRECT_URL = 'https://instantdesk.pl/reset-password'

function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    setError(null)
    setMessage(null)

    const supabase = createClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: PASSWORD_RESET_REDIRECT_URL,
    })

    setLoading(false)

    if (resetError) {
      setError(resetError.message)
      return
    }

    setMessage('If an account exists for that email, a password reset link has been sent.')
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

          <h1 className="text-white text-2xl font-bold mb-1">Reset password</h1>
          <p className="text-white/40 text-sm mb-6">
            Enter your account email and we will send a secure reset link.
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
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={event => setEmail(event.target.value)}
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#7C3AED]/60 focus:ring-1 focus:ring-[#7C3AED]/30"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Send reset link
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
