import { expect, test } from './fixtures'
import { signMemberToken } from '../app/lib/auth'
import { buildAgentSystemPrompt } from '../app/lib/agentPrompt'

async function addMemberSessionCookie(page: import('@playwright/test').Page, baseURL?: string) {
  const token = await signMemberToken({ id: 'rental-test-member', name: 'Rental Test', role: 'owner' })
  await page.context().addCookies([{
    name: 'member_session',
    value: token,
    url: baseURL ?? 'http://127.0.0.1:3106',
  }])
}

async function runRentalScenario(request: import('@playwright/test').APIRequestContext, scenario: string, message?: string) {
  const response = await request.post('/api/rental/bot-test', {
    data: { scenario, message },
  })
  expect(response.ok()).toBeTruthy()
  return response.json() as Promise<{
    finalSystemPrompt: string
    extractedIntent: string
    extractedBookingFields: Record<string, unknown>
    toolCallsMade: string[]
    availabilityResult: Array<{ matchType: string; car: { id: string; className: string; name: string } }>
    selectedFallbackPath: string
    handoverStatus: string
    reply: string
  }>
}

test('prompt preview includes car rental module when businessType is car_rental', async ({ checkedPage: page, baseURL }) => {
  await addMemberSessionCookie(page, baseURL)
  await page.route('**/api/business/settings', async route => {
    await route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ businessType: 'car_rental' }) })
  })
  await page.route('**/api/ai-agent/agent', async route => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agent: {
          id: 'agent-test',
          name: 'Rental Agent',
          persona: 'You are a rental desk assistant.',
          objective: 'Handle rental bookings and support.',
          tone: 'professional',
          fallback_msg: 'I will hand this over to a rental specialist.',
          model: 'gpt-4o',
          temperature: 0.4,
        },
      }),
    })
  })

  await page.goto('/dashboard#ai_instructions')
  await expect(page.getByText('Instruction Prompt').first()).toBeVisible()
  await expect(page.getByText('Car Rental Operations Assistant').first()).toBeVisible()
  await expect(page.getByText('AI Model').first()).toBeVisible()
  await expect(page.locator('select').first()).toContainText('Gemini 2.5 Pro')
  await expect(page.locator('select').first()).toContainText('Gemini 2.5 Flash')
  await expect(page.getByText('Training Data').first()).toBeVisible()
  await expect(page.getByText('Answer Source Settings').first()).toBeVisible()
  await expect(page.getByText('Advanced').first()).toBeVisible()
})

test('businessType persists after refresh on settings page', async ({ checkedPage: page, baseURL }) => {
  await addMemberSessionCookie(page, baseURL)
  let savedBusinessType = 'general_service'
  await page.route('**/api/business/settings', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { businessType?: string }
      savedBusinessType = body.businessType ?? savedBusinessType
      await route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, businessType: savedBusinessType }) })
      return
    }
    await route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ businessType: savedBusinessType }) })
  })
  await page.route('**/api/rental/settings', async route => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        settings: {
          cleaningBufferMinutes: 120,
          currency: 'PLN',
          syncDirection: 'none',
          externalSyncEnabled: false,
        },
      }),
    })
  })

  await page.goto('/dashboard#settings')
  await page.evaluate(() => localStorage.setItem('instantdesk_car_rental_onboarding_done', 'true'))
  const businessTypeSelect = page.getByRole('combobox').first()
  await businessTypeSelect.selectOption('car_rental')
  await expect(businessTypeSelect).toHaveValue('car_rental')

  await page.reload()
  await expect(page.getByRole('combobox').first()).toHaveValue('car_rental')
})

test('car_rental selection loads rental AI instructions without real estate labels', async ({ checkedPage: page, baseURL }) => {
  await addMemberSessionCookie(page, baseURL)
  await page.route('**/api/business/settings', async route => {
    await route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ businessType: 'car_rental' }) })
  })
  await page.route('**/api/ai-agent/agent', async route => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agent: {
          id: 'agent-test',
          name: 'Rental Agent',
          persona: null,
          objective: null,
          tone: 'professional',
          fallback_msg: '',
          model: 'gpt-4o',
          temperature: 0.4,
        },
      }),
    })
  })

  await page.goto('/dashboard#ai_instructions')
  await expect(page.getByText('Instruction Prompt').first()).toBeVisible()
  await expect(page.getByText('Car Rental Operations Assistant').first()).toBeVisible()
  const visibleText = await page.locator('body').innerText()
  expect(visibleText).toContain('Use live operational data')
  expect(visibleText).toContain('Knowledge Base')
  expect(visibleText).not.toContain('Rent or Buy')
  expect(visibleText).not.toContain('Number of Rooms')
  expect(visibleText).not.toContain('2-bedroom flat')
})

