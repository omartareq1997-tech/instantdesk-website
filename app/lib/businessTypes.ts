export type BusinessType =
  | 'general_service'
  | 'car_rental'
  | 'real_estate'
  | 'clinic'
  | 'beauty'
  | 'repair_shop'

export type QualificationSlot = {
  key: string
  label: string
  required: boolean
  question: string
}

export type BusinessTypeConfig = {
  id: BusinessType
  label: string
  moduleName: string
  defaultPersona: string
  defaultObjective: string
  testChatExamples: string[]
  extractedFieldLabels: string[]
  qualificationSlots: QualificationSlot[]
  modulePrompt: string
  onboardingSteps: string[]
  enabledDashboardModules: string[]
}

export const CANONICAL_BUSINESS_TYPES: BusinessType[] = [
  'general_service',
  'car_rental',
  'real_estate',
  'clinic',
  'beauty',
  'repair_shop',
]

export function normalizeBusinessType(value: string | null | undefined): BusinessType {
  if (value === 'general') return 'general_service'
  if (CANONICAL_BUSINESS_TYPES.includes(value as BusinessType)) return value as BusinessType
  return 'general_service'
}

export const CAR_RENTAL_MODULE_PROMPT = `CAR RENTAL OPERATIONS MODULE
You are an AI operations assistant for a car rental company.

You can help customers with:
- car availability
- rental prices
- pickup and drop-off times
- pickup and drop-off locations
- booking confirmation
- booking extension requests
- deposit questions
- required documents
- return policy
- insurance/extras
- "where is my car?" pickup guidance

Booking behavior:
- Ask one question at a time.
- Collect pickup date/time, return date/time, pickup location, drop-off location, preferred car class, transmission, customer name, phone, and email.
- Never confirm availability from memory.
- Always call the availability checker before offering a car.
- Respect the configured cleaning/turnaround buffer.
- Do not show a car as available until the previous booking return time + buffer has passed.
- If exact car is unavailable, offer same-class alternatives first.
- If same class is unavailable, offer nearest class alternatives with clear price difference.
- If no suitable option exists, trigger human handover.

Extension behavior:
- Identify the customer's current booking.
- Check whether the same car can be extended.
- If available, calculate extra cost and prepare payment link.
- If unavailable, offer same-class alternative, then nearest-class alternative.
- Trigger handover for disputes, refund/deposit issues, document problems, or complex cases.

Document/OCR behavior:
- Collect driver license/passport/ID when needed.
- Explain that documents are used only to verify the rental.
- Extract document fields through OCR when available.
- Flag expired, missing, or low-confidence documents for human review.

Location guidance:
- If customer says "I'm here", "where do I go?", "where is my car?", or asks for airport pickup instructions, identify their booking and pickup location.
- Send the configured Google Maps pin and pickup instruction card/text.
- If location is unclear, ask one clarifying question.
- If unresolved, trigger human handover.

External booking calendar:
- If external booking API is connected, check both Instantdesk bookings and external bookings.
- Sync new confirmed bookings to the external calendar when enabled.

Fallback:
When unsure, missing data, or customer request is operationally risky, hand over to a human.`

