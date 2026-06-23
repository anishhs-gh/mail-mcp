import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AccountRegistry } from '../accounts.js'
import { ok, err } from './helpers.js'

export function registerMailboxTools(server: McpServer, registry: AccountRegistry) {
  server.tool(
    'list_mailboxes',
    'List all IMAP folders/mailboxes for an account',
    {
      subscribed_only: z.boolean().optional().default(false).describe('Only return subscribed mailboxes'),
      account: z.string().optional(),
    },
    async ({ subscribed_only, account }) => {
      try {
        const { mail } = registry.get(account)
        const session = mail.imap
        await session.connect()
        try {
          const boxes = subscribed_only
            ? await session.listSubscribed()
            : await session.listMailboxes()
          return ok({ count: boxes.length, mailboxes: boxes })
        } finally { await session.close() }
      } catch (e) { return err((e as Error).message) }
    })

  server.tool(
    'get_mailbox_status',
    'Get message counts and sync metadata for a mailbox (without selecting it)',
    {
      mailbox: z.string().default('INBOX'),
      account: z.string().optional(),
    },
    async ({ mailbox, account }) => {
      try {
        const { mail } = registry.get(account)
        const session = mail.imap
        await session.connect()
        try {
          const status = await session.getStatus(mailbox, ['MESSAGES', 'UNSEEN', 'RECENT', 'UIDNEXT', 'HIGHESTMODSEQ'])
          return ok({ mailbox, ...status })
        } finally { await session.close() }
      } catch (e) { return err((e as Error).message) }
    })

  server.tool(
    'create_mailbox',
    'Create a new IMAP folder',
    {
      name: z.string().describe('Folder name, use "/" for hierarchy e.g. "Projects/Alpha"'),
      account: z.string().optional(),
    },
    async ({ name, account }) => {
      try {
        const { mail } = registry.get(account)
        const session = mail.imap
        await session.connect()
        try {
          await session.createMailbox(name)
          return ok({ created: name })
        } finally { await session.close() }
      } catch (e) { return err((e as Error).message) }
    })

  server.tool(
    'rename_mailbox',
    'Rename an IMAP folder',
    {
      from: z.string().describe('Current folder name'),
      to: z.string().describe('New folder name'),
      account: z.string().optional(),
    },
    async ({ from, to, account }) => {
      try {
        const { mail } = registry.get(account)
        const session = mail.imap
        await session.connect()
        try {
          await session.renameMailbox(from, to)
          return ok({ renamed: true, from, to })
        } finally { await session.close() }
      } catch (e) { return err((e as Error).message) }
    })

  server.tool(
    'delete_mailbox',
    'Delete an IMAP folder and all its messages',
    {
      name: z.string().describe('Folder name to delete'),
      account: z.string().optional(),
    },
    async ({ name, account }) => {
      try {
        const { mail } = registry.get(account)
        const session = mail.imap
        await session.connect()
        try {
          await session.deleteMailbox(name)
          return ok({ deleted: name })
        } finally { await session.close() }
      } catch (e) { return err((e as Error).message) }
    })

  server.tool(
    'copy_emails',
    'Copy messages to another mailbox without removing the originals',
    {
      uids: z.array(z.number().int()).min(1),
      from: z.string().describe('Source mailbox'),
      to: z.string().describe('Destination mailbox'),
      account: z.string().optional(),
    },
    async ({ uids, from, to, account }) => {
      try {
        const { mail } = registry.get(account)
        const session = mail.imap
        await session.connect()
        try {
          await session.copy(uids, to, from)
          return ok({ copied: uids.length, from, to })
        } finally { await session.close() }
      } catch (e) { return err((e as Error).message) }
    })

  server.tool(
    'sync_incremental',
    'Fetch only messages changed since a previous sync point using IMAP CONDSTORE. Pass the highestModSeq from the last sync.',
    {
      mailbox: z.string().optional().default('INBOX'),
      mod_seq: z.number().int().describe('highestModSeq value from the last sync response'),
      account: z.string().optional(),
    },
    async ({ mailbox, mod_seq, account }) => {
      try {
        const { mail } = registry.get(account)
        const session = mail.imap
        await session.connect()
        try {
          const status = await session.open(mailbox ?? 'INBOX')
          const changed = await session.fetchChanged(mod_seq, mailbox ?? 'INBOX')
          return ok({
            count: changed.length,
            highestModSeq: status.highestModSeq,
            messages: changed.map((m: import('@mailts/core').ImapMessage) => ({
              uid: m.uid,
              flags: m.flags,
              subject: m.envelope.subject,
              modSeq: m.modSeq,
            })),
          })
        } finally { await session.close() }
      } catch (e) { return err((e as Error).message) }
    })
}
