import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AccountRegistry } from '../accounts.js'

export function registerResources(server: McpServer, registry: AccountRegistry) {
  // mail://accounts
  server.resource(
    'accounts',
    'mail://accounts',
    { mimeType: 'application/json', description: 'List of configured email accounts' },
    async () => ({
      contents: [{
        uri: 'mail://accounts',
        mimeType: 'application/json',
        text: JSON.stringify(registry.list().map(name => {
          const e = registry.get(name)
          return { name: e.name, label: e.label, hasSmtp: e.hasSmtp, hasImap: Boolean(e.imapConfig) }
        }), null, 2),
      }],
    }),
  )

  // mail://{account}/mailboxes
  server.resource(
    'mailboxes',
    new ResourceTemplate('mail://{account}/mailboxes', { list: undefined }),
    { mimeType: 'application/json', description: 'Folder list for an account' },
    async (uri, { account }) => {
      try {
        const { mail } = registry.get(account as string)
        const session = mail.imap
        await session.connect()
        try {
          return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(await session.listMailboxes(), null, 2) }] }
        } finally { await session.close() }
      } catch (e) {
        return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ error: (e as Error).message }) }] }
      }
    },
  )

  // mail://{account}/{mailbox} — recent emails in a mailbox
  server.resource(
    'mailbox-emails',
    new ResourceTemplate('mail://{account}/{mailbox}', { list: undefined }),
    { mimeType: 'application/json', description: 'Recent emails in a mailbox' },
    async (uri, { account, mailbox }) => {
      try {
        const { mail } = registry.get(account as string)
        const session = mail.imap
        await session.connect()
        try {
          const messages = await session.fetch({ mailbox: decodeURIComponent(mailbox as string), limit: 20 })
          const data = messages.map(m => ({
            uid: m.uid,
            from: m.envelope.from,
            subject: m.envelope.subject,
            date: m.internalDate?.toISOString(),
            seen: m.flags.includes('\\Seen'),
          }))
          return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] }
        } finally { await session.close() }
      } catch (e) {
        return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ error: (e as Error).message }) }] }
      }
    },
  )

  // mail://{account}/{mailbox}/{uid} — single email
  server.resource(
    'email',
    new ResourceTemplate('mail://{account}/{mailbox}/{uid}', { list: undefined }),
    { mimeType: 'application/json', description: 'Single email content' },
    async (uri, { account, mailbox, uid }) => {
      try {
        const { mail } = registry.get(account as string)
        const session = mail.imap
        await session.connect()
        try {
          const msgs = await session.fetch({ uids: [Number(uid)], mailbox: decodeURIComponent(mailbox as string), bodies: true })
          if (msgs.length === 0) return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ error: 'Not found' }) }] }
          const m = msgs[0]!
          return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({
            uid: m.uid, from: m.envelope.from, to: m.envelope.to, subject: m.envelope.subject,
            date: m.internalDate?.toISOString(), text: m.body?.text, html: m.body?.html,
          }, null, 2) }] }
        } finally { await session.close() }
      } catch (e) {
        return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ error: (e as Error).message }) }] }
      }
    },
  )
}
