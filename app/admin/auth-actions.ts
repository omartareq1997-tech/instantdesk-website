'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { generateToken, COOKIE_NAME } from '../lib/auth'

/* ── Login ───────────────────────────────────────────────────
   Compares the submitted password against ADMIN_PASSWORD
   (server-only env var). On success writes a secure httpOnly
   cookie and returns nothing. On failure returns an error
   string for the client to display.
   ────────────────────────────────────────────────────────── */

export async function loginAction(
  password: string
): Promise<{ error?: string }> {
  const adminPassword = process.env.ADMIN_PASSWORD

  if (!adminPassword) {
    return { error: 'Server misconfiguration: ADMIN_PASSWORD is not set.' }
  }

  if (password !== adminPassword) {
    // Generic message — do not hint whether env var exists
    return { error: 'Incorrect password.' }
  }

  const jar = await cookies()
  jar.set(COOKIE_NAME, generateToken(adminPassword), {
    httpOnly:  true,
    secure:    process.env.NODE_ENV === 'production',
    sameSite:  'strict',
    maxAge:    60 * 60 * 24 * 7, // 7 days
    path:      '/',
  })

  return {}
}

/* ── Logout ──────────────────────────────────────────────────
   Deletes the session cookie and redirects to /login.
   Used as a form action so redirect() works correctly.
   ────────────────────────────────────────────────────────── */

export async function logoutAction(): Promise<never> {
  const jar = await cookies()
  jar.delete(COOKIE_NAME)
  redirect('/login')
}
