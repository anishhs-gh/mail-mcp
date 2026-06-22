import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AccountRegistry } from '../accounts.js'
import { resolveAttachments, type McpAttachment } from '../lib/attachment-resolver.js'
import { buildReplyHeaders, buildReplyAllHeaders, quoteTextBody, quoteHtmlBody } from '../lib/reply-builder.js'
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

function registerReplyTool(
  server: McpServer,
  registry: AccountRegistry,
  name: 'reply_email' | 'reply_all_email',
) {
  const isAll = name === 'reply_all_email'

  server.tool(
    name,
    isAll
      ? 'Reply-all to an email. Automatically sets threading headers and pre-fills all original recipients.'
      : 'Reply to an email. Automatically sets In-Reply-To / References threading headers.',
    {
      uid: z.number().int().describe('UID of the email to reply to'),
      text: z.string().optional().describe('Plain text reply body'),
      html: z.string().optional().describe('HTML reply body'),
      quote_original: z.boolean().optional().default(true).describe('Append original message as a quote'),
      cc: z.union([z.string(), z.array(z.string())]).optional(),
      bcc: z.union([z.string(), z.array(z.string())]).optional(),
      attachments: z.array(attachmentSchema).optional(),
      mailbox: z.string().optional().default('INBOX').describe('Source mailbox of the original message'),
      account: z.string().optional(),
    },
    async (input) => {
      try {
        const { account: accountName, uid, text, html, quote_original, cc, bcc, attachments: rawAtts, mailbox } = input
        const { mail, imapConfig } = registry.get(accountName)

        if (!imapConfig) return err('IMAP is not configured for this account')

        // Fetch original message with body for quoting
        const session = mail.imap
        await session.connect()
        let original: import('@mailts/core').ImapMessage

        try {
          const msgs = await session.fetch({ uids: [uid], mailbox: mailbox ?? 'INBOX', bodies: true })
          if (msgs.length === 0) return err(`Message UID ${uid} not found`)
          original = msgs[0]!
          // Mark as \Answered
          await session.setFlags([uid], ['\\Answered'], true, mailbox ?? 'INBOX')
        } finally {
          await session.close()
        }

        const senderAddress = imapConfig.auth.user
        const replyHeaders = isAll
          ? buildReplyAllHeaders(original, senderAddress)
          : buildReplyHeaders(original, senderAddress)

        let finalText = text ?? ''
        let finalHtml = html ?? ''

        if (quote_original !== false) {
          finalText += quoteTextBody(original)
          if (finalHtml || original.body?.html) {
            finalHtml += quoteHtmlBody(original)
          }
        }

        const attachments = rawAtts ? await resolveAttachments(rawAtts as McpAttachment[]) : undefined

        const result = await mail.send({
          to: replyHeaders.to,
          subject: replyHeaders.subject,
          text: finalText || undefined,
          html: finalHtml || undefined,
          cc,
          bcc,
          attachments,
          headers: {
            'In-Reply-To': replyHeaders.inReplyTo,
            ...(replyHeaders.references ? { References: replyHeaders.references } : {}),
          },
        })

        if (result.ok) {
          return ok({ messageId: result.messageId, accepted: result.accepted, to: replyHeaders.to, subject: replyHeaders.subject })
        }
        return err(`Reply failed: ${result.error.message}`)
      } catch (e) {
        return err((e as Error).message)
      }
    },
  )
}

export function registerReplyTools(server: McpServer, registry: AccountRegistry) {
  registerReplyTool(server, registry, 'reply_email')
  registerReplyTool(server, registry, 'reply_all_email')
}
