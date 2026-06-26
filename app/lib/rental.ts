export type RentalBookingStatus =
  | 'pending' | 'confirmed' | 'paid' | 'picked_up' | 'returned'
  | 'extended' | 'cancelled' | 'maintenance'

export type RentalCarStatus = RentalBookingStatus | 'available' | 'inactive'

export interface RentalCar {
  id: string
  name: string
  model?: string | null
  className: string
  classId?: string | null
  transmission?: string | null
  seats?: number | null
  fuelType?: string | null
  dailyPrice: number
  deposit: number
  status: RentalCarStatus
  locationName?: string | null
  locationId?: string | null
  imageUrl?: string | null
  licensePlate?: string | null
  notes?: string | null
  active: boolean
}

export interface RentalBooking {
  id: string
  bookingNumber: string
  carId?: string | null
  carName?: string | null
  carClass?: string | null
  customerName: string
  customerPhone?: string | null
  customerEmail?: string | null
  pickupAt: string
  returnAt: string
  pickupLocation?: string | null
  dropoffLocation?: string | null
  status: RentalBookingStatus
  totalPrice: number
  deposit: number
  paymentStatus: string
  source?: string | null
}

export interface RentalLocation {
  id: string
  locationType?: 'pickup' | 'dropoff' | 'both'
  name: string
  address?: string | null
  googleMapsLink?: string | null
  latitude?: number | null
  longitude?: number | null
  terminalInstructions?: string | null
  pickupInstructionText?: string | null
  dropoffInstructionText?: string | null
  imageUrl?: string | null
  whatsappText?: string | null
  active: boolean
}

export interface RentalSettings {
  cleaningBufferMinutes: number
  currency?: string | null
  minimumRentalDuration?: string | null
  depositPolicy?: string | null
  cancellationPolicy?: string | null
  returnPolicy?: string | null
  lateReturnPolicy?: string | null
  fuelPolicy?: string | null
  mileagePolicy?: string | null
  crossBorderPolicy?: string | null
  pickupDropoffRules?: string | null
  requiredDocumentsText?: string | null
  insuranceExtrasNotes?: string | null
  companyName?: string | null
  companyPhone?: string | null
  companyWhatsapp?: string | null
  companyEmail?: string | null
  companyWebsite?: string | null
  providerName?: string | null
  apiUrl?: string | null
  apiKeyConfigured?: boolean
  syncDirection: 'none' | 'import' | 'push' | 'two_way'
  webhookUrl?: string | null
  externalSyncEnabled: boolean
  lastSyncAt?: string | null
  lastSyncStatus?: string | null
  lastSyncError?: string | null
}

export interface AvailabilityRequest {
  pickupDateTime: string
  returnDateTime: string
  pickupLocation?: string
  dropoffLocation?: string
  carClass?: string
  transmission?: string
  seats?: number
  budget?: number
}

export interface AvailabilityMatch {
  car: RentalCar
  matchType: 'exact' | 'same_class_alternative' | 'nearest_class_alternative'
  priceDifference: number
  reason: string
}

const BLOCKING_STATUSES = new Set<RentalBookingStatus>(['pending', 'confirmed', 'paid', 'picked_up', 'extended', 'maintenance'])

function time(value: string) {
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : NaN
}

export function bookingOverlapsWindow(booking: Pick<RentalBooking, 'pickupAt' | 'returnAt' | 'status'>, pickupAt: string, returnAt: string, bufferMinutes: number) {
  if (!BLOCKING_STATUSES.has(booking.status)) return false
  const pickup = time(pickupAt)
  const dropoff = time(returnAt)
  const bookedStart = time(booking.pickupAt) - bufferMinutes * 60_000
  const bookedEnd = time(booking.returnAt) + bufferMinutes * 60_000
  if ([pickup, dropoff, bookedStart, bookedEnd].some(Number.isNaN)) return false
  return pickup < bookedEnd && dropoff > bookedStart
}

