import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../../../lib/getSessionBusinessId'
import { normalizeRentalBooking } from '../../../../../lib/rentalAvailability'

export const dynamic = 'force-dynamic'

function isMissingTable(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && ['42P01', 'PGRST205'].includes(String((error as { code?: string }).code))
}

export async function GET(_request: Request, { params }: { params: Promise<{ carId: string }> }) {
  const { carId } = await params
  const { businessId } = await getSessionBusinessId()
  const sb = createAdminClient()

  const carRes = await sb
    .from('cars')
    .select('id,name,model,status,license_plate,active,car_classes(name)')
    .eq('business_id', businessId)
    .eq('id', carId)
    .maybeSingle()

  if (carRes.error) return NextResponse.json({ error: carRes.error.message }, { status: isMissingTable(carRes.error) ? 503 : 500 })
  if (!carRes.data) return NextResponse.json({ error: 'Car not found' }, { status: 404 })

  const settingsRes = await sb.from('rental_settings').select('cleaning_buffer_minutes').eq('business_id', businessId).maybeSingle()
  if (settingsRes.error) return NextResponse.json({ error: settingsRes.error.message }, { status: isMissingTable(settingsRes.error) ? 503 : 500 })
  const bufferMinutes = Number(settingsRes.data?.cleaning_buffer_minutes ?? 120)

  const bookingsRes = await sb
    .from('rental_bookings')
    .select('id,business_id,car_id,customer_name,customer_phone,customer_email,pickup_location_id,dropoff_location_id,pickup_at,dropoff_at,status,total_price,notes,created_at,updated_at,cars(name,car_classes(name)),pickup:rental_locations!rental_bookings_pickup_location_id_fkey(name),dropoff:rental_locations!rental_bookings_dropoff_location_id_fkey(name)')
    .eq('business_id', businessId)
    .eq('car_id', carId)
    .order('pickup_at', { ascending: true })

  if (bookingsRes.error) return NextResponse.json({ error: bookingsRes.error.message }, { status: isMissingTable(bookingsRes.error) ? 503 : 500 })

  return NextResponse.json({
    car: {
      id: carRes.data.id,
      name: carRes.data.name,
      model: carRes.data.model,
      status: carRes.data.status,
      licensePlate: carRes.data.license_plate,
      active: carRes.data.active,
      className: (carRes.data.car_classes as { name?: string } | null)?.name ?? null,
    },
    bufferMinutes,
    bookings: (bookingsRes.data ?? []).map((row: any) => normalizeRentalBooking(row, bufferMinutes)),
  })
}
