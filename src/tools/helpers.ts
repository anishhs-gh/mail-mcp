import type { BodyNode } from '@mailts/core'

type TextContent = { type: 'text'; text: string }
type ToolResult = { content: TextContent[]; isError?: boolean }

export function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

export function err(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

/** Walk a BODYSTRUCTURE tree and return metadata for all non-body-text parts. */
export function extractAttachmentMeta(node: BodyNode): Array<{
  filename?: string
  contentType: string
  size: number
  section: string
  inline?: boolean
}> {
  if (node.type === 'multipart') return node.parts.flatMap(extractAttachmentMeta)

  // Skip inline body text (no filename, not explicitly attached)
  const isBodyText =
    (node.contentType === 'text/plain' || node.contentType === 'text/html') &&
    !node.filename &&
    node.disposition !== 'attachment'
  if (isBodyText) return []

  return [{
    filename: node.filename,
    contentType: node.contentType,
    size: node.size,
    section: node.section,
    ...(node.disposition === 'inline' ? { inline: true } : {}),
  }]
}
