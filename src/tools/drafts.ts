import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AccountRegistry } from '../accounts.js'
import { ok, err } from './helpers.js'

export function registerDraftTools(server: McpServer, registry: AccountRegistry) {
  server.tool(
    'save_draft',
    'Save an email as a draft in the Drafts folder without sending it.',
    {
      to: z.union([z.string(), z.array(z.string())]).describe('Intended recipient(s)'),
      subject: z.string(),
      text: z.string().optional(),
      html: z.string().optional(),
      cc: z.union([z.string(), z.array(z.string())]).optional(),
      from: z.string().optional(),
      mailbox: z.string().optional().default('Drafts').describe('Destination mailbox, defaults to Drafts'),
      account: z.string().optional(),
    },
    async (input) => {
      try {
        const { account: accountName, to, subject, text, html, cc, from, mailbox } = input
        const { mail } = registry.get(accountName)

        // Build a minimal RFC 5322 raw message for APPEND
        const toArr = Array.isArray(to) ? to : [to]
        const ccArr = cc ? (Array.isArray(cc) ? cc : [cc]) : []
        const date = new Date()
        const msgId = `<draft-${Date.now()}@mail-mcp.local>`

        const headers = [
          from ? `From: ${from}` : '',
          `To: ${toArr.join(', ')}`,
          ccArr.length ? `Cc: ${ccArr.join(', ')}` : '',
          `Subject: ${subject}`,
          `Date: ${date.toUTCString()}`,
          `Message-ID: ${msgId}`,
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset=UTF-8',
        ].filter(Boolean).join('\r\n')

        const body = text ?? (html ? html.replace(/<[^>]*>/g, '') : '')
        const raw = Buffer.from(`${headers}\r\n\r\n${body}`, 'utf8')

        const session = mail.imap
        await session.connect()
        try {
          const result = await session.append(mailbox ?? 'Drafts', raw, ['\\Draft'])
          return ok({ saved: true, mailbox: mailbox ?? 'Drafts', uid: result.uid })
        } finally {
          await session.close()
        }
      } catch (e) { return err((e as Error).message) }
    },
  )
}
