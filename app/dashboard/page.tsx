import { cookies } from 'next/headers'
import ClientDashboard from './ClientDashboard'
import { getDashboardData } from './db'
import { MEMBER_COOKIE_NAME, verifyMemberToken, type MemberPayload } from '../lib/auth'
import { getSessionBusinessId } from '../lib/getSessionBusinessId'

// Force dynamic rendering so every visit gets fresh data from Supabase.
// Remove this once ISR or SWR-style revalidation is wired up.
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [sessionIds, cookieStore] = await Promise.all([
    getSessionBusinessId(),
    cookies(),
  ])

  const [initialData] = await Promise.all([
    getDashboardData(sessionIds.clientId),
  ])

  // Prefer member_session (team member login) over Supabase Auth for currentUser
  const rawToken    = cookieStore.get(MEMBER_COOKIE_NAME)?.value
  const initialUser: MemberPayload | null = rawToken
    ? await verifyMemberToken(rawToken)
    : null

  // When logged in via Supabase Auth (no member_session), synthesise a user object
  // from the session so ClientDashboard knows the real owner name instead of the demo default.
  const supabaseUser = (!initialUser && sessionIds.fromSession)
    ? { id: 'owner', name: sessionIds.ownerName, role: 'owner' }
    : null

  return (
    <ClientDashboard
      initialData={initialData}
      initialUser={initialUser}
      businessId={sessionIds.businessId}
      supabaseUser={supabaseUser}
      businessName={sessionIds.businessName}
    />
  )
}
