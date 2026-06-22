import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AccountRegistry } from '../accounts.js'
import { ok, err, extractAttachmentMeta } from './helpers.js'

export function registerAttachmentTools(server: McpServer, registry: AccountRegistry) {
  server.tool(
    'get_attachments',
    'List attachments on an email, optionally including base64-encoded content for download',
    {
      uid: z.number().int(),
      mailbox: z.string().optional().default('INBOX'),
      download: z.boolean().optional().default(false).describe('Include base64 content of each attachment'),
      account: z.string().optional(),
    },
    async ({ uid, mailbox, download, account }) => {
      try {
        const { mail } = registry.get(account)
        const session = mail.imap
        await session.connect()
        try {
          const mb = mailbox ?? 'INBOX'
          if (!download) {
            // Use BODYSTRUCTURE only — no attachment bytes transferred
            const msgs = await session.fetch({ uids: [uid], mailbox: mb, structure: true })
            if (msgs.length === 0) return err(`Message UID ${uid} not found`)
            const atts = msgs[0]!.structure ? extractAttachmentMeta(msgs[0]!.structure!) : []
            return ok({ count: atts.length, attachments: atts })
          }

          // download: true — fetch full bodies to get attachment content
          const msgs = await session.fetch({ uids: [uid], mailbox: mb, bodies: true })
          if (msgs.length === 0) return err(`Message UID ${uid} not found`)
          const atts = msgs[0]!.body?.attachments ?? []
          return ok({
            count: atts.length,
            attachments: atts.map(a => ({
              filename: a.filename,
              contentType: a.contentType,
              size: a.size,
              ...(a.content ? { content: a.content.toString('base64'), encoding: 'base64' } : {}),
            })),
          })
        } finally { await session.close() }
      } catch (e) { return err((e as Error).message) }
    })

  server.tool(
    'watch_inbox',
    'Watch for new emails using IMAP IDLE. Blocks for up to timeout_ms (default 30s), then returns any new messages that arrived.',
    {
      mailbox: z.string().optional().default('INBOX'),
      timeout_ms: z.number().int().optional().default(30000).describe('How long to wait for new mail (max 60s)'),
      account: z.string().optional(),
    },
    async ({ mailbox, timeout_ms, account }) => {
      try {
        const { mail } = registry.get(account)
        const session = mail.imap
        await session.connect()

        const newUids: number[] = []
        const clampedTimeout = Math.min(timeout_ms ?? 30000, 60000)

        try {
          // Get current UIDNEXT before IDLE so we know what's "new"
          const status = await session.getStatus(mailbox ?? 'INBOX', ['UIDNEXT'])
          const uidNext = status.uidNext ?? 0

          await new Promise<void>((resolve) => {
            const timer = setTimeout(async () => {
              await session.stopIdle()
              resolve()
            }, clampedTimeout)

            session.idle((msg) => {
              if (msg.seq) newUids.push(msg.seq) // seq as proxy — will refetch by UID range
              clearTimeout(timer)
              session.stopIdle().then(resolve).catch(resolve)
            }, mailbox ?? 'INBOX').catch(resolve)
          })

          // Fetch any messages with UID >= previous uidNext
          if (uidNext > 0) {
            const msgs = await session.fetch({
              uids: [], mailbox: mailbox ?? 'INBOX',
              // Fetch using seq range via a search by UID
            })
            // Filter to new messages
            const newMsgs = msgs.filter(m => m.uid >= uidNext)
            return ok({
              new_messages: newMsgs.length,
              messages: newMsgs.map(m => ({
                uid: m.uid,
                from: m.envelope.from,
                subject: m.envelope.subject,
                date: m.internalDate?.toISOString(),
              })),
            })
          }

          return ok({ new_messages: newUids.length, uids: newUids })
        } finally {
          await session.close()
        }
      } catch (e) { return err((e as Error).message) }
    })
}
