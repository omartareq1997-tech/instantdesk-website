/* ─────────────────────────────────────────────────────────────
   Demo submission data layer

   Primary path  → POST /api/demo-lead → Make.com webhook
   Fallback path → localStorage (only when the API call fails)

   To add Supabase persistence later, extend the API route
   (app/api/demo-lead/route.ts) — no changes needed here.
   ──────────────────────────────────────────────────────────── */

export type DemoSubmission = {
  id: string
  fullName: string
  businessName: string
  email: string
  phone: string
  website: string
  message: string
  submittedAt: string   // ISO-8601
  source: string
  status: 'new' | 'contacted' | 'converted' | 'closed'
}

export type DemoSubmissionInput = Omit<DemoSubmission, 'id' | 'submittedAt' | 'status'>

const STORAGE_KEY = 'instantdesk_demo_submissions_fallback'

/* ── Save ─────────────────────────────────────────────────── */

export async function saveSubmission(input: DemoSubmissionInput): Promise<DemoSubmission> {
  const submission: DemoSubmission = {
    ...input,
    id:          crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
    status:      'new',
  }

  /* Collect browser context to send with the payload */
  const pageUrl  = typeof window    !== 'undefined' ? window.location.href  : ''

  try {
    const res = await fetch('/api/demo-lead', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName:     input.fullName,
        businessName: input.businessName,
        email:        input.email,
        phone:        input.phone,
        website:      input.website,
        message:      input.message,
        pageUrl,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? `API error ${res.status}`)
    }

    /* Webhook delivered — no localStorage needed */
    return submission
  } catch (err) {
    /* ── Fallback: localStorage so the lead is never lost ── */
    console.warn('[demo-submissions] API failed — saving to localStorage fallback:', err)
    if (typeof window !== 'undefined') {
      writeToStorage([...readFromStorage(), submission])
    }
    /* Re-throw so the caller can decide how to surface the error */
    throw err
  }
}

/* ── Read fallback leads ──────────────────────────────────── */

export function getFallbackSubmissions(): DemoSubmission[] {
  if (typeof window === 'undefined') return []
  return readFromStorage()
}

/* ── Internal helpers ─────────────────────────────────────── */

function readFromStorage(): DemoSubmission[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as DemoSubmission[]
  } catch {
    return []
  }
}

function writeToStorage(submissions: DemoSubmission[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(submissions))
  } catch (err) {
    console.error('[demo-submissions] localStorage write failed:', err)
  }
}
