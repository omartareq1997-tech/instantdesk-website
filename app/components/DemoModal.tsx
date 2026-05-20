'use client'

import { useState, useEffect, useRef, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, User, Building2, Mail, Phone, Globe, MessageSquare,
  ArrowRight, CheckCircle, Loader2, Shield, Clock,
} from 'lucide-react'
import { saveSubmission, type DemoSubmissionInput } from '../lib/demo-submissions'

/* ─── Types ─────────────────────────────────────────────── */

type FormValues = {
  fullName: string
  businessName: string
  email: string
  phone: string
  website: string
  message: string
}

type FormErrors = Partial<Record<keyof FormValues, string>>

type Props = {
  isOpen: boolean
  onClose: () => void
  source: string
}

/* ─── Validation ─────────────────────────────────────────── */

function validate(v: FormValues): FormErrors {
  const e: FormErrors = {}
  if (!v.fullName.trim()) e.fullName = 'Full name is required'
  else if (v.fullName.trim().length < 2) e.fullName = 'At least 2 characters'

  if (!v.businessName.trim()) e.businessName = 'Business name is required'

  if (!v.email.trim()) e.email = 'Email is required'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim()))
    e.email = 'Enter a valid email address'

  if (!v.phone.trim()) e.phone = 'Phone number is required'
  else if (!/^[+\d\s\-().]{7,20}$/.test(v.phone.trim()))
    e.phone = 'Enter a valid phone number'

  if (v.website.trim() && !/^https?:\/\/.+\..+/.test(v.website.trim()))
    e.website = 'Include https:// (e.g. https://mysite.com)'

  return e
}

/* ─── Field wrapper ──────────────────────────────────────── */

function Field({
  label,
  error,
  optional,
  children,
}: {
  label: string
  error?: string
  optional?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase tracking-widest text-white/35">
          {label}
        </label>
        {optional && (
          <span className="text-[9px] font-medium text-white/20 uppercase tracking-wider">
            Optional
          </span>
        )}
      </div>
      {children}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-1.5 text-xs text-red-400"
          >
            <span className="w-3.5 h-3.5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 text-[9px] font-black">!</span>
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Input base styles ──────────────────────────────────── */

const BASE_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  transition: 'border-color 0.2s, box-shadow 0.2s',
}

function makeHandlers(hasError: boolean, onBlurExtra?: () => void) {
  return {
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.currentTarget.style.border = hasError
        ? '1px solid rgba(239,68,68,0.6)'
        : '1px solid rgba(139,92,246,0.5)'
      e.currentTarget.style.boxShadow = hasError
        ? '0 0 0 3px rgba(239,68,68,0.1)'
        : '0 0 0 3px rgba(139,92,246,0.12)'
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onBlurExtra?.()
      e.currentTarget.style.border = hasError
        ? '1px solid rgba(239,68,68,0.45)'
        : '1px solid rgba(255,255,255,0.08)'
      e.currentTarget.style.boxShadow = 'none'
    },
  }
}

function inputStyle(hasError: boolean): React.CSSProperties {
  return {
    ...BASE_STYLE,
    ...(hasError ? { border: '1px solid rgba(239,68,68,0.45)' } : {}),
  }
}

const INPUT_CLS = 'w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 outline-none'

/* ─── Success state ──────────────────────────────────────── */

