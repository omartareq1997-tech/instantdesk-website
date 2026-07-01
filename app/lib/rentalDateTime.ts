export type RentalDateWindowSlots = {
  pickup_datetime?: string | null
  return_datetime?: string | null
}

const DEFAULT_RENTAL_TIME_ZONE = 'Europe/Warsaw'

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function parseTime(text: string, fallbackHour: number) {
  const explicitAt = text.match(/\bat\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i)
  const meridiem = Array.from(text.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi)).at(-1)
  const clock = Array.from(text.matchAll(/\b(\d{1,2}):(\d{2})\b/g)).at(-1)
  const match = explicitAt ?? meridiem ?? clock
  if (!match) return { hour: fallbackHour, minute: 0 }
  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  const suffix = match[3]?.toLowerCase()
  if (suffix === 'pm' && hour < 12) hour += 12
  if (suffix === 'am' && hour === 12) hour = 0
  return {
    hour: Math.max(0, Math.min(23, hour)),
    minute: Math.max(0, Math.min(59, minute)),
  }
}

function nextWeekday(base: Date, weekday: number) {
  const next = new Date(base)
  const diff = (weekday - next.getDay() + 7) % 7 || 7
  next.setDate(next.getDate() + diff)
  return next
}

function offsetFor(timeZone: string, year: number, month: number, day: number, hour: number, minute: number) {
  try {
    const probe = new Date(Date.UTC(year, month, day, hour, minute))
    const part = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
    }).formatToParts(probe).find(item => item.type === 'timeZoneName')?.value
    const match = part?.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
    if (!match) return '+00:00'
    const sign = match[1]
    const hours = pad(Number(match[2]))
    const minutes = pad(Number(match[3] ?? 0))
    return `${sign}${hours}:${minutes}`
  } catch {
    return '+00:00'
  }
}

function isoWithBusinessOffset(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const offset = offsetFor(timeZone, year, month, day, hour, minute)
  return `${year}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${offset}`
}

function parseDatePhrase(text: string, fallbackHour: number, now = new Date(), timeZone = DEFAULT_RENTAL_TIME_ZONE): string | null {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text.trim())) return text.trim()
  const lower = text.toLowerCase()
  const time = parseTime(text, fallbackHour)
  let base: Date | null = null

  if (/\btomorrow\b/.test(lower)) {
    base = new Date(now)
    base.setDate(base.getDate() + 1)
  } else if (/\btoday\b/.test(lower)) {
    base = new Date(now)
  } else {
    const monthMatch = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?\b/i)
    if (monthMatch) {
      const day = Number(monthMatch[1])
      const month = MONTH_INDEX[monthMatch[2].toLowerCase()]
      let year = monthMatch[3] ? Number(monthMatch[3]) : now.getFullYear()
      const candidate = new Date(year, month, day, time.hour, time.minute)
      if (!monthMatch[3] && candidate.getTime() < now.getTime() - 24 * 60 * 60 * 1000) year += 1
      return isoWithBusinessOffset(year, month, day, time.hour, time.minute, timeZone)
    }

    const numericMatch = lower.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/)
    if (numericMatch) {
      const day = Number(numericMatch[1])
      const month = Number(numericMatch[2]) - 1
      const rawYear = numericMatch[3]
      let year = rawYear ? Number(rawYear.length === 2 ? `20${rawYear}` : rawYear) : now.getFullYear()
      const candidate = new Date(year, month, day, time.hour, time.minute)
      if (!rawYear && candidate.getTime() < now.getTime() - 24 * 60 * 60 * 1000) year += 1
      if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
        return isoWithBusinessOffset(year, month, day, time.hour, time.minute, timeZone)
      }
    }

    const weekday = Object.keys(WEEKDAY_INDEX).find(day => new RegExp(`\\b${day}\\b`, 'i').test(lower))
    if (weekday) base = nextWeekday(now, WEEKDAY_INDEX[weekday])
  }

  if (!base) return null
  return isoWithBusinessOffset(base.getFullYear(), base.getMonth(), base.getDate(), time.hour, time.minute, timeZone)
}

function splitRentalWindow(message: string, slots: RentalDateWindowSlots) {
  const text = message.trim()
  const fromUntil = text.match(/\b(?:from|pickup(?:\s+at)?(?!\s+location\b)|pick up(?!\s+location\b)|pick-up(?!\s+location\b))\s+(.+?)\s+(?:until|to|through|till|and\s+return(?:ing)?(?:\s+on)?|return(?:ing)?(?:\s+on)?|drop(?:off|-off)?(?:\s+on)?(?!\s+location\b))\s+(.+)$/i)
  if (fromUntil) return { pickupText: fromUntil[1], returnText: fromUntil[2] }

  const pickupMatches = Array.from(text.matchAll(/\b(?:pick\s*up|pickup|pick-up)\s+(?!location\b)(.+?)(?:\s+and\s+|\s*,\s*|$)/gi))
  const returnMatches = Array.from(text.matchAll(/\b(?:return|drop(?:off|-off)?)\s+(?!location\b)(?:on\s+)?(.+)$/gi))
  const pickupMatch = pickupMatches.at(-1)
  const returnMatch = returnMatches.at(-1)
  const pickupText = pickupMatch?.[1] ?? slots.pickup_datetime ?? text
  const returnText = returnMatch?.[1] ?? slots.return_datetime ?? text
  return {
    pickupText: /\bsame location\b/i.test(pickupText) && slots.pickup_datetime ? slots.pickup_datetime : pickupText,
    returnText: /\bsame location\b/i.test(returnText) && slots.return_datetime ? slots.return_datetime : returnText,
  }
}

export function parseRentalDateWindow(
  message: string,
  slots: RentalDateWindowSlots = {},
  now = new Date(),
  timeZone = DEFAULT_RENTAL_TIME_ZONE,
) {
  const { pickupText, returnText } = splitRentalWindow(message, slots)
  return {
    pickupAt: parseDatePhrase(pickupText, 10, now, timeZone),
    dropoffAt: parseDatePhrase(returnText, 18, now, timeZone),
  }
}
