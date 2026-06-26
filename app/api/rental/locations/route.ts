import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'
import { demoRentalLocations } from '../../../lib/rental'

export const dynamic = 'force-dynamic'

function isMissingTable(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '42P01'
}

function isMissingColumn(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '42703'
}

function clean(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberOrNull(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function normalizeType(value: unknown) {
  const text = String(value ?? 'both').toLowerCase()
  if (text === 'pickup' || text === 'dropoff' || text === 'both') return text
  return 'both'
}

async function saveLocation(request: Request, id?: string) {
  const { businessId } = await getSessionBusinessId()
  const body = await request.json().catch(() => ({}))
  const sb = createAdminClient()
  const extendedPayload = {
    business_id: businessId,
    location_type: normalizeType(body.locationType ?? body.location_type),
    name: clean(body.name) ?? 'Rental location',
    address: clean(body.address),
    google_maps_link: clean(body.googleMapsLink ?? body.google_maps_link),
    latitude: numberOrNull(body.latitude),
    longitude: numberOrNull(body.longitude),
    terminal_instructions: clean(body.terminalInstructions ?? body.terminal_instructions),
    pickup_instruction_text: clean(body.pickupInstructionText ?? body.pickup_instruction_text),
    dropoff_instruction_text: clean(body.dropoffInstructionText ?? body.dropoff_instruction_text),
    whatsapp_text: clean(body.whatsappText ?? body.whatsapp_text) ?? clean(body.pickupInstructionText) ?? clean(body.dropoffInstructionText),
    active: body.active === undefined ? true : Boolean(body.active),
    updated_at: new Date().toISOString(),
  }
  const run = (payload: Record<string, unknown>) => id
    ? sb.from('rental_locations').update(payload).eq('business_id', businessId).eq('id', id).select('id').single()
    : sb.from('rental_locations').insert(payload).select('id').single()
  let result = await run(extendedPayload)
  if (result.error && isMissingColumn(result.error)) {
    const fallbackPayload = {
      business_id: businessId,
      name: extendedPayload.name,
      address: extendedPayload.address,
      google_maps_link: extendedPayload.google_maps_link,
      latitude: extendedPayload.latitude,
      longitude: extendedPayload.longitude,
      terminal_instructions: [
        `Type: ${extendedPayload.location_type}`,
        extendedPayload.terminal_instructions,
        extendedPayload.pickup_instruction_text ? `Pickup: ${extendedPayload.pickup_instruction_text}` : null,
        extendedPayload.dropoff_instruction_text ? `Drop-off: ${extendedPayload.dropoff_instruction_text}` : null,
      ].filter(Boolean).join('\n'),
      whatsapp_text: extendedPayload.whatsapp_text,
      active: extendedPayload.active,
      updated_at: extendedPayload.updated_at,
    }
    result = await run(fallbackPayload)
  }
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: isMissingTable(result.error) ? 503 : 500 })
  return NextResponse.json({ ok: true, id: result.data.id })
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  if (url.searchParams.get('action') === 'demo') {
    const { businessId } = await getSessionBusinessId()
    const sb = createAdminClient()
    let count = 0
    for (const location of demoRentalLocations) {
      const payload = {
        locationType: 'both',
        name: location.name,
        address: location.address,
        googleMapsLink: location.googleMapsLink,
        terminalInstructions: location.terminalInstructions,
        pickupInstructionText: location.whatsappText,
        dropoffInstructionText: location.whatsappText,
        whatsappText: location.whatsappText,
        active: location.active,
      }
      const response = await saveLocation(new Request(request.url, { method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' } }))
      if (!response.ok) return response
      count++
    }
    return NextResponse.json({ ok: true, importedLocations: count })
  }
  return saveLocation(request)
}

export async function PUT(request: Request) {
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  return saveLocation(request, id)
}

export async function DELETE(request: Request) {
  const { businessId } = await getSessionBusinessId()
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const sb = createAdminClient()
  const { error } = await sb.from('rental_locations').delete().eq('business_id', businessId).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: isMissingTable(error) ? 503 : 500 })
  return NextResponse.json({ ok: true })
}
