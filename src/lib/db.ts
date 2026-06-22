import postgres from 'postgres'
import type { RawAccountConfig } from '../types.js'
import { encryptOpt, decryptOpt } from './crypto.js'

let _sql: ReturnType<typeof postgres> | null = null

export function getSql(): ReturnType<typeof postgres> {
  if (!_sql) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    const local = url.includes('localhost') || url.includes('127.0.0.1')
    _sql = postgres(url, { ssl: local ? false : 'require', max: 5 })
  }
  return _sql
}

export async function migrate(): Promise<void> {
  const sql = getSql()
  await sql`
    CREATE TABLE IF NOT EXISTS mail_mcp_accounts (
      name                 TEXT PRIMARY KEY,
      label                TEXT,
      is_default           BOOLEAN NOT NULL DEFAULT false,
      imap_host            TEXT,
      imap_port            INTEGER,
      imap_secure          BOOLEAN,
      imap_user            TEXT,
      imap_pass_enc        TEXT,
      smtp_host            TEXT,
      smtp_port            INTEGER,
      smtp_secure          BOOLEAN,
      smtp_user            TEXT,
      smtp_pass_enc        TEXT,
      transport            TEXT,
      transport_api_key_enc TEXT,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
}

/** Decrypt a stored value — returns empty string if decryption fails (e.g. key rotation). */
function safeDecrypt(enc: string | null | undefined): string {
  if (!enc) return ''
  try { return decryptOpt(enc) ?? '' } catch {
    console.warn('[mail-mcp] Failed to decrypt a stored credential — MAIL_MCP_SECRET may have changed. Re-set the password via POST /accounts/:name/password.')
    return ''
  }
}

/** Safe public listing — never returns encrypted fields. */
export async function listAccountsPublic() {
  const sql = getSql()
  return sql`
    SELECT name, label, is_default,
           imap_host, imap_port, imap_secure, imap_user,
           smtp_host, smtp_port, smtp_secure, smtp_user,
           transport,
           (imap_pass_enc IS NOT NULL)         AS has_imap_pass,
           (smtp_pass_enc IS NOT NULL)         AS has_smtp_pass,
           (transport_api_key_enc IS NOT NULL) AS has_transport_key,
           created_at, updated_at
    FROM mail_mcp_accounts ORDER BY is_default DESC, created_at ASC
  `
}

export async function loadAccountsFromDb(): Promise<RawAccountConfig[]> {
  const sql = getSql()
  const rows = await sql`
    SELECT * FROM mail_mcp_accounts ORDER BY is_default DESC, created_at ASC
  `

  return rows.map(r => {
    const account: RawAccountConfig = { name: r.name as string }
    if (r.label)      account.label   = r.label as string
    if (r.is_default) account.default = true

    if (r.imap_host) {
      account.imap = {
        host:   r.imap_host as string,
        port:   (r.imap_port as number) ?? 993,
        secure: (r.imap_secure as boolean) ?? true,
        auth: {
          type: 'plain',
          user: (r.imap_user as string) ?? '',
          pass: safeDecrypt(r.imap_pass_enc as string),
        },
      }
    }

    if (r.transport) {
      account.transport      = r.transport as RawAccountConfig['transport']
      account.transportApiKey = safeDecrypt(r.transport_api_key_enc as string) || undefined
    } else if (r.smtp_host) {
      account.smtp = {
        host:   r.smtp_host as string,
        port:   (r.smtp_port as number) ?? 587,
        secure: (r.smtp_secure as boolean) ?? false,
        auth: {
          type: 'plain',
          user: (r.smtp_user as string) ?? '',
          pass: safeDecrypt(r.smtp_pass_enc as string),
        },
      }
    }

    return account
  })
}

export interface UpsertInput {
  name: string
  label?: string
  isDefault?: boolean
  imapHost?: string; imapPort?: number; imapSecure?: boolean
  imapUser?: string; imapPass?: string
  smtpHost?: string; smtpPort?: number; smtpSecure?: boolean
  smtpUser?: string; smtpPass?: string
  transport?: string; transportApiKey?: string
}

export async function upsertAccount(input: UpsertInput): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO mail_mcp_accounts (
      name, label, is_default,
      imap_host, imap_port, imap_secure, imap_user, imap_pass_enc,
      smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass_enc,
      transport, transport_api_key_enc, updated_at
    ) VALUES (
      ${input.name},
      ${input.label ?? null},
      ${input.isDefault ?? false},
      ${input.imapHost ?? null}, ${input.imapPort ?? null}, ${input.imapSecure ?? null},
      ${input.imapUser ?? null}, ${encryptOpt(input.imapPass)},
      ${input.smtpHost ?? null}, ${input.smtpPort ?? null}, ${input.smtpSecure ?? null},
      ${input.smtpUser ?? null}, ${encryptOpt(input.smtpPass)},
      ${input.transport ?? null}, ${encryptOpt(input.transportApiKey)},
      NOW()
    )
    ON CONFLICT (name) DO UPDATE SET
      label                 = COALESCE(EXCLUDED.label,                 mail_mcp_accounts.label),
      is_default            = EXCLUDED.is_default,
      imap_host             = COALESCE(EXCLUDED.imap_host,             mail_mcp_accounts.imap_host),
      imap_port             = COALESCE(EXCLUDED.imap_port,             mail_mcp_accounts.imap_port),
      imap_secure           = COALESCE(EXCLUDED.imap_secure,           mail_mcp_accounts.imap_secure),
      imap_user             = COALESCE(EXCLUDED.imap_user,             mail_mcp_accounts.imap_user),
      imap_pass_enc         = COALESCE(EXCLUDED.imap_pass_enc,         mail_mcp_accounts.imap_pass_enc),
      smtp_host             = COALESCE(EXCLUDED.smtp_host,             mail_mcp_accounts.smtp_host),
      smtp_port             = COALESCE(EXCLUDED.smtp_port,             mail_mcp_accounts.smtp_port),
      smtp_secure           = COALESCE(EXCLUDED.smtp_secure,           mail_mcp_accounts.smtp_secure),
      smtp_user             = COALESCE(EXCLUDED.smtp_user,             mail_mcp_accounts.smtp_user),
      smtp_pass_enc         = COALESCE(EXCLUDED.smtp_pass_enc,         mail_mcp_accounts.smtp_pass_enc),
      transport             = COALESCE(EXCLUDED.transport,             mail_mcp_accounts.transport),
      transport_api_key_enc = COALESCE(EXCLUDED.transport_api_key_enc, mail_mcp_accounts.transport_api_key_enc),
      updated_at            = NOW()
  `
}