function SuccessView({ name, onClose }: { name: string; onClose: () => void }) {
  return (
    <motion.div
      key="success"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center text-center py-8 px-4"
    >
      {/* Animated checkmark */}
      <div className="relative mb-8">
        {/* Outer glow rings */}
        {[0, 1].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full"
            style={{ background: 'rgba(34,197,94,0.2)' }}
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 1.6 + i * 0.5, opacity: 0 }}
            transition={{ duration: 1.4, delay: 0.6 + i * 0.3, repeat: Infinity, repeatDelay: 0.6 }}
          />
        ))}
        <svg viewBox="0 0 100 100" className="w-24 h-24 relative z-10">
          {/* Circle */}
          <motion.circle
            cx="50" cy="50" r="44"
            fill="none"
            stroke="rgba(34,197,94,0.25)"
            strokeWidth="3"
          />
          <motion.circle
            cx="50" cy="50" r="44"
            fill="none"
            stroke="#22c55e"
            strokeWidth="3.5"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
          {/* Checkmark */}
          <motion.path
            d="M 26 50 L 42 66 L 74 34"
            fill="none"
            stroke="#22c55e"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, delay: 0.65, ease: 'easeOut' }}
          />
        </svg>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
      >
        <h3 className="text-2xl font-black text-white mb-2">
          You&apos;re on the list, {name.split(' ')[0]}!
        </h3>
        <p className="text-white/45 text-sm leading-relaxed max-w-xs mx-auto mb-8">
          We&apos;ve saved your request and will reach out within{' '}
          <span className="text-white/70 font-semibold">24 hours</span> to
          schedule your personalised demo.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.75 }}
        className="flex flex-col sm:flex-row gap-3 w-full max-w-xs"
      >
        <button
          onClick={onClose}
          className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-all duration-200 hover:-translate-y-0.5"
          style={{
            background: 'linear-gradient(135deg,#7c3aed,#2563eb)',
            boxShadow: '0 8px 24px rgba(99,102,241,0.35)',
          }}
        >
          Close
        </button>
        <a
          href="/"
          className="flex-1 py-3 rounded-xl text-sm font-semibold text-white/50 hover:text-white/80 transition-colors text-center"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          Back to home
        </a>
      </motion.div>

      {/* Info row */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
        className="flex items-center justify-center gap-4 mt-8 text-[10px] text-white/20"
      >
        <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> Data never shared</span>
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Reply in 24h</span>
      </motion.div>
    </motion.div>
  )
}

/* ─── Main modal ─────────────────────────────────────────── */

const EMPTY: FormValues = {
  fullName: '', businessName: '', email: '',
  phone: '', website: '', message: '',
}

