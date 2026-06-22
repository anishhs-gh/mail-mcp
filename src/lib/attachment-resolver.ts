import { readFileSync } from 'node:fs'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import type { Attachment } from '@mailts/core'

/** Shape accepted by MCP tool inputs for attachments */
export interface McpAttachment {
  filename: string
  // server-local path
  path?: string
  // base64-encoded content from the MCP client
  content?: string
  encoding?: 'base64'
  contentType?: string
  // URL to fetch at send time
  url?: string
  // CID for inline images referenced in HTML
  cid?: string
}

function fetchUrl(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const fn = url.startsWith('https') ? httpsRequest : httpRequest
    fn(url, res => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject).end()
  })
}

export async function toMailtsAttachment(input: McpAttachment): Promise<Attachment> {
  if (input.url) {
    const content = await fetchUrl(input.url)
    return { filename: input.filename, content, contentType: input.contentType }
  }

  if (input.path) {
    return { filename: input.filename, path: input.path, contentType: input.contentType }
  }

  if (input.content) {
    const buffer = Buffer.from(input.content, input.encoding === 'base64' ? 'base64' : 'utf8')

    if (input.cid) {
      return { filename: input.filename, content: buffer, contentType: input.contentType, cid: input.cid }
    }

    return { filename: input.filename, content: buffer, contentType: input.contentType }
  }

  throw new Error(`Attachment "${input.filename}" must have path, content, or url`)
}

export async function resolveAttachments(inputs: McpAttachment[] = []): Promise<Attachment[]> {
  return Promise.all(inputs.map(toMailtsAttachment))
}
