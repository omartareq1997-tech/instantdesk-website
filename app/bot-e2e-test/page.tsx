'use client'

import { useState } from 'react'
import { Header, Footer } from '../components/PremiumHome'

const scenarios = [
  ['normal_faq', 'Normal FAQ'],
  ['availability', 'Car availability request'],
  ['booking_confirmation', 'Booking confirmation'],
  ['extension', 'Extension request'],
  ['document_ocr', 'Document upload/OCR'],
  ['location', '"Where is my car?"'],
  ['location_unresolved', 'Unresolved location'],
  ['handover', 'Human handover trigger'],
] as const

export default function BotE2ETestPage() {
  const [scenario, setScenario] = useState<(typeof scenarios)[number][0]>('availability')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)

  async function run() {
    setLoading(true)
    try {
      const res = await fetch('/api/rental/bot-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario, message: message.trim() || undefined }),
      })
      setResult(await res.json())
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <Header />
      <section className="px-4 pb-20 pt-32 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-[1320px]">
          <p className="font-mono text-sm font-black uppercase tracking-[0.18em] text-[#f8a36d]">Internal QA</p>
          <h1 className="mt-5 font-serif text-5xl leading-none tracking-[-0.035em] sm:text-7xl">Bot End-to-End Test</h1>
          <p className="mt-6 max-w-3xl text-lg font-semibold leading-8 text-white/58">
            Test normal FAQ, rental availability, booking confirmation, extension, documents, pickup guidance, and human handover with deterministic debug output.
          </p>

          <div className="mt-12 grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-white/40">Scenario</p>
              <div className="mt-4 grid gap-2">
                {scenarios.map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setScenario(id)}
                    className="rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors"
                    style={{
                      borderColor: scenario === id ? 'rgba(248,163,109,0.45)' : 'rgba(255,255,255,0.08)',
                      background: scenario === id ? 'rgba(248,163,109,0.12)' : 'rgba(255,255,255,0.025)',
                      color: scenario === id ? '#f8a36d' : 'rgba(255,255,255,0.62)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <textarea
                value={message}
                onChange={event => setMessage(event.target.value)}
                placeholder="Optional custom customer message"
                rows={4}
                className="mt-5 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/24 focus:border-[#f8a36d]/50"
              />
              <button
                onClick={() => void run()}
                disabled={loading}
                className="mt-4 rounded-full bg-white px-6 py-3 text-sm font-black text-black transition-colors hover:bg-[#f5f0ea] disabled:opacity-50"
              >
                {loading ? 'Running...' : 'Run test'}
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-white/40">Debug output</p>
              {!result ? (
                <p className="mt-8 text-sm font-semibold text-white/36">Run a scenario to see final system prompt, extracted intent, fields, tool calls, availability result, fallback path, and handover status.</p>
              ) : (
                <div className="mt-5 grid gap-4">
                  {[
                    ['extracted intent', result.extractedIntent],
                    ['tool calls made', result.toolCallsMade],
                    ['selected fallback path', result.selectedFallbackPath],
                    ['handover status', result.handoverStatus],
                    ['extracted booking fields', result.extractedBookingFields],
                    ['availability result', result.availabilityResult],
                    ['reply', result.reply],
                    ['final system prompt', result.finalSystemPrompt],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-xl border border-white/8 bg-black/30 p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#f8a36d]">{String(label)}</p>
                      <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap text-xs leading-6 text-white/68">{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  )
}