export default function DemoModal({ isOpen, onClose, source }: Props) {
  const [values,      setValues]      = useState<FormValues>(EMPTY)
  const [errors,      setErrors]      = useState<FormErrors>({})
  const [touched,     setTouched]     = useState<Partial<Record<keyof FormValues, boolean>>>({})
  const [loading,     setLoading]     = useState(false)
  const [success,     setSuccess]     = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const firstRef = useRef<HTMLInputElement>(null)

  /* Reset on open */
  useEffect(() => {
    if (isOpen) {
      setValues(EMPTY)
      setErrors({})
      setTouched({})
      setLoading(false)
      setSuccess(false)
      setSubmitError(null)
      setTimeout(() => firstRef.current?.focus(), 300)
    }
  }, [isOpen])

  /* Scroll-lock */
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  /* Escape key */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loading, onClose])

  /* Live-validate touched fields */
  useEffect(() => {
    if (Object.keys(touched).length === 0) return
    const errs = validate(values)
    const visibleErrs: FormErrors = {}
    for (const k of Object.keys(touched) as (keyof FormValues)[]) {
      if (errs[k]) visibleErrs[k] = errs[k]
    }
    setErrors(visibleErrs)
  }, [values, touched])

  const set = (field: keyof FormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues(prev => ({ ...prev, [field]: e.target.value }))

  const blur = (field: keyof FormValues) => () =>
    setTouched(prev => ({ ...prev, [field]: true }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    /* Mark all touched and validate */
    const allTouched = Object.fromEntries(
      Object.keys(EMPTY).map(k => [k, true])
    ) as Record<keyof FormValues, boolean>
    setTouched(allTouched)

    const errs = validate(values)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    setLoading(true)
    setSubmitError(null)
    try {
      const input: DemoSubmissionInput = {
        fullName:     values.fullName.trim(),
        businessName: values.businessName.trim(),
        email:        values.email.trim(),
        phone:        values.phone.trim(),
        website:      values.website.trim(),
        message:      values.message.trim(),
        source,
      }
      await saveSubmission(input)
      setSuccess(true)
    } catch (err) {
      console.error('[DemoModal] Submission failed:', err)
      setSubmitError(
        "Something went wrong sending your request. Your details have been saved — we'll follow up shortly, or email us at hello@instantdesk.pl"
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[70]"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            onClick={() => !loading && onClose()}
          />

          {/* Modal panel */}
          <div className="fixed inset-0 z-[71] flex items-center justify-center p-4 sm:p-6 pointer-events-none">
            <motion.div
              key="modal"
              initial={{ opacity: 0, scale: 0.95, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 24 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
              className="relative w-full max-w-xl max-h-[90dvh] overflow-y-auto rounded-2xl pointer-events-auto"
              style={{
                background: 'rgba(7,7,20,0.98)',
                backdropFilter: 'blur(40px)',
                WebkitBackdropFilter: 'blur(40px)',
                border: '1px solid rgba(139,92,246,0.2)',
                boxShadow: [
                  '0 40px 100px rgba(0,0,0,0.8)',
                  '0 0 0 1px rgba(255,255,255,0.03)',
                  'inset 0 1px 0 rgba(255,255,255,0.07)',
                  '0 0 80px rgba(99,102,241,0.06)',
                ].join(','),
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(139,92,246,0.2) transparent',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Top gradient accent */}
              <motion.div
                className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl"
                style={{ background: 'linear-gradient(90deg,#7c3aed,#4f46e5,#2563eb,#4f46e5,#7c3aed)' }}
                animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
              />

              {/* Close button */}
              <button
                onClick={onClose}
                disabled={loading}
                className="absolute top-4 right-4 z-10 w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-all disabled:opacity-30"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="p-7 sm:p-8">
                <AnimatePresence mode="wait">
                  {success ? (
                    <SuccessView key="success" name={values.fullName} onClose={onClose} />
                  ) : (
                    <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

                      {/* Header */}
                      <div className="mb-7">
                        <div
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5"
                          style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#c4b5fd' }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                          Personalised demo · response in 24h
                        </div>
                        <h2 className="text-2xl font-black text-white mb-2 leading-tight">
                          Book Your Personalised Demo
                        </h2>
                        <p className="text-sm text-white/40 leading-relaxed">
                          Tell us about your business and we&apos;ll show you exactly how InstantDesk AI can work for you.
                        </p>
                      </div>

                      {/* Form */}
                      <form onSubmit={handleSubmit} noValidate>
                        <div className="flex flex-col gap-4">

                          {/* Row 1: Full name + Business name */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Full Name" error={errors.fullName}>
                              <div className="relative">
                                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                                <input
                                  ref={firstRef}
                                  type="text"
                                  autoComplete="name"
                                  placeholder="Anna Kowalska"
                                  value={values.fullName}
                                  onChange={set('fullName')}
                                  className={`${INPUT_CLS} pl-10`}
                                  style={inputStyle(!!errors.fullName)}
                                  {...makeHandlers(!!errors.fullName, blur('fullName'))}
                                />
                              </div>
                            </Field>

                            <Field label="Business Name" error={errors.businessName}>
                              <div className="relative">
                                <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                                <input
                                  type="text"
                                  autoComplete="organization"
                                  placeholder="Kowalski & Co."
                                  value={values.businessName}
                                  onChange={set('businessName')}
                                  className={`${INPUT_CLS} pl-10`}
                                  style={inputStyle(!!errors.businessName)}
                                  {...makeHandlers(!!errors.businessName, blur('businessName'))}
                                />
                              </div>
                            </Field>
                          </div>

                          {/* Row 2: Email + Phone */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Email Address" error={errors.email}>
                              <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                                <input
                                  type="email"
                                  autoComplete="email"
                                  placeholder="anna@company.com"
                                  value={values.email}
                                  onChange={set('email')}
                                  className={`${INPUT_CLS} pl-10`}
                                  style={inputStyle(!!errors.email)}
                                  {...makeHandlers(!!errors.email, blur('email'))}
                                />
                              </div>
                            </Field>

                            <Field label="Phone Number" error={errors.phone}>
                              <div className="relative">
                                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                                <input
                                  type="tel"
                                  autoComplete="tel"
                                  placeholder="+48 600 000 000"
                                  value={values.phone}
                                  onChange={set('phone')}
                                  className={`${INPUT_CLS} pl-10`}
                                  style={inputStyle(!!errors.phone)}
                                  {...makeHandlers(!!errors.phone, blur('phone'))}
                                />
                              </div>
                            </Field>
                          </div>

                          {/* Row 3: Website */}
                          <Field label="Website" error={errors.website} optional>
                            <div className="relative">
                              <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                              <input
                                type="url"
                                autoComplete="url"
                                placeholder="https://yourwebsite.com"
                                value={values.website}
                                onChange={set('website')}
                                className={`${INPUT_CLS} pl-10`}
                                style={inputStyle(!!errors.website)}
                                {...makeHandlers(!!errors.website, blur('website'))}
                              />
                            </div>
                          </Field>

                          {/* Row 4: Message */}
                          <Field label="How can we help?" optional>
                            <div className="relative">
                              <MessageSquare className="absolute left-3.5 top-3.5 w-4 h-4 text-white/20 pointer-events-none" />
                              <textarea
                                rows={3}
                                placeholder="Tell us about your business, current challenges, or what you'd like to automate…"
                                value={values.message}
                                onChange={set('message')}
                                className={`${INPUT_CLS} pl-10 resize-none`}
                                style={{ ...BASE_STYLE, lineHeight: '1.6' }}
                                {...makeHandlers(false, blur('message'))}
                              />
                            </div>
                          </Field>

                          {/* Submit */}
                          <motion.button
                            type="submit"
                            disabled={loading}
                            whileHover={{ scale: 1.015 }}
                            whileTap={{ scale: 0.985 }}
                            className="relative w-full py-4 rounded-xl text-sm font-bold text-white overflow-hidden transition-all duration-300 disabled:opacity-70 mt-1"
                            style={{
                              background: 'linear-gradient(135deg,#7c3aed 0%,#4f46e5 50%,#2563eb 100%)',
                              boxShadow: '0 8px 32px rgba(99,102,241,0.35)',
                            }}
                          >
                            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/8 to-transparent -skew-x-12 translate-x-[-200%] hover:translate-x-[200%] transition-transform duration-700 pointer-events-none" />
                            <span className="relative flex items-center justify-center gap-2">
                              {loading ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Sending request…
                                </>
                              ) : (
                                <>
                                  Book My Personalised Demo
                                  <ArrowRight className="w-4 h-4" />
                                </>
                              )}
                            </span>
                          </motion.button>

                          {/* Submit error */}
                          <AnimatePresence>
                            {submitError && (
                              <motion.div
                                initial={{ opacity: 0, y: -6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.25 }}
                                className="flex items-start gap-3 px-4 py-3 rounded-xl text-xs text-red-300 leading-relaxed"
                                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
                              >
                                <span className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-black text-red-400">!</span>
                                {submitError}
                              </motion.div>
                            )}
                          </AnimatePresence>

                        </div>
                      </form>

                      {/* Trust indicators */}
                      <div className="flex items-center justify-center gap-5 mt-5 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        {[
                          { icon: Shield, text: 'Data never shared' },
                          { icon: Clock, text: 'Reply within 24h' },
                          { icon: CheckCircle, text: 'No commitment' },
                        ].map(({ icon: Icon, text }) => (
                          <span key={text} className="flex items-center gap-1.5 text-[10px] text-white/22">
                            <Icon className="w-3 h-3 text-violet-500/60" />
                            {text}
                          </span>
                        ))}
                      </div>

                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
