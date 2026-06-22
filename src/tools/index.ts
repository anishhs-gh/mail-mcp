import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AccountRegistry } from '../accounts.js'
import { registerSendTools } from './send.js'
import { registerReadTools } from './read.js'
import { registerReplyTools } from './reply.js'
import { registerFlagTools } from './flags.js'
import { registerMonitorTools } from './monitor.js'
import { registerQueueTools } from './queue.js'
import { registerCalendarTools } from './calendar.js'
import { registerForwardTools } from './forward.js'
import { registerDraftTools } from './drafts.js'
import { registerMailboxTools } from './mailbox.js'
import { registerAttachmentTools } from './attachments.js'
import { registerBulkTools } from './bulk.js'
import { registerTemplateTools } from './templates.js'
import { registerAccountTools } from './account-mgmt.js'

export function registerAllTools(
  server: McpServer,
  registryRef: { registry: AccountRegistry },
) {
  const { registry } = registryRef
  registerSendTools(server, registry)
  registerReadTools(server, registry)
  registerReplyTools(server, registry)
  registerFlagTools(server, registry)
  registerMonitorTools(server, registry)
  registerQueueTools(server, registry)
  registerCalendarTools(server, registry)
  registerForwardTools(server, registry)
  registerDraftTools(server, registry)
  registerMailboxTools(server, registry)
  registerAttachmentTools(server, registry)
  registerBulkTools(server, registry)
  registerTemplateTools(server, registry)
  registerAccountTools(server, registryRef)  // gets full ref for reload_config
}
