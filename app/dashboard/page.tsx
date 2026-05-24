import { cookies } from 'next/headers'
import ClientDashboard from './ClientDashboard'
import { getDashboardData } from './db'
import { MEMBER_COOKIE_NAME, verifyMemberToken, type MemberPayload } from '../lib/auth'

// Force dynamic rendering so every visit gets fresh data from Supabase.
// Remove this once ISR or SWR-style revalidation is wired up.
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  // getDashboardData() always resolves — individual queries fall back to
  // mock data on error, so the page never crashes even without Supabase.
  const [initialData, cookieStore] = await Promise.all([
    getDashboardData(),
    cookies(),
  ])

  const rawToken   = cookieStore.get(MEMBER_COOKIE_NAME)?.value
  const initialUser: MemberPayload | null = rawToken
    ? await verifyMemberToken(rawToken)
    : null

  return <ClientDashboard initialData={initialData} initialUser={initialUser} />
}
