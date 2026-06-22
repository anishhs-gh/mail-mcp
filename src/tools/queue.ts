import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AccountRegistry } from '../accounts.js'
import { ok, err } from './helpers.js'

export function registerQueueTools(server: McpServer, registry: AccountRegistry) {
  server.tool('queue_stats',
    'Get queue statistics: pending, running, succeeded, dead, and cancelled job counts',
    { account: z.string().optional() },
    async ({ account }) => {
      try {
        const { mail } = registry.get(account)
        return ok(mail.queue.stats())
      } catch (e) { return err((e as Error).message) }
    })

  server.tool('queue_pause',
    'Pause the send queue — in-flight jobs finish, new jobs stop dispatching',
    { account: z.string().optional() },
    async ({ account }) => {
      try {
        const { mail } = registry.get(account)
        mail.queue.pause()
        return ok({ paused: true })
      } catch (e) { return err((e as Error).message) }
    })

  server.tool('queue_resume',
    'Resume the send queue after a pause',
    { account: z.string().optional() },
    async ({ account }) => {
      try {
        const { mail } = registry.get(account)
        mail.queue.play()
        return ok({ resumed: true })
      } catch (e) { return err((e as Error).message) }
    })

  server.tool('queue_cancel',
    'Cancel a specific queued job by ID, or cancel all pending jobs',
    {
      job_id: z.string().optional().describe('Job ID to cancel — omit to cancel all pending jobs'),
      account: z.string().optional(),
    },
    async ({ job_id, account }) => {
      try {
        const { mail } = registry.get(account)
        if (job_id) {
          mail.queue.cancel(job_id)
          return ok({ cancelled: job_id })
        }
        const count = mail.queue.cancelAll()
        return ok({ cancelled: count })
      } catch (e) { return err((e as Error).message) }
    })

  server.tool('queue_drain',
    'Wait until all queued jobs have finished sending',
    {
      timeout_ms: z.number().int().optional().describe('Abort remaining jobs after this many ms'),
      account: z.string().optional(),
    },
    async ({ timeout_ms, account }) => {
      try {
        const { mail } = registry.get(account)
        await mail.queue.shutdown(timeout_ms)
        return ok({ drained: true, stats: mail.queue.stats() })
      } catch (e) { return err((e as Error).message) }
    })

  server.tool('list_dead_letters',
    'List jobs in the dead-letter queue (permanently failed after all retries)',
    { account: z.string().optional() },
    async ({ account }) => {
      try {
        const { mail } = registry.get(account)
        const jobs = mail.queue.dlq.getAll().map(j => ({
          id: j.id,
          to: (j.options as unknown as Record<string, unknown>).to,
          subject: (j.options as unknown as Record<string, unknown>).subject,
          attempts: j.attempts,
          errors: j.errors?.map((e: Error) => e.message),
          lastAttemptAt: j.lastAttemptAt?.toISOString(),
        }))
        return ok({ count: jobs.length, jobs })
      } catch (e) { return err((e as Error).message) }
    })

  server.tool('retry_dead_letter',
    'Re-enqueue a dead-letter job for another delivery attempt',
    {
      job_id: z.string(),
      account: z.string().optional(),
    },
    async ({ job_id, account }) => {
      try {
        const { mail } = registry.get(account)
        const job = mail.queue.dlq.get(job_id)
        if (!job) return err(`Dead-letter job "${job_id}" not found`)
        mail.queue.dlq.remove(job_id)
        const newJob = mail.queue.enqueue(job.options as Parameters<typeof mail.queue.enqueue>[0])
        return ok({ requeued: true, new_job_id: newJob.id })
      } catch (e) { return err((e as Error).message) }
    })
}
