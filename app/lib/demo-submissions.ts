/* ─────────────────────────────────────────────────────────────
   Demo submission data layer
   Currently backed by localStorage.
   To migrate to Supabase, replace the two localStorage functions
   below with the Supabase equivalents shown in the comments.
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
  source: string        // e.g. 'landing_hero' | 'landing_cta' | 'navbar'
  status: 'new' | 'contacted' | 'converted' | 'closed'
}

export type DemoSubmissionInput = Omit<DemoSubmission, 'id' | 'submittedAt' | 'status'>

const STORAGE_KEY = 'instantdesk_demo_submissions'

/* ── Save ─────────────────────────────────────────────────── */

export async function saveSubmission(input: DemoSubmissionInput): Promise<DemoSubmission> {
  const submission: DemoSubmission = {
    ...input,
    id: crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
    status: 'new',
  }

  // localStorage (current)
  if (typeof window !== 'undefined') {
    const existing = readFromStorage()
    writeToStorage([...existing, submission])
  }

  // ── Future Supabase integration ──────────────────────────
  // import { createClient } from '@supabase/supabase-js'
  // const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  // const { error } = await supabase.from('demo_submissions').insert(submission)
  // if (error) throw error
  // ────────────────────────────────────────────────────────

  return submission
}

/* ── Read all ─────────────────────────────────────────────── */

export function getSubmissions(): DemoSubmission[] {
  if (typeof window === 'undefined') return []

  // localStorage (current)
  return readFromStorage()

  // ── Future Supabase integration ──────────────────────────
  // const { data, error } = await supabase.from('demo_submissions').select('*').order('submitted_at', { ascending: false })
  // if (error) throw error
  // return data ?? []
  // ────────────────────────────────────────────────────────
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(submissions))
}