test('Test AI fields switch to car rental fields', async ({ checkedPage: page, baseURL }) => {
  await addMemberSessionCookie(page, baseURL)
  await page.route('**/api/business/settings', async route => {
    await route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ businessType: 'car_rental' }) })
  })

  await page.goto('/dashboard#ai_test')
  await expect(page.getByText('Car Rental Operations Assistant').first()).toBeVisible()
  await expect(page.getByText('Pickup location').first()).toBeVisible()
  await expect(page.getByText('Selected vehicle').first()).toBeVisible()
  await expect(page.getByText('Car class').first()).toBeVisible()
  await expect(page.getByText('Hi, I need an automatic economy car').first()).toBeVisible()
  const visibleText = await page.locator('body').innerText()
  expect(visibleText).not.toContain('Property Type')
  expect(visibleText).not.toContain('Rent or Buy')
})

test('prompt builder includes car rental module only for car_rental business type', () => {
  const baseConfig = {
    persona: 'You are a helpful assistant.',
    objective: 'Help visitors.',
    tone: 'professional',
    fallback_msg: 'I will connect you with a human.',
    model: 'gpt-4o',
    temperature: 0.4,
  }

  const rentalPrompt = buildAgentSystemPrompt({ config: { ...baseConfig, businessType: 'car_rental' } })
  const generalPrompt = buildAgentSystemPrompt({ config: { ...baseConfig, businessType: 'general_service' } })

  expect(rentalPrompt).toContain('CAR RENTAL OPERATIONS MODULE')
  expect(rentalPrompt).toContain('Always call the availability checker before offering a car.')
  expect(rentalPrompt).toContain('For first bookings, do not send or promise a payment link by default.')
  expect(generalPrompt).not.toContain('CAR RENTAL OPERATIONS MODULE')
})

test('runtime prompt debug includes the same car rental module', async ({ request }) => {
  const result = await runRentalScenario(request, 'availability')
  expect(result.finalSystemPrompt).toContain('CAR RENTAL OPERATIONS MODULE')
  expect(result.finalSystemPrompt).toContain('Always call the availability checker before offering a car.')
  expect(result.finalSystemPrompt).toContain('External booking calendar:')
})

test('availability excludes overlapping bookings and respects bufferMinutes', async ({ request }) => {
  const result = await runRentalScenario(request, 'availability', 'Do you have an automatic Economy car from the airport tomorrow at 12:30?')
  expect(result.toolCallsMade).toContain('checkCarAvailability')
  expect(result.availabilityResult.some(match => match.car.id === 'car-economy-1')).toBe(false)
  expect(result.availabilityResult.some(match => match.car.id === 'car-economy-2')).toBe(false)
})

test('exact class is returned first when available', async ({ request }) => {
  const result = await runRentalScenario(request, 'availability', 'Do you have an automatic SUV from the airport tomorrow?')
  expect(result.availabilityResult.length).toBeGreaterThan(0)
  expect(result.availabilityResult[0].matchType).toBe('exact')
  expect(result.availabilityResult[0].car.className).toBe('SUV')
})

test('same-class alternative is returned before nearest-class alternative', async ({ request }) => {
  const result = await runRentalScenario(request, 'availability', 'Do you have an automatic SUV Plus car tomorrow?')
  expect(result.availabilityResult.length).toBeGreaterThan(0)
  expect(result.availabilityResult[0].matchType).toBe('same_class_alternative')
})

test('extension unavailable triggers alternatives', async ({ request }) => {
  const result = await runRentalScenario(request, 'extension', 'Can I extend booking CR-1024 by one more day?')
  expect(result.toolCallsMade).toContain('checkExtensionAvailability')
  expect(result.selectedFallbackPath).not.toBe('same_car_extension')
  expect(['recommended', 'triggered']).toContain(result.handoverStatus)
  expect(result.availabilityResult.length).toBeGreaterThan(0)
})

