import type { ImapMessage, EmailAddress } from '@mailts/core'

export interface ReplyHeaders {
  to: string[]
  subject: string
  inReplyTo: string
  references: string
}

function normalizeAddresses(field: EmailAddress | EmailAddress[] | undefined): string[] {
  if (!field) return []
  const arr = Array.isArray(field) ? field : [field]
  return arr.map(a => typeof a === 'string' ? a : a.name ? `${a.name} <${a.email}>` : a.email)
}

export function buildReplyHeaders(msg: ImapMessage, _senderAddress: string): ReplyHeaders {
  const env = msg.envelope
  const msgId = env.messageId ?? ''

  const existingRefs = (env as unknown as Record<string, string>).references ?? ''
  const references = [existingRefs, msgId].filter(Boolean).join(' ').trim()

  // Reply goes to Reply-To if present, otherwise to From
  const replyTo = normalizeAddresses(env.replyTo)
  const from = normalizeAddresses(env.from)
  const to = replyTo.length > 0 ? replyTo : from

  const subject = env.subject ?? ''
  const reSubject = /^re:/i.test(subject.trim()) ? subject : `Re: ${subject}`

  return { to, subject: reSubject, inReplyTo: msgId, references }
}

export function buildReplyAllHeaders(msg: ImapMessage, senderAddress: string): ReplyHeaders {
  const base = buildReplyHeaders(msg, senderAddress)
  const env = msg.envelope

  const originalTo = normalizeAddresses(env.to)
  const originalCc = normalizeAddresses(env.cc)
  const all = [...base.to, ...originalTo, ...originalCc]
  const senderLower = senderAddress.toLowerCase()
  const unique = [...new Set(all.filter(a => !a.toLowerCase().includes(senderLower)))]

  return { ...base, to: unique.length > 0 ? unique : base.to }
}

export function quoteTextBody(msg: ImapMessage): string {
  const originalText = msg.body?.text ?? ''
  if (!originalText) return ''

  const env = msg.envelope
  const date = msg.internalDate?.toUTCString() ?? ''
  const from = normalizeAddresses(env.from)[0] ?? ''
  const quoted = originalText.split('\n').map(l => `> ${l}`).join('\n')

  return `\n\n--- On ${date}, ${from} wrote:\n${quoted}`
}

export function quoteHtmlBody(msg: ImapMessage): string {
  const originalHtml = msg.body?.html ?? msg.body?.text ?? ''
  if (!originalHtml) return ''

  const env = msg.envelope
  const date = msg.internalDate?.toUTCString() ?? ''
  const from = normalizeAddresses(env.from)[0] ?? ''

  return `<br><br><blockquote style="border-left:2px solid #ccc;padding-left:8px;margin-left:0;color:#555">
  <p><em>On ${date}, ${from} wrote:</em></p>
  ${originalHtml}
</blockquote>`
}
