import type { SmtpConfig, ImapConfig, DkimConfig, QueueOptions } from '@mailts/core'

export interface RawAccountConfig {
  name: string
  default?: boolean
  label?: string
  smtp?: SmtpConfig
  transport?: 'resend' | 'sendgrid' | 'mailgun' | 'postmark' | 'ses'
  /** API key for resend/sendgrid — shorthand for single-key transports */
  transportApiKey?: string
  /** Full config object for transports that need more than one field (mailgun, postmark, ses) */
  transportConfig?: Record<string, string>
  imap?: ImapConfig
  dkim?: DkimConfig
  queue?: QueueOptions
}

export interface ServerConfig {
  port?: number
  apiKeys?: string[]
}

export interface MailMcpRawConfig {
  secrets?: Record<string, string>
  accounts: RawAccountConfig[]
  server?: ServerConfig
}

export interface ResolvedServerConfig {
  port: number
  apiKeys: string[]
}