test('"where is my car?" returns location instruction when booking exists', async ({ request }) => {
  const result = await runRentalScenario(request, 'location', "I'm here for booking CR-1024. Where is my car?")
  expect(result.extractedIntent).toBe('location_guidance')
  expect(result.selectedFallbackPath).toBe('location_instruction')
  expect(result.reply).toContain('Krakow Airport Terminal 1')
  expect(result.reply).toContain('Maps:')
  expect(result.handoverStatus).toBe('none')
})

test('unresolved location triggers handover or asks one clarifying question', async ({ request }) => {
  const result = await runRentalScenario(request, 'location_unresolved', "I'm here, where do I go?")
  expect(result.extractedIntent).toBe('location_guidance')
  expect(result.selectedFallbackPath).toBe('ask_booking_number')
  expect(result.reply).toContain('booking number')
  expect(result.handoverStatus).toBe('triggered')
})

test('Car Rental Ops shows empty CTAs and supports add/edit/delete car and location', async ({ checkedPage: page, baseURL }) => {
  await addMemberSessionCookie(page, baseURL)
  let cars: Array<Record<string, unknown>> = []
  let locations: Array<Record<string, unknown>> = []
  const settings = { cleaningBufferMinutes: 120, currency: 'PLN', syncDirection: 'none', externalSyncEnabled: false }

  await page.route('**/api/business/settings', route => route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ businessType: 'car_rental' }) }))
  await page.route('**/api/rental/fleet', route => route.fulfill({
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ migrationRequired: false, cars, bookings: [], locations, settings }),
  }))
  await page.route('**/api/rental/cars**', async route => {
    const url = new URL(route.request().url())
    if (route.request().method() === 'DELETE') {
      cars = cars.filter(car => car.id !== url.searchParams.get('id'))
      await route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true }) })
      return
    }
    const body = route.request().postDataJSON() as Record<string, unknown>
    if (route.request().method() === 'PUT') {
      const id = url.searchParams.get('id')
      cars = cars.map(car => car.id === id ? { ...car, id, name: body.name, className: body.className, transmission: body.transmission, seats: Number(body.seats), fuelType: body.fuelType, dailyPrice: Number(body.dailyPrice), deposit: Number(body.deposit), licensePlate: body.licensePlate, locationName: body.locationName, status: 'available', active: body.active, notes: body.notes } : car)
      await route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, id }) })
      return
    }
    const id = 'car-1'
    cars.push({ id, name: body.name, className: body.className, transmission: 'automatic', seats: Number(body.seats), fuelType: body.fuelType, dailyPrice: Number(body.dailyPrice), deposit: Number(body.deposit), licensePlate: body.licensePlate, locationName: body.locationName, status: 'available', active: true, notes: body.notes })
    await route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, id }) })
  })
  await page.route('**/api/rental/locations**', async route => {
    const url = new URL(route.request().url())
    if (route.request().method() === 'DELETE') {
      locations = locations.filter(location => location.id !== url.searchParams.get('id'))
      await route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true }) })
      return
    }
    const body = route.request().postDataJSON() as Record<string, unknown>
    if (route.request().method() === 'PUT') {
      const id = url.searchParams.get('id')
      locations = locations.map(location => location.id === id ? { ...location, ...body, id } : location)
      await route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, id }) })
      return
    }
    const id = 'loc-1'
    locations.push({ id, ...body })
    await route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, id }) })
  })

  await page.goto('/dashboard#rental_ops')
  await expect(page.getByText('No cars yet. Add your first car, import CSV, or use demo fleet.')).toBeVisible()

  await page.getByRole('button', { name: /^Add car$/ }).click()
  await page.locator('input[placeholder="Daily price"]').fill('199')
  await page.locator('input[placeholder="Deposit"]').fill('900')
  await page.locator('input[placeholder="License plate"]').fill('KR TEST')
  await page.getByRole('button', { name: 'Save car' }).click()
  await expect(page.getByText('Toyota Corolla').first()).toBeVisible()

  await page.getByTitle('Edit car').click()
  await page.locator('input[placeholder="Car name/model"]').fill('Toyota Yaris')
  await page.getByRole('button', { name: 'Save car' }).click()
  await expect(page.getByText('Toyota Yaris').first()).toBeVisible()

  await page.getByTitle('Delete car').click()
  await expect(page.getByText('No cars yet. Add your first car, import CSV, or use demo fleet.')).toBeVisible()

  await page.getByRole('button', { name: /Locations/i }).click()
  await expect(page.getByText('No locations yet. Add pickup/drop-off locations so the bot can guide customers.').first()).toBeVisible()
  await page.getByRole('button', { name: /^Add location$/ }).click()
  await page.locator('input[placeholder="Location name"]').fill('Airport Terminal 1')
  await page.locator('textarea[placeholder="Pickup instruction text"]').fill('Meet at arrivals.')
  await page.getByRole('button', { name: 'Save location' }).click()
  await expect(page.getByRole('heading', { name: 'Airport Terminal 1' })).toBeVisible()
  await page.getByRole('button', { name: /^Locations$/ }).click()
  await page.locator('.icon-btn').last().click()
  await expect(page.getByText('No locations yet. Add pickup/drop-off locations so the bot can guide customers.').first()).toBeVisible()
})

