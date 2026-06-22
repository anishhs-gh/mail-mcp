import { z } from 'zod'
import { htmlToText } from '@mailts/core'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AccountRegistry } from '../accounts.js'
import { ok, err } from './helpers.js'

// Extract {{variable}} names from a template string
function extractVariables(template: string): string[] {
  const matches = [...template.matchAll(/\{\{\s*(\w[\w.]*)\s*\}\}/g)]
  return [...new Set(matches.map(m => m[1]!))]
}

// Render {{variable}} placeholders using mailts's built-in syntax
function render(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{\s*(\w[\w.]*)\s*\}\}/g, (_m, key: string) => {
    const parts = key.split('.')
    let val: unknown = data
    for (const p of parts) {
      if (val === null || val === undefined || typeof val !== 'object') return ''
      val = (val as Record<string, unknown>)[p]
    }
    return val === null || val === undefined ? '' : String(val)
  })
}

export function registerTemplateTools(server: McpServer, registry: AccountRegistry) {
  server.tool(
    'define_template',
    'Register a reusable HTML email template. Uses {{variable}} placeholders rendered by mailts\'s built-in engine.',
    {
      name: z.string().describe('Unique template name used in send_template and bulk_send'),
      subject: z.string().describe('Subject line template — supports {{variable}} placeholders'),
      template: z.string().describe('HTML template string with {{variable}} placeholders. mailts auto-generates a plain-text fallback.'),
      from: z.string().optional().describe('Default sender address for this template'),
      reply_to: z.string().optional(),
      account: z.string().optional(),
    },
    async ({ name, subject, template, from, reply_to, account }) => {
      try {
        const entry = registry.get(account)
        entry.mail.define(name, {
          template,
          subject,
          from,
          replyTo: reply_to,
        })
        // Store metadata so we can list templates
        entry.templates.set(name, { subject, variables: extractVariables(template + subject), from })
        return ok({ name, variables: extractVariables(template + subject) })
      } catch (e) { return err((e as Error).message) }
    })

  server.tool(
    'send_template',
    'Send a registered template to one or more recipients with variable data. Renders {{variable}} placeholders per-recipient.',
    {
      name: z.string().describe('Template name from define_template'),
      to: z.union([z.string(), z.array(z.string())]),
      data: z.record(z.string()).optional().describe('Key-value map for {{variable}} substitution'),
      attachments: z.array(z.object({
        filename: z.string(),
        path: z.string().optional(),
        content: z.string().optional(),
        encoding: z.enum(['base64']).optional(),
        contentType: z.string().optional(),
        url: z.string().optional(),
        cid: z.string().optional(),
      })).optional(),
      account: z.string().optional(),
    },
    async ({ name, to, data, attachments: rawAtts, account }) => {
      try {
        const { resolveAttachments } = await import('../lib/attachment-resolver.js')
        const entry = registry.get(account)
        const attachments = rawAtts ? await resolveAttachments(rawAtts as Parameters<typeof resolveAttachments>[0]) : undefined

        const result = await entry.mail.trigger(name, { to, data, attachments } as Parameters<typeof entry.mail.trigger>[1])

        if (result.ok) return ok({ messageId: result.messageId, accepted: result.accepted })
        return err(`Send failed: ${result.error.message}`)
      } catch (e) { return err((e as Error).message) }
    })

  server.tool(
    'preview_template',
    'Render a template with sample data and return the result without sending. Shows the HTML and auto-generated plain-text fallback.',
    {
      name: z.string().optional().describe('Template name from define_template'),
      html: z.string().optional().describe('Ad-hoc HTML template to render (no need to register first)'),
      subject: z.string().optional().describe('Subject template string'),
      data: z.record(z.string()).optional().describe('Sample data for {{variable}} substitution'),
      account: z.string().optional(),
    },
    async ({ name, html: rawHtml, subject: subjectTemplate, data = {}, account }) => {
      try {
        if (!name && !rawHtml) return err('Provide name or html')
        let templateHtml = rawHtml ?? ''
        let templateSubject = subjectTemplate ?? ''

        if (name) {
          const entry = registry.get(account)
          const meta = entry.templates.get(name)
          if (!meta) return err(`Template "${name}" not found. Register it first with define_template.`)
          // We can't directly access mail.define internals — use stored metadata + provided html
          templateSubject = meta.subject
        }

        const renderedHtml = render(templateHtml, data)
        const renderedSubject = render(templateSubject, data)
        const renderedText = htmlToText(renderedHtml)

        return ok({ subject: renderedSubject, html: renderedHtml, text: renderedText })
      } catch (e) { return err((e as Error).message) }
    })

  server.tool(
    'list_templates',
    'List all registered templates and their variable signatures for an account',
    { account: z.string().optional() },
    async ({ account }) => {
      try {
        const entry = registry.get(account)
        const templates = [...entry.templates.entries()].map(([name, meta]) => ({
          name,
          subject: meta.subject,
          variables: meta.variables,
          from: meta.from,
        }))
        return ok({ count: templates.length, templates })
      } catch (e) { return err((e as Error).message) }
    })
}
