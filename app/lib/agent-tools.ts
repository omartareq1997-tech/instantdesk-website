import type { SupabaseClient } from '@supabase/supabase-js'
import { checkRentalAvailability, type RentalAvailabilityResult } from './rentalAvailability'
import { parseRentalDateWindow } from './rentalDateTime'

export type AgentToolName =
  | 'searchFleet'
  | 'checkAvailability'
  | 'calculatePrice'
  | 'createBooking'
  | 'updateBooking'
  | 'extendBooking'
  | 'cancelBooking'
  | 'getBusinessPolicies'
  | 'getLocations'
  | 'handoverToHuman'

export type AgentToolResult = {
  tool: AgentToolName
  ok: boolean
  summary: string
  data?: unknown
  error?: string
}

export type AgentToolContext = {
  businessId: string
  businessType: string | null
  conversationId: string
  message: string
  slots: {
    name?: string | null
    phone?: string | null
    email?: string | null
    booking_number?: string | null
    pickup_location?: string | null
    dropoff_location?: string | null
    pickup_datetime?: string | null
    return_datetime?: string | null
    car_class?: string | null
    transmission?: string | null
    seats?: string | null
    extras?: string | null
  }
}

type RentalCarRow = {
  id: string
  name: string
  model?: string | null
  transmission?: string | null
  seats?: number | null
  fuel_type?: string | null
  daily_price?: number | null
  deposit?: number | null
  status?: string | null
  active?: boolean | null
  car_classes?: { name?: string | null } | null
  rental_locations?: { name?: string | null } | null
}

