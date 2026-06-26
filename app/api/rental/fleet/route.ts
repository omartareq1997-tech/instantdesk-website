import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'
import { demoRentalBookings, demoRentalCars, demoRentalLocations, demoRentalSettings, type RentalSettings } from '../../../lib/rental'

export const dynamic = 'force-dynamic'

const defaultSettings: RentalSettings = {
  ...demoRentalSettings,
}

function isMissingTable(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '42P01'
}

export async function GET() {
  const { businessId } = await getSessionBusinessId()
  const sb = createAdminClient()

  const [carsRes, bookingsRes, locationsRes, settingsRes] = await Promise.all([
    sb.from('cars').select('id,name,model,transmission,seats,fuel_type,daily_price,deposit,status,image_url,license_plate,notes,active,car_class_id,location_id,car_classes(name),rental_locations(name)').eq('business_id', businessId).order('created_at', { ascending: false }),
    sb.from('bookings').select('id,booking_number,car_id,pickup_at,return_at,status,total_price,deposit,payment_status,source,cars(name,car_classes(name)),rental_customers(name,phone,email),pickup:rental_locations!bookings_pickup_location_id_fkey(name),dropoff:rental_locations!bookings_dropoff_location_id_fkey(name)').eq('business_id', businessId).order('pickup_at', { ascending: true }),
    sb.from('rental_locations').select('*').eq('business_id', businessId).order('name'),
    sb.from('rental_settings').select('*').eq('business_id', businessId).maybeSingle(),
  ])

  if ([carsRes.error, bookingsRes.error, locationsRes.error, settingsRes.error].some(Boolean)) {
    const tableMissing = [carsRes.error, bookingsRes.error, locationsRes.error, settingsRes.error].some(isMissingTable)
    if (!tableMissing) {
      return NextResponse.json({ error: 'Failed to load rental operations data' }, { status: 500 })
    }
    return NextResponse.json({
      migrationRequired: true,
      cars: demoRentalCars,
      bookings: demoRentalBookings,
      locations: demoRentalLocations,
      settings: defaultSettings,
    })
  }

  const cars = (carsRes.data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    model: row.model,
    classId: row.car_class_id,
    className: row.car_classes?.name ?? 'Unclassified',
    transmission: row.transmission,
    seats: row.seats,
    fuelType: row.fuel_type,
    dailyPrice: Number(row.daily_price ?? 0),
    deposit: Number(row.deposit ?? 0),
    status: row.status,
    locationId: row.location_id,
    locationName: row.rental_locations?.name ?? null,
    imageUrl: row.image_url,
    licensePlate: row.license_plate,
    notes: row.notes,
    active: row.active,
  }))

  const bookings = (bookingsRes.data ?? []).map((row: any) => ({
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

  const locations = (locationsRes.data ?? []).map((row: any) => ({
    id: row.id,
    locationType: row.location_type ?? 'both',
    name: row.name,
    address: row.address,
    googleMapsLink: row.google_maps_link,
    latitude: row.latitude ? Number(row.latitude) : null,
    longitude: row.longitude ? Number(row.longitude) : null,
    terminalInstructions: row.terminal_instructions,
    pickupInstructionText: row.pickup_instruction_text ?? row.whatsapp_text,
    dropoffInstructionText: row.dropoff_instruction_text ?? row.whatsapp_text,
    imageUrl: row.image_url,
    whatsappText: row.whatsapp_text,
    active: row.active,
  }))

  const s = settingsRes.data
  return NextResponse.json({
    migrationRequired: false,
    cars,
    bookings,
    locations,
    settings: s ? {
      cleaningBufferMinutes: s.cleaning_buffer_minutes ?? 120,
      currency: s.currency ?? 'PLN',
      minimumRentalDuration: s.minimum_rental_duration ?? null,
      depositPolicy: s.deposit_policy ?? s.terms_summary ?? null,
      cancellationPolicy: s.cancellation_policy ?? null,
      returnPolicy: s.return_policy ?? null,
      lateReturnPolicy: s.late_return_policy ?? null,
      fuelPolicy: s.fuel_policy ?? null,
      mileagePolicy: s.mileage_policy ?? null,
      crossBorderPolicy: s.cross_border_policy ?? null,
      pickupDropoffRules: s.pickup_dropoff_rules ?? null,
      requiredDocumentsText: s.required_documents_text ?? null,
      insuranceExtrasNotes: s.insurance_extras_notes ?? null,
      companyName: s.company_contact_name ?? null,
      companyPhone: s.company_contact_phone ?? null,
      companyWhatsapp: s.company_whatsapp ?? null,
      companyEmail: s.company_contact_email ?? null,
      companyWebsite: s.company_website ?? null,
      providerName: s.provider_name,
      apiUrl: s.api_url,
      apiKeyConfigured: Boolean(s.api_key_encrypted),
      syncDirection: s.sync_direction ?? 'none',
      webhookUrl: s.webhook_url,
      externalSyncEnabled: Boolean(s.external_sync_enabled),
      lastSyncAt: s.last_sync_at,
      lastSyncStatus: s.last_sync_status,
      lastSyncError: s.last_sync_error,
    } : defaultSettings,
  })
}

export async function POST(request: Request) {
  const { businessId } = await getSessionBusinessId()
  const body = await request.json().catch(() => ({}))
  const sb = createAdminClient()

  const { data, error } = await sb.from('cars').insert({
    business_id: businessId,
    name: String(body.name ?? 'New rental car'),
    model: body.model ?? null,
    transmission: body.transmission ?? null,
    seats: Number(body.seats) || null,
    fuel_type: body.fuelType ?? null,
    daily_price: Number(body.dailyPrice) || 0,
    deposit: Number(body.deposit) || 0,
    status: body.status ?? 'available',
    license_plate: body.licensePlate ?? null,
    notes: body.notes ?? null,
    active: body.active ?? true,
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: isMissingTable(error) ? 503 : 500 })
  return NextResponse.json({ ok: true, id: data.id })
}
