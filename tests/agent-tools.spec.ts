import { expect, test } from './fixtures'
import { planOperationalTools } from '../app/lib/agent-tools'
import { parseRentalDateWindow } from '../app/lib/rentalDateTime'
import { extractRentalVehicleName } from '../app/lib/rentalVehicle'

test.describe('agent operational tool planner', () => {
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

  test('keeps exact car requests stable when location and dates follow the model name', () => {
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

  test('reuses previously stored ISO pickup and return slot values', () => {
    const parsed = parseRentalDateWindow('My email is alex@example.com', {
      pickup_datetime: '2026-07-02T09:00:00+02:00',
      return_datetime: '2026-07-09T22:00:00+02:00',
    })
    expect(parsed.pickupAt).toBe('2026-07-02T09:00:00+02:00')
    expect(parsed.dropoffAt).toBe('2026-07-09T22:00:00+02:00')
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
})