test('car rental settings save/reload and buffer appears in Car Rental Ops', async ({ checkedPage: page, baseURL }) => {
  await addMemberSessionCookie(page, baseURL)
  let businessType = 'car_rental'
  let rentalSettings = { cleaningBufferMinutes: 120, currency: 'PLN', syncDirection: 'none', externalSyncEnabled: false, depositPolicy: '' }

  await page.route('**/api/business/settings', async route => {
    if (route.request().method() === 'POST') {
      businessType = (route.request().postDataJSON() as { businessType: string }).businessType
    }
    await route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, businessType }) })
  })
  await page.route('**/api/rental/settings', async route => {
    if (route.request().method() === 'POST') {
      rentalSettings = { ...rentalSettings, ...(route.request().postDataJSON() as typeof rentalSettings) }
      await route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true }) })
      return
    }
    await route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ settings: rentalSettings }) })
  })
  await page.route('**/api/rental/fleet', route => route.fulfill({
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ migrationRequired: false, cars: [], bookings: [], locations: [], settings: rentalSettings }),
  }))

  await page.goto('/dashboard#settings')
  await expect(page.locator('select').first()).toHaveValue('car_rental')
  await page.locator('input[placeholder="Buffer minutes"]').fill('180')
  await page.locator('textarea[placeholder="Deposit policy"]').fill('Deposit due before pickup.')
  await page.getByRole('button', { name: 'Save rental settings' }).click()
  await expect(page.getByText('Rental settings saved.')).toBeVisible()

  await page.goto('/dashboard#rental_ops')
  await expect(page.getByText('180m')).toBeVisible()
})

