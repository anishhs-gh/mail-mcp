import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AccountRegistry } from '../accounts.js'
import { parseRecipients, type Recipient } from '../lib/recipients-parser.js'
import { resolveAttachments, type McpAttachment } from '../lib/attachment-resolver.js'
import { ok, err } from './helpers.js'

const attachmentSchema = z.object({
  filename: z.string(),
  path: z.string().optional(),
  content: z.string().optional(),
  encoding: z.enum(['base64']).optional(),
  contentType: z.string().optional(),
  url: z.string().optional(),
  cid: z.string().optional(),
})

const fileSchema = z.object({
  content: z.string().describe('Raw file content (UTF-8 text)'),
  format: z.enum(['csv', 'json', 'tsv']),
  email_field: z.string().optional(),
  name_field: z.string().optional(),
})

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Simple {{variable}} renderer matching mailts's built-in engine
function renderTemplate(template: string, data: Record<string, string | undefined>): string {
  return template.replace(/\{\{\s*(\w[\w.]*)\s*\}\}/g, (_m, key: string) => {
    const parts = key.split('.')
    let val: unknown = data
    for (const p of parts) {
      if (val === null || val === undefined || typeof val !== 'object') return ''
      val = (val as Record<string, unknown>)[p]
    }
    return val === null || val === undefined ? '' : String(val)
  })
}

export function registerBulkTools(server: McpServer, registry: AccountRegistry) {
  server.tool(
    'parse_recipients_file',
    'Parse and validate a CSV, JSON, or TSV recipients file. Use this to preview recipients before calling bulk_send.',
    {
      content: z.string().describe('Raw file content (UTF-8 text)'),
      format: z.enum(['csv', 'json', 'tsv']),
      email_field: z.string().optional().describe('Column/key name containing email addresses'),
      name_field: z.string().optional().describe('Column/key name containing display names'),
    },
    async ({ content, format, email_field, name_field }) => {
      try {
        const result = parseRecipients(content, format, email_field, name_field)
        return ok(result)
      } catch (e) { return err((e as Error).message) }
    })

  server.tool(
    'bulk_send',
    [
      'Send an email to multiple recipients.',
      'mode "broadcast": one email with all recipients in To.',
      'mode "individual": separate email per recipient with {{variable}} mail-merge from each row.',
      'Recipients can be passed inline or loaded from a CSV/JSON/TSV file.',
    ].join(' '),
    {
      subject: z.string().describe('Subject line — supports {{variable}} placeholders in individual mode'),
      text: z.string().optional().describe('Plain text body — supports {{variable}} placeholders'),
      html: z.string().optional().describe('HTML body — supports {{variable}} placeholders'),
      from: z.string().optional(),
      mode: z.enum(['broadcast', 'individual']).optional().default('individual'),
      recipients: z.array(z.record(z.string())).optional().describe('Inline list of recipients'),
      recipients_file: fileSchema.optional().describe('Load recipients from a file'),
      attachments: z.array(attachmentSchema).optional(),
      delay_ms: z.number().int().optional().default(200).describe('Delay between sends in individual mode (ms)'),
      dry_run: z.boolean().optional().default(false).describe('Preview without sending'),
      queue: z.boolean().optional().default(false).describe('Enqueue instead of sending immediately'),
      account: z.string().optional(),
    },
    async (input) => {
      try {
        const { account: accountName, subject, text, html, from, mode,
          recipients: inlineRecipients, recipients_file, attachments: rawAtts,
          delay_ms, dry_run, queue: useQueue } = input

        const { mail } = registry.get(accountName)

        // Resolve recipients
        let recipients: Recipient[]
        if (recipients_file) {
          const parsed = parseRecipients(recipients_file.content, recipients_file.format,
            recipients_file.email_field, recipients_file.name_field)
          recipients = parsed.recipients
        } else if (inlineRecipients) {
          recipients = inlineRecipients.map(r => ({ email: r.email ?? '', ...r }))
            .filter(r => r.email)
        } else {
          return err('Provide recipients or recipients_file')
        }

        if (recipients.length === 0) return err('No valid recipients found')

        const attachments = rawAtts ? await resolveAttachments(rawAtts as McpAttachment[]) : undefined

        if (dry_run) {
          return ok({
            total: recipients.length, sent: 0, failed: 0, skipped: recipients.length,
            results: recipients.map(r => ({
              email: r.email,
              subject: mode === 'individual' ? renderTemplate(subject, r) : subject,
              would_send: true,
            })),
          })
        }

        if (mode === 'broadcast') {
          const toList = recipients.map(r => r.name ? `${r.name} <${r.email}>` : r.email)
          const result = await mail.send({ to: toList, subject, text, html, from, attachments })
          if (result.ok) {
            return ok({ total: recipients.length, sent: recipients.length, failed: 0,
              results: [{ email: toList.join(', '), ok: true, messageId: result.messageId }] })
          }
          return err(`Broadcast failed: ${result.error.message}`)
        }

        // Individual mode — per-recipient send with merge
        const results: unknown[] = []
        let sent = 0

        for (const r of recipients) {
          const mergedSubject = renderTemplate(subject, r)
          const mergedText = text ? renderTemplate(text, r) : undefined
          const mergedHtml = html ? renderTemplate(html, r) : undefined
          const to = r.name ? `${r.name} <${r.email}>` : r.email

          try {
            if (useQueue) {
              const job = mail.queue.enqueue({ to, subject: mergedSubject, text: mergedText, html: mergedHtml, from, attachments })
              results.push({ email: r.email, ok: true, queued: true, jobId: job.id })
              sent++
            } else {
              const result = await mail.send({ to, subject: mergedSubject, text: mergedText, html: mergedHtml, from, attachments })
              if (result.ok) {
                results.push({ email: r.email, ok: true, messageId: result.messageId })
                sent++
              } else {
                results.push({ email: r.email, ok: false, error: result.error.message })
              }
            }
          } catch (e) {
            results.push({ email: r.email, ok: false, error: (e as Error).message })
          }

          if (delay_ms && delay_ms > 0) await sleep(delay_ms)
        }

        return ok({ total: recipients.length, sent, failed: recipients.length - sent, results })
      } catch (e) { return err((e as Error).message) }
    })
}
