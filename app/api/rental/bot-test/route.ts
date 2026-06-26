import { NextResponse } from 'next/server'
import { runRentalBotTest, type RentalTestScenario } from '../../../lib/rentalBotTest'

const scenarios = new Set<RentalTestScenario>([
  'normal_faq',
  'availability',
  'booking_confirmation',
  'extension',
  'document_ocr',
  'location',
  'location_unresolved',
  'handover',
])

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { scenario?: string; message?: string }
  const scenario = scenarios.has(body.scenario as RentalTestScenario)
    ? body.scenario as RentalTestScenario
    : 'availability'

  return NextResponse.json(runRentalBotTest(scenario, body.message))
}
