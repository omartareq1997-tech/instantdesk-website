import { NextResponse } from 'next/server'
import { getSessionBusinessId } from '../../../../lib/getSessionBusinessId'
import { checkRentalAvailability } from '../../../../lib/rentalAvailability'

export const dynamic = 'force-dynamic'
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

function isMissingTable(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && ['42P01', 'PGRST205'].includes(String((error as { code?: string }).code))
}

export async function POST(request: Request) {
  const { businessId } = await getSessionBusinessId()
  const body = await request.json().catch(() => ({})) as {
    car_id?: string
    carId?: string
    car_class?: string
    carClass?: string
    pickup_at?: string
    pickupAt?: string
    pickupDateTime?: string
    dropoff_at?: string
    dropoffAt?: string
    returnAt?: string
    returnDateTime?: string
    pickup_location_id?: string
    pickupLocationId?: string
    dropoff_location_id?: string
    dropoffLocationId?: string
  }

  try {
    const result = await checkRentalAvailability({
      businessId,
      carId: body.car_id ?? body.carId ?? null,
      carClass: body.car_class ?? body.carClass ?? null,
      pickupAt: body.pickup_at ?? body.pickupAt ?? body.pickupDateTime ?? '',
      dropoffAt: body.dropoff_at ?? body.dropoffAt ?? body.returnAt ?? body.returnDateTime ?? '',
      pickupLocationId: body.pickup_location_id ?? body.pickupLocationId ?? null,
      dropoffLocationId: body.dropoff_location_id ?? body.dropoffLocationId ?? null,
    })
    return NextResponse.json({
      available: result.available,
      available_cars: result.availableCars,
      availableCars: result.availableCars,
      conflicts: result.conflicts,
      bufferMinutes: result.bufferMinutes,
      message: result.message,
    }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Availability check failed',
    }, { status: isMissingTable(error) ? 503 : 400, headers: NO_STORE_HEADERS })
  }
}
