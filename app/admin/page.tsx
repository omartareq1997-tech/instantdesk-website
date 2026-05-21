import { createAdminClient } from '../lib/supabase-server'
import AdminDashboard, { type Lead, type Status } from './AdminDashboard'

/* ─── DB row shape ───────────────────────────────────────────
   Supabase returns snake_case column names.
   Map to the camelCase Lead type used by the UI.
   ────────────────────────────────────────────────────────── */

type LeadRow = {
  id: string
  full_name: string | null
  business_name: string | null
  email: string | null
  phone: string | null
  website: string | null
  message: string | null
  source: string | null
  created_at: string
  status: string | null
}

const VALID_STATUSES: Status[] = ['new', 'contacted', 'demo_booked', 'won', 'lost']

function mapRow(row: LeadRow): Lead {
  return {
    id:           row.id,
    fullName:     row.full_name     ?? '',
    businessName: row.business_name ?? '',
    email:        row.email         ?? '',
    phone:        row.phone         ?? '',
    website:      row.website       ?? '',
    message:      row.message       ?? '',
    source:       row.source        ?? 'general',
    submittedAt:  row.created_at,
    status:       VALID_STATUSES.includes(row.status as Status)
                    ? (row.status as Status)
                    : 'new',
  }
}

/* ─── Page ───────────────────────────────────────────────────
   Server Component — runs on every request, never ships to
   the browser. The AdminDashboard Client Component receives
   the already-fetched leads as a serialisable prop.
   ────────────────────────────────────────────────────────── */

export const dynamic = 'force-dynamic'   // always fetch fresh data

export default async function AdminPage() {
  let leads: Lead[]     = []
  let fetchError: string | undefined

  try {
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      fetchError = error.message
    } else {
      leads = (data as LeadRow[]).map(mapRow)
    }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'Unknown error'
  }

  return <AdminDashboard initialLeads={leads} fetchError={fetchError} />
}
