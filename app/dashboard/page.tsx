import ClientDashboard from './ClientDashboard'
import { getDashboardData } from './db'

// Force dynamic rendering so every visit gets fresh data from Supabase.
// Remove this once ISR or SWR-style revalidation is wired up.
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  // getDashboardData() always resolves — individual queries fall back to
  // mock data on error, so the page never crashes even without Supabase.
  const initialData = await getDashboardData()

  return <ClientDashboard initialData={initialData} />
}
