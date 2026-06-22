import type { ResolvedServerConfig, RawAccountConfig } from './types.js'

export const DB_MODE = Boolean(process.env.DATABASE_URL)

export interface LoadedConfig {
  accounts: RawAccountConfig[]
  server: ResolvedServerConfig
}

export async function loadConfig(): Promise<LoadedConfig> {
  const apiKeys = (process.env.API_KEYS ?? '').split(',').map(k => k.trim()).filter(Boolean)
  if (apiKeys.length === 0) throw new Error('No API keys configured. Set API_KEYS env var.')

  const accounts: RawAccountConfig[] = []

  // ── Default account from env vars (always loaded first) ───────────────
  const envAccount = buildEnvAccount()
  if (envAccount) {
    accounts.push(envAccount)
    console.info('[mail-mcp] Loaded default account from environment variables')
  }

  // ── Additional accounts from DB (appended on top of env account) ──────
  if (DB_MODE) {
    const { migrate, loadAccountsFromDb } = await import('./lib/db.js')
    await migrate()
    const dbAccounts = await loadAccountsFromDb()
    accounts.push(...dbAccounts)
    console.info(`[mail-mcp] Loaded ${dbAccounts.length} account(s) from database`)
  }

  if (accounts.length === 0) {
    throw new Error(
      'No accounts configured. Set IMAP_HOST / SMTP_HOST env vars, or set DATABASE_URL and add accounts via the add_account tool.',
    )
  }

  // If a DB account explicitly set is_default, unmark the env account
  const hasDbDefault = accounts.slice(1).some(a => a.default)
  if (hasDbDefault && accounts[0]?.name === 'default') accounts[0].default = false

  // Ensure exactly one default
  if (!accounts.some(a => a.default)) accounts[0]!.default = true

  return {
    accounts,
    server: { port: Number(process.env.PORT ?? 3000), apiKeys },
  }
}

/** Build the single default account from IMAP_HOST / SMTP_HOST env vars. */
function buildEnvAccount(): RawAccountConfig | null {
  const imapHost = process.env.IMAP_HOST
  const smtpHost = process.env.SMTP_HOST
  if (!imapHost && !smtpHost) return null

  const account: RawAccountConfig = { name: 'default', default: true }

  if (imapHost) {
    account.imap = {
      host: imapHost,
      port: Number(process.env.IMAP_PORT ?? 993),
      secure: process.env.IMAP_SECURE !== 'false',
      auth: {
        type: 'plain',
        user: process.env.IMAP_USER ?? '',
        pass: process.env.IMAP_PASS ?? '',
      },
    }
  }

  if (smtpHost) {
    account.smtp = {
      host: smtpHost,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        type: 'plain',
        user: process.env.SMTP_USER ?? process.env.IMAP_USER ?? '',
        pass: process.env.SMTP_PASS ?? process.env.IMAP_PASS ?? '',
      },
    }
  }

  return account
}
