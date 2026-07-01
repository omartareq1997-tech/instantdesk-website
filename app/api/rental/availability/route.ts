import { POST as checkAvailability } from './check/route'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return checkAvailability(request)
}