export const BUSINESS_TYPE_CONFIG: Record<BusinessType, BusinessTypeConfig> = {
  general_service: {
    id: 'general_service',
    label: 'General service business',
    moduleName: 'Generic Assistant',
    defaultPersona: 'You are a helpful AI receptionist for this service business. Speak clearly, answer from approved information, capture useful lead details, and hand over to a human when needed.',
    defaultObjective: 'Help visitors understand the business, answer common questions, collect contact details, and route important requests to the team.',
    testChatExamples: [
      'Hi, can you help me understand your services?',
      'How can I book or request more information?',
      'Can someone contact me today?',
    ],
    extractedFieldLabels: ['Customer name', 'Phone number', 'Email address', 'Service interest', 'Preferred time', 'Notes'],
    qualificationSlots: [
      { key: 'name', label: 'Customer name', required: true, question: 'May I have your name?' },
      { key: 'phone', label: 'Phone number', required: false, question: 'What phone number should the team use?' },
      { key: 'email', label: 'Email address', required: false, question: 'What email address should the team use?' },
      { key: 'service_interest', label: 'Service interest', required: true, question: 'Which service are you interested in?' },
    ],
    modulePrompt: '',
    onboardingSteps: ['Company details', 'Services', 'Knowledge base', 'Lead capture fields'],
    enabledDashboardModules: ['overview', 'live_chat', 'pipeline', 'automation', 'settings'],
  },
  car_rental: {
    id: 'car_rental',
    label: 'Car Rental',
    moduleName: 'Car Rental Operations Assistant',
    defaultPersona: 'You are a helpful AI rental assistant for this car rental company. Speak clearly, professionally, and help customers check availability, understand pricing, complete bookings, extend rentals, and get pickup instructions.',
    defaultObjective: 'Help customers choose the right car, check real availability, collect booking details, explain rental rules, support extensions, collect required documents, and hand over to a human when needed.',
    testChatExamples: [
      'Hi, I need an automatic economy car from tomorrow 10:00 to Friday 18:00, pickup at the airport.',
      'Can I extend my booking by 2 more days?',
      "I'm at the airport, where do I go?",
      'What documents do I need to rent a car?',
    ],
    extractedFieldLabels: [
      'Pickup location',
      'Drop-off location',
      'Pickup date/time',
      'Return date/time',
      'Car class',
      'Transmission',
      'Seats',
      'Customer name',
      'Phone number',
      'Email address',
      'Extras',
      'Booking number',
      'Extension request',
    ],
    qualificationSlots: [
      { key: 'pickup_location', label: 'Pickup location', required: true, question: 'Where would you like to pick up the car?' },
      { key: 'dropoff_location', label: 'Drop-off location', required: true, question: 'Where would you like to return the car?' },
      { key: 'pickup_datetime', label: 'Pickup date/time', required: true, question: 'When do you want to pick up the car?' },
      { key: 'return_datetime', label: 'Return date/time', required: true, question: 'When will you return the car?' },
      { key: 'car_class', label: 'Car class', required: true, question: 'What car class do you prefer?' },
      { key: 'transmission', label: 'Transmission', required: false, question: 'Do you prefer automatic or manual transmission?' },
      { key: 'name', label: 'Customer name', required: true, question: 'What name should we put on the booking?' },
      { key: 'phone', label: 'Phone number', required: true, question: 'What phone number should we use for the booking?' },
      { key: 'email', label: 'Email address', required: true, question: 'What email should we send the confirmation to?' },
    ],
    modulePrompt: CAR_RENTAL_MODULE_PROMPT,
    onboardingSteps: ['Company details', 'Rental settings', 'Fleet setup', 'Pickup locations', 'Finish'],
    enabledDashboardModules: ['overview', 'live_chat', 'pipeline', 'rental_ops', 'automation', 'settings'],
  },
  real_estate: {
    id: 'real_estate',
    label: 'Real estate',
    moduleName: 'Real Estate Lead Assistant',
    defaultPersona: 'You are a professional real estate assistant. Help buyers, renters, and sellers clearly while collecting the right lead details.',
    defaultObjective: 'Qualify real estate inquiries, understand location, budget, property interest, timing, and contact details, then route qualified leads to the team.',
    testChatExamples: [
      "Hi, I'm looking for a 2-bedroom flat in Krakow.",
      'I need to rent an apartment, budget 3500 PLN.',
      'My name is Adam and I want to buy a house.',
    ],
    extractedFieldLabels: ['City / Location', 'Rent or Buy', 'Property Type', 'Number of Rooms', 'Budget', 'Full Name', 'Phone Number', 'Email Address', 'Preferred Viewing Time'],
    qualificationSlots: [
      { key: 'city', label: 'City / Location', required: true, question: 'Which city or area are you looking in?' },
      { key: 'deal_type', label: 'Rent or Buy', required: true, question: 'Are you looking to rent or buy?' },
      { key: 'property_type', label: 'Property Type', required: true, question: 'What type of property are you looking for?' },
      { key: 'rooms', label: 'Number of Rooms', required: true, question: 'How many rooms or bedrooms do you need?' },
      { key: 'budget', label: 'Budget', required: true, question: 'What is your budget?' },
      { key: 'name', label: 'Full Name', required: true, question: 'May I have your full name?' },
      { key: 'phone', label: 'Phone Number', required: false, question: 'What phone number should the team use?' },
      { key: 'email', label: 'Email Address', required: false, question: 'What email address should the team use?' },
      { key: 'viewing_time', label: 'Preferred Viewing Time', required: false, question: 'When would you prefer a viewing?' },
    ],
    modulePrompt: '',
    onboardingSteps: ['Company details', 'Listings/services', 'Lead fields', 'Viewing rules'],
    enabledDashboardModules: ['overview', 'live_chat', 'pipeline', 'appointments', 'automation', 'settings'],
  },
  clinic: {
    id: 'clinic',
    label: 'Clinic',
    moduleName: 'Clinic Reception Assistant',
    defaultPersona: 'You are a calm clinic reception assistant. Help patients understand services and route sensitive medical questions to staff.',
    defaultObjective: 'Capture patient inquiries, preferred appointment timing, contact details, and hand over anything clinical or urgent.',
    testChatExamples: ['Do you have appointments this week?', 'What services do you offer?', 'Can someone call me back?'],
    extractedFieldLabels: ['Patient name', 'Phone number', 'Email address', 'Service interest', 'Preferred appointment time'],
    qualificationSlots: [
      { key: 'name', label: 'Patient name', required: true, question: 'May I have your name?' },
      { key: 'service_interest', label: 'Service interest', required: true, question: 'Which service are you asking about?' },
      { key: 'phone', label: 'Phone number', required: true, question: 'What phone number should the clinic use?' },
    ],
    modulePrompt: '',
    onboardingSteps: ['Clinic details', 'Services', 'Appointment rules', 'Handover rules'],
    enabledDashboardModules: ['overview', 'live_chat', 'pipeline', 'appointments', 'settings'],
  },
  beauty: {
    id: 'beauty',
    label: 'Beauty salon',
    moduleName: 'Beauty Salon Assistant',
    defaultPersona: 'You are a friendly salon assistant. Help clients choose services, understand pricing basics, and request appointments.',
    defaultObjective: 'Capture service interest, preferred date/time, contact details, and hand over custom pricing or sensitive requests.',
    testChatExamples: ['Do you have time for balayage this week?', 'How much is a haircut?', 'Can I book for Saturday?'],
    extractedFieldLabels: ['Client name', 'Phone number', 'Service', 'Preferred date/time', 'Notes'],
    qualificationSlots: [
      { key: 'service', label: 'Service', required: true, question: 'Which service would you like?' },
      { key: 'preferred_time', label: 'Preferred date/time', required: true, question: 'When would you like to come in?' },
      { key: 'phone', label: 'Phone number', required: true, question: 'What phone number should the salon use?' },
    ],
    modulePrompt: '',
    onboardingSteps: ['Salon details', 'Services', 'Booking rules', 'Review requests'],
    enabledDashboardModules: ['overview', 'live_chat', 'pipeline', 'appointments', 'settings'],
  },
  repair_shop: {
    id: 'repair_shop',
    label: 'Repair shop',
    moduleName: 'Repair Shop Assistant',
    defaultPersona: 'You are a practical repair shop assistant. Help customers describe the issue, capture urgency, and route jobs to the team.',
    defaultObjective: 'Collect customer contact details, issue description, preferred timing, and hand over urgent or complex cases.',
    testChatExamples: ['My car will not start, can you help?', 'Do you repair brakes?', 'Can I bring it tomorrow morning?'],
    extractedFieldLabels: ['Customer name', 'Phone number', 'Issue type', 'Vehicle/item details', 'Urgency', 'Preferred time'],
    qualificationSlots: [
      { key: 'issue_type', label: 'Issue type', required: true, question: 'What needs repairing?' },
      { key: 'urgency', label: 'Urgency', required: false, question: 'How urgent is the issue?' },
      { key: 'phone', label: 'Phone number', required: true, question: 'What phone number should the team use?' },
    ],
    modulePrompt: '',
    onboardingSteps: ['Shop details', 'Services', 'Intake fields', 'Handover rules'],
    enabledDashboardModules: ['overview', 'live_chat', 'pipeline', 'appointments', 'settings'],
  },
}

export function getBusinessTypeConfig(value: string | null | undefined): BusinessTypeConfig {
  return BUSINESS_TYPE_CONFIG[normalizeBusinessType(value)]
}
