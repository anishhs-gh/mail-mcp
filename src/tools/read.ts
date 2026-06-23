import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AccountRegistry } from '../accounts.js'
import { ok, err, extractAttachmentMeta } from './helpers.js'

function msgSummary(m: import('@mailts/core').ImapMessage) {
  return {
    uid: m.uid,
    from: m.envelope.from,
    to: m.envelope.to,
    subject: m.envelope.subject,
    date: m.internalDate?.toISOString(),
    seen: m.flags.includes('\\Seen'),
    flagged: m.flags.includes('\\Flagged'),
    hasAttachments: (m.body?.attachments?.length ?? 0) > 0,
    preview: m.body?.text?.slice(0, 200),
  }
}

export function registerReadTools(server: McpServer, registry: AccountRegistry) {
  // ── list_emails ───────────────────────────────────────────────────────────
  server.tool(
    'list_emails',
    'List emails in a mailbox with optional filters. Returns headers only (no body).',
    {
      mailbox: z.string().optional().default('INBOX').describe('Mailbox / folder name'),
      limit: z.number().int().min(1).max(200).optional().default(20),
      unseen: z.boolean().optional().describe('Filter to unread messages only'),
      account: z.string().optional(),
    },
    async (input) => {
      try {
        const { account: accountName, mailbox, limit, unseen } = input
        const { mail } = registry.get(accountName)
        const session = mail.imap
        await session.connect()

        try {
          const opts: import('@mailts/core').ImapFetchOptions = {
            mailbox: mailbox ?? 'INBOX',
            limit: limit ?? 20,
          }
          if (unseen === true) opts.seen = false
          if (unseen === false) opts.seen = true

          const messages = await session.fetch(opts)
          return ok({ count: messages.length, messages: messages.map(msgSummary) })
        } finally {
          await session.close()
        }
      } catch (e) {
        return err((e as Error).message)
      }
    },
  )

  // ── get_email ─────────────────────────────────────────────────────────────
  server.tool(
    'get_email',
    'Fetch the full content of a single email by UID, including body and attachments.',
    {
      uid: z.number().int().describe('IMAP UID of the message'),
      mailbox: z.string().optional().default('INBOX'),
      account: z.string().optional(),
    },
    async (input) => {
      try {
        const { account: accountName, uid, mailbox } = input
        const { mail } = registry.get(accountName)
        const session = mail.imap
        await session.connect()

        try {
          const messages = await session.fetch({ uids: [uid], mailbox: mailbox ?? 'INBOX', textOnly: true })
          if (messages.length === 0) return err(`Message UID ${uid} not found`)

          const m = messages[0]!
          const attachments = m.structure ? extractAttachmentMeta(m.structure) : []
          return ok({
            uid: m.uid,
            from: m.envelope.from,
            to: m.envelope.to,
            cc: m.envelope.cc,
            subject: m.envelope.subject,
            date: m.internalDate?.toISOString(),
            seen: m.flags.includes('\\Seen'),
            flagged: m.flags.includes('\\Flagged'),
            html: m.body?.html,
            text: m.body?.text,
            attachments,
            messageId: m.envelope.messageId,
          })
        } finally {
          await session.close()
        }
      } catch (e) {
        return err((e as Error).message)
      }
    },
  )

  // ── search_emails ─────────────────────────────────────────────────────────
  server.tool(
    'search_emails',
    'Search emails using IMAP criteria. Combines multiple filters with AND logic.',
    {
      mailbox: z.string().optional().default('INBOX'),
      query: z.string().optional().describe('Full-text keyword (searches subject + body)'),
      from: z.string().optional(),
      to: z.string().optional(),
      subject: z.string().optional(),
      since: z.string().optional().describe('ISO 8601 date — messages after this date'),
      before: z.string().optional().describe('ISO 8601 date — messages before this date'),
      seen: z.boolean().optional(),
      flagged: z.boolean().optional(),
      limit: z.number().int().min(1).max(200).optional().default(20),
      account: z.string().optional(),
    },
    async (input) => {
      try {
        const { account: accountName, mailbox, limit, query, from, to, subject, since, before, seen, flagged } = input
        const { mail } = registry.get(accountName)
        const session = mail.imap
        await session.connect()

        try {
          const mb = mailbox ?? 'INBOX'
          const criteria: import('@mailts/core').ImapSearchCriteria = {}
          if (query) criteria.text = query
          if (from) criteria.from = from
          if (to) criteria.to = to
          if (subject) criteria.subject = subject
          if (since) criteria.since = new Date(since)
          if (before) criteria.before = new Date(before)
          if (seen === true) criteria.seen = true
          if (seen === false) criteria.unseen = true
          if (flagged === true) criteria.flagged = true
          if (flagged === false) criteria.unflagged = true

          let uids = await session.search(criteria, mb)
          if (uids.length === 0) return ok({ count: 0, messages: [] })

          uids = uids.slice(-(limit ?? 20))
          const messages = await session.fetch({ uids, mailbox: mb })
          return ok({ count: messages.length, messages: messages.map(msgSummary) })
        } finally {
          await session.close()
        }
      } catch (e) {
        return err((e as Error).message)
      }
    },
  )

  // ── get_thread ────────────────────────────────────────────────────────────
  server.tool(
    'get_thread',
    'Fetch all emails in a conversation thread by following Message-ID / In-Reply-To / References chains. Returns messages sorted oldest-first.',
    {
      message_id: z.string().describe('Message-ID of any email in the thread (include angle brackets e.g. <abc@example.com>)'),
      mailbox: z.string().optional().default('INBOX'),
      account: z.string().optional(),
    },
    async ({ message_id, mailbox, account }) => {
      try {
        const { mail } = registry.get(account)
        const session = mail.imap
        await session.connect()

        try {
          const mb = mailbox ?? 'INBOX'
          // Search for messages that contain this Message-ID in References or are the message itself
          const [byMsgId, byRefs, byInReplyTo] = await Promise.all([
            session.search({ header: { name: 'Message-ID', value: message_id } }, mb),
            session.search({ header: { name: 'References', value: message_id } }, mb),
            session.search({ header: { name: 'In-Reply-To', value: message_id } }, mb),
          ])

          const uids = [...new Set([...byMsgId, ...byRefs, ...byInReplyTo])].sort((a, b) => a - b)
          if (uids.length === 0) return ok({ count: 0, messages: [] })

          const messages = await session.fetch({ uids, mailbox: mb, textOnly: true })
          const sorted = messages.sort((a: import('@mailts/core').ImapMessage, b: import('@mailts/core').ImapMessage) => (a.internalDate?.getTime() ?? 0) - (b.internalDate?.getTime() ?? 0))

          return ok({
            count: sorted.length,
            messages: sorted.map((m: import('@mailts/core').ImapMessage) => ({
              uid: m.uid,
              messageId: m.envelope.messageId,
              from: m.envelope.from,
              to: m.envelope.to,
              subject: m.envelope.subject,
              date: m.internalDate?.toISOString(),
              seen: m.flags.includes('\\Seen'),
              text: m.body?.text,
              html: m.body?.html,
            })),
          })
        } finally {
          await session.close()
        }
      } catch (e) {
        return err((e as Error).message)
      }
    },
  )
}
