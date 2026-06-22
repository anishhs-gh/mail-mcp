import 'dotenv/config'
import { createServer } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { loadConfig, DB_MODE } from './config.js'
import { AccountRegistry } from './accounts.js'
import { registerAllTools } from './tools/index.js'
import { registerResources } from './resources/index.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

async function main() {
  const config = await loadConfig()

  // Mutable registry ref — updated on hot-reload and by reload_config tool
  const state = { registry: await AccountRegistry.build(config.accounts) }

  const keyBuffers = config.server.apiKeys.map(k => Buffer.from(k, 'utf8'))

  // MCP / general API auth — uses API_KEYS
  function authorize(req: IncomingMessage): boolean {
    const header = req.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) return false
    const incoming = Buffer.from(token, 'utf8')
    return keyBuffers.some(key => key.length === incoming.length && timingSafeEqual(key, incoming))
  }

  // Password endpoint auth — uses MAIL_MCP_SECRET so the agent (which knows API_KEYS) cannot call it
  function authorizePasswordEndpoint(req: IncomingMessage): boolean {
    const secret = process.env.MAIL_MCP_SECRET
    if (!secret) return false
    const header = req.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) return false
    const incoming = Buffer.from(token, 'utf8')
    const expected = Buffer.from(secret, 'utf8')
    return incoming.length === expected.length && timingSafeEqual(incoming, expected)
  }


  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname

    if (path === '/health' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, version: '0.1.0', accounts: state.registry.list().length })
      return
    }

    // GET /accounts — list all accounts (no passwords)
    if (path === '/accounts' && req.method === 'GET') {
      if (!authorize(req)) { sendJson(res, 401, { error: 'Unauthorized' }); return }
      if (!DB_MODE) {
        const accounts = state.registry.list().map(name => {
          const e = state.registry.get(name)
          return { name: e.name, label: e.label, hasImap: Boolean(e.imapConfig), hasSmtp: e.hasSmtp }
        })
        sendJson(res, 200, { accounts })
        return
      }
      try {
        const { listAccountsPublic } = await import('./lib/db.js')
        sendJson(res, 200, { accounts: await listAccountsPublic() })
      } catch (e) { sendJson(res, 500, { error: (e as Error).message }) }
      return
    }

    const accountMatch = path.match(/^\/accounts\/([^/]+)$/)

    // DELETE /accounts/:name — remove an account
    if (accountMatch && req.method === 'DELETE') {
      if (!authorize(req)) { sendJson(res, 401, { error: 'Unauthorized' }); return }
      if (!DB_MODE) { sendJson(res, 503, { error: 'Requires DATABASE_URL' }); return }
      const accountName = accountMatch[1]!
      try {
        const { deleteAccount } = await import('./lib/db.js')
        await deleteAccount(accountName)
        const newConfig = await loadConfig()
        state.registry = await AccountRegistry.build(newConfig.accounts)
        sendJson(res, 200, { ok: true, removed: accountName })
      } catch (e) { sendJson(res, 500, { error: (e as Error).message }) }
      return
    }

    // PATCH /accounts/:name — update non-sensitive fields
    if (accountMatch && req.method === 'PATCH') {
      if (!authorize(req)) { sendJson(res, 401, { error: 'Unauthorized' }); return }
      if (!DB_MODE) { sendJson(res, 503, { error: 'Requires DATABASE_URL' }); return }
      const accountName = accountMatch[1]!
      try {
        const raw = await readBody(req)
        const body = raw ? JSON.parse(raw) : {}
        const { label, imap_host, imap_port, imap_user, imap_secure,
                smtp_host, smtp_port, smtp_user, smtp_secure,
                transport, is_default } = body as Record<string, string | number | boolean>

        const { upsertAccount, setDefaultAccount } = await import('./lib/db.js')
        if (is_default) await setDefaultAccount(accountName)
        await upsertAccount({
          name: accountName,
          label: label as string,
          isDefault: is_default as boolean,
          imapHost: imap_host as string, imapPort: imap_port as number, imapSecure: imap_secure as boolean,
          imapUser: imap_user as string,
          smtpHost: smtp_host as string, smtpPort: smtp_port as number, smtpSecure: smtp_secure as boolean,
          smtpUser: smtp_user as string,
          transport: transport as string,
        })
        const newConfig = await loadConfig()
        state.registry = await AccountRegistry.build(newConfig.accounts)
        sendJson(res, 200, { ok: true, updated: accountName })
      } catch (e) { sendJson(res, 500, { error: (e as Error).message }) }
      return
    }

    // POST /accounts/:name/password — set encrypted credentials (uses MAIL_MCP_SECRET as Bearer, not API_KEYS)
    const pwdMatch = path.match(/^\/accounts\/([^/]+)\/password$/)
    if (pwdMatch && req.method === 'POST') {
      if (!authorizePasswordEndpoint(req)) { sendJson(res, 401, { error: 'Unauthorized — use MAIL_MCP_SECRET as Bearer token' }); return }
      if (!DB_MODE) { sendJson(res, 503, { error: 'Password endpoint requires DATABASE_URL' }); return }

      const accountName = pwdMatch[1]!
      try {
        const raw = await readBody(req)
        const body = raw ? JSON.parse(raw) : {}
        const { imap_pass, smtp_pass, transport_api_key } = body as Record<string, string>

        if (!imap_pass && !smtp_pass && !transport_api_key) {
          sendJson(res, 400, { error: 'Provide at least one of: imap_pass, smtp_pass, transport_api_key' })
          return
        }

        const { setAccountPasswords } = await import('./lib/db.js')
        const found = await setAccountPasswords(accountName, { imapPass: imap_pass, smtpPass: smtp_pass, transportApiKey: transport_api_key })

        if (!found) { sendJson(res, 404, { error: `Account "${accountName}" not found` }); return }

        // Auto-reload so new credentials take effect immediately
        const newConfig = await loadConfig()
        state.registry = await AccountRegistry.build(newConfig.accounts)

        sendJson(res, 200, { ok: true, account: accountName })
      } catch (e) {
        sendJson(res, 500, { error: (e as Error).message })
      }
      return
    }

    if (path === '/mcp') {
      if (!authorize(req)) {
        sendJson(res, 401, { error: 'Unauthorized' })
        return
      }

      const mcpServer = new McpServer({ name: 'mail-mcp', version: '0.1.0' })
      registerAllTools(mcpServer, state)
      registerResources(mcpServer, state.registry)

      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
      await mcpServer.connect(transport)

      let parsedBody: unknown
      if (req.method === 'POST') {
        try {
          const raw = await readBody(req)
          parsedBody = raw ? JSON.parse(raw) : undefined
        } catch {
          sendJson(res, 400, { error: 'Invalid JSON body' })
          return
        }
      }

      await transport.handleRequest(req, res, parsedBody)
      return
    }

    sendJson(res, 404, { error: 'Not found' })
  })

  server.listen(config.server.port, () => {
    console.info(`[mail-mcp] Listening on http://localhost:${config.server.port}/mcp`)
    console.info(`[mail-mcp] Accounts: ${state.registry.list().join(', ')}`)
  })
}

main().catch(e => {
  console.error('[mail-mcp] Startup failed:', (e as Error).message)
  process.exit(1)
})
