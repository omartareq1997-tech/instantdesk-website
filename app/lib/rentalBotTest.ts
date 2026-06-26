import { buildAgentSystemPrompt } from './agentPrompt'
import {
  checkCarAvailability,
  demoRentalBookings,
  demoRentalCars,
  demoRentalLocations,
  demoRentalSettings,
  type AvailabilityMatch,
  type AvailabilityRequest,
  type RentalBooking,
} from './rental'

export type RentalTestScenario =
  | 'normal_faq'
  | 'availability'
  | 'booking_confirmation'
  | 'extension'
  | 'document_ocr'
  | 'location'
  | 'location_unresolved'
  | 'handover'

export type RentalBotTestResult = {
  finalSystemPrompt: string
  extractedIntent: string
  extractedBookingFields: Record<string, string | number | null>
  toolCallsMade: string[]
  availabilityResult: AvailabilityMatch[]
  selectedFallbackPath: string
  handoverStatus: 'none' | 'recommended' | 'triggered'
  reply: string
}

function tomorrowAt(hour: number, minute = 0) {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

function addDays(value: string, days: number) {
  const date = new Date(value)
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

export function extractRentalIntent(message: string): string {
  const text = message.toLowerCase()
  if (/extend|extension|keep.*car|longer/.test(text)) return 'booking_extension'
  if (/where.*car|where do i go|i'?m here|pickup location|airport terminal/.test(text)) return 'location_guidance'
  if (/document|license|licence|passport|id\b|ocr/.test(text)) return 'document_collection'
  if (/discount|refund|deposit problem|angry|complaint|manager/.test(text)) return 'human_handover'
  if (/confirm|book|reserve/.test(text)) return 'booking_confirmation'
  if (/available|availability|automatic|manual|suv|van|economy|pickup|drop.?off/.test(text)) return 'availability_check'
  return 'normal_faq'
}

export function extractRentalBookingFields(message: string): Record<string, string | number | null> {
  const text = message.toLowerCase()
  const carClass = /economy plus/.test(text) ? 'Economy Plus' : /suv plus/.test(text) ? 'SUV Plus' : /van/.test(text) ? 'Van' : /suv/.test(text) ? 'SUV' : /economy/.test(text) ? 'Economy' : null
  const transmission = /automatic/.test(text) ? 'automatic' : /manual/.test(text) ? 'manual' : null
  const pickupLocation = /airport|terminal/.test(text) ? 'Krakow Airport Terminal 1' : /city/.test(text) ? 'City Center' : null
  const bookingNumber = message.match(/\bCR-\d{4}\b/i)?.[0]?.toUpperCase() ?? null
  return {
    pickupDateTime: tomorrowAt(12, 30),
    returnDateTime: tomorrowAt(16, 0),
    pickupLocation,
    dropoffLocation: pickupLocation,
    carClass,
    transmission,
    customerName: /marta/i.test(message) ? 'Marta Nowak' : null,
    phone: message.match(/\+?\d[\d\s-]{6,}/)?.[0] ?? null,
    email: message.match(/[^\s@]+@[^\s@]+\.[^\s@]+/)?.[0] ?? null,
    bookingNumber,
  }
}

export function checkRentalExtension(bookingNumber = 'CR-1024') {
  const booking = demoRentalBookings.find(item => item.bookingNumber === bookingNumber)
  if (!booking) {
    return {
      booking: null,
      sameCarAvailable: false,
      extraCost: 0,
      alternatives: [] as AvailabilityMatch[],
      handover: true,
    }
  }

  const requestedReturn = addDays(booking.returnAt, 1)
  const otherBookings = demoRentalBookings.filter(item => item.id !== booking.id)
  const sameCar = demoRentalCars.find(car => car.id === booking.carId)
  const sameCarAvailable = sameCar
    ? checkCarAvailability({
      pickupDateTime: booking.returnAt,
      returnDateTime: requestedReturn,
      carClass: sameCar.className,
      transmission: sameCar.transmission ?? undefined,
      seats: sameCar.seats ?? undefined,
    }, [sameCar], otherBookings, demoRentalSettings.cleaningBufferMinutes).length > 0
    : false

  const alternatives = sameCarAvailable
    ? []
    : checkCarAvailability({
      pickupDateTime: booking.returnAt,
      returnDateTime: requestedReturn,
      carClass: booking.carClass ?? undefined,
    }, demoRentalCars.filter(car => car.id !== booking.carId), otherBookings, demoRentalSettings.cleaningBufferMinutes)

  return {
    booking,
    sameCarAvailable,
    extraCost: sameCar ? sameCar.dailyPrice : 0,
    alternatives,
    handover: alternatives.length === 0,
  }
}

export function resolvePickupInstructions(bookingNumber: string | null) {
  if (!bookingNumber) {
    return { booking: null, location: null, handover: true, clarificationNeeded: true }
  }
  const booking = demoRentalBookings.find(item => item.bookingNumber === bookingNumber)
  if (!booking) return { booking: null, location: null, handover: true, clarificationNeeded: false }
  const location = demoRentalLocations.find(item => item.name === booking.pickupLocation) ?? null
  return { booking, location, handover: !location, clarificationNeeded: false }
}

export function buildRentalTestPrompt() {
  return buildAgentSystemPrompt({
    businessType: 'car_rental',
    config: {
      persona: 'You are a calm, operationally precise rental desk assistant.',
      objective: 'Help customers check availability, complete rental bookings, resolve pickup questions, and hand over risky cases.',
      tone: 'professional',
      fallback_msg: 'I need a rental specialist to review this before confirming anything. I will hand this over now.',
      model: 'gpt-4o',
      temperature: 0.4,
    },
    knowledgeText: 'Demo fleet classes: Economy, SUV, Van. Demo airport pickup uses Terminal 1 arrivals, exit 2.',
    collectedData: ['Customer message is being tested in Bot End-to-End Test.'],
    missingFields: [{ label: 'pickup date/time', required: true }, { label: 'return date/time', required: true }],
    stage: 'rental_test',
  })
}

export function runRentalBotTest(scenario: RentalTestScenario, customMessage?: string): RentalBotTestResult {
  const message = customMessage || {
    normal_faq: 'What documents do I need to rent a car?',
    availability: 'Do you have an automatic Economy car from the airport tomorrow?',
    booking_confirmation: 'I want to book an automatic SUV tomorrow from the airport.',
    extension: 'Can I extend booking CR-1024 by one more day?',
    document_ocr: 'I need to upload my driver license.',
    location: "I'm here for booking CR-1024. Where is my car?",
    location_unresolved: "I'm here, where do I go?",
    handover: 'I want a refund and I am angry about my deposit.',
  }[scenario]

  const intent = scenario === 'location_unresolved' ? 'location_guidance' : extractRentalIntent(message)
  const fields = extractRentalBookingFields(message)
  const toolCallsMade: string[] = []
  let availabilityResult: AvailabilityMatch[] = []
  let selectedFallbackPath = 'none'
  let handoverStatus: RentalBotTestResult['handoverStatus'] = 'none'
  let reply = 'I can help with that. What would you like to do next?'

  if (intent === 'availability_check' || intent === 'booking_confirmation') {
    toolCallsMade.push('checkCarAvailability')
    const request: AvailabilityRequest = {
      pickupDateTime: String(fields.pickupDateTime),
      returnDateTime: String(fields.returnDateTime),
      pickupLocation: fields.pickupLocation ? String(fields.pickupLocation) : undefined,
      dropoffLocation: fields.dropoffLocation ? String(fields.dropoffLocation) : undefined,
      carClass: fields.carClass ? String(fields.carClass) : 'Economy',
      transmission: fields.transmission ? String(fields.transmission) : undefined,
    }
    availabilityResult = checkCarAvailability(request, demoRentalCars, demoRentalBookings, demoRentalSettings.cleaningBufferMinutes)
    selectedFallbackPath = availabilityResult.length ? availabilityResult[0].matchType : 'handover_no_availability'
    handoverStatus = availabilityResult.length ? 'none' : 'triggered'
    reply = availabilityResult.length
      ? `I found ${availabilityResult[0].car.name} as a ${availabilityResult[0].matchType.replace(/_/g, ' ')}. I still need your name, phone, and email before confirming.`
      : 'I cannot find a suitable car for that window, so I will hand this to the rental team.'
  } else if (intent === 'booking_extension') {
    toolCallsMade.push('checkExtensionAvailability', 'checkCarAvailability')
    const extension = checkRentalExtension(String(fields.bookingNumber ?? 'CR-1024'))
    availabilityResult = extension.alternatives
    selectedFallbackPath = extension.sameCarAvailable ? 'same_car_extension' : extension.alternatives.length ? extension.alternatives[0].matchType : 'handover_extension_unavailable'
    handoverStatus = extension.handover ? 'triggered' : 'recommended'
    reply = extension.sameCarAvailable
      ? `The same car can be extended. Extra cost is ${extension.extraCost} zł. I can prepare a payment link.`
      : extension.alternatives.length
        ? `The same car is not available for extension. I can offer ${extension.alternatives[0].car.name} as an alternative.`
        : 'No suitable extension option is available, so I will hand this over.'
  } else if (intent === 'location_guidance') {
    toolCallsMade.push('resolvePickupInstructions')
    const location = resolvePickupInstructions(fields.bookingNumber ? String(fields.bookingNumber) : null)
    selectedFallbackPath = location.location ? 'location_instruction' : location.clarificationNeeded ? 'ask_booking_number' : 'handover_location_unresolved'
    handoverStatus = location.location ? 'none' : 'triggered'
    reply = location.location
      ? `${location.location.whatsappText} Instructions: ${location.location.terminalInstructions}`
      : location.clarificationNeeded
        ? 'Could you send your booking number so I can find the correct pickup instructions?'
        : 'I cannot identify the pickup location, so I will hand this over to the team.'
  } else if (intent === 'document_collection') {
    toolCallsMade.push('collectRentalDocument', 'ocrPlaceholder')
    selectedFallbackPath = 'human_review_if_low_confidence'
    handoverStatus = 'recommended'
    reply = 'Please upload your driver license, passport, or ID. We use it only to verify the rental, and low-confidence OCR will be reviewed by a human.'
  } else if (intent === 'human_handover') {
    selectedFallbackPath = 'operational_risk_handover'
    handoverStatus = 'triggered'
    reply = 'This involves a sensitive rental issue, so I will hand this over to a human specialist.'
  } else {
    reply = 'For rentals, we usually need a valid driver license or passport/ID, the booking details, and deposit/payment confirmation before pickup.'
  }

  return {
    finalSystemPrompt: buildRentalTestPrompt(),
    extractedIntent: intent,
    extractedBookingFields: fields,
    toolCallsMade,
    availabilityResult,
    selectedFallbackPath,
    handoverStatus,
    reply,
  }
}
