/**
 * Resolves the business_id (and client_id) for the currently authenticated user.
 *
 * Resolution order:
 *   1. Supabase Auth session → look up clients.user_id  (owner login)
 *      Always reuses the FIRST (oldest) clients row for this user — idempotent
 *      even if duplicates were accidentally created by earlier bugs.
 *      Only provisions a new clients row if NONE exists for this user_id.
 *      Only provisions a businesses row if the businesses FK target is missing.
 *   2. member_session cookie → look up team_members → clients.id
 *   3. Env-var fallback (unauthenticated / demo mode only)
 *
 * clientId == businessId == clients.id == businesses.id
 * leads.business_id  FK → businesses.id
 * other tables use client_id which also equals clients.id
 */

import { createSSRClient } from './supabase-ssr-client'
import { createAdminClient } from './supabase-server'
import { cookies } from 'next/headers'
import { MEMBER_COOKIE_NAME, verifyMemberToken } from './auth'

const FALLBACK_ID =
  process.env.DEMO_CLIENT_ID ??
  process.env.NEXT_PUBLIC_DEMO_CLIENT_ID ??
  '0616a47a-2c01-49ce-a798-385f8276b92b'

export interface SessionIds {
  clientId:      string
  businessId:    string
  fromSession:   boolean
  ownerName:     string
  businessName:  string
  userEmail:     string
}

/**
 * Ensures businesses.id = clientId exists (leads FK target).
 * Uses read-first to avoid writes on every request.
 * Only writes once per client lifetime (or after manual DB cleanup).
 */
async function ensureBusinessesRow(
  admin:        ReturnType<typeof createAdminClient>,
  clientId:     string,
  businessName: string,
): Promise<boolean> {
  const { data: existing } = await admin
    .from('businesses')
    .select('id')
    .eq('id', clientId)
    .limit(1)

  if (existing && existing.length > 0) {
    console.log('[getSessionBusinessId] businesses row exists:', clientId)
    return true
  }

  const { error } = await admin
    .from('businesses')
    .upsert({ id: clientId, name: businessName }, { onConflict: 'id' })

  if (error) {
    console.error('[getSessionBusinessId] businesses row provision FAILED:', {
      clientId,
      message: error.message,
      code:    error.code,
      hint:    error.hint,
      details: error.details,
    })
    return false
  }

  console.log('[getSessionBusinessId] businesses row provisioned:', clientId)
  return true
}

export async function getSessionBusinessId(): Promise<SessionIds> {
  // ── 1. Supabase Auth (owner) ─────────────────────────────────────────────
  try {
    const sb = await createSSRClient()
    const { data: { user } } = await sb.auth.getUser()

    if (user) {
      const admin        = createAdminClient()
      const email        = user.email ?? ''
      const ownerName    = email.split('@')[0] || 'Owner'

      console.log('[getSessionBusinessId] auth user id:', user.id)

      // ── Always fetch the OLDEST clients row for this user.
      // Use array + limit(1) instead of maybeSingle() so duplicate rows
      // (from prior buggy provisioning) never cause a null return and never
      // trigger another INSERT.
      const { data: clientRows, error: selectErr } = await admin
        .from('clients')
        .select('id, business_name')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)

      if (selectErr) {
        console.warn('[getSessionBusinessId] clients select error:', selectErr.message)
      }

      const existingClient = clientRows?.[0] ?? null
      console.log('[getSessionBusinessId] existing client found:', !!existingClient?.id, existingClient?.id ?? 'none')

      if (existingClient?.id) {
        const businessName = (existingClient.business_name as string | null) || ownerName
        const bizExists    = await ensureBusinessesRow(admin, existingClient.id, businessName)

        console.log('[getSessionBusinessId] resolved', {
          clientId:   existingClient.id,
          businessId: existingClient.id,
          bizExists,
        })

        return {
          clientId:    existingClient.id,
          businessId:  existingClient.id,
          fromSession: true,
          ownerName,
          businessName,
          userEmail:   email,
        }
      }

      // ── No clients row yet — provision exactly once ───────────────────────
      const businessName = ownerName + "'s Business"

      const { data: newClient, error: insertErr } = await admin
        .from('clients')
        .insert({ user_id: user.id, business_name: businessName })
        .select('id')
        .single()

      if (newClient?.id) {
        console.log('[getSessionBusinessId] provisioned new clients row:', newClient.id, 'for user:', user.id)
        const bizExists = await ensureBusinessesRow(admin, newClient.id, businessName)

        console.log('[getSessionBusinessId] resolved (new)', {
          clientId:   newClient.id,
          businessId: newClient.id,
          bizExists,
        })

        return {
          clientId:    newClient.id,
          businessId:  newClient.id,
          fromSession: true,
          ownerName,
          businessName,
          userEmail:   email,
        }
      }

      // Race condition: another concurrent request inserted first (23505 = unique violation)
      if (insertErr?.code === '23505') {
        const { data: racedRows } = await admin
          .from('clients')
          .select('id, business_name')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1)

        const racedClient = racedRows?.[0] ?? null
        if (racedClient?.id) {
          const bName     = (racedClient.business_name as string | null) || businessName
          const bizExists = await ensureBusinessesRow(admin, racedClient.id, bName)

          console.log('[getSessionBusinessId] resolved (race retry)', {
            clientId:   racedClient.id,
            businessId: racedClient.id,
            bizExists,
          })

          return {
            clientId:    racedClient.id,
            businessId:  racedClient.id,
            fromSession: true,
            ownerName,
            businessName: bName,
            userEmail:   email,
          }
        }
      }

      console.warn('[getSessionBusinessId] failed to provision clients row:', insertErr)
    }
  } catch (e) {
    console.warn('[getSessionBusinessId] Supabase Auth check failed:', e)
  }

  // ── 2. Member session cookie ─────────────────────────────────────────────
  try {
    const cookieStore = await cookies()
    const rawToken    = cookieStore.get(MEMBER_COOKIE_NAME)?.value
    const member      = await verifyMemberToken(rawToken)
    if (member?.id) {
      const admin = createAdminClient()
      const { data: tm } = await admin
        .from('team_members')
        .select('client_id, name, email')
        .eq('id', member.id)
        .maybeSingle()
      const row      = tm as { client_id?: string; name?: string; email?: string } | null
      const clientId = row?.client_id
      if (clientId) {
        return {
          clientId, businessId: clientId, fromSession: true,
          ownerName:    row?.name  ?? member.name ?? 'Team Member',
          businessName: '',
          userEmail:    row?.email ?? '',
        }
      }
    }
  } catch { /* member session invalid */ }

  // ── 3. Env-var fallback (unauthenticated / demo mode) ────────────────────
  return {
    clientId:     FALLBACK_ID,
    businessId:   FALLBACK_ID,
    fromSession:  false,
    ownerName:    'Alex Thompson',
    businessName: 'TechFlow Solutions',
    userEmail:    '',
  }
}
