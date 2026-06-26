import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'

export const dynamic = 'force-dynamic'

function isMissingTable(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '42P01'
}

export async function POST(request: Request) {
  const { businessId } = await getSessionBusinessId()
  const body = await request.json().catch(() => ({}))
  const sb = createAdminClient()

  const bookingNumber = `CR-${Date.now().toString().slice(-6)}`
  const customerName = String(body.customerName ?? '').trim()
  if (!customerName || !body.pickupAt || !body.returnAt) {
    return NextResponse.json({ error: 'customerName, pickupAt, and returnAt are required' }, { status: 400 })
  }

  const customerRes = await sb.from('rental_customers').insert({
    business_id: businessId,
    name: customerName,
    phone: body.customerPhone ?? null,
    email: body.customerEmail ?? null,
  }).select('id').single()

  if (customerRes.error) {
    return NextResponse.json({ error: customerRes.error.message }, { status: isMissingTable(customerRes.error) ? 503 : 500 })
  }

  const bookingRes = await sb.from('bookings').insert({
    business_id: businessId,
    booking_number: bookingNumber,
    customer_id: customerRes.data.id,
    car_id: body.carId ?? null,
    pickup_at: body.pickupAt,
    return_at: body.returnAt,
    status: body.status ?? 'pending',
    extras: body.extras ?? [],
    daily_price: Number(body.dailyPrice) || 0,
    deposit: Number(body.deposit) || 0,
    total_price: Number(body.totalPrice) || 0,
    payment_status: body.paymentStatus ?? 'unpaid',
    source: body.source ?? 'instantdesk_dashboard',
    notes: body.notes ?? null,
  }).select('id,booking_number').single()

  if (bookingRes.error) return NextResponse.json({ error: bookingRes.error.message }, { status: 500 })

  await sb.from('booking_logs').insert({
    business_id: businessId,
    booking_id: bookingRes.data.id,
    event_type: 'booking_created',
    description: 'Booking created from InstantDesk rental workflow.',
    actor: 'InstantDesk',
    new_value: body,
  })

  return NextResponse.json({
    ok: true,
    bookingId: bookingRes.data.id,
    bookingNumber: bookingRes.data.booking_number,
    confirmationUrl: `/api/rental/bookings/${bookingRes.data.id}/confirmation`,
    whatsappMessage: `Booking ${bookingRes.data.booking_number} is reserved. Pickup: ${body.pickupAt}. Reply here if you need help finding the car.`,
  })
}
