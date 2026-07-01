const KNOWN_RENTAL_MODELS = [
  'Toyota Corolla',
  'Toyota Camry',
  'Toyota Yaris',
  'BMW X5',
  'Mercedes GLC',
  'Skoda Superb',
  'Corolla',
  'Camry',
  'Yaris',
  'X5',
  'GLC',
  'Superb',
]

export function extractRentalVehicleName(text: string | null | undefined): string | null {
  const source = text ?? ''
  const match = KNOWN_RENTAL_MODELS.find(model => {
    const pattern = model.replace(/\s+/g, '\\s+')
    return new RegExp(`\\b${pattern}\\b`, 'i').test(source)
  })
  if (!match) return null
  const lower = match.toLowerCase()
  if (lower === 'corolla') return 'Toyota Corolla'
  if (lower === 'camry') return 'Toyota Camry'
  if (lower === 'yaris') return 'Toyota Yaris'
  if (lower === 'x5') return 'BMW X5'
  if (lower === 'glc') return 'Mercedes GLC'
  if (lower === 'superb') return 'Skoda Superb'
  return match
}
