import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AccountRegistry } from '../accounts.js'
import { ok, err } from './helpers.js'
import { DB_MODE } from '../config.js'
import { upsertAccount, deleteAccount, setDefaultAccount as dbSetDefault } from '../lib/db.js'

const NO_DB = 'Managing multiple accounts requires DATABASE_URL to be configured.'

export function registerAccountTools(
  server: McpServer,
  registryRef: { registry: AccountRegistry },
) {
  const reg = () => registryRef.registry

  // ── list_accounts ─────────────────────────────────────────────────────────
  server.tool(
    'list_accounts',
    'List all configured email accounts. Shows which is default and capabilities. Use set_default_account to switch.',
    { health: z.boolean().optional().default(false) },
    async ({ health }) => {
      try {
        const defaultName = reg().defaultAccount().name
        const results = await Promise.all(
          reg().list().map(async name => {
            const entry = reg().get(name)
            const base = {
              name: entry.name,
              label: entry.label,
              isDefault: entry.name === defaultName,
              hasSmtp: entry.hasSmtp,
              hasImap: Boolean(entry.imapConfig),
              templates: entry.templates.size,
            }
            if (!health) return base
            try {
              return { ...base, health: await entry.mail.health() }
            } catch (e) {
              return { ...base, health: { error: (e as Error).message } }
            }
          }),
        )
        return ok(results)
      } catch (e) { return err((e as Error).message) }
    })

  // ── add_account ───────────────────────────────────────────────────────────
  server.tool(
    'add_account',
    'Add a new email account. Saves host/user/port to the database. Passwords are never passed through the agent — the tool returns a curl command to set them directly.',
    {
      name: z.string().describe('Unique account identifier'),
      label: z.string().optional().describe('Human-readable display name'),
      set_default: z.boolean().optional().default(false),
      imap_host: z.string().optional(),
      imap_port: z.number().int().optional(),
      imap_user: z.string().optional(),
      imap_secure: z.boolean().optional(),
      smtp_host: z.string().optional(),
      smtp_port: z.number().int().optional(),
      smtp_user: z.string().optional(),
      smtp_secure: z.boolean().optional(),
      transport: z.enum(['resend', 'sendgrid', 'mailgun', 'postmark', 'ses']).optional(),
    },
    async (input) => {
      try {
        if (!DB_MODE) return err(NO_DB)
        const { name, label, set_default, imap_host, imap_port, imap_user, imap_secure,
          smtp_host, smtp_port, smtp_user, smtp_secure, transport } = input

        if (reg().list().includes(name)) return err(`Account "${name}" already exists`)

        if (set_default) await dbSetDefault('__none__')
        await upsertAccount({
          name, label, isDefault: set_default,
          imapHost: imap_host, imapPort: imap_port, imapSecure: imap_secure, imapUser: imap_user,
          smtpHost: smtp_host, smtpPort: smtp_port, smtpSecure: smtp_secure, smtpUser: smtp_user,
          transport,
        })

        const serverUrl = process.env.SERVER_URL ?? 'https://your-server'
        const passwordFields: Record<string, string> = {}
        if (imap_host) passwordFields['imap_pass'] = 'your-imap-password'
        if (smtp_host) passwordFields['smtp_pass'] = 'your-smtp-password'
        if (transport) passwordFields['transport_api_key'] = 'your-api-key'

        return ok({
          added: true,
          name,
          next_step: 'Set credentials via the password endpoint — never share passwords with the agent',
          auth_note: 'Use MAIL_MCP_SECRET as the Bearer token — NOT API_KEYS. This ensures even the agent cannot call this endpoint.',
          example: [
            `curl -X POST ${serverUrl}/accounts/${name}/password \\`,
            `  -H "Authorization: Bearer <your MAIL_MCP_SECRET value>" \\`,
            `  -H "Content-Type: application/json" \\`,
            `  -d '${JSON.stringify(passwordFields)}'`,
          ].join('\n'),
          note: 'Credentials are encrypted at rest. Account activates immediately — no reload needed.',
        })
      } catch (e) { return err((e as Error).message) }
    })

  // ── update_account ────────────────────────────────────────────────────────
  server.tool(
    'update_account',
    'Update an existing account\'s non-sensitive settings (host, port, user, label). To update passwords use POST /accounts/:name/password directly.',
    {
      name: z.string().describe('Account to update'),
      label: z.string().optional(),
      set_default: z.boolean().optional(),
      imap_host: z.string().optional(),
      imap_port: z.number().int().optional(),
      imap_user: z.string().optional(),
      imap_secure: z.boolean().optional(),
      smtp_host: z.string().optional(),
      smtp_port: z.number().int().optional(),
      smtp_user: z.string().optional(),
      smtp_secure: z.boolean().optional(),
      transport: z.enum(['resend', 'sendgrid', 'mailgun', 'postmark', 'ses']).optional(),
      // Kept in schema so the agent can guide the user — never processed
      imap_password: z.string().optional().describe('Not accepted here — use POST /accounts/:name/password'),
      smtp_password: z.string().optional().describe('Not accepted here — use POST /accounts/:name/password'),
      transport_api_key: z.string().optional().describe('Not accepted here — use POST /accounts/:name/password'),
    },
    async (input) => {
      try {
        if (!DB_MODE) return err(NO_DB)
        const { name, label, set_default, imap_host, imap_port, imap_user, imap_secure,
          smtp_host, smtp_port, smtp_user, smtp_secure, transport,
          imap_password, smtp_password, transport_api_key } = input

        if (!reg().list().includes(name)) return err(`Account "${name}" not found`)

        if (set_default) await dbSetDefault(name)
        await upsertAccount({
          name, label, isDefault: set_default,
          imapHost: imap_host, imapPort: imap_port, imapUser: imap_user, imapSecure: imap_secure,
          smtpHost: smtp_host, smtpPort: smtp_port, smtpUser: smtp_user, smtpSecure: smtp_secure,
          transport,
        })

        const serverUrl = process.env.SERVER_URL ?? 'https://your-server'
        const wantsPassword = imap_password || smtp_password || transport_api_key
        return ok({
          updated: true,
          name,
          ...(wantsPassword ? {
            note: 'Passwords must be set directly — never through the agent. Use MAIL_MCP_SECRET as the Bearer token:',
            example: [
              `curl -X POST ${serverUrl}/accounts/${name}/password \\`,
              `  -H "Authorization: Bearer <your MAIL_MCP_SECRET value>" \\`,
              `  -H "Content-Type: application/json" \\`,
              `  -d '{"imap_pass":"new-password"}'`,
            ].join('\n'),
          } : {}),
          next_step: 'Call reload_config() to apply changes',
        })
      } catch (e) { return err((e as Error).message) }
    })

  // ── remove_account ────────────────────────────────────────────────────────
  server.tool(
    'remove_account',
    'Remove an account permanently from the database',
    {
      name: z.string(),
      new_default: z.string().optional().describe('Promote this account to default if removing the current default'),
    },
    async ({ name, new_default }) => {
      try {
        if (!DB_MODE) return err(NO_DB)
        if (!reg().list().includes(name)) return err(`Account "${name}" not found`)

        await deleteAccount(name)
        if (new_default) await dbSetDefault(new_default)
        return ok({ removed: name, next_step: 'Call reload_config() to apply changes' })
      } catch (e) { return err((e as Error).message) }
    })

  // ── set_default_account ───────────────────────────────────────────────────
  server.tool(
    'set_default_account',
    'Change which account is used when no account parameter is specified in tool calls',
    { name: z.string() },
    async ({ name }) => {
      try {
        if (!DB_MODE) return err(NO_DB)
        if (!reg().list().includes(name)) return err(`Account "${name}" not found`)
        await dbSetDefault(name)
        return ok({ default: name, next_step: 'Call reload_config() to apply' })
      } catch (e) { return err((e as Error).message) }
    })

  // ── reload_config ─────────────────────────────────────────────────────────
  server.tool(
    'reload_config',
    'Reload accounts from env vars and database without restarting the server',
    {},
    async () => {
      try {
        const { loadConfig } = await import('../config.js')
        const { AccountRegistry } = await import('../accounts.js')
        const newConfig = await loadConfig()
        registryRef.registry = await AccountRegistry.build(newConfig.accounts)
        return ok({ reloaded: true, accounts: registryRef.registry.list() })
      } catch (e) { return err((e as Error).message) }
    })
}
