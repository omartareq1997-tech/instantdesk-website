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

type SaveStep =
  | 'parse_request'
  | 'resolve_session'
  | 'schema_preflight'
  | 'business_update'
  | 'rental_settings'
  | 'rental_locations'
  | 'car_classes'
  | 'rental_cars'

type SupabaseLikeError = {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}

function isMissingTable(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && ['42P01', 'PGRST205'].includes(String((error as { code?: string }).code))
}

function isMissingColumn(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && ['42703', 'PGRST204'].includes(String((error as { code?: string }).code))
}

function formatError(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const supabaseError = error as SupabaseLikeError
    return {
      message: supabaseError.message ?? 'Unknown Supabase error',
      code: supabaseError.code ?? null,
      details: supabaseError.details ?? null,
      hint: supabaseError.hint ?? null,
    }
  }
  return {
    message: error instanceof Error ? error.message : String(error || 'Unknown error'),
    code: null,
    details: null,
    hint: null,
  }
}

function stepError(step: SaveStep, error: unknown) {
  const formatted = formatError(error)
  const message = isMissingTable(error)
    ? `${formatted.message}. Run sql/create_rental_operations.sql in Supabase before saving car rental onboarding.`
    : formatted.message
  return {
    success: false,
    step,
    error: message,
    code: formatted.code,
    details: formatted.details,
    hint: formatted.hint,
  }
}

function logStep(step: SaveStep, message: string, meta?: Record<string, unknown>) {
  console.log(`[RentalOnboarding] ${step}: ${message}`, meta ?? {})
}

function logStepError(step: SaveStep, error: unknown, meta?: Record<string, unknown>) {
  console.error(`[RentalOnboarding] ${step} failed`, {
    ...formatError(error),
    ...(meta ?? {}),
  })
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
  logStep('car_classes', 'Looking up car class', { businessId, name: label })
  const existing = await sb.from('car_classes').select('id').eq('business_id', businessId).ilike('name', label).limit(1).maybeSingle()
  if (existing.error) {
    logStepError('car_classes', existing.error, { businessId, name: label })
    throw existing.error
  }
  if (existing.data?.id) return existing.data.id as string
  logStep('car_classes', 'Creating car class', { businessId, name: label })
  const inserted = await sb.from('car_classes').insert({ business_id: businessId, name: label }).select('id').single()
  if (inserted.error) {
    logStepError('car_classes', inserted.error, { businessId, name: label })
    throw inserted.error
  }
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

  logStep('rental_locations', 'Saving locations', { businessId, count: extendedRows.length, names: extendedRows.map(row => row.name) })
  let result = await sb.from('rental_locations').insert(extendedRows).select('id,name')
  if (result.error && isMissingColumn(result.error)) {
    logStepError('rental_locations', result.error, { businessId, fallback: 'base_columns' })
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
    logStep('rental_locations', 'Retrying locations with base columns', { businessId, count: baseRows.length, names: baseRows.map(row => row.name) })
    result = await sb.from('rental_locations').insert(baseRows).select('id,name')
  }

  if (result.error) {
    logStepError('rental_locations', result.error, { businessId, count: extendedRows.length })
    throw result.error
  }
  return (result.data ?? []) as { id: string; name: string }[]
}

async function insertCars(
  sb: ReturnType<typeof createAdminClient>,
  businessId: string,
  cars: FleetPayload[],
  locationRows: { id: string; name: string }[],
) {
  const inserted: string[] = []
  logStep('rental_cars', 'Saving cars', { businessId, count: cars.length })
  for (const car of cars) {
    const classId = await ensureClass(sb, businessId, clean(car.class_name) ?? 'Economy')
    const locationName = clean(car.location)
    const locationId = locationName
      ? locationRows.find(location => location.name.toLowerCase() === locationName.toLowerCase())?.id ?? null
      : null
    const generatedName = [clean(car.make), clean(car.model)].filter(Boolean).join(' ')
    const carName = clean(car.car_name) ?? (generatedName || 'Rental car')
    const row = {
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
    }
    logStep('rental_cars', 'Inserting car', { businessId, name: row.name, classId, locationId, status: row.status })
    const result = await sb.from('cars').insert(row).select('id').single()
    if (result.error) {
      logStepError('rental_cars', result.error, { businessId, car: row })
      throw result.error
    }
    inserted.push(result.data.id as string)
  }
  return inserted
}

