import type { EmployeeAccount, PasswordVerifier } from '../types/employees'

const iterations = 210_000
const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

async function derivePassword(password: string, salt: Uint8Array<ArrayBuffer>, rounds: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, key, 256)
  return toHex(new Uint8Array(bits))
}

export async function createPasswordVerifier(password: string): Promise<PasswordVerifier> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return { algorithm: 'PBKDF2-SHA256', iterations, salt: toHex(salt), hash: await derivePassword(password, salt, iterations) }
}

export function isPasswordVerifier(value: unknown): value is PasswordVerifier {
  if (typeof value !== 'object' || value === null) return false
  const verifier = value as Partial<PasswordVerifier>
  return verifier.algorithm === 'PBKDF2-SHA256' && Number.isInteger(verifier.iterations)
    && typeof verifier.iterations === 'number' && verifier.iterations >= 100_000 && verifier.iterations <= 1_000_000
    && typeof verifier.salt === 'string' && /^[a-f0-9]{32}$/.test(verifier.salt)
    && typeof verifier.hash === 'string' && /^[a-f0-9]{64}$/.test(verifier.hash)
}

export async function verifyEmployeePassword(account: EmployeeAccount, password: string) {
  const verifier = account.passwordVerifier
  if (!verifier) return password.length > 0
  if (!isPasswordVerifier(verifier)) return false
  const salt = new Uint8Array(verifier.salt.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)))
  return await derivePassword(password, salt, verifier.iterations) === verifier.hash
}
