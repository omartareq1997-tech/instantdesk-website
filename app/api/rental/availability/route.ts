import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'
import { checkRentalAvailability, demoRentalBookings, demoRentalCars, type AvailabilityRequest, type RentalBooking, type RentalCar } from '../../../lib/rental'

export const dynamic = 'force-dynamic'

function isMissingTable(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '42P01'
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as AvailabilityRequest
  if (!payload.pickupDateTime || !payload.returnDateTime) {
    return NextResponse.json({ error: 'pickupDateTime and returnDateTime are required' }, { status: 400 })
  }

  const { businessId } = await getSessionBusinessId()
  const sb = createAdminClient()

  const [settingsRes, carsRes, bookingsRes] = await Promise.all([
    sb.from('rental_settings').select('cleaning_buffer_minutes,external_sync_enabled,provider_name,last_sync_status,last_sync_error').eq('business_id', businessId).maybeSingle(),
    sb.from('cars').select('id,name,model,transmission,seats,fuel_type,daily_price,deposit,status,image_url,license_plate,notes,active,car_classes(name),rental_locations(name)').eq('business_id', businessId).eq('active', true),
    sb.from('bookings').select('id,booking_number,car_id,pickup_at,return_at,status,total_price,deposit,payment_status,source,cars(name,car_classes(name)),rental_customers(name,phone,email),pickup:rental_locations!bookings_pickup_location_id_fkey(name),dropoff:rental_locations!bookings_dropoff_location_id_fkey(name)').eq('business_id', businessId),
  ])

  if ([settingsRes.error, carsRes.error, bookingsRes.error].some(Boolean)) {
    const tableMissing = [settingsRes.error, carsRes.error, bookingsRes.error].some(isMissingTable)
    if (!tableMissing) return NextResponse.json({ error: 'Availability check failed' }, { status: 500 })
    const matches = checkRentalAvailability(payload, demoRentalCars, demoRentalBookings, 120)
    return NextResponse.json({ migrationRequired: true, bufferMinutes: 120, matches, consideredExternalCalendar: false })
  }

  const bufferMinutes = settingsRes.data?.cleaning_buffer_minutes ?? 120
  const cars: RentalCar[] = (carsRes.data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    model: row.model,
    className: row.car_classes?.name ?? 'Unclassified',
    transmission: row.transmission,
    seats: row.seats,
    fuelType: row.fuel_type,
    dailyPrice: Number(row.daily_price ?? 0),
    deposit: Number(row.deposit ?? 0),
    status: row.status,
    locationName: row.rental_locations?.name ?? null,
    imageUrl: row.image_url,
    licensePlate: row.license_plate,
    notes: row.notes,
    active: row.active,
  }))
  const bookings: RentalBooking[] = (bookingsRes.data ?? []).map((row: any) => ({
    id: row.id,
    bookingNumber: row.booking_number,
    carId: row.car_id,
    carName: row.cars?.name ?? null,
    carClass: row.cars?.car_classes?.name ?? null,
    customerName: row.rental_customers?.name ?? 'Customer',
    customerPhone: row.rental_customers?.phone ?? null,
    customerEmail: row.rental_customers?.email ?? null,
    pickupAt: row.pickup_at,
    returnAt: row.return_at,
    pickupLocation: row.pickup?.name ?? null,
    dropoffLocation: row.dropoff?.name ?? null,
    status: row.status,
    totalPrice: Number(row.total_price ?? 0),
    deposit: Number(row.deposit ?? 0),
    paymentStatus: row.payment_status,
    source: row.source,
  }))

  const matches = checkRentalAvailability(payload, cars, bookings, bufferMinutes)
  return NextResponse.json({
    migrationRequired: false,
    bufferMinutes,
    matches,
    consideredExternalCalendar: Boolean(settingsRes.data?.external_sync_enabled),
    externalCalendarStatus: settingsRes.data?.last_sync_status ?? null,
    externalCalendarError: settingsRes.data?.last_sync_error ?? null,
    handoverRecommended: matches.length === 0,
  })
}
