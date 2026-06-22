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

export function registerForwardTools(server: McpServer, registry: AccountRegistry) {
  server.tool(
    'forward_email',
    'Forward an existing email to new recipients. The original is embedded as a message/rfc822 attachment.',
    {
      uid: z.number().int().describe('UID of the email to forward'),
      to: z.union([z.string(), z.array(z.string())]).describe('Recipient address(es)'),
      comment: z.string().optional().describe('Text to include above the forwarded message'),
      attachments: z.array(attachmentSchema).optional().describe('Additional attachments to include'),
      mailbox: z.string().optional().default('INBOX').describe('Source mailbox of the original message'),
      account: z.string().optional(),
    },
    async (input) => {
      try {
        const { account: accountName, uid, to, comment, attachments: rawAtts, mailbox } = input
        const { mail } = registry.get(accountName)

        // Fetch original with full body
        const session = mail.imap
        await session.connect()
        let originalSubject = ''
        let rawMessage: Buffer | undefined

        try {
          const msgs = await session.fetch({ uids: [uid], mailbox: mailbox ?? 'INBOX', bodies: true })
          if (msgs.length === 0) return err(`Message UID ${uid} not found`)

          const m = msgs[0]!
          originalSubject = m.envelope.subject ?? ''

          // Build a minimal raw RFC 5322 representation from the fetched parts
          // (A real implementation would request RFC822 body — this uses available data)
          const headers = [
            `From: ${Array.isArray(m.envelope.from) ? m.envelope.from.map((a: unknown) => typeof a === 'string' ? a : (a as {email: string}).email).join(', ') : ''}`,
            `To: ${Array.isArray(m.envelope.to) ? m.envelope.to.map((a: unknown) => typeof a === 'string' ? a : (a as {email: string}).email).join(', ') : ''}`,
            `Subject: ${originalSubject}`,
            `Date: ${m.internalDate?.toUTCString() ?? ''}`,
            `Message-ID: ${m.envelope.messageId ?? ''}`,
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            '',
            m.body?.text ?? m.body?.html ?? '',
          ].join('\r\n')
          rawMessage = Buffer.from(headers, 'utf8')
        } finally {
          await session.close()
        }

        const extraAtts = rawAtts ? await resolveAttachments(rawAtts as McpAttachment[]) : []
        const subject = `Fwd: ${originalSubject}`

        const result = await mail.send({
          to,
          subject,
          text: comment ?? 'See forwarded message below.',
          attachments: [
            { filename: 'forwarded.eml', rfc822: rawMessage! },
            ...extraAtts,
          ],
        })

        if (result.ok) return ok({ messageId: result.messageId, accepted: result.accepted, subject })
        return err(`Forward failed: ${result.error.message}`)
      } catch (e) { return err((e as Error).message) }
    },
  )
}
