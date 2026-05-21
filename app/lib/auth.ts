import { createHash } from 'crypto'

/* ── Token helpers ───────────────────────────────────────────
   Server-only. Uses Node.js crypto — never import this in a
   'use client' file (the build will fail naturally because
   'crypto' is not available in browser bundles).
   ────────────────────────────────────────────────────────── */

const SALT = 'instantdesk-admin-v1'
export const COOKIE_NAME = 'admin_session'

/** Deterministic token derived from the current ADMIN_PASSWORD. */
export function generateToken(password: string): string {
  return createHash('sha256')
    .update(SALT + password)
    .digest('hex')
}

/**
 * Returns true if the cookie value matches the expected token
 * for the current ADMIN_PASSWORD env var.
 */
export function verifyToken(token: string | undefined): boolean {
  const password = process.env.ADMIN_PASSWORD
  if (!password || !token) return false
  return token === generateToken(password)
}
