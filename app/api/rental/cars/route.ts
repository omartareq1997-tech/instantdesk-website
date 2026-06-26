import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'
import { demoRentalCars } from '../../../lib/rental'

export const dynamic = 'force-dynamic'

function isMissingTable(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '42P01'
}

function clean(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function statusToDb(status?: string) {
  const normalized = String(status ?? 'available').toLowerCase().replace(/\s+/g, '_')
  if (normalized === 'reserved') return 'pending'
  if (normalized === 'rented') return 'picked_up'
  if (normalized === 'cleaning') return 'maintenance'
  if (normalized === 'out_of_service') return 'inactive'
  if (['available', 'pending', 'confirmed', 'paid', 'picked_up', 'returned', 'extended', 'cancelled', 'maintenance', 'inactive'].includes(normalized)) return normalized
  return 'available'
}

function transmissionToDb(value?: string | null) {
  return String(value ?? '').toLowerCase().includes('manual') ? 'manual' : 'automatic'
}

async function ensureClass(sb: ReturnType<typeof createAdminClient>, businessId: string, name: string) {
  const label = name.trim() || 'Economy'
  const existing = await sb.from('car_classes').select('id').eq('business_id', businessId).ilike('name', label).limit(1).maybeSingle()
  if (existing.data?.id) return existing.data.id as string
  const inserted = await sb.from('car_classes').insert({ business_id: businessId, name: label }).select('id').single()
  if (inserted.error) throw inserted.error
  return inserted.data.id as string
}

async function locationIdForName(sb: ReturnType<typeof createAdminClient>, businessId: string, value: unknown) {
  const name = clean(value)
  if (!name) return null
  const row = await sb.from('rental_locations').select('id').eq('business_id', businessId).ilike('name', name).limit(1).maybeSingle()
  return row.data?.id ?? null
}

async function upsertCar(request: Request, id?: string) {
  const { businessId } = await getSessionBusinessId()
  const body = await request.json().catch(() => ({}))
  const sb = createAdminClient()
  try {
    const classId = await ensureClass(sb, businessId, clean(body.className ?? body.class_name) ?? 'Economy')
    const locationId = clean(body.locationId) ?? await locationIdForName(sb, businessId, body.locationName ?? body.location)
    const generatedName = [clean(body.make), clean(body.model)].filter(Boolean).join(' ')
    const payload = {
      business_id: businessId,
      car_class_id: classId,
      location_id: locationId,
      name: clean(body.name ?? body.car_name) ?? (generatedName || 'Rental car'),
      model: clean(body.model),
      transmission: transmissionToDb(body.transmission),
      seats: Number(body.seats) || null,
      fuel_type: clean(body.fuelType ?? body.fuel_type),
      daily_price: Number(body.dailyPrice ?? body.daily_price) || 0,
      deposit: Number(body.deposit) || 0,
      status: statusToDb(body.status),
      image_url: clean(body.imageUrl ?? body.image_url),
      license_plate: clean(body.licensePlate ?? body.license_plate),
      notes: clean(body.notes ?? (clean(body.make) ? `Make: ${clean(body.make)}` : null)),
      active: body.active === undefined ? statusToDb(body.status) !== 'inactive' : Boolean(body.active),
      updated_at: new Date().toISOString(),
    }
    const result = id
      ? await sb.from('cars').update(payload).eq('business_id', businessId).eq('id', id).select('id').single()
      : await sb.from('cars').insert(payload).select('id').single()
    if (result.error) throw result.error
    return NextResponse.json({ ok: true, id: result.data.id })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Car save failed' }, { status: isMissingTable(error) ? 503 : 500 })
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  const action = url.searchParams.get('action')
  if (action === 'demo') {
    const { businessId } = await getSessionBusinessId()
    const sb = createAdminClient()
    try {
      let inserted = 0
      for (const car of demoRentalCars) {
        const classId = await ensureClass(sb, businessId, car.className)
        const result = await sb.from('cars').insert({
          business_id: businessId,
          car_class_id: classId,
          name: car.name,
          model: car.model,
          transmission: transmissionToDb(car.transmission),
          seats: car.seats,
          fuel_type: car.fuelType,
          daily_price: car.dailyPrice,
          deposit: car.deposit,
          status: statusToDb(car.status),
          license_plate: car.licensePlate,
          notes: car.notes,
          active: car.active,
        })
        if (result.error) throw result.error
        inserted++
      }
      return NextResponse.json({ ok: true, importedCars: inserted })
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Demo fleet import failed' }, { status: isMissingTable(error) ? 503 : 500 })
    }
  }
  return upsertCar(request)
}

export async function PUT(request: Request) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  return upsertCar(request, id)
}

export async function DELETE(request: Request) {
  const { businessId } = await getSessionBusinessId()
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const sb = createAdminClient()
  const { error } = await sb.from('cars').delete().eq('business_id', businessId).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: isMissingTable(error) ? 503 : 500 })
  return NextResponse.json({ ok: true })
}