export async function deleteAccount(name: string): Promise<void> {
  const sql = getSql()
  await sql`DELETE FROM mail_mcp_accounts WHERE name = ${name}`
}

export async function setDefaultAccount(name: string): Promise<void> {
  const sql = getSql()
  await sql`
    UPDATE mail_mcp_accounts
    SET is_default = (name = ${name}), updated_at = NOW()
  `
}

/**
 * Update only the encrypted password fields for an account.
 * Fields not provided are left unchanged (CASE WHEN null → keep existing).
 * Returns false if the account was not found.
 */
export async function setAccountPasswords(
  name: string,
  passwords: { imapPass?: string; smtpPass?: string; transportApiKey?: string },
): Promise<boolean> {
  const sql = getSql()
  const imapEnc      = encryptOpt(passwords.imapPass)
  const smtpEnc      = encryptOpt(passwords.smtpPass)
  const transportEnc = encryptOpt(passwords.transportApiKey)

  const result = await sql`
    UPDATE mail_mcp_accounts SET
      imap_pass_enc         = CASE WHEN ${imapEnc}::text      IS NOT NULL THEN ${imapEnc}::text      ELSE imap_pass_enc         END,
      smtp_pass_enc         = CASE WHEN ${smtpEnc}::text      IS NOT NULL THEN ${smtpEnc}::text      ELSE smtp_pass_enc         END,
      transport_api_key_enc = CASE WHEN ${transportEnc}::text IS NOT NULL THEN ${transportEnc}::text ELSE transport_api_key_enc END,
      updated_at = NOW()
    WHERE name = ${name}
  `
  return (result as unknown as { count: number }).count > 0
}
