import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'
import { demoRentalCars, demoRentalLocations, demoRentalSettings } from '../../../lib/rental'

export const dynamic = 'force-dynamic'

type FleetPayload = {
  car_name?: string
  make?: string
  model?: string
  class_name?: string
  transmission?: string
  seats?: number | string
  fuel_type?: string
  daily_price?: number | string
  deposit?: number | string
  license_plate?: string
  location?: string
  status?: string
}

type LocationPayload = {
  locationType?: 'pickup' | 'dropoff' | 'both'
  name?: string
  address?: string
  googleMapsLink?: string
  latitude?: number | string | null
  longitude?: number | string | null
  terminalInstructions?: string
  pickupInstructionText?: string
  dropoffInstructionText?: string
  active?: boolean
}

function isMissingTable(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '42P01'
}

function isMissingColumn(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '42703'
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

function transmissionToDb(value?: string) {
  const normalized = String(value ?? '').toLowerCase()
  if (normalized.includes('manual')) return 'manual'
  return 'automatic'
}

function numberOrNull(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function clean(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function ensureClass(sb: ReturnType<typeof createAdminClient>, businessId: string, name: string) {
  const label = name.trim() || 'Economy'
  const existing = await sb.from('car_classes').select('id').eq('business_id', businessId).ilike('name', label).limit(1).maybeSingle()
  if (existing.data?.id) return existing.data.id as string
  const inserted = await sb.from('car_classes').insert({ business_id: businessId, name: label }).select('id').single()
  if (inserted.error) throw inserted.error
  return inserted.data.id as string
}

async function insertLocations(
  sb: ReturnType<typeof createAdminClient>,
  businessId: string,
  locations: LocationPayload[],
) {
  if (!locations.length) return [] as { id: string; name: string }[]
  const extendedRows = locations.map(location => ({
    business_id: businessId,
    location_type: location.locationType ?? 'both',
    name: clean(location.name) ?? 'Rental location',
    address: clean(location.address),
    google_maps_link: clean(location.googleMapsLink),
    latitude: numberOrNull(location.latitude),
    longitude: numberOrNull(location.longitude),
    terminal_instructions: clean(location.terminalInstructions),
    pickup_instruction_text: clean(location.pickupInstructionText),
    dropoff_instruction_text: clean(location.dropoffInstructionText),
    whatsapp_text: clean(location.pickupInstructionText) ?? clean(location.dropoffInstructionText),
    active: location.active ?? true,
  }))

  let result = await sb.from('rental_locations').insert(extendedRows).select('id,name')
  if (result.error && isMissingColumn(result.error)) {
    const baseRows = locations.map(location => ({
      business_id: businessId,
      name: clean(location.name) ?? 'Rental location',
      address: clean(location.address),
      google_maps_link: clean(location.googleMapsLink),
      latitude: numberOrNull(location.latitude),
      longitude: numberOrNull(location.longitude),
      terminal_instructions: [
        location.locationType ? `Type: ${location.locationType}` : null,
        clean(location.terminalInstructions),
        clean(location.pickupInstructionText) ? `Pickup: ${clean(location.pickupInstructionText)}` : null,
        clean(location.dropoffInstructionText) ? `Drop-off: ${clean(location.dropoffInstructionText)}` : null,
      ].filter(Boolean).join('\n'),
      whatsapp_text: clean(location.pickupInstructionText) ?? clean(location.dropoffInstructionText),
      active: location.active ?? true,
    }))
    result = await sb.from('rental_locations').insert(baseRows).select('id,name')
  }

  if (result.error) throw result.error
  return (result.data ?? []) as { id: string; name: string }[]
}

async function insertCars(
  sb: ReturnType<typeof createAdminClient>,
  businessId: string,
  cars: FleetPayload[],
  locationRows: { id: string; name: string }[],
) {
  const inserted: string[] = []
  for (const car of cars) {
    const classId = await ensureClass(sb, businessId, clean(car.class_name) ?? 'Economy')
    const locationName = clean(car.location)
    const locationId = locationName
      ? locationRows.find(location => location.name.toLowerCase() === locationName.toLowerCase())?.id ?? null
      : null
    const generatedName = [clean(car.make), clean(car.model)].filter(Boolean).join(' ')
    const carName = clean(car.car_name) ?? (generatedName || 'Rental car')
    const result = await sb.from('cars').insert({
      business_id: businessId,
      car_class_id: classId,
      location_id: locationId,
      name: carName,
      model: clean(car.model),
      transmission: transmissionToDb(car.transmission),
      seats: numberOrNull(car.seats),
      fuel_type: clean(car.fuel_type),
      daily_price: Number(car.daily_price) || 0,
      deposit: Number(car.deposit) || 0,
      status: statusToDb(car.status),
      license_plate: clean(car.license_plate),
      notes: clean(car.make) ? `Make: ${clean(car.make)}` : null,
      active: statusToDb(car.status) !== 'inactive',
    }).select('id').single()
    if (result.error) throw result.error
    inserted.push(result.data.id as string)
  }
  return inserted
}

function demoFleetPayload(): FleetPayload[] {
  return demoRentalCars.map(car => {
    const [make, ...modelParts] = car.name.split(' ')
    return {
      car_name: car.name,
      make,
      model: modelParts.join(' ') || car.model || '',
      class_name: car.className,
      transmission: car.transmission ?? 'automatic',
      seats: car.seats ?? 5,
      fuel_type: car.fuelType ?? 'Petrol',
      daily_price: car.dailyPrice,
      deposit: car.deposit,
      license_plate: car.licensePlate ?? '',
      location: car.locationName ?? '',
      status: car.status,
    }
  })
}

function demoLocationPayload(): LocationPayload[] {
  return demoRentalLocations.map(location => ({
    locationType: 'both',
    name: location.name,
    address: location.address ?? '',
    googleMapsLink: location.googleMapsLink ?? '',
    terminalInstructions: location.terminalInstructions ?? '',
    pickupInstructionText: location.whatsappText ?? '',
    dropoffInstructionText: location.whatsappText ?? '',
    active: location.active,
  }))
}

export async function POST(request: Request) {
  const { businessId } = await getSessionBusinessId()
  const body = await request.json().catch(() => ({})) as {
    company?: { name?: string; phone?: string; email?: string }
    settings?: Record<string, unknown>
    cars?: FleetPayload[]
    locations?: LocationPayload[]
    useDemoFleet?: boolean
    useDemoLocations?: boolean
  }
  const sb = createAdminClient()

  const cars = body.useDemoFleet ? demoFleetPayload() : body.cars ?? []
  const locations = body.useDemoLocations ? demoLocationPayload() : body.locations ?? []

  try {
    const settings = body.settings ?? {}
    const settingsResult = await sb.from('rental_settings').upsert({
      business_id: businessId,
      cleaning_buffer_minutes: Number(settings.bufferMinutes ?? settings.cleaningBufferMinutes) || demoRentalSettings.cleaningBufferMinutes,
      provider_name: clean(settings.providerName),
      api_url: clean(settings.apiUrl),
      sync_direction: clean(settings.syncDirection) ?? 'none',
      webhook_url: clean(settings.webhookUrl),
      external_sync_enabled: Boolean(settings.externalSyncEnabled),
      company_contact_name: clean(body.company?.name),
      company_contact_email: clean(body.company?.email),
      company_contact_phone: clean(body.company?.phone),
      terms_summary: [
        clean(settings.depositPolicy) ? `Deposit policy: ${clean(settings.depositPolicy)}` : null,
        clean(settings.minimumDuration) ? `Minimum rental duration: ${clean(settings.minimumDuration)}` : null,
        clean(settings.pickupRules) ? `Pickup/drop-off rules: ${clean(settings.pickupRules)}` : null,
      ].filter(Boolean).join('\n') || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id' })
    if (settingsResult.error) throw settingsResult.error

    const locationRows = await insertLocations(sb, businessId, locations)
    const carIds = await insertCars(sb, businessId, cars, locationRows)

    return NextResponse.json({
      ok: true,
      importedCars: carIds.length,
      importedLocations: locationRows.length,
    })
  } catch (error) {
    const status = isMissingTable(error) ? 503 : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save car rental onboarding' }, { status })
  }
}
