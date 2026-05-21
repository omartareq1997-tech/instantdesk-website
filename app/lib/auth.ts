const SALT = 'instantdesk-admin-v1'
export const COOKIE_NAME = 'admin_session'

/** Deterministic SHA-256 token derived from the current ADMIN_PASSWORD.
 *  Uses Web Crypto so it works in both Node.js (server actions) and Edge (middleware).
 */
export async function generateToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(SALT + password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Returns true if the cookie value matches the expected token for ADMIN_PASSWORD. */
export async function verifyToken(token: string | undefined): Promise<boolean> {
  const password = process.env.ADMIN_PASSWORD
  if (!password || !token) return false
  return token === await generateToken(password)
}
