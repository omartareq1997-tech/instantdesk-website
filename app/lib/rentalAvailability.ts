import { createAdminClient } from './supabase-server'

export type RentalBookingCalendarStatus = 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled' | 'paid' | 'picked_up' | 'extended' | 'maintenance' | 'unavailable'

export type RentalAvailabilityInput = {
  businessId: string
  carId?: string | null
  carClass?: string | null
  pickupAt: string
  dropoffAt: string
  pickupLocationId?: string | null
  dropoffLocationId?: string | null
  excludeBookingId?: string | null
}

export type RentalCalendarBooking = {
  id: string
  bookingNumber?: string
  carId: string
  carName?: string | null
  carClass?: string | null
  carLicensePlate?: string | null
  dailyPrice?: number | null
  customerName: string
  customerPhone?: string | null
  customerEmail?: string | null
  pickupLocationId?: string | null
  dropoffLocationId?: string | null
  pickupLocation?: string | null
  dropoffLocation?: string | null
  pickupAt: string
  dropoffAt: string
  returnAt: string
  bufferUntil?: string | null
  status: RentalBookingCalendarStatus
  totalPrice: number
  deposit?: number
  paymentStatus?: string | null
  source?: string | null
  city?: string | null
  notes?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export type RentalAvailabilityCar = {
  id: string
  name: string
  model?: string | null
  classId?: string | null
  className?: string | null
  transmission?: string | null
  seats?: number | null
  fuelType?: string | null
  dailyPrice?: number
  deposit?: number
  status?: string | null
  licensePlate?: string | null
  locationId?: string | null
  locationName?: string | null
  city?: string | null
  active?: boolean
}

export type RentalAvailabilityResult = {
  available: boolean
  requestedCar: RentalAvailabilityCar | null
  availableCars: RentalAvailabilityCar[]
  conflicts: RentalCalendarBooking[]
  bufferMinutes: number
  message: string
}

export const BLOCKING_RENTAL_BOOKING_STATUSES = new Set<string>(['pending', 'confirmed', 'active', 'paid', 'picked_up', 'extended', 'maintenance', 'unavailable'])

function toMs(value: string) {
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : NaN
}

export function validateRentalAvailabilityInput(input: RentalAvailabilityInput): string | null {
  if (!input.businessId) return 'businessId is required'
  if (!input.carId && !input.carClass) return 'car_id or car_class is required'
  if (!input.pickupAt || !input.dropoffAt) return 'pickup_at and dropoff_at are required'
  const pickup = toMs(input.pickupAt)
  const dropoff = toMs(input.dropoffAt)
  if (Number.isNaN(pickup) || Number.isNaN(dropoff)) return 'pickup_at and dropoff_at must be valid timestamps'
  if (dropoff <= pickup) return 'dropoff_at must be after pickup_at'
  if (pickup < Date.now() - 60_000) return 'pickup_at cannot be in the past'
  return null
}

export function rentalBookingBlocksWindow(
  booking: Pick<RentalCalendarBooking, 'pickupAt' | 'dropoffAt' | 'status'>,
  pickupAt: string,
  dropoffAt: string,
  bufferMinutes: number,
) {
  if (!BLOCKING_RENTAL_BOOKING_STATUSES.has(booking.status)) return false
  const requestedPickup = toMs(pickupAt)
  const requestedDropoff = toMs(dropoffAt)
  const existingPickup = toMs(booking.pickupAt)
  const existingDropoffWithBuffer = toMs(booking.dropoffAt) + bufferMinutes * 60_000
  if ([requestedPickup, requestedDropoff, existingPickup, existingDropoffWithBuffer].some(Number.isNaN)) return false
  return requestedPickup < existingDropoffWithBuffer && requestedDropoff > existingPickup
}

function normalizeCar(row: any): RentalAvailabilityCar {
  const locationName = row.rental_locations?.name ?? null
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    classId: row.car_class_id,
    className: row.car_classes?.name ?? null,
    transmission: row.transmission,
    seats: row.seats,
    fuelType: row.fuel_type,
    dailyPrice: Number(row.daily_price ?? 0),
    deposit: Number(row.deposit ?? 0),
    status: row.status,
    licensePlate: row.license_plate,
    locationId: row.location_id,
    locationName,
    city: inferRentalCity(locationName),
    active: row.active,
  }
}

export function inferRentalCity(value?: string | null) {
  const text = String(value ?? '').toLowerCase()
  if (!text.trim()) return null
  if (/krak[oó]w|krakow|boche[ńn]ska/.test(text)) return 'Kraków'
  if (/warszawa|warsaw/.test(text)) return 'Warsaw'
  if (/pozna[ńn]|poznan/.test(text)) return 'Poznań'
  if (/wroc[łl]aw|wroclaw/.test(text)) return 'Wrocław'
  if (/gda[ńn]sk|gdansk/.test(text)) return 'Gdańsk'
  const first = String(value ?? '').split(/[,\-–]/)[0]?.trim()
  return first || null
}

