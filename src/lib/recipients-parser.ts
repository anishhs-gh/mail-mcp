export interface Recipient {
  email: string
  name?: string
  [key: string]: string | undefined
}

export interface ParseResult {
  count: number
  recipients: Recipient[]
  fields: string[]
  warnings: string[]
}

const EMAIL_FIELDS = ['email', 'email_address', 'address', 'mail', 'e-mail']
const NAME_FIELDS = ['name', 'full_name', 'fullname', 'display_name', 'displayname', 'first_name', 'firstname', 'contact']

function detectField(headers: string[], candidates: string[]): string | undefined {
  const lower = headers.map(h => h.toLowerCase().trim())
  for (const c of candidates) {
    const idx = lower.indexOf(c)
    if (idx !== -1) return headers[idx]
  }
  return undefined
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

// Minimal RFC 4180 CSV parser — handles quoted fields, embedded commas and newlines
function parseCsv(content: string, delimiter = ','): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < content.length) {
    const ch = content[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === delimiter) {
        row.push(field); field = ''
      } else if (ch === '\r' && content[i + 1] === '\n') {
        row.push(field); field = ''
        rows.push(row); row = []
        i += 2; continue
      } else if (ch === '\n') {
        row.push(field); field = ''
        rows.push(row); row = []
      } else {
        field += ch
      }
    }
    i++
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim()))
}

export function parseRecipients(
  content: string,
  format: 'csv' | 'json' | 'tsv',
  emailField?: string,
  nameField?: string,
): ParseResult {
  const warnings: string[] = []

  if (format === 'json') {
    const parsed: unknown = JSON.parse(content)
    if (!Array.isArray(parsed)) throw new Error('JSON recipients must be an array')

    const fields = parsed.length > 0 ? Object.keys(parsed[0] as object) : []
    const eField = emailField ?? detectField(fields, EMAIL_FIELDS) ?? fields[0]
    const nField = nameField ?? detectField(fields, NAME_FIELDS)

    if (!eField) throw new Error('Could not detect email field in JSON. Specify email_field.')

    const recipients: Recipient[] = []
    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i] as Record<string, unknown>
      const email = String(row[eField] ?? '').trim()
      if (!email) { warnings.push(`Row ${i + 1}: missing email, skipped`); continue }
      if (!isValidEmail(email)) { warnings.push(`Row ${i + 1}: invalid email "${email}", skipped`); continue }

      const extra: Recipient = { email }
      if (nField && row[nField]) extra.name = String(row[nField])
      for (const [k, v] of Object.entries(row)) {
        if (k !== eField && k !== nField) extra[k] = String(v ?? '')
      }
      recipients.push(extra)
    }

    return { count: recipients.length, recipients, fields, warnings }
  }

  // CSV / TSV
  const delimiter = format === 'tsv' ? '\t' : ','
  const rows = parseCsv(content, delimiter)
  if (rows.length === 0) return { count: 0, recipients: [], fields: [], warnings: ['File is empty'] }

  const headers = rows[0]!.map(h => h.trim())
  const eField = emailField ?? detectField(headers, EMAIL_FIELDS)
  const nField = nameField ?? detectField(headers, NAME_FIELDS)

  if (!eField) throw new Error(`Could not detect email column. Headers: ${headers.join(', ')}. Specify email_field.`)

  const eIdx = headers.indexOf(eField)
  const nIdx = nField ? headers.indexOf(nField) : -1

  const recipients: Recipient[] = []
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i]!
    const email = (cols[eIdx] ?? '').trim()
    if (!email) { warnings.push(`Row ${i + 1}: missing email, skipped`); continue }
    if (!isValidEmail(email)) { warnings.push(`Row ${i + 1}: invalid email "${email}", skipped`); continue }

    const rec: Recipient = { email }
    if (nIdx >= 0 && cols[nIdx]) rec.name = cols[nIdx]!.trim()
    for (let j = 0; j < headers.length; j++) {
      if (j !== eIdx && j !== nIdx) rec[headers[j]!] = (cols[j] ?? '').trim()
    }
    recipients.push(rec)
  }

  return { count: recipients.length, recipients, fields: headers, warnings }
}
