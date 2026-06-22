import { describe, it, expect, beforeEach } from 'vitest'

beforeEach(() => {
  process.env.MAIL_MCP_SECRET = 'test-secret-key-for-unit-tests'
})

describe('encrypt / decrypt', () => {
  it('round-trips a plain ASCII string', async () => {
    const { encrypt, decrypt } = await import('../src/lib/crypto.js')
    const plain = 'hello world'
    expect(decrypt(encrypt(plain))).toBe(plain)
  })

  it('round-trips a Gmail app password with spaces', async () => {
    const { encrypt, decrypt } = await import('../src/lib/crypto.js')
    const pass = 'awjg ewyf ubdw rtwu'
    expect(decrypt(encrypt(pass))).toBe(pass)
  })

  it('round-trips unicode / special characters', async () => {
    const { encrypt, decrypt } = await import('../src/lib/crypto.js')
    const plain = 'p@$$w0rd!#£€你好'
    expect(decrypt(encrypt(plain))).toBe(plain)
  })

  it('produces different ciphertexts for the same input (random IV)', async () => {
    const { encrypt } = await import('../src/lib/crypto.js')
    const plain = 'same-input'
    expect(encrypt(plain)).not.toBe(encrypt(plain))
  })

  it('encrypted value has iv:tag:ciphertext format', async () => {
    const { encrypt } = await import('../src/lib/crypto.js')
    const parts = encrypt('test').split(':')
    expect(parts).toHaveLength(3)
    parts.forEach(p => expect(p.length).toBeGreaterThan(0))
  })

  it('throws on tampered ciphertext (auth tag mismatch)', async () => {
    const { encrypt, decrypt } = await import('../src/lib/crypto.js')
    const enc = encrypt('secret')
    const parts = enc.split(':')
    // Corrupt the ciphertext part
    const tampered = parts[0] + ':' + parts[1] + ':' + 'aW52YWxpZA=='
    expect(() => decrypt(tampered)).toThrow()
  })

  it('throws when MAIL_MCP_SECRET is missing', async () => {
    const { encrypt } = await import('../src/lib/crypto.js')
    delete process.env.MAIL_MCP_SECRET
    expect(() => encrypt('test')).toThrow('MAIL_MCP_SECRET')
    process.env.MAIL_MCP_SECRET = 'test-secret-key-for-unit-tests'
  })
})

describe('encryptOpt / decryptOpt', () => {
  it('returns null for null/undefined input', async () => {
    const { encryptOpt, decryptOpt } = await import('../src/lib/crypto.js')
    expect(encryptOpt(null)).toBeNull()
    expect(encryptOpt(undefined)).toBeNull()
    expect(decryptOpt(null)).toBeUndefined()
    expect(decryptOpt(undefined)).toBeUndefined()
  })

  it('encrypts and decrypts a value', async () => {
    const { encryptOpt, decryptOpt } = await import('../src/lib/crypto.js')
    const enc = encryptOpt('my-password')
    expect(enc).not.toBeNull()
    expect(decryptOpt(enc!)).toBe('my-password')
  })
})

describe('key rotation — safeDecrypt', () => {
  it('returns empty string when decrypting with wrong key (simulates MAIL_MCP_SECRET rotation)', async () => {
    // Encrypt with key A
    process.env.MAIL_MCP_SECRET = 'key-A-original-secret'
    const { encrypt } = await import('../src/lib/crypto.js')
    const enc = encrypt('super-secret-password')

    // Switch to key B — decryption should fail gracefully
    process.env.MAIL_MCP_SECRET = 'key-B-rotated-secret'

    // Inline safeDecrypt logic (mirrors db.ts)
    const { decryptOpt } = await import('../src/lib/crypto.js')
    let result = ''
    try { result = decryptOpt(enc) ?? '' } catch { result = '' }

    expect(result).toBe('')
  })

  it('returns empty string for null/undefined input', async () => {
    const { decryptOpt } = await import('../src/lib/crypto.js')
    expect(decryptOpt(null)).toBeUndefined()
    expect(decryptOpt(undefined)).toBeUndefined()

    // safeDecrypt pattern — ?? '' gives empty string
    const safe = (v: string | null | undefined) => { try { return decryptOpt(v) ?? '' } catch { return '' } }
    expect(safe(null)).toBe('')
    expect(safe(undefined)).toBe('')
  })
})
