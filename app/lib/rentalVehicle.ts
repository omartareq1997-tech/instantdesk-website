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

const MODEL_ALIASES: Array<[RegExp, string]> = [
  [/\b(?:mercedes\s+glc|glc|mercedes)\b/i, 'Mercedes GLC'],
  [/\b(?:bmw\s+x5|x5|bmw)\b/i, 'BMW X5'],
  [/\b(?:toyota\s+corolla|corolla)\b/i, 'Toyota Corolla'],
  [/\b(?:toyota\s+camry|camry)\b/i, 'Toyota Camry'],
  [/\b(?:toyota\s+yaris|yaris)\b/i, 'Toyota Yaris'],
  [/\b(?:skoda\s+superb|superb|skoda)\b/i, 'Skoda Superb'],
]

export function extractRentalVehicleName(text: string | null | undefined): string | null {
  const source = text ?? ''
  const aliased = MODEL_ALIASES.find(([pattern]) => pattern.test(source))
  if (aliased) return aliased[1]
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
