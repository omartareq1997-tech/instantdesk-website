import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-server'
import { getSessionBusinessId } from '../../../lib/getSessionBusinessId'
import { demoRentalSettings } from '../../../lib/rental'

export const dynamic = 'force-dynamic'

function isMissingColumn(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '42703'
}

function clean(value: unknown) {
  return typeof value === 'string' ? value : null
}

function mapSettings(row: any) {
  return {
    cleaningBufferMinutes: row?.cleaning_buffer_minutes ?? 120,
    currency: row?.currency ?? 'PLN',
    minimumRentalDuration: row?.minimum_rental_duration ?? null,
    depositPolicy: row?.deposit_policy ?? row?.terms_summary ?? null,
    cancellationPolicy: row?.cancellation_policy ?? null,
    returnPolicy: row?.return_policy ?? null,
    lateReturnPolicy: row?.late_return_policy ?? null,
    fuelPolicy: row?.fuel_policy ?? null,
    mileagePolicy: row?.mileage_policy ?? null,
    crossBorderPolicy: row?.cross_border_policy ?? null,
    pickupDropoffRules: row?.pickup_dropoff_rules ?? null,
    requiredDocumentsText: row?.required_documents_text ?? null,
    insuranceExtrasNotes: row?.insurance_extras_notes ?? null,
    companyName: row?.company_contact_name ?? null,
    companyPhone: row?.company_contact_phone ?? null,
    companyWhatsapp: row?.company_whatsapp ?? null,
    companyEmail: row?.company_contact_email ?? null,
    companyWebsite: row?.company_website ?? null,
    providerName: row?.provider_name ?? null,
    apiUrl: row?.api_url ?? null,
    apiKeyConfigured: Boolean(row?.api_key_encrypted),
    syncDirection: row?.sync_direction ?? 'none',
    webhookUrl: row?.webhook_url ?? null,
    externalSyncEnabled: Boolean(row?.external_sync_enabled),
    lastSyncAt: row?.last_sync_at ?? null,
    lastSyncStatus: row?.last_sync_status ?? null,
    lastSyncError: row?.last_sync_error ?? null,
  }
}

export async function GET() {
  const { businessId } = await getSessionBusinessId()
  const sb = createAdminClient()
  let result = await sb.from('rental_settings').select('*').eq('business_id', businessId).maybeSingle()
  if (result.error && isMissingColumn(result.error)) {
    result = await sb.from('rental_settings').select('business_id,cleaning_buffer_minutes,provider_name,api_url,api_key_encrypted,sync_direction,webhook_url,external_sync_enabled,last_sync_at,last_sync_status,last_sync_error,company_contact_name,company_contact_email,company_contact_phone,terms_summary').eq('business_id', businessId).maybeSingle()
  }
  if (result.error) {
    return NextResponse.json({
      settings: { ...demoRentalSettings, ...mapSettings(null) },
      migrationRequired: true,
      error: result.error.message,
    })
  }
  return NextResponse.json({ settings: mapSettings(result.data) })
}

export async function POST(request: Request) {
  const { businessId } = await getSessionBusinessId()
  const body = await request.json().catch(() => ({}))
  const sb = createAdminClient()
  const fullPayload = {
    business_id: businessId,
    cleaning_buffer_minutes: Number(body.cleaningBufferMinutes) || 120,
    currency: body.currency ?? 'PLN',
    minimum_rental_duration: clean(body.minimumRentalDuration),
    deposit_policy: clean(body.depositPolicy),
    cancellation_policy: clean(body.cancellationPolicy),
    return_policy: clean(body.returnPolicy),
    late_return_policy: clean(body.lateReturnPolicy),
    fuel_policy: clean(body.fuelPolicy),
    mileage_policy: clean(body.mileagePolicy),
    cross_border_policy: clean(body.crossBorderPolicy),
    pickup_dropoff_rules: clean(body.pickupDropoffRules),
    required_documents_text: clean(body.requiredDocumentsText),
    insurance_extras_notes: clean(body.insuranceExtrasNotes),
    company_contact_name: clean(body.companyName),
    company_contact_phone: clean(body.companyPhone),
    company_whatsapp: clean(body.companyWhatsapp),
    company_contact_email: clean(body.companyEmail),
    company_website: clean(body.companyWebsite),
    provider_name: body.providerName ?? null,
    api_url: body.apiUrl ?? null,
    api_key_encrypted: body.apiKey ? `configured:${String(body.apiKey).slice(0, 4)}` : undefined,
    sync_direction: body.syncDirection ?? 'none',
    webhook_url: body.webhookUrl ?? null,
    external_sync_enabled: Boolean(body.externalSyncEnabled),
    last_sync_status: body.syncNow ? 'manual_sync_requested' : body.lastSyncStatus ?? null,
    last_sync_at: body.syncNow ? new Date().toISOString() : body.lastSyncAt ?? null,
    updated_at: new Date().toISOString(),
  }

  let { error } = await sb.from('rental_settings').upsert(fullPayload, { onConflict: 'business_id' })
  if (error && isMissingColumn(error)) {
    const fallbackPayload = {
      business_id: businessId,
      cleaning_buffer_minutes: fullPayload.cleaning_buffer_minutes,
      provider_name: fullPayload.provider_name,
      api_url: fullPayload.api_url,
      api_key_encrypted: fullPayload.api_key_encrypted,
      sync_direction: fullPayload.sync_direction,
      webhook_url: fullPayload.webhook_url,
      external_sync_enabled: fullPayload.external_sync_enabled,
      last_sync_status: fullPayload.last_sync_status,
      last_sync_at: fullPayload.last_sync_at,
      company_contact_name: fullPayload.company_contact_name,
      company_contact_email: fullPayload.company_contact_email,
      company_contact_phone: fullPayload.company_contact_phone,
      terms_summary: [
        fullPayload.deposit_policy ? `Deposit: ${fullPayload.deposit_policy}` : null,
        fullPayload.cancellation_policy ? `Cancellation: ${fullPayload.cancellation_policy}` : null,
        fullPayload.return_policy ? `Return: ${fullPayload.return_policy}` : null,
        fullPayload.late_return_policy ? `Late returns: ${fullPayload.late_return_policy}` : null,
        fullPayload.fuel_policy ? `Fuel: ${fullPayload.fuel_policy}` : null,
        fullPayload.mileage_policy ? `Mileage: ${fullPayload.mileage_policy}` : null,
        fullPayload.cross_border_policy ? `Cross-border: ${fullPayload.cross_border_policy}` : null,
        fullPayload.required_documents_text ? `Documents: ${fullPayload.required_documents_text}` : null,
      ].filter(Boolean).join('\n') || null,
      updated_at: fullPayload.updated_at,
    }
    ;({ error } = await sb.from('rental_settings').upsert(fallbackPayload, { onConflict: 'business_id' }))
  }

  if (error) return NextResponse.json({ error: error.message }, { status: error.code === '42P01' ? 503 : 500 })
  return NextResponse.json({ ok: true, syncStatus: body.syncNow ? 'manual_sync_requested' : 'saved' })
}
