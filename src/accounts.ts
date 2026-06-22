import { MailTs } from '@mailts/core'
import type { ImapConfig } from '@mailts/core'
import type { Transport } from '@mailts/core'
import type { RawAccountConfig } from './types.js'

export interface TemplateMeta {
  subject: string
  variables: string[]
  from?: string
}

export interface AccountEntry {
  mail: MailTs
  imapConfig: ImapConfig | null
  hasSmtp: boolean
  name: string
  label: string
  /** In-memory template registry for this account. Populated by define_template. */
  templates: Map<string, TemplateMeta>
}

export class AccountRegistry {
  private accounts = new Map<string, AccountEntry>()
  private defaultName = ''

  static async build(configs: RawAccountConfig[]): Promise<AccountRegistry> {
    const registry = new AccountRegistry()

    for (const cfg of configs) {
      const mailConfig: ConstructorParameters<typeof MailTs>[0] = {}

      if (cfg.smtp) mailConfig.smtp = cfg.smtp
      if (cfg.imap) mailConfig.imap = cfg.imap
      if (cfg.queue) mailConfig.queue = cfg.queue

      if (cfg.transport) {
        const cfg2 = { ...(cfg.transportConfig ?? {}), ...(cfg.transportApiKey ? { apiKey: cfg.transportApiKey } : {}) }
        mailConfig.transport = await buildTransport(cfg.transport, cfg2)
      }

      const entry: AccountEntry = {
        mail: new MailTs(mailConfig),
        imapConfig: cfg.imap ?? null,
        hasSmtp: Boolean(cfg.smtp || cfg.transport),
        name: cfg.name,
        label: cfg.label ?? cfg.name,
        templates: new Map(),
      }

      registry.accounts.set(cfg.name, entry)
      if (cfg.default) registry.defaultName = cfg.name
    }

    if (!registry.defaultName && registry.accounts.size > 0) {
      registry.defaultName = registry.accounts.keys().next().value!
    }

    return registry
  }

  get(name?: string): AccountEntry {
    const key = name ?? this.defaultName
    const entry = this.accounts.get(key)
    if (!entry) {
      const known = [...this.accounts.keys()].join(', ')
      throw new Error(`Account "${key}" not found. Known accounts: ${known}`)
    }
    return entry
  }

  list(): string[] {
    return [...this.accounts.keys()]
  }

  defaultAccount(): AccountEntry {
    return this.get()
  }
}

async function buildTransport(name: string, cfg: Record<string, string>): Promise<Transport> {
  const transports = await import('@mailts/core/transports')
  switch (name) {
    case 'resend':
      return new transports.ResendTransport({ apiKey: cfg.apiKey ?? '' })
    case 'sendgrid':
      return new transports.SendGridTransport({ apiKey: cfg.apiKey ?? '' })
    case 'mailgun':
      return new transports.MailgunTransport({ apiKey: cfg.apiKey ?? '', domain: cfg.domain ?? '' })
    case 'postmark':
      return new transports.PostmarkTransport({ serverToken: cfg.serverToken ?? cfg.apiKey ?? '' })
    case 'ses':
      return new transports.SesTransport({
        region: cfg.region ?? 'us-east-1',
        accessKeyId: cfg.accessKeyId ?? '',
        secretAccessKey: cfg.secretAccessKey ?? '',
        sessionToken: cfg.sessionToken,
      })
    default:
      throw new Error(`Unknown transport "${name}". Valid: resend, sendgrid, mailgun, postmark, ses`)
  }
}
