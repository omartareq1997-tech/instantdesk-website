import type { createAdminClient } from './supabase-server'

type DB = ReturnType<typeof createAdminClient>

export interface LeadMemory {
  id:               string
  business_id:      string
  lead_id:          string
  conversation_id:  string | null
  preferences:      string | null
  budget:           string | null
  desired_location: string | null
  urgency:          string | null
  objections:       string | null
  viewed_properties:string | null
  language:         string | null
  summary:          string | null
  last_user_intent: string | null
  next_best_action: string | null
  updated_at:       string
  created_at:       string
}

// Minimal slot shape — mirrors chat/route.ts Slots interface
interface MemorySlots {
  name:          string | null
  phone:         string | null
  email:         string | null
  city:          string | null
  area:          string | null
  budget:        string | null
  property_type: string | null
  rooms:         string | null
  deal_type:     string | null
  viewing_time:  string | null
  pickup_location?: string | null
  dropoff_location?: string | null
  pickup_datetime?: string | null
  return_datetime?: string | null
  car_class?: string | null
  transmission?: string | null
  seats?: string | null
  booking_number?: string | null
  extension_request?: string | null
}

/* ─── Deterministic extractors ───────────────────────────────────────────── */

function detectLanguage(text: string): string {
  if (/\b(nie|tak|czy|szukam|chcę|proszę|mieszkanie|wynajem)\b/.test(text)) return 'Polish'
  if (/\b(bonjour|merci|appartement|louer|acheter|oui|non)\b/.test(text)) return 'French'
  if (/\b(hola|gracias|busco|quiero|apartamento|piso|sí)\b/.test(text)) return 'Spanish'
  if (/\b(danke|bitte|suche|wohnung|mieten|kaufen|ja|nein)\b/.test(text)) return 'German'
  if (/[а-яА-Я]{3,}/.test(text)) return 'Russian'
  if (/[؀-ۿ]{3,}/.test(text)) return 'Arabic'
  return 'English'
}

function detectUrgency(text: string): string | null {
  const t = text.toLowerCase()
  if (/\b(asap|urgent|immediately|right away|today|this week|as soon as possible|need it now|quickly|moving soon|relocating soon)\b/.test(t)) return 'high'
  if (/\b(soon|within a month|next month|couple of weeks|few weeks|planning to move|planning to buy|planning to rent)\b/.test(t)) return 'medium'
  if (/\b(not in a rush|flexible|whenever|no hurry|no rush|just browsing|just looking|exploring)\b/.test(t)) return 'low'
  return null
}