async function verifyTable(sb: ReturnType<typeof createAdminClient>, table: string) {
  const result = await sb.from(table).select('*').limit(1)
  if (result.error) throw result.error
}

async function verifyRentalSchema(sb: ReturnType<typeof createAdminClient>) {
  const tables = ['businesses', 'profiles', 'rental_settings', 'rental_locations', 'car_classes', 'cars']
  for (const table of tables) {
    logStep('schema_preflight', 'Checking table', { table })
    try {
      await verifyTable(sb, table)
    } catch (error) {
      logStepError('schema_preflight', error, { table })
      throw error
    }
  }
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
  let businessId = ''
  try {
    logStep('resolve_session', 'Resolving business session')
    ;({ businessId } = await getSessionBusinessId())
  } catch (error) {
    logStepError('resolve_session', error)
    return NextResponse.json(stepError('resolve_session', error), { status: 401 })
  }
  if (!businessId) {
    const body = { success: false, step: 'resolve_session' as const, error: 'Not authenticated: no businessId resolved for onboarding save.' }
    console.error('[RentalOnboarding] resolve_session failed', body)
    return NextResponse.json(body, { status: 401 })
  }

  let body: {
    company?: { name?: string; phone?: string; email?: string; whatsapp?: string; website?: string }
    settings?: Record<string, unknown>
    cars?: FleetPayload[]
    locations?: LocationPayload[]
    useDemoFleet?: boolean
    useDemoLocations?: boolean
  }
  try {
    body = await request.json() as typeof body
  } catch (error) {
    logStepError('parse_request', error, { businessId })
    return NextResponse.json(stepError('parse_request', error), { status: 400 })
  }
  const sb = createAdminClient()

  const cars = body.useDemoFleet ? demoFleetPayload() : body.cars ?? []
  const locations = body.useDemoLocations ? demoLocationPayload() : body.locations ?? []
  logStep('parse_request', 'Received onboarding payload', {
    businessId,
    company: {
      hasName: Boolean(clean(body.company?.name)),
      hasEmail: Boolean(clean(body.company?.email)),
      hasPhone: Boolean(clean(body.company?.phone)),
    },
    settingsKeys: Object.keys(body.settings ?? {}),
    cars: cars.length,
    locations: locations.length,
    useDemoFleet: Boolean(body.useDemoFleet),
    useDemoLocations: Boolean(body.useDemoLocations),
  })

  let currentStep: SaveStep = 'schema_preflight'
  try {
    currentStep = 'schema_preflight'
    await verifyRentalSchema(sb)

    currentStep = 'business_update'
    logStep('business_update', 'Marking business as car_rental', { businessId })
    const businessUpdate = await sb.from('businesses').update({ business_type: 'car_rental' }).eq('id', businessId).select('id').maybeSingle()
    if (businessUpdate.error && isMissingColumn(businessUpdate.error)) {
      logStepError('business_update', businessUpdate.error, { businessId, nonFatal: true })
    } else if (businessUpdate.error) {
      logStepError('business_update', businessUpdate.error, { businessId })
      throw businessUpdate.error
    }

    currentStep = 'rental_settings'
    const settings = body.settings ?? {}
    const settingsPayload = {
      business_id: businessId,
      cleaning_buffer_minutes: Number(settings.bufferMinutes ?? settings.cleaningBufferMinutes) || demoRentalSettings.cleaningBufferMinutes,
      currency: clean(settings.currency) ?? 'PLN',
      minimum_rental_duration: clean(settings.minimumDuration ?? settings.minimumRentalDuration),
      deposit_policy: clean(settings.depositPolicy),
      cancellation_policy: clean(settings.cancellationPolicy),
      return_policy: clean(settings.returnPolicy),
      late_return_policy: clean(settings.lateReturnPolicy),
      fuel_policy: clean(settings.fuelPolicy),
      mileage_policy: clean(settings.mileagePolicy),
      cross_border_policy: clean(settings.crossBorderPolicy),
      pickup_dropoff_rules: clean(settings.pickupRules ?? settings.pickupDropoffRules),
      required_documents_text: clean(settings.requiredDocumentsText),
      insurance_extras_notes: clean(settings.insuranceExtrasNotes),
      provider_name: clean(settings.providerName),
      api_url: clean(settings.apiUrl),
      sync_direction: clean(settings.syncDirection) ?? 'none',
      webhook_url: clean(settings.webhookUrl),
      external_sync_enabled: Boolean(settings.externalSyncEnabled),
      company_contact_name: clean(body.company?.name),
      company_contact_email: clean(body.company?.email),
      company_contact_phone: clean(body.company?.phone),
      company_whatsapp: clean((body.company as { whatsapp?: string } | undefined)?.whatsapp),
      company_website: clean((body.company as { website?: string } | undefined)?.website),
      terms_summary: [
        clean(settings.depositPolicy) ? `Deposit policy: ${clean(settings.depositPolicy)}` : null,
        clean(settings.minimumDuration) ? `Minimum rental duration: ${clean(settings.minimumDuration)}` : null,
        clean(settings.pickupRules) ? `Pickup/drop-off rules: ${clean(settings.pickupRules)}` : null,
      ].filter(Boolean).join('\n') || null,
      updated_at: new Date().toISOString(),
    }
    logStep('rental_settings', 'Saving rental_settings', { businessId, payload: settingsPayload })
    let settingsResult = await sb.from('rental_settings').upsert(settingsPayload, { onConflict: 'business_id' })
    if (settingsResult.error && isMissingColumn(settingsResult.error)) {
      logStepError('rental_settings', settingsResult.error, { businessId, fallback: 'base_columns' })
      const fallbackPayload = {
        business_id: settingsPayload.business_id,
        cleaning_buffer_minutes: settingsPayload.cleaning_buffer_minutes,
        provider_name: settingsPayload.provider_name,
        api_url: settingsPayload.api_url,
        sync_direction: settingsPayload.sync_direction,
        webhook_url: settingsPayload.webhook_url,
        external_sync_enabled: settingsPayload.external_sync_enabled,
        company_contact_name: settingsPayload.company_contact_name,
        company_contact_email: settingsPayload.company_contact_email,
        company_contact_phone: settingsPayload.company_contact_phone,
        terms_summary: settingsPayload.terms_summary,
        updated_at: settingsPayload.updated_at,
      }
      logStep('rental_settings', 'Retrying rental_settings with base columns', { businessId, payload: fallbackPayload })
      settingsResult = await sb.from('rental_settings').upsert(fallbackPayload, { onConflict: 'business_id' })
    }
    if (settingsResult.error) {
      logStepError('rental_settings', settingsResult.error, { businessId, payload: settingsPayload })
      throw settingsResult.error
    }

    currentStep = 'rental_locations'
    const locationRows = await insertLocations(sb, businessId, locations)
    currentStep = 'rental_cars'
    const carIds = await insertCars(sb, businessId, cars, locationRows)

    return NextResponse.json({
      success: true,
      ok: true,
      importedCars: carIds.length,
      importedLocations: locationRows.length,
    })
  } catch (error) {
    const status = isMissingTable(error) ? 503 : 500
    const failure = stepError(currentStep, error)
    return NextResponse.json(failure, { status })
  }
}
