import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AccountRegistry } from '../accounts.js'
import { resolveAttachments, type McpAttachment } from '../lib/attachment-resolver.js'
import { ok, err } from './helpers.js'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))


const attendeeSchema = z.object({
  email: z.string(),
  name: z.string().optional(),
  rsvp: z.boolean().optional(),
})

const icalSchema = {
  summary: z.string().describe('Event title'),
  start: z.string().describe('ISO 8601 start datetime'),
  end: z.string().describe('ISO 8601 end datetime'),
  timezone: z.string().optional().describe('IANA timezone, e.g. "America/New_York". Defaults to UTC'),
  location: z.string().optional(),
  description: z.string().optional(),
  organizer_name: z.string().describe('Organizer display name'),
  organizer_email: z.string().describe('Organizer email address'),
  attendees: z.array(attendeeSchema).optional(),
  method: z.enum(['REQUEST', 'CANCEL', 'REPLY']).optional().default('REQUEST'),
}

const attachmentSchema = z.object({
  filename: z.string(),
  path: z.string().optional(),
  content: z.string().optional(),
  encoding: z.enum(['base64']).optional(),
  contentType: z.string().optional(),
  url: z.string().optional(),
  cid: z.string().optional(),
})

export function registerCalendarTools(server: McpServer, registry: AccountRegistry) {
  server.tool(
    'send_calendar_invite',
    'Send an email with an embedded iCal VEVENT. Recipients receive a calendar invite with RSVP.',
    {
      to: z.union([z.string(), z.array(z.string())]).describe('Recipient address(es)'),
      subject: z.string(),
      text: z.string().optional().describe('Email body text (separate from iCal description)'),
      from: z.string().optional(),
      attachments: z.array(attachmentSchema).optional(),
      account: z.string().optional(),
      ...icalSchema,
    },
    async (input) => {
      try {
        const { account: accountName, to, subject, text, from, attachments: rawAtts,
          summary, start, end, timezone, location, description,
          organizer_name, organizer_email, attendees, method } = input

        const { mail } = registry.get(accountName)
        const attachments = rawAtts ? await resolveAttachments(rawAtts as McpAttachment[]) : undefined

        const result = await mail.send({
          to, subject, text, from, attachments,
          ical: {
            summary, location, description, method,
            start: new Date(start),
            end: new Date(end),
            timezone,
            organizer: { name: organizer_name, email: organizer_email },
            attendees,
          },
        })

        if (result.ok) return ok({ messageId: result.messageId, accepted: result.accepted })
        return err(`Send failed: ${result.error.message}`)
      } catch (e) { return err((e as Error).message) }
    },
  )

  server.tool(
    'bulk_send_calendar_invite',
    'Send a personalized calendar invite to each recipient individually. Each person is added as the sole attendee on their copy.',
    {
      recipients: z.array(z.object({ email: z.string(), name: z.string().optional() }))
        .describe('List of recipients — each gets their own invite'),
      subject: z.string(),
      text: z.string().optional(),
      from: z.string().optional(),
      delay_ms: z.number().int().optional().default(200).describe('Delay between sends in ms'),
      dry_run: z.boolean().optional().default(false),
      account: z.string().optional(),
      ...icalSchema,
    },
    async (input) => {
      try {
        const { account: accountName, recipients, subject, text, from, delay_ms, dry_run,
          summary, start, end, timezone, location, description,
          organizer_name, organizer_email, method } = input

        const { mail } = registry.get(accountName)

        if (dry_run) {
          return ok({ total: recipients.length, skipped: recipients.length, results: recipients.map(r => ({ email: r.email, would_send: true })) })
        }

        const results: unknown[] = []
        for (const r of recipients) {
          try {
            const result = await mail.send({
              to: r.name ? `${r.name} <${r.email}>` : r.email,
              subject, text, from,
              ical: {
                summary, location, description, method,
                start: new Date(start),
                end: new Date(end),
                timezone,
                organizer: { name: organizer_name, email: organizer_email },
                attendees: [{ email: r.email, name: r.name, rsvp: true }],
              },
            })
            results.push(result.ok
              ? { email: r.email, ok: true, messageId: result.messageId }
              : { email: r.email, ok: false, error: result.error.message })
          } catch (e) {
            results.push({ email: r.email, ok: false, error: (e as Error).message })
          }
          if (delay_ms && delay_ms > 0) await sleep(delay_ms)
        }

        const sent = results.filter((r: unknown) => (r as Record<string, unknown>).ok).length
        return ok({ total: recipients.length, sent, failed: recipients.length - sent, results })
      } catch (e) { return err((e as Error).message) }
    },
  )
}

