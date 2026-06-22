import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AccountRegistry } from '../accounts.js'
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

const recipientSchema = z.union([z.string(), z.array(z.string())])

export function registerSendTools(server: McpServer, registry: AccountRegistry) {
  // ── send_email ────────────────────────────────────────────────────────────
  server.tool(
    'send_email',
    'Send an email immediately via SMTP or HTTP transport',
    {
      to: recipientSchema.describe('Recipient address(es) — "Name <email>" or plain address'),
      subject: z.string().describe('Email subject'),
      text: z.string().optional().describe('Plain text body'),
      html: z.string().optional().describe('HTML body. Auto-generates plain-text fallback when text is omitted'),
      cc: recipientSchema.optional().describe('CC recipient(s)'),
      bcc: recipientSchema.optional().describe('BCC recipient(s)'),
      replyTo: z.string().optional().describe('Reply-To address'),
      from: z.string().optional().describe('Sender address — overrides account default'),
      priority: z.enum(['high', 'normal', 'low']).optional().describe('Message priority'),
      attachments: z.array(attachmentSchema).optional().describe('File attachments'),
      headers: z.record(z.string()).optional().describe('Custom RFC 5322 headers'),
      account: z.string().optional().describe('Account name — omit to use the default account'),
    },
    async (input) => {
      try {
        const { account: accountName, attachments: rawAtts, ...emailOpts } = input
        const { mail } = registry.get(accountName)

        const attachments = rawAtts ? await resolveAttachments(rawAtts as McpAttachment[]) : undefined

        const result = await mail.send({ ...emailOpts, attachments })

        if (result.ok) {
          return ok({ messageId: result.messageId, accepted: result.accepted, rejected: result.rejected })
        }
        return err(`Send failed: ${result.error.message}`)
      } catch (e) {
        return err((e as Error).message)
      }
    },
  )

  // ── queue_email ───────────────────────────────────────────────────────────
  server.tool(
    'queue_email',
    'Enqueue an email for async delivery with automatic retries and priority scheduling',
    {
      to: recipientSchema.describe('Recipient address(es)'),
      subject: z.string().describe('Email subject'),
      text: z.string().optional(),
      html: z.string().optional(),
      cc: recipientSchema.optional(),
      bcc: recipientSchema.optional(),
      replyTo: z.string().optional(),
      from: z.string().optional(),
      priority: z.enum(['critical', 'high', 'normal', 'low']).optional().describe('Queue priority tier'),
      attachments: z.array(attachmentSchema).optional(),
      headers: z.record(z.string()).optional(),
      account: z.string().optional(),
    },
    async (input) => {
      try {
        const { account: accountName, priority, attachments: rawAtts, ...emailOpts } = input
        const { mail } = registry.get(accountName)

        const attachments = rawAtts ? await resolveAttachments(rawAtts as McpAttachment[]) : undefined
        const jobId = mail.queue.enqueue({ ...emailOpts, attachments }, { priority })

        return ok({ jobId, queued: true })
      } catch (e) {
        return err((e as Error).message)
      }
    },
  )
}
