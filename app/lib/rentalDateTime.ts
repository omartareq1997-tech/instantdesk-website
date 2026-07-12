export type RentalDateWindowSlots = {
  pickup_datetime?: string | null
  return_datetime?: string | null
  pickup_date?: string | null
  return_date?: string | null
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

function parseTime(text: string) {
  const explicitAt = text.match(/\bat\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i)
  const meridiem = Array.from(text.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi)).at(-1)
  const clock = Array.from(text.matchAll(/\b(\d{1,2}):(\d{2})\b/g)).at(-1)
  const match = explicitAt ?? meridiem ?? clock
  if (!match) return null
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

function parseLabeledTime(text: string, label: 'pickup' | 'return') {
  const pattern = label === 'pickup'
    ? /\b(?:pick\s*up|pickup|pick-up|pick)\s*(?:at)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i
    : /\b(?:return|drop(?:off|-off)?)\s*(?:at)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i
  const match = text.match(pattern)
  if (!match) return null
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

function parseClockTimes(text: string) {
  return Array.from(text.matchAll(/\b(\d{1,2}):(\d{2})\b|\b(\d{1,2})\s*(am|pm)\b/gi))
    .filter(match => {
      const start = match.index ?? 0
      const before = text.slice(Math.max(0, start - 12), start).toLowerCase()
      return !/\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s*$/.test(before)
    })
    .map(match => {
      let hour = Number(match[1] ?? match[3])
      const minute = Number(match[2] ?? 0)
      const suffix = match[4]?.toLowerCase()
      if (suffix === 'pm' && hour < 12) hour += 12
      if (suffix === 'am' && hour === 12) hour = 0
      return {
        hour: Math.max(0, Math.min(23, hour)),
        minute: Math.max(0, Math.min(59, minute)),
      }
    })
    .filter(time => Number.isFinite(time.hour) && Number.isFinite(time.minute))
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

function dateOnly(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

function datePartFromIso(value: string | null | undefined, timeZone = DEFAULT_RENTAL_TIME_ZONE) {
  if (!value) return null
  const direct = value.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/)?.[1]
  if (direct) return direct
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value
  const year = part('year')
  const month = part('month')
  const day = part('day')
  return year && month && day ? `${year}-${month}-${day}` : null
}

function isoFromDateOnly(dateValue: string | null | undefined, time: { hour: number; minute: number } | null, timeZone = DEFAULT_RENTAL_TIME_ZONE) {
  if (!dateValue || !time) return null
  const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return isoWithBusinessOffset(Number(match[1]), Number(match[2]) - 1, Number(match[3]), time.hour, time.minute, timeZone)
}

function parseDateOnlyPhrase(text: string, now = new Date(), timeZone = DEFAULT_RENTAL_TIME_ZONE): string | null {
  const lower = text.toLowerCase()
  if (/\btomorrow\b/.test(lower)) {
    const base = new Date(now)
    base.setDate(base.getDate() + 1)
    return dateOnly(base.getFullYear(), base.getMonth(), base.getDate())
  }
  if (/\b(?:today|tonight)\b/.test(lower)) {
    return dateOnly(now.getFullYear(), now.getMonth(), now.getDate())
  }
  const monthMatch = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?\b/i)
  if (monthMatch) {
    const day = Number(monthMatch[1])
    const month = MONTH_INDEX[monthMatch[2].toLowerCase()]
    let year = monthMatch[3] ? Number(monthMatch[3]) : now.getFullYear()
    const candidate = new Date(year, month, day, 12, 0)
    if (!monthMatch[3] && candidate.getTime() < now.getTime() - 24 * 60 * 60 * 1000) year += 1
    return dateOnly(year, month, day)
  }
  const numericMatch = lower.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/)
  if (numericMatch) {
    const day = Number(numericMatch[1])
    const month = Number(numericMatch[2]) - 1
    const rawYear = numericMatch[3]
    let year = rawYear ? Number(rawYear.length === 2 ? `20${rawYear}` : rawYear) : now.getFullYear()
    const candidate = new Date(year, month, day, 12, 0)
    if (!rawYear && candidate.getTime() < now.getTime() - 24 * 60 * 60 * 1000) year += 1
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) return dateOnly(year, month, day)
  }
  const bareDayMatch = lower.match(/\b(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/)
  if (bareDayMatch) {
    const day = Number(bareDayMatch[1])
    if (day >= 1 && day <= 31) {
      let year = now.getFullYear()
      let month = now.getMonth()
      let candidate = new Date(year, month, day, 12, 0)
      if (candidate.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
        month += 1
        if (month > 11) {
          month = 0
          year += 1
        }
        candidate = new Date(year, month, day, 12, 0)
      }
      if (candidate.getMonth() === month && candidate.getDate() === day) return dateOnly(year, month, day)
    }
  }
  const weekday = Object.keys(WEEKDAY_INDEX).find(day => new RegExp(`\\b${day}\\b`, 'i').test(lower))
  if (weekday) {
    const base = nextWeekday(now, WEEKDAY_INDEX[weekday])
    return dateOnly(base.getFullYear(), base.getMonth(), base.getDate())
  }
  return null
}

function parseDatePhrase(text: string, now = new Date(), timeZone = DEFAULT_RENTAL_TIME_ZONE): string | null {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text.trim())) return text.trim()
  const lower = text.toLowerCase()
  const time = parseTime(text)
  if (!time) return null
  let base: Date | null = null

  if (/\btomorrow\b/.test(lower)) {
    base = new Date(now)
    base.setDate(base.getDate() + 1)
  } else if (/\b(?:today|tonight)\b/.test(lower)) {
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
  const hasDateIntent = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}[./-]\d{1,2}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|\d{4}-\d{2}-\d{2}T)\b/i.test(text)
  const pickupText = pickupMatch?.[1] ?? (hasDateIntent ? text : slots.pickup_datetime ?? text)
  const returnText = returnMatch?.[1] ?? slots.return_datetime ?? ''
  return {
    pickupText: /\bsame location\b/i.test(pickupText) && slots.pickup_datetime ? slots.pickup_datetime : pickupText,
    returnText: /\bsame location\b/i.test(returnText) && slots.return_datetime ? slots.return_datetime : returnText,
  }
}

