import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../../../lib/getSessionBusinessId'

export const dynamic = 'force-dynamic'

function pdfEscape(value: string) {
  return value.replace(/[()\\]/g, '\\$&')
}

function simplePdf(lines: string[]) {
  const content = [
    'BT',
    '/F1 14 Tf',
    '50 790 Td',
    ...lines.flatMap((line, index) => [
      index === 0 ? '' : '0 -22 Td',
      `(${pdfEscape(line)}) Tj`,
    ]),
    'ET',
  ].filter(Boolean).join('\n')
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const obj of objects) {
    offsets.push(pdf.length)
    pdf += `${obj}\n`
  }
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf)
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { businessId } = await getSessionBusinessId()
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('bookings')
    .select('booking_number,pickup_at,return_at,total_price,deposit,payment_status,cars(name,car_classes(name)),rental_customers(name,phone,email),pickup:rental_locations!bookings_pickup_location_id_fkey(name,address),dropoff:rental_locations!bookings_dropoff_location_id_fkey(name,address)')
    .eq('business_id', businessId)
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  const row: any = data
  const pdf = simplePdf([
    'InstantDesk Rental Booking Confirmation',
    `Booking number: ${row.booking_number}`,
    `Customer: ${row.rental_customers?.name ?? 'Customer'}`,
    `Phone: ${row.rental_customers?.phone ?? '-'}`,
    `Email: ${row.rental_customers?.email ?? '-'}`,
    `Car: ${row.cars?.name ?? 'Class booking'} (${row.cars?.car_classes?.name ?? 'Class pending'})`,
    `Pickup: ${row.pickup_at} · ${row.pickup?.name ?? '-'}`,
    `Dropoff: ${row.return_at} · ${row.dropoff?.name ?? '-'}`,
    `Total: ${row.total_price ?? 0}`,
    `Deposit: ${row.deposit ?? 0}`,
    `Payment status: ${row.payment_status ?? 'unpaid'}`,
    'Terms summary: Driver must present valid documents and follow rental company terms.',
    'Contact: contact@instantdesk.pl',
  ])

  return new NextResponse(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="booking-${row.booking_number}.pdf"`,
    },
  })
}