function norm(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

function title(value: string | null | undefined) {
  return value?.trim() || ''
}

function includesAny(text: string, words: string[]) {
  return words.some(word => text.includes(word))
}

function requestedCarText(message: string) {
  const lower = message.toLowerCase()
  const knownModels = [
    'toyota corolla',
    'toyota camry',
    'toyota yaris',
    'bmw x5',
    'mercedes glc',
    'skoda superb',
    'corolla',
    'camry',
    'yaris',
    'x5',
    'glc',
    'superb',
  ]
  return knownModels.find(model => new RegExp(`\\b${model.replace(/\s+/g, '\\s+')}\\b`, 'i').test(lower)) ?? ''
}

function bookingReference(context: AgentToolContext) {
  const explicit = context.slots.booking_number?.trim()
  if (explicit) return explicit
  return context.message.match(/\b(?:RB-[A-Z0-9]{4,}|[0-9a-f]{8}-[0-9a-f-]{27,})\b/i)?.[0] ?? null
}

function wantsBookingCreation(text: string) {
  return /\b(book|reserve|confirm|create booking|make a booking)\b/i.test(text)
}

function wantsBookingUpdate(text: string) {
  return /\b(change|update|modify|move|reschedule|switch)\b/i.test(text)
}

function wantsBookingExtension(text: string) {
  return /\b(extend|extension|keep.*longer|return later)\b/i.test(text)
}

function wantsCancellation(text: string) {
  return /\b(cancel|cancellation)\b/i.test(text)
}

function carMatches(row: RentalCarRow, text: string) {
  if (!text) return true
  const haystack = `${row.name ?? ''} ${row.model ?? ''} ${row.car_classes?.name ?? ''}`.toLowerCase()
  return text.split(/\s+/).filter(Boolean).every(word => haystack.includes(word))
}

export function planOperationalTools(context: AgentToolContext): AgentToolName[] {
  const businessType = context.businessType
  if (businessType !== 'car_rental') return []
  const text = norm(context.message)
  const tools: AgentToolName[] = []
  if (includesAny(text, ['policy', 'deposit', 'documents', 'license', 'insurance', 'mileage', 'late fee', 'cancel', 'cancellation', 'age requirement'])) {
    tools.push('getBusinessPolicies')
  }
  if (includesAny(text, ['where can i pick', 'pickup location', 'pick up location', 'drop off', 'airport', 'deliver', 'delivery area', 'locations'])) {
    tools.push('getLocations')
  }
  if (includesAny(text, ['what cars', 'which cars', 'do you have', 'available cars', 'automatic cars', 'suv', 'fleet', 'corolla', 'toyota'])) {
    tools.push('searchFleet')
  }
  if (wantsCancellation(text)) {
    tools.push('cancelBooking')
  }
  if (wantsBookingExtension(text)) {
    tools.push('extendBooking')
  } else if (wantsBookingUpdate(text)) {
    tools.push('updateBooking')
  }
  if (includesAny(text, ['available', 'free', 'rent', 'from ', 'until ', 'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])) {
    if (!tools.includes('searchFleet')) tools.push('searchFleet')
    tools.push('checkAvailability')
  }
  if (wantsBookingCreation(text)) {
    if (!tools.includes('searchFleet')) tools.push('searchFleet')
    if (!tools.includes('checkAvailability')) tools.push('checkAvailability')
    tools.push('createBooking')
  }
  if (includesAny(text, ['how much', 'cost', 'price', 'total', 'deposit', 'fee'])) {
    if (!tools.includes('searchFleet')) tools.push('searchFleet')
    tools.push('calculatePrice')
  }
  if (includesAny(text, ['human', 'agent', 'support', 'angry', 'complaint'])) {
    tools.push('handoverToHuman')
  }
  return [...new Set(tools)]
}

function normalizeCar(row: RentalCarRow) {
  return {
    id: row.id,
    name: row.name,
    model: row.model ?? null,
    className: row.car_classes?.name ?? null,
    transmission: row.transmission ?? null,
    seats: row.seats ?? null,
    fuelType: row.fuel_type ?? null,
    dailyPrice: Number(row.daily_price ?? 0),
    deposit: Number(row.deposit ?? 0),
    status: row.status ?? null,
    locationName: row.rental_locations?.name ?? null,
  }
}

async function searchFleet(sb: SupabaseClient, context: AgentToolContext): Promise<AgentToolResult> {
  const { data, error } = await sb
    .from('cars')
    .select('id,name,model,transmission,seats,fuel_type,daily_price,deposit,status,active,car_classes(name),rental_locations(name)')
    .eq('business_id', context.businessId)
    .eq('active', true)
    .order('name')
  if (error) return { tool: 'searchFleet', ok: false, summary: 'Fleet search failed.', error: error.message }
  const carText = requestedCarText(context.message)
  const wantedClass = norm(context.slots.car_class)
  const wantedTransmission = norm(context.slots.transmission) || (/\bautomatic\b/i.test(context.message) ? 'automatic' : /\bmanual\b/i.test(context.message) ? 'manual' : '')
  const wantedLocation = norm(context.slots.pickup_location) || (/\bkrakow|kraków\b/i.test(context.message) ? 'krakow' : '')
  const cars = ((data ?? []) as RentalCarRow[])
    .filter(car => carMatches(car, carText))
    .filter(car => !wantedClass || norm(car.car_classes?.name).includes(wantedClass))
    .filter(car => !wantedTransmission || norm(car.transmission) === wantedTransmission)
    .filter(car => !wantedLocation || !car.rental_locations?.name || norm(car.rental_locations?.name).includes(wantedLocation))
    .map(normalizeCar)
  return {
    tool: 'searchFleet',
    ok: true,
    summary: cars.length ? `Found ${cars.length} matching active fleet vehicle(s).` : 'No matching active fleet vehicles found.',
    data: { cars },
  }
}

async function getLocations(sb: SupabaseClient, context: AgentToolContext): Promise<AgentToolResult> {
  const { data, error } = await sb
    .from('rental_locations')
    .select('id,name,address,active')
    .eq('business_id', context.businessId)
    .eq('active', true)
    .order('name')
  if (error) return { tool: 'getLocations', ok: false, summary: 'Location lookup failed.', error: error.message }
  const locations = data ?? []
  return {
    tool: 'getLocations',
    ok: true,
    summary: locations.length ? `Found ${locations.length} active pickup/drop-off location(s).` : 'No active pickup/drop-off locations are configured.',
    data: { locations },
  }
}

async function getBusinessPolicies(sb: SupabaseClient, context: AgentToolContext): Promise<AgentToolResult> {
  const { data, error } = await sb
    .from('rental_settings')
    .select('*')
    .eq('business_id', context.businessId)
    .maybeSingle()
  if (error) return { tool: 'getBusinessPolicies', ok: false, summary: 'Policy lookup failed.', error: error.message }
  return {
    tool: 'getBusinessPolicies',
    ok: true,
    summary: data ? 'Loaded live rental policy/settings.' : 'No rental policy/settings are configured.',
    data: { settings: data ?? null },
  }
}

function firstCar(toolResults: AgentToolResult[]) {
  const fleet = toolResults.find(result => result.tool === 'searchFleet' && result.ok)?.data as { cars?: { id: string; name: string; dailyPrice?: number; deposit?: number }[] } | undefined
  return fleet?.cars?.[0] ?? null
}

async function checkAvailability(context: AgentToolContext, toolResults: AgentToolResult[]): Promise<AgentToolResult> {
  const car = firstCar(toolResults)
  const { pickupAt, dropoffAt } = parseRentalDateWindow(context.message, context.slots)
  if (!pickupAt || !dropoffAt) {
    return { tool: 'checkAvailability', ok: false, summary: 'Availability needs exact pickup and return date/time before checking the live calendar.' }
  }
  if (!car?.id && !context.slots.car_class) {
    return { tool: 'checkAvailability', ok: false, summary: 'Availability needs a selected car or car class before checking the live calendar.' }
  }
  try {
    const result: RentalAvailabilityResult = await checkRentalAvailability({
      businessId: context.businessId,
      carId: car?.id ?? null,
      carClass: car?.id ? null : context.slots.car_class,
      pickupAt,
      dropoffAt,
    })
    return {
      tool: 'checkAvailability',
      ok: true,
      summary: result.message,
      data: result,
    }
  } catch (error) {
    return { tool: 'checkAvailability', ok: false, summary: 'Availability check failed.', error: error instanceof Error ? error.message : String(error) }
  }
}

function daysBetween(pickupAt: string, dropoffAt: string) {
  const pickup = new Date(pickupAt).getTime()
  const dropoff = new Date(dropoffAt).getTime()
  if (!Number.isFinite(pickup) || !Number.isFinite(dropoff) || dropoff <= pickup) return 0
  return Math.max(1, Math.ceil((dropoff - pickup) / (24 * 60 * 60 * 1000)))
}

async function calculatePrice(context: AgentToolContext, toolResults: AgentToolResult[]): Promise<AgentToolResult> {
  const car = firstCar(toolResults)
  const { pickupAt, dropoffAt } = parseRentalDateWindow(context.message, context.slots)
  if (!car) return { tool: 'calculatePrice', ok: false, summary: 'Pricing needs a selected car before calculating a total.' }
  if (!pickupAt || !dropoffAt) return { tool: 'calculatePrice', ok: false, summary: 'Pricing needs exact pickup and return date/time before calculating a total.' }
  const rentalDays = daysBetween(pickupAt, dropoffAt)
  const dailyPrice = Number(car.dailyPrice ?? 0)
  const deposit = Number(car.deposit ?? 0)
  const rentalSubtotal = rentalDays * dailyPrice
  return {
    tool: 'calculatePrice',
    ok: true,
    summary: `Estimated price for ${car.name}: ${rentalDays} day(s) × ${dailyPrice} = ${rentalSubtotal}. Deposit: ${deposit}.`,
    data: { car, pickupAt, dropoffAt, rentalDays, dailyPrice, rentalSubtotal, deposit, totalDueBeforeDeposit: rentalSubtotal },
  }
}

async function resolveLocationId(sb: SupabaseClient, businessId: string, value: string | null | undefined) {
  const wanted = norm(value)
  if (!wanted) return null
  const { data, error } = await sb
    .from('rental_locations')
    .select('id,name')
    .eq('business_id', businessId)
    .eq('active', true)
  if (error) throw error
  const exact = (data ?? []).find((location: { id: string; name?: string | null }) => norm(location.name) === wanted)
  const partial = (data ?? []).find((location: { id: string; name?: string | null }) => norm(location.name).includes(wanted) || wanted.includes(norm(location.name)))
  return exact?.id ?? partial?.id ?? null
}

async function createBooking(sb: SupabaseClient, context: AgentToolContext, toolResults: AgentToolResult[]): Promise<AgentToolResult> {
  const car = firstCar(toolResults)
  const availability = toolResults.find(result => result.tool === 'checkAvailability')?.data as RentalAvailabilityResult | undefined
  const { pickupAt, dropoffAt } = parseRentalDateWindow(context.message, context.slots)
  if (!car?.id) return { tool: 'createBooking', ok: false, summary: 'Booking creation needs a selected car from the live fleet.' }
  if (!pickupAt || !dropoffAt) return { tool: 'createBooking', ok: false, summary: 'Booking creation needs exact pickup and return date/time.' }
  if (!availability?.available) return { tool: 'createBooking', ok: false, summary: 'Booking was not created because availability has not been confirmed for this car and time window.' }
  if (!context.slots.name || !context.slots.phone || !context.slots.email) {
    return { tool: 'createBooking', ok: false, summary: 'Booking creation needs customer name, phone number, and email first.' }
  }
  const pickupLocationId = await resolveLocationId(sb, context.businessId, context.slots.pickup_location)
  const dropoffLocationId = await resolveLocationId(sb, context.businessId, context.slots.dropoff_location ?? context.slots.pickup_location)
  if (!pickupLocationId || !dropoffLocationId) {
    return { tool: 'createBooking', ok: false, summary: 'Booking creation needs valid pickup and drop-off locations first.' }
  }
  const totalPrice = (toolResults.find(result => result.tool === 'calculatePrice')?.data as { totalDueBeforeDeposit?: number } | undefined)?.totalDueBeforeDeposit ?? 0
  const { data, error } = await sb
    .from('rental_bookings')
    .insert({
      business_id: context.businessId,
      car_id: car.id,
      customer_name: context.slots.name,
      customer_phone: context.slots.phone,
      customer_email: context.slots.email,
      pickup_location_id: pickupLocationId,
      dropoff_location_id: dropoffLocationId,
      pickup_at: pickupAt,
      dropoff_at: dropoffAt,
      status: 'pending',
      total_price: totalPrice,
      notes: 'Created by InstantDesk AI tool after live availability check.',
      updated_at: new Date().toISOString(),
    })
    .select('id,status')
    .single()
  if (error) return { tool: 'createBooking', ok: false, summary: 'Booking creation failed.', error: error.message }
  const bookingNumber = `RB-${String(data.id).slice(0, 8).toUpperCase()}`
  return { tool: 'createBooking', ok: true, summary: `Created pending booking ${bookingNumber}.`, data: { bookingId: data.id, bookingNumber, status: data.status } }
}

async function loadBooking(sb: SupabaseClient, context: AgentToolContext) {
  const reference = bookingReference(context)
  if (!reference) return { booking: null, error: 'Booking reference is required.' }
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(reference)) {
    return { booking: null, error: 'Booking changes need the full booking id until persisted booking numbers are enabled.' }
  }
  const { data, error } = await sb
    .from('rental_bookings')
    .select('id,business_id,car_id,pickup_at,dropoff_at,status,customer_name')
    .eq('business_id', context.businessId)
    .eq('id', reference)
    .maybeSingle()
  if (error) return { booking: null, error: error.message }
  return { booking: data as { id: string; car_id: string; pickup_at: string; dropoff_at: string; status: string } | null, error: data ? null : 'Booking was not found.' }
}

async function updateBooking(sb: SupabaseClient, context: AgentToolContext, toolResults: AgentToolResult[]): Promise<AgentToolResult> {
  const loaded = await loadBooking(sb, context)
  if (loaded.error || !loaded.booking) return { tool: 'updateBooking', ok: false, summary: loaded.error ?? 'Booking was not found.' }
  const car = firstCar(toolResults)
  const { pickupAt, dropoffAt } = parseRentalDateWindow(context.message, context.slots)
  const nextCarId = car?.id ?? loaded.booking.car_id
  const nextPickupAt = pickupAt ?? loaded.booking.pickup_at
  const nextDropoffAt = dropoffAt ?? loaded.booking.dropoff_at
  try {
    const availability = await checkRentalAvailability({
      businessId: context.businessId,
      carId: nextCarId,
      pickupAt: nextPickupAt,
      dropoffAt: nextDropoffAt,
      excludeBookingId: loaded.booking.id,
    })
    if (!availability.available) {
      return { tool: 'updateBooking', ok: false, summary: 'Booking was not updated because the requested change conflicts with live availability.', data: availability }
    }
    const { data, error } = await sb
      .from('rental_bookings')
      .update({ car_id: nextCarId, pickup_at: nextPickupAt, dropoff_at: nextDropoffAt, updated_at: new Date().toISOString() })
      .eq('business_id', context.businessId)
      .eq('id', loaded.booking.id)
      .select('id,status,pickup_at,dropoff_at,car_id')
      .single()
    if (error) throw error
    return { tool: 'updateBooking', ok: true, summary: 'Booking was updated after re-checking availability.', data }
  } catch (error) {
    return { tool: 'updateBooking', ok: false, summary: 'Booking update failed.', error: error instanceof Error ? error.message : String(error) }
  }
}

async function extendBooking(sb: SupabaseClient, context: AgentToolContext): Promise<AgentToolResult> {
  const loaded = await loadBooking(sb, context)
  if (loaded.error || !loaded.booking) return { tool: 'extendBooking', ok: false, summary: loaded.error ?? 'Booking was not found.' }
  const { dropoffAt } = parseRentalDateWindow(context.message, { ...context.slots, pickup_datetime: loaded.booking.dropoff_at })
  if (!dropoffAt) return { tool: 'extendBooking', ok: false, summary: 'Extension needs the new return date/time.' }
  try {
    const availability = await checkRentalAvailability({
      businessId: context.businessId,
      carId: loaded.booking.car_id,
      pickupAt: loaded.booking.dropoff_at,
      dropoffAt,
      excludeBookingId: loaded.booking.id,
    })
    if (!availability.available) return { tool: 'extendBooking', ok: false, summary: 'Booking cannot be extended because the car is not available after the current return time.', data: availability }
    const { data, error } = await sb
      .from('rental_bookings')
      .update({ dropoff_at: dropoffAt, updated_at: new Date().toISOString() })
      .eq('business_id', context.businessId)
      .eq('id', loaded.booking.id)
      .select('id,status,dropoff_at')
      .single()
    if (error) throw error
    return { tool: 'extendBooking', ok: true, summary: 'Booking extension was saved after checking future bookings and buffer time.', data }
  } catch (error) {
    return { tool: 'extendBooking', ok: false, summary: 'Booking extension failed.', error: error instanceof Error ? error.message : String(error) }
  }
}

async function cancelBooking(sb: SupabaseClient, context: AgentToolContext): Promise<AgentToolResult> {
  const loaded = await loadBooking(sb, context)
  if (loaded.error || !loaded.booking) return { tool: 'cancelBooking', ok: false, summary: loaded.error ?? 'Booking was not found.' }
  const { data, error } = await sb
    .from('rental_bookings')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('business_id', context.businessId)
    .eq('id', loaded.booking.id)
    .select('id,status')
    .single()
  if (error) return { tool: 'cancelBooking', ok: false, summary: 'Booking cancellation failed.', error: error.message }
  return { tool: 'cancelBooking', ok: true, summary: 'Booking was cancelled according to the saved rental policy.', data }
}

async function handoverToHuman(sb: SupabaseClient, context: AgentToolContext): Promise<AgentToolResult> {
  try {
    await sb.from('handover_events').insert({
      conversation_id: context.conversationId,
      business_id: context.businessId,
      reason: 'tool_handover_requested',
      message: 'AI tool planner escalated this conversation for human review.',
    })
  } catch { /* handover event table is optional in older deployments */ }
  return { tool: 'handoverToHuman', ok: true, summary: 'Conversation should be escalated to human support.' }
}

export async function runOperationalTools(sb: SupabaseClient, context: AgentToolContext): Promise<AgentToolResult[]> {
  const planned = planOperationalTools(context)
  const results: AgentToolResult[] = []
  for (const tool of planned) {
    if (tool === 'searchFleet') results.push(await searchFleet(sb, context))
    else if (tool === 'getLocations') results.push(await getLocations(sb, context))
    else if (tool === 'getBusinessPolicies') results.push(await getBusinessPolicies(sb, context))
    else if (tool === 'checkAvailability') results.push(await checkAvailability(context, results))
    else if (tool === 'calculatePrice') results.push(await calculatePrice(context, results))
    else if (tool === 'createBooking') results.push(await createBooking(sb, context, results))
    else if (tool === 'updateBooking') results.push(await updateBooking(sb, context, results))
    else if (tool === 'extendBooking') results.push(await extendBooking(sb, context))
    else if (tool === 'cancelBooking') results.push(await cancelBooking(sb, context))
    else if (tool === 'handoverToHuman') results.push(await handoverToHuman(sb, context))
    else results.push({ tool, ok: false, summary: `${tool} is registered but not enabled for automatic execution yet.` })
  }
  return results
}

export function formatToolResultsForPrompt(results: AgentToolResult[]) {
  if (!results.length) return ''
  return results.map(result => {
    const data = result.data ? `\nData: ${JSON.stringify(result.data).slice(0, 4000)}` : ''
    const error = result.error ? `\nError: ${result.error}` : ''
    return `Tool: ${result.tool}\nStatus: ${result.ok ? 'ok' : 'failed'}\nSummary: ${result.summary}${error}${data}`
  }).join('\n\n')
}