function splitRentalDateOnlyWindow(message: string) {
  const text = message.trim()
  const fromUntil = text.match(/\b(?:from|pickup(?:\s+at)?(?!\s+location\b)|pick up(?!\s+location\b)|pick-up(?!\s+location\b)|rent(?:\s+a\s+car)?|rent)\s+(.+?)\s+(?:until|to|through|till|and\s+return(?:ing)?(?:\s+on)?|return(?:ing)?(?:\s+on)?|drop(?:off|-off)?(?:\s+on)?(?!\s+location\b))\s+(.+)$/i)
  if (fromUntil) return { pickupText: fromUntil[1], returnText: fromUntil[2] }
  const returnMatch = text.match(/\b(?:until|to|return(?:ing)?(?:\s+on)?|drop(?:off|-off)?(?:\s+on)?)\s+(.+)$/i)
  return {
    pickupText: text,
    returnText: returnMatch?.[1] ?? '',
  }
}

export function parseRentalDateWindow(
  message: string,
  slots: RentalDateWindowSlots = {},
  now = new Date(),
  timeZone = DEFAULT_RENTAL_TIME_ZONE,
) {
  const { pickupText, returnText } = splitRentalWindow(message, slots)
  const { pickupText: pickupDateText, returnText: returnDateText } = splitRentalDateOnlyWindow(message)
  const existingPickupDate = slots.pickup_date ?? datePartFromIso(slots.pickup_datetime, timeZone)
  const existingReturnDate = slots.return_date ?? datePartFromIso(slots.return_datetime, timeZone)
  const pickupDate = parseDateOnlyPhrase(pickupText, now, timeZone) ?? parseDateOnlyPhrase(pickupDateText, now, timeZone) ?? existingPickupDate
  const returnDate = parseDateOnlyPhrase(returnText, now, timeZone) ?? parseDateOnlyPhrase(returnDateText, now, timeZone) ?? existingReturnDate
  const clockTimes = parseClockTimes(message)
  let pickupTime = parseLabeledTime(message, 'pickup')
  let returnTime = parseLabeledTime(message, 'return')
  if (!pickupTime && returnTime && clockTimes.length >= 2) pickupTime = clockTimes[0]
  if (!pickupTime && !returnTime && clockTimes.length >= 2) {
    pickupTime = clockTimes[0]
    returnTime = clockTimes[1]
  }
  return {
    pickupAt: parseDatePhrase(pickupText, now, timeZone) ?? isoFromDateOnly(pickupDate, pickupTime, timeZone),
    dropoffAt: parseDatePhrase(returnText, now, timeZone) ?? isoFromDateOnly(returnDate, returnTime, timeZone),
    pickupDate,
    returnDate,
  }
}
