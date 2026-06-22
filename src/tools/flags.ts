import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AccountRegistry } from '../accounts.js'
import { ok, err } from './helpers.js'

export function registerFlagTools(server: McpServer, registry: AccountRegistry) {
  // ── mark_emails ───────────────────────────────────────────────────────────
  server.tool(
    'mark_emails',
    'Set or clear flags (seen, flagged, answered) on one or more messages',
    {
      uids: z.array(z.number().int()).min(1).describe('Message UIDs to flag'),
      mailbox: z.string().optional().default('INBOX'),
      seen: z.boolean().optional().describe('Mark as read (true) or unread (false)'),
      flagged: z.boolean().optional().describe('Star (true) or unstar (false)'),
      answered: z.boolean().optional().describe('Mark as answered'),
      account: z.string().optional(),
    },
    async (input) => {
      try {
        const { account: accountName, uids, mailbox, seen, flagged, answered } = input
        const { mail } = registry.get(accountName)
        const session = mail.imap
        await session.connect()

        try {
          const mb = mailbox ?? 'INBOX'
          if (seen === true)  await session.markSeen(uids, mb)
          if (seen === false) await session.markUnseen(uids, mb)
          if (flagged === true)  await session.markFlagged(uids, mb)
          if (flagged === false) await session.markUnflagged(uids, mb)
          if (answered !== undefined) await session.setFlags(uids, ['\\Answered'], answered, mb)

          return ok({ updated: uids.length, uids })
        } finally {
          await session.close()
        }
      } catch (e) {
        return err((e as Error).message)
      }
    },
  )

  // ── move_emails ───────────────────────────────────────────────────────────
  server.tool(
    'move_emails',
    'Move messages to a different mailbox. Uses IMAP MOVE extension when available, falls back to COPY + DELETE.',
    {
      uids: z.array(z.number().int()).min(1),
      from: z.string().describe('Source mailbox'),
      to: z.string().describe('Destination mailbox'),
      account: z.string().optional(),
    },
    async (input) => {
      try {
        const { account: accountName, uids, from, to } = input
        const { mail } = registry.get(accountName)
        const session = mail.imap
        await session.connect()

        try {
          await session.move(uids, to, from)
          return ok({ moved: uids.length, from, to })
        } finally {
          await session.close()
        }
      } catch (e) {
        return err((e as Error).message)
      }
    },
  )

  // ── delete_emails ─────────────────────────────────────────────────────────
  server.tool(
    'delete_emails',
    'Permanently delete messages (marks \\Deleted then EXPUNGEs)',
    {
      uids: z.array(z.number().int()).min(1),
      mailbox: z.string().optional().default('INBOX'),
      account: z.string().optional(),
    },
    async (input) => {
      try {
        const { account: accountName, uids, mailbox } = input
        const { mail } = registry.get(accountName)
        const session = mail.imap
        await session.connect()

        try {
          await session.delete(uids, mailbox ?? 'INBOX')
          return ok({ deleted: uids.length })
        } finally {
          await session.close()
        }
      } catch (e) {
        return err((e as Error).message)
      }
    },
  )
}
