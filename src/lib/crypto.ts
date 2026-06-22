import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'

function key(): Buffer {
  const secret = process.env.MAIL_MCP_SECRET
  if (!secret) throw new Error('MAIL_MCP_SECRET env var is required when using DATABASE_URL')
  return createHash('sha256').update(secret).digest()
}

/** Encrypt a plaintext string. Returns "iv:authTag:ciphertext" (all base64). */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGO, key(), iv)
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`
}

/** Decrypt a value produced by encrypt(). */
export function decrypt(enc: string): string {
  const parts = enc.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted value format')
  const [ivB64, tagB64, dataB64] = parts as [string, string, string]
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

export const encryptOpt = (v?: string | null): string | null => v ? encrypt(v) : null
export const decryptOpt = (v?: string | null): string | undefined => v ? decrypt(v) : undefined
