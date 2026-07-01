import { expect, test } from './fixtures'
import { planOperationalTools } from '../app/lib/agent-tools'
import { parseRentalDateWindow } from '../app/lib/rentalDateTime'

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
      message: 'Is Toyota Corolla available from tomorrow 10:00 until Friday 18:00?',
    })
    expect(tools).toContain('searchFleet')
    expect(tools).toContain('checkAvailability')
  })

  test('keeps exact car requests stable when location and dates follow the model name', () => {
    const tools = planOperationalTools({
      ...baseContext,
      message: 'Please book Toyota Corolla in Krakow from tomorrow 10:00 until Friday 18:00.',
    })
    expect(tools).toContain('searchFleet')
    expect(tools).toContain('checkAvailability')
  })

  test('plans policy and location lookups separately', () => {
    expect(planOperationalTools({ ...baseContext, message: 'What documents and deposit do I need?' })).toContain('getBusinessPolicies')
    expect(planOperationalTools({ ...baseContext, message: 'Can I pick up at the airport?' })).toContain('getLocations')
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

  test('parses tomorrow and explicit July return dates as business-time ISO values', () => {
    const parsed = parseRentalDateWindow(
      'I want to pick up tomorrow at 9am and return on 9 July at 10pm.',
      {},
      new Date('2026-07-01T12:00:00+02:00'),
    )
    expect(parsed.pickupAt).toContain('2026-07-02T09:00:00')
    expect(parsed.dropoffAt).toContain('2026-07-09T22:00:00')
  })

  test('reuses previously stored ISO pickup and return slot values', () => {
    const parsed = parseRentalDateWindow('My email is alex@example.com', {
      pickup_datetime: '2026-07-02T09:00:00+02:00',
      return_datetime: '2026-07-09T22:00:00+02:00',
    })
    expect(parsed.pickupAt).toBe('2026-07-02T09:00:00+02:00')
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
