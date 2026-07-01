/* ── Admin session (single shared password) ─────────────────── */

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

/* ── Member session (per-user invite auth) ──────────────────── */

export const MEMBER_COOKIE_NAME = 'member_session'

const enc = new TextEncoder()

function buf2hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function b64urlDecode(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (s.length % 4)) % 4)
  return atob(padded)
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

function memberSecret(): string {
  const explicitSecret = process.env.MEMBER_SESSION_SECRET?.trim()
  if (explicitSecret) return explicitSecret

  const adminPassword = process.env.ADMIN_PASSWORD?.trim()
  if (adminPassword) return adminPassword

  return 'instantdesk-member-v1'
}

export interface MemberPayload { id: string; name: string; role: string; iat: number }

/** Sign a member session token. */
export async function signMemberToken(payload: Omit<MemberPayload, 'iat'>): Promise<string> {
  const body = b64url(JSON.stringify({ ...payload, iat: Date.now() }))
  const key  = await hmacKey(memberSecret())
  const sig  = buf2hex(await crypto.subtle.sign('HMAC', key, enc.encode(body)))
  return `${body}.${sig}`
}

/** Verify a member session token. Returns the payload or null if invalid. */
export async function verifyMemberToken(token: string | undefined): Promise<MemberPayload | null> {
  if (!token) return null
  const dot = token.lastIndexOf('.')
  if (dot < 0) return null
  const body = token.slice(0, dot)
  const sig  = token.slice(dot + 1)
  try {
    const key      = await hmacKey(memberSecret())
    const expected = buf2hex(await crypto.subtle.sign('HMAC', key, enc.encode(body)))
    if (sig !== expected) return null
    const data = JSON.parse(b64urlDecode(body)) as MemberPayload
    // Tokens expire after 30 days
    if (Date.now() - data.iat > 30 * 24 * 60 * 60 * 1000) return null
    return data
  } catch {
    return null
  }
}

/* ── PBKDF2 password hashing ────────────────────────────────── */

/** Hash a plain-text password for storage. Returns `salt_hex:hash_hex`. */
export async function hashPassword(password: string): Promise<string> {
  const salt    = crypto.getRandomValues(new Uint8Array(16))
  const saltHex = buf2hex(salt.buffer)
  const key     = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits    = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    key, 256,
  )
  return `${saltHex}:${buf2hex(bits)}`
}

/** Verify a plain-text password against a stored `salt:hash` string. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const salt = new Uint8Array(saltHex.match(/../g)!.map(h => parseInt(h, 16)))
  const key  = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    key, 256,
  )
  return buf2hex(bits) === hashHex
}
