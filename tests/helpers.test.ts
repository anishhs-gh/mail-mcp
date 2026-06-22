import { describe, it, expect } from 'vitest'
import type { BodyLeaf, BodyMultipart, BodyNode } from '@mailts/core'
import { extractAttachmentMeta, ok, err } from '../src/tools/helpers.js'

// ── Fixtures ───────────────────────────────────────────────────────────────

function leaf(overrides: Partial<BodyLeaf> & { contentType: string }): BodyLeaf {
  return {
    type: 'leaf',
    section: '1',
    encoding: '7bit',
    size: 100,
    ...overrides,
  }
}

function multipart(parts: BodyNode[], subtype = 'mixed', section = ''): BodyMultipart {
  return {
    type: 'multipart',
    section,
    contentType: `multipart/${subtype}`,
    boundary: 'boundary',
    parts,
  }
}

// ── ok / err ───────────────────────────────────────────────────────────────

describe('ok', () => {
  it('wraps data as JSON text content', () => {
    const result = ok({ count: 3 })
    expect(result.isError).toBeUndefined()
    expect(result.content).toHaveLength(1)
    expect(result.content[0]!.type).toBe('text')
    expect(JSON.parse(result.content[0]!.text)).toEqual({ count: 3 })
  })
})

describe('err', () => {
  it('sets isError and puts message as text', () => {
    const result = err('something went wrong')
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toBe('something went wrong')
  })
})

// ── extractAttachmentMeta ──────────────────────────────────────────────────

describe('extractAttachmentMeta', () => {
  it('ignores plain text body leaf (no filename, no disposition)', () => {
    expect(extractAttachmentMeta(leaf({ contentType: 'text/plain' }))).toEqual([])
  })

  it('ignores html body leaf (no filename, no disposition)', () => {
    expect(extractAttachmentMeta(leaf({ contentType: 'text/html' }))).toEqual([])
  })

  it('includes a PDF attachment leaf', () => {
    const node = leaf({ contentType: 'application/pdf', filename: 'report.pdf', section: '2', size: 5000, disposition: 'attachment' })
    const result = extractAttachmentMeta(node)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ contentType: 'application/pdf', filename: 'report.pdf', size: 5000, section: '2' })
    expect(result[0]!.inline).toBeUndefined()
  })

  it('includes named text/plain as attachment when it has a filename', () => {
    const node = leaf({ contentType: 'text/plain', filename: 'notes.txt', section: '2', disposition: 'attachment' })
    const result = extractAttachmentMeta(node)
    expect(result).toHaveLength(1)
    expect(result[0]!.filename).toBe('notes.txt')
  })

  it('marks inline disposition parts with inline: true', () => {
    const node = leaf({ contentType: 'image/jpeg', filename: 'photo.jpg', section: '2', size: 80000, disposition: 'inline' })
    const result = extractAttachmentMeta(node)
    expect(result).toHaveLength(1)
    expect(result[0]!.inline).toBe(true)
  })

  it('returns [] for multipart/alternative with only text parts', () => {
    const node = multipart([
      leaf({ contentType: 'text/plain', section: '1' }),
      leaf({ contentType: 'text/html', section: '2' }),
    ], 'alternative')
    expect(extractAttachmentMeta(node)).toEqual([])
  })

  it('returns only the attachment in multipart/mixed with text body + pdf', () => {
    const node = multipart([
      leaf({ contentType: 'text/plain', section: '1' }),
      leaf({ contentType: 'application/pdf', filename: 'doc.pdf', section: '2', size: 2000, disposition: 'attachment' }),
    ])
    const result = extractAttachmentMeta(node)
    expect(result).toHaveLength(1)
    expect(result[0]!.contentType).toBe('application/pdf')
  })

  it('returns multiple attachments from a single multipart', () => {
    const node = multipart([
      leaf({ contentType: 'text/plain', section: '1' }),
      leaf({ contentType: 'image/png', filename: 'img.png', section: '2', size: 1000, disposition: 'inline' }),
      leaf({ contentType: 'application/zip', filename: 'archive.zip', section: '3', size: 9000, disposition: 'attachment' }),
    ])
    const result = extractAttachmentMeta(node)
    expect(result).toHaveLength(2)
    expect(result[0]!.contentType).toBe('image/png')
    expect(result[1]!.contentType).toBe('application/zip')
  })

  it('recurses into nested multipart', () => {
    // multipart/mixed > multipart/alternative (text parts) + pdf
    const inner = multipart([
      leaf({ contentType: 'text/plain', section: '1.1' }),
      leaf({ contentType: 'text/html', section: '1.2' }),
    ], 'alternative', '1')
    const outer = multipart([
      inner,
      leaf({ contentType: 'application/pdf', filename: 'nested.pdf', section: '2', size: 3000, disposition: 'attachment' }),
    ])
    const result = extractAttachmentMeta(outer)
    expect(result).toHaveLength(1)
    expect(result[0]!.filename).toBe('nested.pdf')
  })

  it('includes text/html with explicit attachment disposition', () => {
    const node = leaf({ contentType: 'text/html', filename: 'page.html', section: '1', disposition: 'attachment' })
    expect(extractAttachmentMeta(node)).toHaveLength(1)
  })

  it('omits filename field when absent', () => {
    const node = leaf({ contentType: 'application/octet-stream', section: '2', size: 500, disposition: 'attachment' })
    const result = extractAttachmentMeta(node)
    expect(result).toHaveLength(1)
    expect(result[0]!.filename).toBeUndefined()
  })
})
