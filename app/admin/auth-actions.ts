'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { generateToken, COOKIE_NAME } from '../lib/auth'

export async function loginAction(password: string): Promise<{ error?: string }> {
  const adminPassword = process.env.ADMIN_PASSWORD

  if (!adminPassword) {
    return { error: 'Server misconfiguration: ADMIN_PASSWORD is not set.' }
  }

  if (password !== adminPassword) {
    return { error: 'Incorrect password.' }
  }

  const jar = await cookies()
  jar.set(COOKIE_NAME, await generateToken(adminPassword), {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   60 * 60 * 24 * 7,
    path:     '/',
  })

  redirect('/admin')
}

export async function logoutAction(): Promise<never> {
  const jar = await cookies()
  jar.delete({ name: COOKIE_NAME, path: '/' })
  redirect('/login')
}
