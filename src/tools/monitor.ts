import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AccountRegistry } from '../accounts.js'
import { ok, err } from './helpers.js'

export function registerMonitorTools(server: McpServer, registry: AccountRegistry) {
  server.tool(
    'health_check',
    'Probe SMTP and IMAP connectivity for one or all accounts. Returns latency in ms.',
    {
      account: z.string().optional().describe('Account name to check — omit to check all accounts'),
    },
    async (input) => {
      try {
        const names = input.account ? [input.account] : registry.list()
        const results: Record<string, unknown> = {}

        for (const name of names) {
          try {
            const { mail } = registry.get(name)
            const health = await mail.health()
            results[name] = health
          } catch (e) {
            results[name] = { error: (e as Error).message }
          }
        }

        return ok(results)
      } catch (e) {
        return err((e as Error).message)
      }
    },
  )
}