test('per-car booking calendar renders connected month date ranges', async ({ checkedPage: page, baseURL }) => {
  await addMemberSessionCookie(page, baseURL)
  const car = {
    id: 'car-range-1',
    name: 'BMW X5',
    className: 'SUV',
    transmission: 'automatic',
    seats: 5,
    fuelType: 'petrol',
    dailyPrice: 420,
    deposit: 1500,
    status: 'available',
    active: true,
    licensePlate: 'KR X5',
    locationName: 'Kraków Bocheńska 2a',
  }
  const booking = {
    id: 'booking-range-1',
    bookingNumber: 'RB-RANGE',
    carId: car.id,
    customerName: 'Calendar Tester',
    customerPhone: '510998000',
    pickupAt: '2026-07-12T10:00:00+02:00',
    returnAt: '2026-07-15T18:00:00+02:00',
    dropoffAt: '2026-07-15T18:00:00+02:00',
    bufferUntil: '2026-07-15T20:00:00+02:00',
    pickupLocation: 'Kraków Bocheńska 2a',
    dropoffLocation: 'Kraków Bocheńska 2a',
    status: 'confirmed',
    totalPrice: 1260,
    deposit: 1500,
    paymentStatus: 'pending',
  }
  const cancelledBooking = {
    ...booking,
    id: 'booking-cancelled-1',
    bookingNumber: 'RB-CANCEL',
    customerName: 'Cancelled Tester',
    status: 'cancelled',
  }
  const settings = { cleaningBufferMinutes: 120, currency: 'PLN', syncDirection: 'none', externalSyncEnabled: false }

  await page.route('**/api/business/settings', route => route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ businessType: 'car_rental' }) }))
  await page.route('**/api/rental/fleet', route => route.fulfill({
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ migrationRequired: false, cars: [car], bookings: [booking, cancelledBooking], locations: [], settings }),
  }))
  await page.route('**/api/rental/cars/car-range-1/calendar', route => route.fulfill({
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ car, bookings: [booking, cancelledBooking] }),
  }))

  await page.goto('/dashboard#rental_ops')
  await page.getByTitle('Booking calendar').click()
  await expect(page.getByText('Booking Calendar')).toBeVisible()
  await expect(page.getByText('July 2026', { exact: true })).toBeVisible()
  await expect(page.getByText('August 2026', { exact: true })).toBeVisible()
  await expect(page.getByText('Calendar Tester').last()).toBeVisible()
  await expect(page.getByText('undefined')).toHaveCount(0)
  await expect(page.getByText(/Buffer until 15 Jul 2026, 20:00/)).toBeVisible()
  await expect(page.getByText('Cancelled Tester')).toBeVisible()
  await expect(page.getByText('cancelled — does not block availability')).toBeVisible()
})

test('city selector filters rental ops and Rental Ledger exports current view', async ({ checkedPage: page, baseURL }) => {
  await addMemberSessionCookie(page, baseURL)
  const krakowCar = {
    id: 'car-krk-1',
    name: 'Toyota Corolla',
    className: 'Economy',
    transmission: 'automatic',
    seats: 5,
    fuelType: 'petrol',
    dailyPrice: 140,
    deposit: 1000,
    status: 'available',
    active: true,
    licensePlate: 'KR TEST',
    locationName: 'Kraków Bocheńska 2a',
    city: 'Kraków',
  }
  const warsawCar = {
    ...krakowCar,
    id: 'car-waw-1',
    name: 'Skoda Superb',
    dailyPrice: 150,
    licensePlate: 'WA TEST',
    locationName: 'Warsaw Central',
    city: 'Warsaw',
  }
  const booking = {
    id: 'booking-waw-1',
    bookingNumber: 'RB-WAW001',
    carId: warsawCar.id,
    carName: warsawCar.name,
    customerName: 'Warsaw Customer',
    customerPhone: '500111222',
    customerEmail: 'warsaw@example.com',
    pickupAt: '2026-07-12T10:00:00+02:00',
    returnAt: '2026-07-15T18:00:00+02:00',
    dropoffAt: '2026-07-15T18:00:00+02:00',
    pickupLocation: 'Warsaw Central',
    dropoffLocation: 'Warsaw Central',
    status: 'confirmed',
    totalPrice: 600,
    deposit: 1200,
    paymentStatus: 'held',
    source: 'website',
    city: 'Warsaw',
    createdAt: '2026-07-01T10:00:00+02:00',
    updatedAt: '2026-07-01T10:00:00+02:00',
  }
  const settings = { cleaningBufferMinutes: 120, currency: 'PLN', syncDirection: 'none', externalSyncEnabled: false }

  await page.route('**/api/business/settings', route => route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ businessType: 'car_rental' }) }))
  await page.route('**/api/rental/fleet', route => route.fulfill({
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ migrationRequired: false, cars: [krakowCar, warsawCar], bookings: [booking], locations: [], settings }),
  }))

  await page.goto('/dashboard#rental_ops')
  await expect(page.getByText('Toyota Corolla').first()).toBeVisible()
  await page.locator('select').first().selectOption('Warsaw')
  await expect(page.getByText('Skoda Superb').first()).toBeVisible()
  await expect(page.getByText('Toyota Corolla').first()).toBeHidden()

  await page.getByRole('button', { name: /Rental Ledger/i }).click()
  await expect(page.getByText('Warsaw Customer')).toBeVisible()
  await expect(page.getByText('RB-WAW001')).toBeVisible()
  await expect(page.getByRole('button', { name: /Export CSV/i })).toBeVisible()
})