export function checkRentalAvailability(
  request: AvailabilityRequest,
  cars: RentalCar[],
  bookings: RentalBooking[],
  bufferMinutes = 120,
): AvailabilityMatch[] {
  const available = cars
    .filter(car => car.active && car.status !== 'inactive' && car.status !== 'maintenance')
    .filter(car => !bookings.some(booking => booking.carId === car.id && bookingOverlapsWindow(booking, request.pickupDateTime, request.returnDateTime, bufferMinutes)))
    .filter(car => !request.transmission || car.transmission === request.transmission)
    .filter(car => !request.seats || (car.seats ?? 0) >= request.seats)
    .filter(car => !request.budget || car.dailyPrice <= request.budget)

  const wantedClass = request.carClass?.trim().toLowerCase()
  const exact = available.filter(car => !wantedClass || car.className.toLowerCase() === wantedClass)
  if (exact.length) {
    return exact
      .sort((a, b) => a.dailyPrice - b.dailyPrice)
      .map(car => ({ car, matchType: 'exact', priceDifference: 0, reason: 'Matches requested class, dates, location filters, transmission, seats, and budget.' }))
  }

  const sameClassAlternatives = available.filter(car => {
    if (!wantedClass) return false
    const className = car.className.toLowerCase()
    return className.includes(wantedClass) || wantedClass.includes(className)
  })
  if (sameClassAlternatives.length) {
    return sameClassAlternatives
      .sort((a, b) => a.dailyPrice - b.dailyPrice)
      .map(car => ({ car, matchType: 'same_class_alternative', priceDifference: 0, reason: 'Requested class is unavailable exactly, but this is a same-class alternative.' }))
  }

  const targetPrice = cars.find(car => wantedClass && car.className.toLowerCase() === wantedClass)?.dailyPrice ?? 0
  return available
    .sort((a, b) => Math.abs(a.dailyPrice - targetPrice) - Math.abs(b.dailyPrice - targetPrice))
    .slice(0, 6)
    .map(car => ({
      car,
      matchType: 'nearest_class_alternative',
      priceDifference: targetPrice ? car.dailyPrice - targetPrice : 0,
      reason: 'Requested class is unavailable; this is the nearest available alternative by price and capacity.',
    }))
}

export const checkCarAvailability = checkRentalAvailability

export const demoRentalCarClasses = [
  { id: 'class-economy', name: 'Economy', seats: 5 },
  { id: 'class-suv', name: 'SUV', seats: 5 },
  { id: 'class-van', name: 'Van', seats: 8 },
]