export function normalizeRentalBooking(row: any, bufferMinutes = 0): RentalCalendarBooking {
  const dropoffAt = row.dropoff_at ?? row.return_at
  const bufferUntil = dropoffAt ? new Date(new Date(dropoffAt).getTime() + bufferMinutes * 60_000).toISOString() : null
  const pickupLocation = row.pickup?.name ?? null
  const carLocation = row.cars?.rental_locations?.name ?? null
  const carDeposit = Number(row.cars?.deposit ?? 0)
  const totalPrice = Number(row.total_price ?? 0)
  return {
    id: row.id,
    bookingNumber: `RB-${String(row.id).slice(0, 8).toUpperCase()}`,
    carId: row.car_id,
    carName: row.cars?.name ?? null,
    carClass: row.cars?.car_classes?.name ?? null,
    carLicensePlate: row.cars?.license_plate ?? null,
    dailyPrice: row.cars?.daily_price !== undefined ? Number(row.cars.daily_price ?? 0) : null,
    customerName: row.customer_name ?? row.rental_customers?.name ?? 'Manual booking',
    customerPhone: row.customer_phone ?? row.rental_customers?.phone ?? null,
    customerEmail: row.customer_email ?? row.rental_customers?.email ?? null,
    pickupLocationId: row.pickup_location_id ?? null,
    dropoffLocationId: row.dropoff_location_id ?? null,
    pickupLocation,
    dropoffLocation: row.dropoff?.name ?? null,
    pickupAt: row.pickup_at,
    dropoffAt,
    returnAt: dropoffAt,
    bufferUntil,
    status: row.status,
    totalPrice,
    deposit: Number(row.deposit ?? carDeposit ?? 0),
    paymentStatus: row.payment_status ?? row.deposit_status ?? null,
    source: row.source ?? row.channel ?? null,
    city: row.city ?? inferRentalCity(pickupLocation ?? carLocation),
    notes: row.notes ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  }
}

