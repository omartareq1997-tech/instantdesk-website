import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'
import { checkRentalAvailability, normalizeRentalBooking } from '../../../lib/rentalAvailability'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = new Set(['pending', 'confirmed', 'active', 'completed', 'cancelled'])

function isMissingTable(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && ['42P01', 'PGRST205'].includes(String((error as { code?: string }).code))
}

function clean(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function statusValue(value: unknown) {
  const status = String(value ?? 'pending').toLowerCase()
  return VALID_STATUSES.has(status) ? status : 'pending'
}

function bookingInput(body: any) {
  return {
    carId: clean(body.car_id ?? body.carId),
    customerName: clean(body.customer_name ?? body.customerName),
    customerPhone: clean(body.customer_phone ?? body.customerPhone ?? body.phone),
    customerEmail: clean(body.customer_email ?? body.customerEmail ?? body.email),
    pickupLocationId: clean(body.pickup_location_id ?? body.pickupLocationId),
    dropoffLocationId: clean(body.dropoff_location_id ?? body.dropoffLocationId),
    pickupAt: clean(body.pickup_at ?? body.pickupAt ?? body.pickupDateTime),
    dropoffAt: clean(body.dropoff_at ?? body.dropoffAt ?? body.returnAt ?? body.returnDateTime),
    status: statusValue(body.status),
    totalPrice: Number(body.total_price ?? body.totalPrice) || 0,
    notes: clean(body.notes),
  }
}

export async function GET(request: Request) {
  const { businessId } = await getSessionBusinessId()
  const url = new URL(request.url)
  const status = url.searchParams.get('status')
  const carId = url.searchParams.get('car_id') ?? url.searchParams.get('carId')
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const sb = createAdminClient()

  const settingsRes = await sb.from('rental_settings').select('cleaning_buffer_minutes').eq('business_id', businessId).maybeSingle()
  const bufferMinutes = Number(settingsRes.data?.cleaning_buffer_minutes ?? 120)

  let query = sb
    .from('rental_bookings')
    .select('id,business_id,car_id,customer_name,customer_phone,customer_email,pickup_location_id,dropoff_location_id,pickup_at,dropoff_at,status,total_price,notes,created_at,updated_at,cars(name,car_classes(name)),pickup:rental_locations!rental_bookings_pickup_location_id_fkey(name),dropoff:rental_locations!rental_bookings_dropoff_location_id_fkey(name)')
    .eq('business_id', businessId)
    .order('pickup_at', { ascending: true })

  if (status) query = query.eq('status', status)
  if (carId) query = query.eq('car_id', carId)
  if (from) query = query.gte('dropoff_at', from)
  if (to) query = query.lte('pickup_at', to)

  const result = await query
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: isMissingTable(result.error) ? 503 : 500 })
  return NextResponse.json({
    bookings: (result.data ?? []).map((row: any) => normalizeRentalBooking(row, bufferMinutes)),
    bufferMinutes,
  })
}

export async function POST(request: Request) {
  const { businessId } = await getSessionBusinessId()
  const body = await request.json().catch(() => ({}))
  const input = bookingInput(body)

  if (!input.carId || !input.customerName || !input.pickupAt || !input.dropoffAt) {
    return NextResponse.json({ error: 'car_id, customer_name, pickup_at, and dropoff_at are required' }, { status: 400 })
  }

  try {
    const availability = await checkRentalAvailability({
      businessId,
      carId: input.carId,
      pickupAt: input.pickupAt,
      dropoffAt: input.dropoffAt,
      pickupLocationId: input.pickupLocationId,
      dropoffLocationId: input.dropoffLocationId,
    })
    if (!availability.available) {
      return NextResponse.json({
        success: false,
        error: 'Car is not available for the requested pickup/drop-off window.',
        available: false,
        available_cars: availability.availableCars,
        conflicts: availability.conflicts,
      }, { status: 409 })
    }

    const sb = createAdminClient()
    const result = await sb.from('rental_bookings').insert({
      business_id: businessId,
      car_id: input.carId,
      customer_name: input.customerName,
      customer_phone: input.customerPhone,
      customer_email: input.customerEmail,
      pickup_location_id: input.pickupLocationId,
      dropoff_location_id: input.dropoffLocationId,
      pickup_at: input.pickupAt,
      dropoff_at: input.dropoffAt,
      status: input.status,
      total_price: input.totalPrice,
      notes: input.notes,
      updated_at: new Date().toISOString(),
    }).select('id').single()

    if (result.error) throw result.error
    const bookingNumber = `RB-${String(result.data.id).slice(0, 8).toUpperCase()}`
    return NextResponse.json({
      success: true,
      ok: true,
      bookingId: result.data.id,
      bookingNumber,
      confirmationUrl: '',
      whatsappMessage: `Booking ${bookingNumber} is ${input.status}. Pickup: ${input.pickupAt}. Drop-off: ${input.dropoffAt}.`,
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Booking creation failed',
    }, { status: isMissingTable(error) ? 503 : 400 })
  }
}

export async function PATCH(request: Request) {
  const { businessId } = await getSessionBusinessId()
  const body = await request.json().catch(() => ({}))
  const id = clean(body.id)
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const status = statusValue(body.status)
  const sb = createAdminClient()
  const result = await sb
    .from('rental_bookings')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('business_id', businessId)
    .eq('id', id)
    .select('id,status')
    .single()
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: isMissingTable(result.error) ? 503 : 500 })
  return NextResponse.json({ success: true, booking: result.data })
}