function demoDate(dayOffset: number, hour: number, minute = 0) {
  const date = new Date()
  date.setDate(date.getDate() + dayOffset)
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

export const demoRentalCars: RentalCar[] = [
  { id: 'car-economy-1', name: 'Toyota Yaris', model: '2024 Hybrid', className: 'Economy', transmission: 'automatic', seats: 5, fuelType: 'Hybrid', dailyPrice: 140, deposit: 800, status: 'available', locationName: 'Krakow Airport Terminal 1', licensePlate: 'KR 2458A', active: true },
  { id: 'car-economy-2', name: 'Hyundai i20', model: '2023', className: 'Economy', transmission: 'manual', seats: 5, fuelType: 'Petrol', dailyPrice: 125, deposit: 700, status: 'available', locationName: 'City Center', licensePlate: 'KR 8821G', active: true },
  { id: 'car-suv-1', name: 'Kia Sportage', model: '2024', className: 'SUV', transmission: 'automatic', seats: 5, fuelType: 'Petrol', dailyPrice: 260, deposit: 1500, status: 'available', locationName: 'Krakow Airport Terminal 1', licensePlate: 'KR 5512S', active: true },
  { id: 'car-suv-2', name: 'Toyota RAV4', model: '2023', className: 'SUV', transmission: 'automatic', seats: 5, fuelType: 'Hybrid', dailyPrice: 280, deposit: 1600, status: 'available', locationName: 'City Center', licensePlate: 'KR 3311R', active: true },
  { id: 'car-van-1', name: 'Mercedes Vito', model: '2023', className: 'Van', transmission: 'automatic', seats: 8, fuelType: 'Diesel', dailyPrice: 390, deposit: 2200, status: 'available', locationName: 'Depot', licensePlate: 'KR 9001V', active: true },
]

export const demoRentalBookings: RentalBooking[] = [
  { id: 'booking-1', bookingNumber: 'CR-1024', carId: 'car-economy-1', carName: 'Toyota Yaris', carClass: 'Economy', customerName: 'Marta Nowak', customerPhone: '+48 600 100 200', customerEmail: 'marta@example.com', pickupAt: demoDate(1, 10), returnAt: demoDate(1, 12), pickupLocation: 'Krakow Airport Terminal 1', dropoffLocation: 'Krakow Airport Terminal 1', status: 'confirmed', totalPrice: 140, deposit: 800, paymentStatus: 'deposit_paid', source: 'website_chat' },
  { id: 'booking-2', bookingNumber: 'CR-1025', carId: 'car-economy-2', carName: 'Hyundai i20', carClass: 'Economy', customerName: 'Adam Zielinski', pickupAt: demoDate(1, 9), returnAt: demoDate(2, 9), pickupLocation: 'City Center', dropoffLocation: 'City Center', status: 'confirmed', totalPrice: 250, deposit: 700, paymentStatus: 'deposit_pending', source: 'website_chat' },
  { id: 'booking-3', bookingNumber: 'CR-1026', carId: 'car-suv-1', carName: 'Kia Sportage', carClass: 'SUV', customerName: 'Julia Maj', pickupAt: demoDate(1, 10), returnAt: demoDate(3, 10), pickupLocation: 'Krakow Airport Terminal 1', dropoffLocation: 'City Center', status: 'paid', totalPrice: 520, deposit: 1500, paymentStatus: 'paid', source: 'external_calendar' },
  { id: 'booking-4', bookingNumber: 'CR-1027', carId: 'car-van-1', carName: 'Mercedes Vito', carClass: 'Van', customerName: 'Maintenance block', pickupAt: demoDate(1, 8), returnAt: demoDate(1, 18), pickupLocation: 'Depot', dropoffLocation: 'Depot', status: 'maintenance', totalPrice: 0, deposit: 0, paymentStatus: 'none', source: 'manual_block' },
  { id: 'booking-5', bookingNumber: 'CR-1028', carId: 'car-economy-1', carName: 'Toyota Yaris', carClass: 'Economy', customerName: 'Future renter', pickupAt: demoDate(1, 15), returnAt: demoDate(2, 12), pickupLocation: 'Krakow Airport Terminal 1', dropoffLocation: 'City Center', status: 'confirmed', totalPrice: 210, deposit: 800, paymentStatus: 'deposit_paid', source: 'external_calendar' },
]

export const demoRentalLocations: RentalLocation[] = [
  { id: 'loc-1', name: 'Krakow Airport Terminal 1', address: 'Krakow Airport arrivals hall, Terminal 1', googleMapsLink: 'https://maps.google.com/?q=Krakow+Airport+Terminal+1', terminalInstructions: 'Meet at Terminal 1 arrivals, exit 2. Driver will hold a sign with your booking number. Parking zone P2, row B.', whatsappText: 'Pickup: Krakow Airport Terminal 1 arrivals, exit 2. Parking P2 row B. Maps: https://maps.google.com/?q=Krakow+Airport+Terminal+1', active: true },
  { id: 'loc-2', name: 'City Center', address: 'Main office, Old Town', googleMapsLink: 'https://maps.google.com', terminalInstructions: 'Park in front of the office and call the rental desk.', whatsappText: 'Pickup: City Center office. Maps: https://maps.google.com', active: true },
  { id: 'loc-3', name: 'Depot', address: 'Fleet depot, industrial zone', googleMapsLink: 'https://maps.google.com/?q=Krakow+fleet+depot', terminalInstructions: 'Use gate 3 and call the rental desk from the security booth.', whatsappText: 'Pickup: Depot, gate 3. Maps: https://maps.google.com/?q=Krakow+fleet+depot', active: true },
]

export const demoRentalSettings: RentalSettings = {
  cleaningBufferMinutes: 120,
  providerName: 'Demo external calendar',
  apiUrl: 'https://calendar.example.test/api/bookings',
  apiKeyConfigured: true,
  syncDirection: 'two_way',
  webhookUrl: 'https://instantdesk.pl/api/rental/webhook/demo',
  externalSyncEnabled: true,
  lastSyncStatus: 'demo_ready',
}
