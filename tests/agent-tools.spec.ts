import { expect, test } from './fixtures'
import { planOperationalTools } from '../app/lib/agent-tools'
import { parseRentalDateWindow } from '../app/lib/rentalDateTime'
import { extractRentalVehicleName } from '../app/lib/rentalVehicle'
import { __testRentalChatHelpers } from '../app/api/chat/route'

test.describe('agent operational tool planner', () => {
  const warsawDate = (date: Date) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Warsaw',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const get = (type: string) => parts.find(part => part.type === type)?.value ?? ''
    return `${get('year')}-${get('month')}-${get('day')}`
  }

  const baseContext = {
    businessId: 'business-1',
    businessType: 'car_rental',
    conversationId: 'conversation-1',
    slots: {},
  }

  test('plans fleet search for inventory questions', () => {
    const tools = planOperationalTools({
      ...baseContext,
      message: 'What automatic SUVs do you have in Krakow?',
    })
    expect(tools).toContain('searchFleet')
  })

  test('plans live availability check for exact rental windows', () => {
    const tools = planOperationalTools({
      ...baseContext,
      slots: {
        selected_vehicle: 'Toyota Corolla',
        pickup_location: 'Kraków Bocheńska 2a',
        dropoff_location: 'Kraków Bocheńska 2a',
        pickup_datetime: '2026-07-02T10:00:00+02:00',
        return_datetime: '2026-07-03T18:00:00+02:00',
      },
      message: 'Is Toyota Corolla available from tomorrow 10:00 until Friday 18:00?',
    })
    expect(tools).toContain('searchFleet')
    expect(tools).toContain('checkAvailability')
  })

  test('checks availability for exact car requests once period and locations are known', () => {
    const tools = planOperationalTools({
      ...baseContext,
      slots: {
        selected_vehicle: 'Toyota Corolla',
        pickup_location: 'Kraków Bocheńska 2a',
        dropoff_location: 'Kraków Bocheńska 2a',
        pickup_datetime: '2026-07-02T10:00:00+02:00',
        return_datetime: '2026-07-03T18:00:00+02:00',
      },
      message: 'Please book Toyota Corolla in Krakow from tomorrow 10:00 until Friday 18:00.',
    })
    expect(tools).toContain('searchFleet')
    expect(tools).toContain('checkAvailability')
    expect(tools).not.toContain('createBooking')
  })

  test('plans policy and location lookups separately', () => {
    expect(planOperationalTools({ ...baseContext, message: 'What documents and deposit do I need?' })).toContain('getBusinessPolicies')
    expect(planOperationalTools({ ...baseContext, message: 'Can I pick up at the airport?' })).toContain('getLocations')
    expect(planOperationalTools({ ...baseContext, message: 'what is your pickup location?' })).toContain('getLocations')
  })

  test('does not plan rental tools for other verticals', () => {
    const tools = planOperationalTools({
      ...baseContext,
      businessType: 'restaurant',
      message: 'Is a table available tomorrow?',
    })
    expect(tools).toEqual([])
  })

  test('plans booking creation only through fleet and availability checks first', () => {
    const tools = planOperationalTools({
      ...baseContext,
      slots: {
        name: 'Alex',
        phone: '510880999',
        email: 'alex@example.com',
        selected_vehicle: 'Toyota Corolla',
        pickup_location: 'Kraków Bocheńska 2a',
        dropoff_location: 'Kraków Bocheńska 2a',
        pickup_datetime: '2026-07-02T10:00:00+02:00',
        return_datetime: '2026-07-03T18:00:00+02:00',
      },
      message: 'Please book the Toyota Corolla from tomorrow 10:00 until Friday 18:00.',
    })
    expect(tools.indexOf('searchFleet')).toBeLessThan(tools.indexOf('checkAvailability'))
    expect(tools.indexOf('checkAvailability')).toBeLessThan(tools.indexOf('createBooking'))
  })

  test('plans booking mutation tools for existing booking intents', () => {
    expect(planOperationalTools({ ...baseContext, message: 'Cancel booking 11111111-1111-4111-8111-111111111111' })).toContain('cancelBooking')
    expect(planOperationalTools({ ...baseContext, message: 'Extend booking 11111111-1111-4111-8111-111111111111 until Friday 18:00' })).toContain('extendBooking')
    expect(planOperationalTools({ ...baseContext, message: 'Change booking 11111111-1111-4111-8111-111111111111 to tomorrow 10:00' })).toContain('updateBooking')
  })

  test('parses tomorrow-to-Friday rental windows', () => {
    const parsed = parseRentalDateWindow(
      'I need to rent a Toyota Corolla in Krakow from tomorrow 10:00 until Friday 18:00.',
      {},
      new Date('2026-07-01T12:00:00+02:00'),
    )
    expect(parsed.pickupAt).toBeTruthy()
    expect(parsed.dropoffAt).toBeTruthy()
    expect(new Date(parsed.dropoffAt!).getTime()).toBeGreaterThan(new Date(parsed.pickupAt!).getTime())
  })

  test('does not invent a vehicle or rental window from a bare tomorrow rental intent', () => {
    const parsed = parseRentalDateWindow(
      'I want to rent a car tomorrow',
      {},
      new Date('2026-07-01T12:00:00+02:00'),
    )
    expect(parsed.pickupAt).toBeNull()
    expect(parsed.dropoffAt).toBeNull()
    const tools = planOperationalTools({
      ...baseContext,
      message: 'I want to rent a car tomorrow',
    })
    expect(tools).not.toContain('checkAvailability')
    expect(tools).not.toContain('createBooking')
  })

  test('requires locations before checking availability', () => {
    const tools = planOperationalTools({
      ...baseContext,
      slots: {
        selected_vehicle: 'Toyota Corolla',
        pickup_datetime: '2026-07-02T10:00:00+02:00',
        return_datetime: '2026-07-09T22:00:00+02:00',
      },
      message: 'Is Toyota Corolla available from tomorrow 10:00 until 09/07/2026 22:00?',
    })
    expect(tools).toContain('searchFleet')
    expect(tools).not.toContain('checkAvailability')
  })

  test('does not create a booking when the final location is provided without explicit booking confirmation', () => {
    const tools = planOperationalTools({
      ...baseContext,
      slots: {
        name: 'Alex',
        phone: '510880999',
        email: 'alex@example.com',
        selected_vehicle: 'BMW X5',
        pickup_location: 'Kraków Bocheńska 2a',
        dropoff_location: 'Kraków Bocheńska 2a',
        pickup_datetime: '2026-07-02T10:00:00+02:00',
        return_datetime: '2026-07-09T22:00:00+02:00',
      },
      message: 'drop off same location',
    })
    expect(tools).toContain('checkAvailability')
    expect(tools).not.toContain('createBooking')
  })

  test('plans booking creation only after explicit confirmation with complete required state', () => {
    const tools = planOperationalTools({
      ...baseContext,
      slots: {
        name: 'Alex',
        phone: '510880999',
        email: 'alex@example.com',
        selected_vehicle: 'BMW X5',
        pickup_location: 'Kraków Bocheńska 2a',
        dropoff_location: 'Kraków Bocheńska 2a',
        pickup_datetime: '2026-07-02T10:00:00+02:00',
        return_datetime: '2026-07-09T22:00:00+02:00',
      },
      message: 'please book it',
    })
    expect(tools).toContain('searchFleet')
    expect(tools).toContain('checkAvailability')
    expect(tools).toContain('createBooking')
  })

  test('does not create a booking when customer name is missing despite confirmation', () => {
    const tools = planOperationalTools({
      ...baseContext,
      slots: {
        phone: '520555000',
        email: 'sam@test.com',
        selected_vehicle: 'BMW X5',
        pickup_location: 'Kraków Bocheńska 2a',
        dropoff_location: 'Kraków Bocheńska 2a',
        pickup_datetime: '2026-07-03T11:00:00+02:00',
        return_datetime: '2026-07-08T21:00:00+02:00',
      },
      message: 'yes please',
    })
    expect(tools).not.toContain('createBooking')
  })

  test('does not create a booking when drop-off location is missing despite confirmation', () => {
    const tools = planOperationalTools({
      ...baseContext,
      slots: {
        name: 'Sam Marty',
        phone: '520555000',
        email: 'sam@test.com',
        selected_vehicle: 'BMW X5',
        pickup_location: 'Kraków Bocheńska 2a',
        pickup_datetime: '2026-07-03T11:00:00+02:00',
        return_datetime: '2026-07-08T21:00:00+02:00',
      },
      message: 'yes please',
    })
    expect(tools).not.toContain('checkAvailability')
    expect(tools).not.toContain('createBooking')
  })

  test('booking confirmation with missing locations fetches locations and does not call createBooking', () => {
    const tools = planOperationalTools({
      ...baseContext,
      slots: {
        selected_vehicle: 'Skoda Superb',
        pickup_datetime: '2026-07-09T20:00:00+02:00',
        return_datetime: '2026-07-12T21:00:00+02:00',
        name: 'Justyna',
        phone: '510 555 444',
        email: 'justyna@gmail.com',
      },
      message: 'yes please',
    })
    expect(tools).toContain('getLocations')
    expect(tools).not.toContain('createBooking')
  })

  test('parses tomorrow and explicit July return dates as business-time ISO values', () => {
    const parsed = parseRentalDateWindow(
      'I want to pick up tomorrow at 9am and return on 9 July at 10pm.',
      {},
      new Date('2026-07-01T12:00:00+02:00'),
    )
    expect(parsed.pickupAt).toContain('2026-07-02T09:00:00')
    expect(parsed.dropoffAt).toContain('2026-07-09T22:00:00')
  })

  test('parses corrected numeric return dates as business-time ISO values', () => {
    const parsed = parseRentalDateWindow(
      'Pickup tomorrow 10:00 and return 09/07/2026 22:00.',
      {},
      new Date('2026-07-01T12:00:00+02:00'),
    )
    expect(parsed.pickupAt).toContain('2026-07-02T10:00:00')
    expect(parsed.dropoffAt).toContain('2026-07-09T22:00:00')
  })

  test('extracts selected rental vehicle models from customer messages', () => {
    expect(extractRentalVehicleName('I want the BMW X5 please')).toBe('BMW X5')
    expect(extractRentalVehicleName('Please reserve Corolla for me')).toBe('Toyota Corolla')
    expect(extractRentalVehicleName("I'll go with the X5")).toBe('BMW X5')
    expect(extractRentalVehicleName('I will take the Mercedes')).toBe('Mercedes GLC')
    expect(extractRentalVehicleName('Mercedes GLC')).toBe('Mercedes GLC')
    expect(extractRentalVehicleName('book the GLC for me')).toBe('Mercedes GLC')
  })

  test('selected Mercedes continues booking workflow and checks availability when period and locations are known', () => {
    const tools = planOperationalTools({
      ...baseContext,
      slots: {
        selected_vehicle: 'Mercedes GLC',
        car_class: 'SUV',
        transmission: 'automatic',
        pickup_location: 'Kraków Bocheńska 2a',
        dropoff_location: 'Kraków Bocheńska 2a',
        pickup_datetime: '2026-07-02T10:00:00+02:00',
        return_datetime: '2026-07-09T21:00:00+02:00',
      },
      message: 'I will take the Mercedes',
    })
    expect(tools).toContain('searchFleet')
    expect(tools).toContain('checkAvailability')
    expect(tools).not.toContain('createBooking')
  })

  test('complete selected vehicle state checks availability and price before final confirmation', () => {
    const tools = planOperationalTools({
      ...baseContext,
      slots: {
        name: 'Alex',
        phone: '510880999',
        email: 'alex@example.com',
        selected_vehicle: 'Mercedes GLC',
        car_class: 'SUV',
        transmission: 'automatic',
        pickup_location: 'Kraków Bocheńska 2a',
        dropoff_location: 'Kraków Bocheńska 2a',
        pickup_datetime: '2026-07-02T10:00:00+02:00',
        return_datetime: '2026-07-09T21:00:00+02:00',
      },
      message: 'My email is alex@example.com',
    })
    expect(tools).toContain('searchFleet')
    expect(tools).toContain('checkAvailability')
    expect(tools).toContain('calculatePrice')
    expect(tools).not.toContain('createBooking')
  })

  test('explicit confirmation with complete Mercedes state creates only after availability and price', () => {
    const tools = planOperationalTools({
      ...baseContext,
      slots: {
        name: 'Alex',
        phone: '510880999',
        email: 'alex@example.com',
        selected_vehicle: 'Mercedes GLC',
        car_class: 'SUV',
        transmission: 'automatic',
        pickup_location: 'Kraków Bocheńska 2a',
        dropoff_location: 'Kraków Bocheńska 2a',
        pickup_datetime: '2026-07-02T10:00:00+02:00',
        return_datetime: '2026-07-09T21:00:00+02:00',
      },
      message: 'yes, book it',
    })
    expect(tools.indexOf('searchFleet')).toBeLessThan(tools.indexOf('checkAvailability'))
    expect(tools.indexOf('checkAvailability')).toBeLessThan(tools.indexOf('calculatePrice'))
    expect(tools.indexOf('calculatePrice')).toBeLessThan(tools.indexOf('createBooking'))
  })

  test('economy intent searches fleet without selecting BMW X5 or checking availability', () => {
    const tools = planOperationalTools({
      ...baseContext,
      message: 'I want an economical car',
    })
    expect(tools).toContain('searchFleet')
    expect(tools).not.toContain('checkAvailability')
    expect(tools).not.toContain('createBooking')
  })

  test('economy intent with a confirmed period and locations checks live availability before offering cars', () => {
    const tools = planOperationalTools({
      ...baseContext,
      slots: {
        car_class: 'economy',
        pickup_location: 'Kraków Bocheńska 2a',
        dropoff_location: 'Kraków Bocheńska 2a',
        pickup_datetime: '2026-07-02T15:00:00+02:00',
        return_datetime: '2026-07-10T17:00:00+02:00',
      },
      message: 'I want an economical car',
    })
    expect(tools).toContain('searchFleet')
    expect(tools).toContain('checkAvailability')
    expect(tools).not.toContain('createBooking')
  })

  test('reuses previously stored ISO pickup and return slot values', () => {
    const parsed = parseRentalDateWindow('My email is alex@example.com', {
      pickup_datetime: '2026-07-02T09:00:00+02:00',
      return_datetime: '2026-07-09T22:00:00+02:00',
    })
    expect(parsed.pickupAt).toBe('2026-07-02T09:00:00+02:00')
    expect(parsed.dropoffAt).toBe('2026-07-09T22:00:00+02:00')
  })

  test('merges exact production partial date then time rental transcript into canonical datetimes', () => {
    const today = warsawDate(new Date())
    const first = __testRentalChatHelpers.buildConfirmedSlots(
      null,
      [],
      'yes, i want to rent a car today until 12/07',
    )
    expect(first.pickup_date).toBe(today)
    expect(first.return_date).toBe('2026-07-12')
    expect(first.pickup_datetime).toBeNull()
    expect(first.return_datetime).toBeNull()

    const merged = __testRentalChatHelpers.buildConfirmedSlots(
      { id: 'lead-1', name: null, phone: null, email: null, interest: null, status: null, metadata: first as any },
      [],
      'pick at 20:00 return at 21:00',
    )
    expect(merged.pickup_datetime).toBe(`${today}T20:00:00+02:00`)
    expect(merged.return_datetime).toBe('2026-07-12T21:00:00+02:00')
  })

  test('selected vehicle preserves known rental datetimes and does not ask for dates again', () => {
    const slots = __testRentalChatHelpers.buildConfirmedSlots(
      {
        id: 'lead-1',
        name: null,
        phone: null,
        email: null,
        interest: null,
        status: null,
        metadata: {
          pickup_location: 'Kraków Bocheńska 2a',
          dropoff_location: 'Kraków Bocheńska 2a',
          pickup_datetime: '2026-07-08T20:00:00+02:00',
          return_datetime: '2026-07-12T21:00:00+02:00',
          car_class: 'economy',
        },
      },
      [],
      'im interested in toyota camry',
    )
    expect(slots.selected_vehicle).toBe('Toyota Camry')
    expect(slots.pickup_datetime).toBe('2026-07-08T20:00:00+02:00')
    expect(slots.return_datetime).toBe('2026-07-12T21:00:00+02:00')
    const reply = __testRentalChatHelpers.rentalToolReplyOverride(
      [
        { tool: 'searchFleet', ok: true, summary: 'Found Toyota Camry.', data: { cars: [{ id: 'camry-1', name: 'Toyota Camry', className: 'Economy', transmission: 'automatic', dailyPrice: 160 }], requestedCar: { id: 'camry-1', name: 'Toyota Camry', transmission: 'automatic', dailyPrice: 160 }, availabilityFiltered: true } },
        { tool: 'checkAvailability', ok: true, summary: 'Toyota Camry is available.', data: { available: true, requestedCar: { id: 'camry-1', name: 'Toyota Camry' }, availableCars: [] } },
      ],
      slots,
      [
        { key: 'name', label: 'Name', question: 'Could you please provide your name?', required: true },
        { key: 'phone', label: 'Phone', question: 'What is your phone number?', required: true },
        { key: 'email', label: 'Email', question: 'What is your email address?', required: true },
      ],
      'car_rental',
      'im interested in toyota camry',
    ) ?? ''
    expect(reply).toContain('The Toyota Camry is available')
    expect(reply).not.toMatch(/pickup date|return date|what .*date/i)
  })

  test('availability-filtered class search lists only verified available cars', () => {
    const reply = __testRentalChatHelpers.rentalToolReplyOverride(
      [
        {
          tool: 'searchFleet',
          ok: true,
          summary: 'Found 2 matching available fleet vehicle(s). Unavailable for that period: Toyota Corolla.',
          data: {
            availabilityFiltered: true,
            unavailableCars: ['Toyota Corolla'],
            cars: [
              { name: 'Skoda Superb', className: 'Economy', transmission: 'automatic', dailyPrice: 150 },
              { name: 'Toyota Camry', className: 'Economy', transmission: 'automatic', dailyPrice: 160 },
            ],
          },
        },
      ],
      {
        car_class: 'economy',
        pickup_location: 'Kraków Bocheńska 2a',
        dropoff_location: 'Kraków Bocheńska 2a',
        pickup_datetime: '2026-07-08T20:00:00+02:00',
        return_datetime: '2026-07-12T21:00:00+02:00',
      } as any,
      [{ key: 'selected_vehicle', label: 'Selected vehicle', question: 'Which vehicle would you like?', required: true }],
      'car_rental',
      'im looking for economy',
    ) ?? ''
    expect(reply).toContain('These cars are available for your rental period')
    expect(reply).toContain('Skoda Superb')
    expect(reply).toContain('Toyota Camry')
    expect(reply).not.toContain('Toyota Corolla')
    expect(reply).not.toContain('matching cars from the live fleet')
  })

  test('detects likely mid-sentence provider output for Gemini diagnostics', () => {
    expect(__testRentalChatHelpers.looksMidSentence("Okay, so that's pickup today at")).toBe(true)
    expect(__testRentalChatHelpers.looksMidSentence('The Toyota Camry is available for that rental period.')).toBe(false)
  })

  test('keeps stored dates when user confirms drop off same location', () => {
    const parsed = parseRentalDateWindow('drop off same location', {
      pickup_datetime: '2026-07-02T10:00:00+02:00',
      return_datetime: '2026-07-09T22:00:00+02:00',
    })
    expect(parsed.pickupAt).toBe('2026-07-02T10:00:00+02:00')
    expect(parsed.dropoffAt).toBe('2026-07-09T22:00:00+02:00')
  })

  test('ignores pickup/drop-off location labels when parsing complete booking dates', () => {
    const parsed = parseRentalDateWindow(
      'Please book Toyota Corolla. Pickup location Kraków Bocheńska 2a. Drop-off location Kraków Bocheńska 2a. Pick up 16 July at 9am and return 18 July at 10pm.',
      {},
      new Date('2026-07-01T12:00:00+02:00'),
    )
    expect(parsed.pickupAt).toContain('2026-07-16T09:00:00')
    expect(parsed.dropoffAt).toContain('2026-07-18T22:00:00')
  })

  test('extracts plain full name when assistant asked for customer name', () => {
    const slots = __testRentalChatHelpers.buildConfirmedSlots(
      null,
      [{ role: 'assistant', content: 'What is your full name?' }],
      'Sam Marty',
    )
    expect(slots.name).toBe('Sam Marty')
  })

  test('accepts and preserves single-word customer name from canonical conversation state', () => {
    const slots = __testRentalChatHelpers.buildConfirmedSlots(
      { id: 'lead-1', name: null, phone: '510 555 444', email: 'justyna@gmail.com', interest: null, status: null, metadata: {} },
      [],
      'what pickup locations do you have?',
      { name: 'Justyna', selected_vehicle: 'Skoda Superb' },
    )
    expect(slots.name).toBe('Justyna')
    expect(slots.phone).toBe('510 555 444')
    expect(slots.email).toBe('justyna@gmail.com')
    expect(slots.selected_vehicle).toBe('Skoda Superb')
  })

  test('hydrates canonical state from conversation metadata after reconnect or inactivity', () => {
    const slots = __testRentalChatHelpers.slotsFromConversationAgentState({
      agent_state: {
        slots: {
          name: 'Justyna',
          phone: '510555444',
          email: 'justyna@gmail.com',
          selected_vehicle: 'Skoda Superb',
          pickup_datetime: '2026-07-09T20:00:00+02:00',
          return_datetime: '2026-07-12T21:00:00+02:00',
        },
      },
    })
    expect(slots.name).toBe('Justyna')
    expect(slots.selected_vehicle).toBe('Skoda Superb')
    expect(slots.pickup_datetime).toBe('2026-07-09T20:00:00+02:00')
  })

  test('exact Justyna transcript keeps name after email and asks for locations, not name again', () => {
    const slots = __testRentalChatHelpers.buildConfirmedSlots(
      {
        id: 'lead-1',
        name: null,
        phone: '510 555 444',
        email: null,
        interest: null,
        status: null,
        metadata: {
          name: 'Justyna',
          selected_vehicle: 'Skoda Superb',
          car_class: 'economy',
          pickup_datetime: '2026-07-09T20:00:00+02:00',
          return_datetime: '2026-07-12T21:00:00+02:00',
        },
      },
      [
        { role: 'assistant', content: 'The Skoda Superb is available from 9 July 2026 at 20:00 to 12 July 2026 at 21:00. What name should we put on the booking?' },
        { role: 'user', content: 'Justyna' },
        { role: 'assistant', content: "Thanks, Justyna. What's your phone number?" },
        { role: 'user', content: '510 555 444' },
        { role: 'assistant', content: "Thanks, Justyna. What's your email address?" },
      ],
      'justyna@gmail.com',
    )
    expect(slots.name).toBe('Justyna')
    expect(slots.phone).toBe('510 555 444')
    expect(slots.email).toBe('justyna@gmail.com')

    const reply = __testRentalChatHelpers.deterministicRentalNextActionReply(
      slots,
      [
        { key: 'pickup_location', label: 'Pickup location', question: 'Where would you like to pick up the car?', required: true },
        { key: 'dropoff_location', label: 'Drop-off location', question: 'Where would you like to return the car?', required: true },
      ],
      [{ tool: 'getLocations', ok: true, summary: 'Found 1 active pickup/drop-off location(s).', data: { locations: [{ name: 'Kraków Bocheńska 2a', address: 'Kraków Bocheńska 2a' }] } }],
      'car_rental',
      'justyna@gmail.com',
    ) ?? ''
    expect(reply).toContain('Thanks, Justyna')
    expect(reply).toContain('Bocheńska 2a')
    expect(reply).not.toMatch(/customer name|share your name|provide your name/i)
  })

  test('location question interrupts pending confirmation and does not replay quote', () => {
    const slots = {
      name: 'Justyna',
      phone: '510 555 444',
      email: 'justyna@gmail.com',
      selected_vehicle: 'Skoda Superb',
      pickup_datetime: '2026-07-09T20:00:00+02:00',
      return_datetime: '2026-07-12T21:00:00+02:00',
    } as any
    expect(__testRentalChatHelpers.detectRentalUserIntent('what pick up location do you have in krakow', slots)).toBe('ASK_LOCATIONS')
    const reply = __testRentalChatHelpers.deterministicRentalNextActionReply(
      slots,
      [
        { key: 'pickup_location', label: 'Pickup location', question: 'Where would you like to pick up the car?', required: true },
        { key: 'dropoff_location', label: 'Drop-off location', question: 'Where would you like to return the car?', required: true },
      ],
      [{ tool: 'getLocations', ok: true, summary: 'Found 1 active pickup/drop-off location(s).', data: { locations: [{ name: 'Kraków Bocheńska 2a', address: 'Kraków Bocheńska 2a' }] } }],
      'car_rental',
      'what pick up location do you have in krakow',
    ) ?? ''
    expect(reply).toContain('Bocheńska 2a')
    expect(reply).not.toMatch(/Estimated rental price|Would you like me to create/i)
  })

  test('booking precondition failure maps to natural location request, not raw tool error', () => {
    const reply = __testRentalChatHelpers.rentalToolReplyOverride(
      [
        { tool: 'getLocations', ok: true, summary: 'Found 1 active pickup/drop-off location(s).', data: { locations: [{ name: 'Kraków Bocheńska 2a', address: 'Kraków Bocheńska 2a' }] } },
        { tool: 'createBooking', ok: false, summary: 'Booking creation needs valid pickup and drop-off locations first.' },
      ],
      { name: 'Justyna', phone: '510 555 444', email: 'justyna@gmail.com', selected_vehicle: 'Skoda Superb' } as any,
      [
        { key: 'pickup_location', label: 'Pickup location', question: 'Where would you like to pick up the car?', required: true },
        { key: 'dropoff_location', label: 'Drop-off location', question: 'Where would you like to return the car?', required: true },
      ],
      'car_rental',
      'yes please',
    ) ?? ''
    expect(reply).toContain('Bocheńska 2a')
    expect(reply).not.toMatch(/Booking creation needs|Missing required|failed/i)
  })

  test('extracts same pickup drop-off as canonical business location', () => {
    const slots = __testRentalChatHelpers.buildConfirmedSlots(
      { id: 'lead-1', name: null, phone: null, email: null, interest: null, status: null, metadata: { pickup_location: 'Kraków Bocheńska 2a' } },
      [],
      'same as pick up location',
    )
    expect(slots.dropoff_location).toBe('Kraków Bocheńska 2a')
  })

  test('same-location explicit phrase copies pickup location id to drop-off', () => {
    const slots = __testRentalChatHelpers.buildConfirmedSlots(
      { id: 'lead-1', name: null, phone: null, email: null, interest: null, status: null, metadata: { pickup_location: 'Configured Depot', pickup_location_id: 'loc-1' } },
      [],
      'drop off is the same as pick up',
    )
    expect(slots.dropoff_location).toBe('Configured Depot')
    expect(slots.dropoff_location_id).toBe('loc-1')
  })

  test('offered configured location maps yes/use-both acceptance to both location ids', () => {
    const slots = __testRentalChatHelpers.applyConfiguredLocationAcceptance(
      {
        pickup_location: 'Configured Depot',
        dropoff_location: null,
        pickup_location_id: null,
        dropoff_location_id: null,
      } as any,
      'yes use it for both',
      [{ tool: 'getLocations', ok: true, summary: 'Found 1 active pickup/drop-off location(s).', data: { locations: [{ id: 'loc-1', name: 'Configured Depot', address: '1 Main Street' }] } }],
    )
    expect(slots.pickup_location).toBe('Configured Depot, 1 Main Street')
    expect(slots.dropoff_location).toBe('Configured Depot, 1 Main Street')
    expect(slots.pickup_location_id).toBe('loc-1')
    expect(slots.dropoff_location_id).toBe('loc-1')
  })

  test('combined time and use-both message preserves datetimes and binds both configured locations', () => {
    const parsed = __testRentalChatHelpers.buildConfirmedSlots(
      {
        id: 'lead-1',
        name: null,
        phone: null,
        email: null,
        interest: null,
        status: null,
        metadata: {
          pickup_date: '2026-07-09',
          return_date: '2026-07-12',
        },
      },
      [{ role: 'assistant', content: 'We currently offer pickup at Configured Depot, 1 Main Street. You can also return the car there. Would you like me to use that location for both pickup and drop-off?' }],
      'pick at 20:00 return at 21:00, yes i will use that location for both pickup and drop-off',
    )
    const slots = __testRentalChatHelpers.applyConfiguredLocationAcceptance(
      parsed,
      'pick at 20:00 return at 21:00, yes i will use that location for both pickup and drop-off',
      [{ tool: 'getLocations', ok: true, summary: 'Found 1 active pickup/drop-off location(s).', data: { locations: [{ id: 'loc-1', name: 'Configured Depot', address: '1 Main Street' }] } }],
    )
    expect(slots.pickup_datetime).toBe('2026-07-09T20:00:00+02:00')
    expect(slots.return_datetime).toBe('2026-07-12T21:00:00+02:00')
    expect(slots.pickup_location_id).toBe('loc-1')
    expect(slots.dropoff_location_id).toBe('loc-1')
    expect(slots.dropoff_location).toBe('Configured Depot, 1 Main Street')
  })

  test('same-location natural variants are treated as same-location intent', () => {
    for (const text of ['same place', 'use it for both', 'yes for both', 'return it there']) {
      expect(__testRentalChatHelpers.sameLocationIntent(text)).toBe(true)
    }
  })

  test('semantic reducer applies unseen same-location meaning without reading phrase text', () => {
    const slots = __testRentalChatHelpers.reduceRentalState(
      {
        pickup_location: 'Configured Depot',
        pickup_location_id: 'loc-1',
        dropoff_location: null,
        dropoff_location_id: null,
      } as any,
      __testRentalChatHelpers.normalizeSemanticInterpretation({
        intent: 'UPDATE_RENTAL_DETAILS',
        state_patch: {},
        relations: [{ type: 'SAME_AS', source: 'pickup_location', target: 'dropoff_location' }],
        references: [{ expression: "I'll leave it wherever I got it from", resolved_to: 'pickup_location', field: 'dropoff_location' }],
        corrections: [],
        question: null,
        confirmation: null,
        confidence: 0.96,
      }, 'llm'),
    )
    expect(slots.dropoff_location).toBe('Configured Depot')
    expect(slots.dropoff_location_id).toBe('loc-1')
  })

  test('semantic reducer applies broad same-location relation from LLM output', () => {
    const slots = __testRentalChatHelpers.reduceRentalState(
      {
        pickup_location: 'Configured Depot',
        pickup_location_id: 'loc-1',
        dropoff_location: null,
        dropoff_location_id: null,
      } as any,
      __testRentalChatHelpers.normalizeSemanticInterpretation({
        intent: 'UPDATE_RENTAL_DETAILS',
        state_patch: {},
        relations: [{ type: 'SAME_LOCATION', fields: ['pickup_location', 'dropoff_location'] }],
        references: [{ expression: 'same joint both ways bro', resolved_to: 'last_offered_location' }],
        corrections: [],
        confidence: 0.91,
      }, 'llm'),
    )
    expect(slots.pickup_location_id).toBe('loc-1')
    expect(slots.dropoff_location_id).toBe('loc-1')
  })

  test('semantic reducer applies contextual return-time corrections with newest patch winning', () => {
    const first = __testRentalChatHelpers.reduceRentalState(
      {
        return_date: '2026-07-12',
        return_datetime: '2026-07-12T21:00:00+02:00',
      } as any,
      __testRentalChatHelpers.normalizeSemanticInterpretation({
        intent: 'CORRECT_RENTAL_DETAILS',
        state_patch: { return_time: '22:00' },
        corrections: [{ field: 'return_datetime', operation: 'REPLACE' }],
        relations: [],
        references: [{ expression: 'actually make it ten at night', resolved_to: 'return_datetime' }],
        confidence: 0.96,
      }, 'llm'),
    )
    expect(first.return_datetime).toBe('2026-07-12T22:00:00+02:00')

    const second = __testRentalChatHelpers.reduceRentalState(
      first,
      __testRentalChatHelpers.normalizeSemanticInterpretation({
        intent: 'CORRECT_RENTAL_DETAILS',
        state_patch: { return_time: '21:00' },
        corrections: [{ field: 'return_datetime', operation: 'REPLACE' }],
        relations: [],
        references: [{ expression: 'forget that, make it nine', resolved_to: 'return_datetime' }],
        confidence: 0.94,
      }, 'llm'),
    )
    expect(second.return_datetime).toBe('2026-07-12T21:00:00+02:00')
  })

  test('rental date reducer rejects stale LLM absolute dates and anchors relative dates to business today', () => {
    let trace: any = null
    const first = __testRentalChatHelpers.reduceRentalState(
      {} as any,
      __testRentalChatHelpers.normalizeSemanticInterpretation({
        intent: 'UPDATE_RENTAL_DETAILS',
        state_patch: { pickup_date: '2023-10-10', return_date: '2023-10-16' },
        relations: [],
        references: [],
        corrections: [],
        confidence: 0.92,
      }, 'llm'),
      [],
      [],
      {
        latestUserMessage: 'sup bro i need wheels from tonight until the 16th',
        now: new Date('2026-07-12T17:00:00+02:00'),
        timeZone: 'Europe/Warsaw',
        onDateResolution: value => { trace = value },
      },
    )
    expect(first.pickup_date).toBe('2026-07-12')
    expect(first.return_date).toBe('2026-07-16')
    expect(trace?.now_date).toBe('2026-07-12')
    expect(trace?.source_expression_types).toEqual(expect.arrayContaining(['tonight', 'bare_ordinal_day']))
    expect(trace?.resolved_fields).toEqual(expect.arrayContaining(['pickup_date', 'return_date']))
    expect(trace?.rejected_llm_absolute_date).toBe(true)
    expect(trace?.rejected_llm_date_reasons).toEqual(expect.arrayContaining(['pickup_date:past_without_explicit_year']))

    const second = __testRentalChatHelpers.reduceRentalState(
      first,
      __testRentalChatHelpers.normalizeSemanticInterpretation({
        intent: 'UPDATE_RENTAL_DETAILS',
        state_patch: { pickup_datetime: '2023-10-10T20:00:00+02:00', pickup_time: '20:00' },
        relations: [],
        references: [],
        corrections: [],
        confidence: 0.9,
      }, 'llm'),
      [],
      [],
      {
        latestUserMessage: 'pick up at 20:00, what location do you have in krakow',
        now: new Date('2026-07-12T17:00:00+02:00'),
        timeZone: 'Europe/Warsaw',
      },
    )
    expect(second.pickup_datetime).toBe('2026-07-12T20:00:00+02:00')
    expect(second.return_date).toBe('2026-07-16')

    const third = __testRentalChatHelpers.reduceRentalState(
      second,
      __testRentalChatHelpers.normalizeSemanticInterpretation({
        intent: 'UPDATE_RENTAL_DETAILS',
        state_patch: { return_time: '20:00' },
        relations: [],
        references: [],
        corrections: [],
        confidence: 0.91,
      }, 'llm'),
      [],
      [],
      {
        latestUserMessage: '20:00',
        now: new Date('2026-07-12T17:00:00+02:00'),
        timeZone: 'Europe/Warsaw',
      },
    )
    expect(third.return_datetime).toBe('2026-07-16T20:00:00+02:00')
  })

  test('semantic references resolve offered vehicle order and price through backend data', () => {
    const first = __testRentalChatHelpers.reduceRentalState(
      {} as any,
      __testRentalChatHelpers.normalizeSemanticInterpretation({
        intent: 'SELECT_VEHICLE',
        state_patch: {},
        relations: [],
        references: [{ expression: "I'll take the first one", resolved_to: 'first_offered_vehicle' }],
        confidence: 0.9,
      }, 'llm'),
      [],
      [{ tool: 'searchFleet', ok: true, summary: 'fleet', data: { cars: [
        { name: 'Toyota Corolla', dailyPrice: 140 },
        { name: 'Skoda Superb', dailyPrice: 150 },
      ] } }],
    )
    expect(first.selected_vehicle).toBe('Toyota Corolla')

    const cheapest = __testRentalChatHelpers.reduceRentalState(
      {} as any,
      __testRentalChatHelpers.normalizeSemanticInterpretation({
        intent: 'SELECT_VEHICLE',
        state_patch: {},
        relations: [],
        references: [{ expression: 'give me the cheaper one', resolved_to: 'cheapest_offered_vehicle' }],
        confidence: 0.92,
      }, 'llm'),
      [],
      [{ tool: 'searchFleet', ok: true, summary: 'fleet', data: { cars: [
        { name: 'Skoda Superb', dailyPrice: 150 },
        { name: 'Toyota Corolla', dailyPrice: 140 },
      ] } }],
    )
    expect(cheapest.selected_vehicle).toBe('Toyota Corolla')
  })

  test('semantic intent interrupts stale confirmation workflow for location questions', () => {
    const semantics = __testRentalChatHelpers.normalizeSemanticInterpretation({
      intent: 'ASK_LOCATION',
      state_patch: {},
      relations: [],
      references: [],
      confidence: 0.95,
    }, 'llm')
    expect(__testRentalChatHelpers.rentalSemanticIntentToUserIntent(semantics.intent)).toBe('ASK_LOCATIONS')
    expect(__testRentalChatHelpers.semanticNeedsLocationTool(semantics)).toBe(true)
  })

  test('semantic provider payloads normalize OpenAI, Gemini, and Claude shapes into one schema', () => {
    const semanticJson = JSON.stringify({
      intent: 'UPDATE_RENTAL_DETAILS',
      state_patch: {},
      relations: [{ type: 'SAME_AS', source: 'pickup_location', target: 'dropoff_location' }],
      references: [{ resolved_to: 'last_offered_location', field: 'dropoff_location' }],
      corrections: [],
      confirmation: 'yes',
      confidence: 0.96,
    })
    const openai = __testRentalChatHelpers.extractSemanticTextFromProviderPayload('openai', {
      choices: [{ finish_reason: 'stop', message: { content: semanticJson } }],
    })
    const gemini = __testRentalChatHelpers.extractSemanticTextFromProviderPayload('gemini', {
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: semanticJson }] } }],
    })
    const claude = __testRentalChatHelpers.extractSemanticTextFromProviderPayload('claude', {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: semanticJson }],
    })
    for (const output of [openai, gemini, claude]) {
      const parsed = __testRentalChatHelpers.parseSemanticJson(output.text)
      expect(__testRentalChatHelpers.validateSemanticInterpretationPayload(parsed)).toEqual([])
      const normalized = __testRentalChatHelpers.normalizeSemanticInterpretation(parsed, 'llm')
      expect(normalized.intent).toBe('UPDATE_RENTAL_DETAILS')
      expect(normalized.confirmation).toBe('yes')
      expect(normalized.relations).toContainEqual({ type: 'SAME_AS', source: 'pickup_location', target: 'dropoff_location' })
    }
  })

  test('semantic schema validation reports structural invalid fields without raw payload values', () => {
    const issues = __testRentalChatHelpers.validateSemanticInterpretationPayload({
      intent: 'MAKE_MAGIC',
      relations: [{ type: 'SAME_AS', source: 'pickup_location', target: 'not_a_field' }],
      references: [{ field: 'not_a_field' }],
    })
    expect(issues).toContainEqual({ path: 'intent', code: 'invalid_enum' })
    expect(issues).toContainEqual({ path: 'relations[0].target', code: 'invalid_field' })
    expect(issues).toContainEqual({ path: 'references[0].field', code: 'invalid_field' })
    expect(JSON.stringify(issues)).not.toContain('MAKE_MAGIC')
  })

  test('normalizes Bocheńska drop-off mentions to the canonical business location', () => {
    const slots = __testRentalChatHelpers.buildConfirmedSlots(
      { id: 'lead-1', name: null, phone: null, email: null, interest: null, status: null, metadata: { pickup_location: 'Kraków Bocheńska 2a' } },
      [],
      'I will drop off the car there at Kraków Bocheńska 2a',
    )
    expect(slots.dropoff_location).toBe('Kraków Bocheńska 2a')
  })

  test('accepting pickup and drop-off at Bocheńska sets both locations and does not repeat location lookup', () => {
    const slots = __testRentalChatHelpers.buildConfirmedSlots(
      null,
      [{ role: 'assistant', content: 'Our pickup location in Kraków is Bocheńska 2a.' }],
      'OK will pick up and drop off the car at Kraków Bocheńska 2a',
    )
    expect(slots.pickup_location).toBe('Kraków Bocheńska 2a')
    expect(slots.dropoff_location).toBe('Kraków Bocheńska 2a')

    const reply = __testRentalChatHelpers.rentalToolReplyOverride(
      [{ tool: 'getLocations', ok: true, summary: 'Found 1 active pickup/drop-off location(s).', data: { locations: [{ name: 'Kraków Bocheńska 2a', address: 'Kraków Bocheńska 2a' }] } }],
      slots,
      [{ key: 'selected_vehicle', label: 'Selected vehicle', question: 'Which vehicle would you like?', required: true }],
      'car_rental',
      'OK will pick up and drop off the car at Kraków Bocheńska 2a',
    )
    expect(reply).toBe('Perfect — pickup and return will both be at Kraków Bocheńska 2a. What type of car would you prefer?')
    expect(reply).not.toContain('Our pickup location')
  })

  test('formats pickup location without duplicate city and street copy', () => {
    expect(__testRentalChatHelpers.formatRentalLocationForCustomer({
      name: 'Kraków Bocheńska 2a',
      address: 'Kraków Bocheńska 2a',
    })).toBe('in Kraków is Bocheńska 2a')
  })

  test('customer-facing availability and confirmation replies do not expose ISO datetimes', () => {
    const slots = {
      selected_vehicle: 'Mercedes GLC',
      pickup_datetime: '2026-07-03T09:00:00+02:00',
      return_datetime: '2026-07-08T22:00:00+02:00',
      pickup_location: 'Kraków Bocheńska 2a',
      dropoff_location: 'Kraków Bocheńska 2a',
      name: 'Alex',
      phone: '510880999',
      email: 'alex@example.com',
    } as any
    const reply = __testRentalChatHelpers.rentalToolReplyOverride(
      [
        { tool: 'checkAvailability', ok: true, summary: 'raw', data: { available: true, requestedCar: { name: 'Mercedes GLC' }, availableCars: [] } },
        { tool: 'calculatePrice', ok: true, summary: 'raw', data: { rentalDays: 6, dailyPrice: 300, rentalSubtotal: 1800, deposit: 3000 } },
      ],
      slots,
      [],
      'car_rental',
      'I need it for 5 days',
    ) ?? ''
    expect(reply).toContain('The Mercedes GLC is available from 3 July 2026 at 09:00 to 8 July 2026 at 22:00.')
    expect(reply).toContain('Estimated rental price: 1,800 PLN.')
    expect(reply).toContain('This period is charged as 6 rental days at 300 PLN/day.')
    expect(reply).toContain('Because the return time is later than the pickup time, this is charged as 6 rental days.')
    expect(reply).not.toMatch(/\d{4}-\d{2}-\d{2}T/)
  })

  test('rental reply guard replaces raw ISO datetimes with customer-facing dates', () => {
    const reply = __testRentalChatHelpers.replaceRentalIsoDateTimes(
      'Pickup: 2026-07-09T20:00:00+02:00. Return: 2026-07-12T21:00:00+02:00.',
      {
        pickup_datetime: '2026-07-09T20:00:00+02:00',
        return_datetime: '2026-07-12T21:00:00+02:00',
      } as any,
    )
    expect(reply).toContain('Pickup: 9 July 2026 at 20:00.')
    expect(reply).toContain('Return: 12 July 2026 at 21:00.')
    expect(reply).not.toMatch(/\d{4}-\d{2}-\d{2}T/)
  })

  test('final pending booking reply includes reference, formatted price, truthful status, and no team confirmation copy', () => {
    const reply = __testRentalChatHelpers.rentalToolReplyOverride(
      [
        { tool: 'calculatePrice', ok: true, summary: 'raw', data: { rentalDays: 6, dailyPrice: 300, rentalSubtotal: 1800, deposit: 3000 } },
        { tool: 'createBooking', ok: true, summary: 'Created pending booking RB-388E23B8.', data: { bookingNumber: 'RB-388E23B8', status: 'pending' } },
      ],
      {
        selected_vehicle: 'Mercedes GLC',
        pickup_datetime: '2026-07-03T09:00:00+02:00',
        return_datetime: '2026-07-08T22:00:00+02:00',
      } as any,
      [],
      'car_rental',
      'yes please',
    ) ?? ''
    expect(reply).toContain('Your booking request has been created successfully. Reference: RB-388E23B8.')
    expect(reply).toContain('Mercedes GLC is requested from 3 July 2026 at 09:00 to 8 July 2026 at 22:00.')
    expect(reply).toContain('Estimated rental price: 1,800 PLN.')
    expect(reply).toContain('Deposit: 3,000 PLN.')
    expect(reply).not.toMatch(/team will contact|team will confirm/i)
    expect(reply).not.toMatch(/\d{4}-\d{2}-\d{2}T/)
  })

  test('operational claim gate blocks booking success without createBooking evidence', () => {
    const slots = {
      selected_vehicle: 'Toyota Camry',
      pickup_datetime: '2026-07-10T20:00:00+02:00',
      return_datetime: '2026-07-16T22:00:00+02:00',
      pickup_location: 'Kraków Bocheńska 2a',
      dropoff_location: 'Kraków Bocheńska 2a',
      name: 'Sami',
      phone: '444333123',
      email: 'sami@example.com',
    } as any
    const authority = __testRentalChatHelpers.enforceRentalReplyAuthority(
      'Your booking request for the Toyota Camry has been created. Our team will contact you shortly to confirm the final details.',
      slots,
      [],
      [],
      'car_rental',
      'yup',
    )
    expect(authority.violations).toContain('BOOKING_CREATED')
    expect(authority.violations).toContain('HUMAN_CONFIRMATION_REQUIRED')
    expect(authority.reply).not.toMatch(/booking request .*created|team will contact|confirm the final details/i)
  })

  test('operational claim gate allows booking creation only with persisted reference and status', () => {
    const slots = {
      selected_vehicle: 'Toyota Camry',
      pickup_datetime: '2026-07-10T20:00:00+02:00',
      return_datetime: '2026-07-16T22:00:00+02:00',
      pickup_location: 'Kraków Bocheńska 2a',
      dropoff_location: 'Kraków Bocheńska 2a',
    } as any
    const contract = __testRentalChatHelpers.rentalOperationalClaimContract([
      { tool: 'checkAvailability', ok: true, summary: 'available', data: { available: true, requestedCar: { id: 'car-1' } } },
      { tool: 'calculatePrice', ok: true, summary: 'price', data: { rentalSubtotal: 960 } },
      { tool: 'createBooking', ok: true, summary: 'Created pending booking RB-12345678.', data: { bookingId: '12345678-aaaa-bbbb-cccc-123456789abc', bookingNumber: 'RB-12345678', status: 'pending' } },
    ], slots)
    expect(contract.allowed_claims).toContain('BOOKING_CREATED')
    expect(contract.allowed_claims).not.toContain('BOOKING_CONFIRMED')
    expect(contract.allowed_claims).toContain('VEHICLE_AVAILABLE')
    expect(contract.allowed_claims).toContain('PRICE_QUOTED')
    expect(__testRentalChatHelpers.rentalOperationalClaimViolations('Your booking request has been created successfully. Reference: RB-12345678.', contract)).toEqual([])
    expect(__testRentalChatHelpers.rentalOperationalClaimViolations('Your booking is confirmed. Reference: RB-12345678.', contract)).toContain('BOOKING_CONFIRMED')
  })

  test('incomplete rental window forbids availability and price claims and asks only for missing return time', () => {
    const slots = {
      pickup_date: '2026-07-10',
      pickup_datetime: '2026-07-10T20:00:00+02:00',
      return_date: '2026-07-16',
      pickup_location: 'Kraków Bocheńska 2a',
      dropoff_location: 'Kraków Bocheńska 2a',
      car_class: 'Economy',
    } as any
    const missing = [{ key: 'return_datetime', label: 'Return date/time', question: 'What return date and time should I use?', required: true }] as any
    const authority = __testRentalChatHelpers.enforceRentalReplyAuthority(
      'These cars are available for your rental period: Toyota Camry. The estimated rental price is 960 PLN.',
      slots,
      missing,
      [{ tool: 'searchFleet', ok: true, summary: 'Found 3 matching active fleet vehicle(s).', data: { cars: [{ name: 'Toyota Camry' }], availabilityFiltered: false } }],
      'car_rental',
      'i want cheap car',
    )
    expect(authority.violations).toEqual(expect.arrayContaining(['VEHICLE_AVAILABLE', 'PRICE_QUOTED']))
    expect(authority.reply).toMatch(/what time would you like to return it on 16 July 2026/i)
    expect(authority.reply).not.toMatch(/available|estimated rental price/i)
  })

  test('selected unavailable car does not collect contact details and offers alternatives', () => {
    const slots = {
      selected_vehicle: 'Mercedes GLC',
      car_class: 'SUV',
      pickup_datetime: '2026-07-03T08:00:00+02:00',
      return_datetime: '2026-07-11T10:00:00+02:00',
      pickup_location: 'Kraków Bocheńska 2a',
      dropoff_location: 'Kraków Bocheńska 2a',
    } as any
    const reply = __testRentalChatHelpers.rentalToolReplyOverride(
      [
        {
          tool: 'checkAvailability',
          ok: true,
          summary: 'Mercedes GLC is blocked.',
          data: {
            available: false,
            requestedCar: { name: 'Mercedes GLC' },
            availableCars: [{ name: 'BMW X5' }],
          },
        },
      ],
      slots,
      [
        { key: 'name', label: 'Name', question: 'Could you please provide your name?', required: true },
        { key: 'phone', label: 'Phone', question: 'What is your phone number?', required: true },
        { key: 'email', label: 'Email', question: 'What is your email address?', required: true },
      ],
      'car_rental',
      'I will go with the GLC',
    ) ?? ''
    expect(reply).toContain('The Mercedes GLC is not available for those dates')
    expect(reply).toContain('BMW X5')
    expect(reply).not.toMatch(/name|phone|email/i)
    expect(reply).not.toContain('Great')
  })
})