export async function checkRentalAvailability(input: RentalAvailabilityInput): Promise<RentalAvailabilityResult> {
  const validationError = validateRentalAvailabilityInput(input)
  if (validationError) throw new Error(validationError)

  const sb = createAdminClient()
  const settingsRes = await sb
    .from('rental_settings')
    .select('cleaning_buffer_minutes')
    .eq('business_id', input.businessId)
    .maybeSingle()
  if (settingsRes.error) throw settingsRes.error
  const bufferMinutes = Number(settingsRes.data?.cleaning_buffer_minutes ?? 120)

  let carsQuery = sb
    .from('cars')
    .select('id,name,model,transmission,seats,fuel_type,daily_price,deposit,status,license_plate,active,car_class_id,location_id,car_classes(name),rental_locations(name)')
    .eq('business_id', input.businessId)
    .eq('active', true)

  if (input.carId) carsQuery = carsQuery.eq('id', input.carId)
  const carsRes = await carsQuery
  if (carsRes.error) throw carsRes.error

  let cars = (carsRes.data ?? []).map(normalizeCar)
  if (input.carClass && !input.carId) {
    const wanted = input.carClass.trim().toLowerCase()
    cars = cars.filter(car => car.className?.toLowerCase() === wanted)
  }
  if (input.carId && cars.length === 0) throw new Error('Car does not belong to this business')

  const bookingCarIds = cars.map(car => car.id)
  if (bookingCarIds.length === 0) {
    return {
      available: false,
      requestedCar: null,
      availableCars: [],
      conflicts: [],
      bufferMinutes,
      message: input.carClass ? `No cars found in class ${input.carClass}.` : 'No matching cars found.',
    }
  }

  const bookingsRes = await sb
    .from('rental_bookings')
    .select('id,business_id,car_id,customer_name,customer_phone,customer_email,pickup_location_id,dropoff_location_id,pickup_at,dropoff_at,status,total_price,notes,created_at,updated_at,cars(name,daily_price,deposit,license_plate,car_classes(name),rental_locations(name)),pickup:rental_locations!rental_bookings_pickup_location_id_fkey(name),dropoff:rental_locations!rental_bookings_dropoff_location_id_fkey(name)')
    .eq('business_id', input.businessId)
    .in('car_id', bookingCarIds)
    .in('status', Array.from(BLOCKING_RENTAL_BOOKING_STATUSES))
    .lt('pickup_at', input.dropoffAt)

  if (bookingsRes.error) throw bookingsRes.error
  const bookings = (bookingsRes.data ?? [])
    .filter((row: any) => row.id !== input.excludeBookingId)
    .map((row: any) => normalizeRentalBooking(row, bufferMinutes))

  const conflicts = bookings.filter(booking => rentalBookingBlocksWindow(booking, input.pickupAt, input.dropoffAt, bufferMinutes))
  const conflictCarIds = new Set(conflicts.map(booking => booking.carId))
  const availableCars = cars.filter(car => !conflictCarIds.has(car.id))
  const requestedCar = input.carId ? cars[0] ?? null : null

  if (requestedCar && availableCars.some(car => car.id === requestedCar.id)) {
    return {
      available: true,
      requestedCar,
      availableCars,
      conflicts: [],
      bufferMinutes,
      message: `The ${requestedCar.name} is available from ${input.pickupAt} to ${input.dropoffAt}.`,
    }
  }

  async function filterAvailable(candidateCars: RentalAvailabilityCar[]) {
    const ids = candidateCars.map(car => car.id)
    if (!ids.length) return []
    const candidateBookingsRes = await sb
      .from('rental_bookings')
      .select('id,business_id,car_id,customer_name,customer_phone,customer_email,pickup_location_id,dropoff_location_id,pickup_at,dropoff_at,status,total_price,notes,created_at,updated_at,cars(name,daily_price,deposit,license_plate,car_classes(name),rental_locations(name)),pickup:rental_locations!rental_bookings_pickup_location_id_fkey(name),dropoff:rental_locations!rental_bookings_dropoff_location_id_fkey(name)')
      .eq('business_id', input.businessId)
      .in('car_id', ids)
      .in('status', Array.from(BLOCKING_RENTAL_BOOKING_STATUSES))
      .lt('pickup_at', input.dropoffAt)
    if (candidateBookingsRes.error) return []
    const candidateConflicts = (candidateBookingsRes.data ?? [])
      .filter((row: any) => row.id !== input.excludeBookingId)
      .map((row: any) => normalizeRentalBooking(row, bufferMinutes))
      .filter(booking => rentalBookingBlocksWindow(booking, input.pickupAt, input.dropoffAt, bufferMinutes))
    const candidateConflictIds = new Set(candidateConflicts.map(booking => booking.carId))
    return candidateCars.filter(car => !candidateConflictIds.has(car.id))
  }

  if (requestedCar) {
    let alternativesQuery = sb
      .from('cars')
      .select('id,name,model,transmission,seats,fuel_type,daily_price,deposit,status,license_plate,active,car_class_id,location_id,car_classes(name),rental_locations(name)')
      .eq('business_id', input.businessId)
      .eq('active', true)
      .neq('id', requestedCar.id)
    const alternativesRes = await alternativesQuery
    const alternatives = alternativesRes.error ? [] : (alternativesRes.data ?? []).map(normalizeCar)
    const availableAlternatives = (await filterAvailable(alternatives))
      .sort((a, b) => {
        const aSameClass = requestedCar.className && a.className === requestedCar.className ? 0 : 1
        const bSameClass = requestedCar.className && b.className === requestedCar.className ? 0 : 1
        return aSameClass - bSameClass || (a.dailyPrice ?? 0) - (b.dailyPrice ?? 0)
      })
    return {
      available: false,
      requestedCar,
      availableCars: availableAlternatives,
      conflicts,
      bufferMinutes,
      message: availableAlternatives.length
        ? `The ${requestedCar.name} is not available for those dates, but these similar cars are available: ${availableAlternatives.map(car => car.name).join(', ')}.`
        : `The ${requestedCar.name} is not available for those dates.`,
    }
  }

  let fallbackAvailableCars: RentalAvailabilityCar[] = []
  if (!availableCars.length && input.carClass) {
    const allCarsRes = await sb
      .from('cars')
      .select('id,name,model,transmission,seats,fuel_type,daily_price,deposit,status,license_plate,active,car_class_id,location_id,car_classes(name),rental_locations(name)')
      .eq('business_id', input.businessId)
      .eq('active', true)
    if (!allCarsRes.error) {
      fallbackAvailableCars = (await filterAvailable((allCarsRes.data ?? []).map(normalizeCar)))
        .filter(car => car.className?.toLowerCase() !== input.carClass?.trim().toLowerCase())
        .sort((a, b) => (a.dailyPrice ?? 0) - (b.dailyPrice ?? 0))
    }
  }

  return {
    available: availableCars.length > 0,
    requestedCar: null,
    availableCars: availableCars.length ? availableCars : fallbackAvailableCars,
    conflicts,
    bufferMinutes,
    message: availableCars.length
      ? `Available cars in ${input.carClass}: ${availableCars.map(car => car.name).join(', ')}.`
      : fallbackAvailableCars.length
        ? `No cars in ${input.carClass} are available for those dates. Available alternatives: ${fallbackAvailableCars.map(car => car.name).join(', ')}.`
        : `No cars in ${input.carClass} are available for those dates.`,
  }
}