function detectObjections(text: string): string[] {
  const found: string[] = []
  if (/\b(too expensive|out of budget|can'?t afford|too much|overpriced)\b/i.test(text)) found.push('price concern')
  if (/\b(not interested|not for me|doesn'?t suit|don'?t like|not what)\b/i.test(text)) found.push('not interested')
  if (/\b(need to think|need time|not ready|maybe later|undecided|will consider|call me back)\b/i.test(text)) found.push('needs time to decide')
  if (/\b(too small|too big|too far|wrong area|wrong location|not the right|wrong car|wrong vehicle)\b/i.test(text)) found.push('mismatch concern')
  return found
}

function detectViewedProperties(messages: { role: string; content: string }[]): string | null {
  const refs: string[] = []
  const urlRe  = /https?:\/\/[^\s)>"']+/gi
  const itemRe = /\b(?:property|apartment|flat|unit|listing|car|vehicle|booking)\s+(?:at|on|in|number)?\s*([A-Z0-9][^\n.!?]{4,50})/gi
  for (const m of messages) {
    if (m.role !== 'user') continue
    let match: RegExpExecArray | null
    while ((match = urlRe.exec(m.content)) !== null) refs.push(match[0].slice(0, 80))
    while ((match = itemRe.exec(m.content)) !== null) refs.push(match[1].trim().slice(0, 60))
  }
  const unique = [...new Set(refs)]
  return unique.length ? unique.slice(0, 5).join('; ') : null
}

function buildPreferences(slots: MemorySlots): string | null {
  const parts: string[] = []
  if (slots.car_class)     parts.push(slots.car_class)
  if (slots.transmission)  parts.push(slots.transmission)
  if (slots.seats)         parts.push(`${slots.seats} seats`)
  if (slots.deal_type)     parts.push(`${slots.deal_type === 'rent' ? 'Renting' : 'Buying'}`)
  if (slots.property_type) parts.push(slots.property_type)
  if (slots.rooms)         parts.push(slots.rooms)
  return parts.length ? parts.join(', ') : null
}

function buildSummary(slots: MemorySlots, stage: string): string | null {
  const parts: string[] = []
  if (slots.name)          parts.push(slots.name)
  if (slots.car_class)     parts.push(`${slots.car_class} rental`)
  if (slots.pickup_location) parts.push(`pickup ${slots.pickup_location}`)
  if (slots.pickup_datetime) parts.push(`from ${slots.pickup_datetime}`)
  if (slots.return_datetime) parts.push(`to ${slots.return_datetime}`)
  if (slots.deal_type)     parts.push(slots.deal_type === 'rent' ? 'renting' : 'buying')
  if (slots.property_type) parts.push(slots.property_type)
  if (slots.rooms)         parts.push(slots.rooms)
  if (slots.city)          parts.push(`in ${slots.city}${slots.area ? ` (${slots.area})` : ''}`)
  if (slots.budget)        parts.push(`budget ${slots.budget}`)
  if (parts.length === 0)  return null
  return `${parts.join(' · ')} · stage: ${stage}`
}

function buildNextBestAction(stage: string, slots: MemorySlots): string {
  if (slots.car_class || slots.pickup_location || slots.pickup_datetime || slots.booking_number) {
    if (stage === 'booked') return 'Booking details captured — prepare confirmation and pickup instructions'
    if (slots.extension_request) return 'Extension requested — check same-car availability and hand over if unavailable'
    if (stage === 'ready_to_book') return 'Core rental details collected — check availability before offering a vehicle'
    if (stage === 'qualifying') {
      const missing: string[] = []
      if (!slots.pickup_location) missing.push('pickup location')
      if (!slots.pickup_datetime) missing.push('pickup date/time')
      if (!slots.return_datetime) missing.push('return date/time')
      if (!slots.car_class) missing.push('car class')
      if (!slots.name) missing.push('customer name')
      return missing.length ? `Still need: ${missing.slice(0, 3).join(', ')}` : 'Check availability and guide toward booking'
    }
  }
  if (stage === 'booked')        return 'Appointment confirmed — prepare property shortlist for viewing'
  if (stage === 'ready_to_book') return 'All core info collected — suggest a concrete viewing time'
  if (stage === 'qualifying') {
    const missing: string[] = []
    if (!slots.city)          missing.push('location')
    if (!slots.deal_type)     missing.push('rent/buy intent')
    if (!slots.property_type) missing.push('property type')
    if (!slots.budget)        missing.push('budget')
    if (!slots.name)          missing.push('contact name')
    return missing.length
      ? `Still need: ${missing.slice(0, 3).join(', ')}`
      : 'Complete qualification and guide toward booking'
  }
  return 'Open discovery — understand what brought the lead here'
}

/* ─── Public API ─────────────────────────────────────────────────────────── */

export async function loadLeadMemory(
  sb: DB,
  businessId: string,
  leadId: string,
): Promise<LeadMemory | null> {
  const { data } = await sb
    .from('lead_memory')
    .select('*')
    .eq('business_id', businessId)
    .eq('lead_id', leadId)
    .maybeSingle()
  return (data as LeadMemory | null) ?? null
}

export async function upsertLeadMemory(
  sb: DB,
  opts: {
    businessId:     string
    leadId:         string
    conversationId: string
    confirmed:      MemorySlots
    stage:          string
    messages:       { role: string; content: string }[]
    userMessage:    string
  },
): Promise<void> {
  const { businessId, leadId, conversationId, confirmed, stage, messages, userMessage } = opts

  const allUserText = messages
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .concat(userMessage)
    .join(' ')

  const allObjections = [
    ...new Set(
      messages
        .filter(m => m.role === 'user')
        .flatMap(m => detectObjections(m.content))
        .concat(detectObjections(userMessage)),
    ),
  ]

  const patch = {
    business_id:       businessId,
    lead_id:           leadId,
    conversation_id:   conversationId,
    preferences:       buildPreferences(confirmed),
    budget:            confirmed.budget,
    desired_location:  [confirmed.city, confirmed.area].filter(Boolean).join(', ') || null,
    urgency:           detectUrgency(allUserText),
    objections:        allObjections.length ? allObjections.join('; ') : null,
    viewed_properties: detectViewedProperties(messages),
    language:          detectLanguage(userMessage),
    summary:           buildSummary(confirmed, stage),
    last_user_intent:  userMessage.slice(0, 200),
    next_best_action:  buildNextBestAction(stage, confirmed),
    updated_at:        new Date().toISOString(),
  }

  const { error } = await sb.from('lead_memory').upsert(patch, {
    onConflict: 'business_id,lead_id',
  })
  if (error) console.error('[leadMemory] upsert error:', error.message)
  else console.log('[leadMemory] upserted for lead:', leadId)
}

export function formatMemoryForPrompt(memory: LeadMemory | null): string {
  if (!memory) return ''
  const lines: string[] = []
  if (memory.summary)            lines.push(`Summary: ${memory.summary}`)
  if (memory.preferences)        lines.push(`Preferences: ${memory.preferences}`)
  if (memory.budget)             lines.push(`Budget: ${memory.budget}`)
  if (memory.desired_location)   lines.push(`Desired location: ${memory.desired_location}`)
  if (memory.urgency)            lines.push(`Urgency: ${memory.urgency}`)
  if (memory.objections)         lines.push(`Objections noted: ${memory.objections}`)
  if (memory.viewed_properties)  lines.push(`Referenced items/bookings: ${memory.viewed_properties}`)
  if (memory.language && memory.language !== 'English')
                                 lines.push(`Language: ${memory.language}`)
  if (memory.next_best_action)   lines.push(`Next best action: ${memory.next_best_action}`)
  return lines.join('\n')
}
