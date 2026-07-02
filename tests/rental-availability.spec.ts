import { expect, test } from './fixtures'
import { rentalBookingBlocksWindow, type RentalCalendarBooking } from '../app/lib/rentalAvailability'

const baseBooking: RentalCalendarBooking = {
  id: 'booking-1',
  carId: 'car-1',
  customerName: 'QA Customer',
  pickupAt: '2026-07-12T10:00:00.000Z',
  dropoffAt: '2026-07-15T18:00:00.000Z',
  returnAt: '2026-07-15T18:00:00.000Z',
  status: 'confirmed',
  totalPrice: 300,
}

test.describe('rental booking availability overlap rules', () => {
  test('exact overlap blocks availability', () => {
    expect(rentalBookingBlocksWindow(baseBooking, '2026-07-12T10:00:00.000Z', '2026-07-15T18:00:00.000Z', 120)).toBe(true)
  })

  test('booking starts during existing booking', () => {
    expect(rentalBookingBlocksWindow(baseBooking, '2026-07-13T09:00:00.000Z', '2026-07-16T09:00:00.000Z', 120)).toBe(true)
  })

  test('booking ends during existing booking', () => {
    expect(rentalBookingBlocksWindow(baseBooking, '2026-07-11T09:00:00.000Z', '2026-07-13T09:00:00.000Z', 120)).toBe(true)
  })

  test('booking fully covers existing booking', () => {
    expect(rentalBookingBlocksWindow(baseBooking, '2026-07-11T09:00:00.000Z', '2026-07-16T09:00:00.000Z', 120)).toBe(true)
  })

  test('back-to-back booking is allowed only after buffer', () => {
    expect(rentalBookingBlocksWindow(baseBooking, '2026-07-15T18:00:00.000Z', '2026-07-16T10:00:00.000Z', 120)).toBe(true)
    expect(rentalBookingBlocksWindow(baseBooking, '2026-07-15T20:00:00.000Z', '2026-07-16T10:00:00.000Z', 120)).toBe(false)
  })

  test('cancelled and completed bookings do not block availability', () => {
    expect(rentalBookingBlocksWindow({ ...baseBooking, status: 'cancelled' }, '2026-07-13T09:00:00.000Z', '2026-07-14T09:00:00.000Z', 120)).toBe(false)
    expect(rentalBookingBlocksWindow({ ...baseBooking, status: 'completed' }, '2026-07-13T09:00:00.000Z', '2026-07-14T09:00:00.000Z', 120)).toBe(false)
  })

  test('maintenance and unavailable bookings block availability', () => {
    expect(rentalBookingBlocksWindow({ ...baseBooking, status: 'maintenance' }, '2026-07-13T09:00:00.000Z', '2026-07-14T09:00:00.000Z', 120)).toBe(true)
    expect(rentalBookingBlocksWindow({ ...baseBooking, status: 'unavailable' }, '2026-07-13T09:00:00.000Z', '2026-07-14T09:00:00.000Z', 120)).toBe(true)
  })
})
