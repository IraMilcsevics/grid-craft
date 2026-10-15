import { COLUMNS, COLUMN_BY_KEY, type ColumnKey, type Order } from './schema'
import { countErrors, orderTotal, parseInput, validateCell } from './validate'

/** RFC 4180-style parser: quoted fields, escaped quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

const quote = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: readonly Order[], keys: readonly ColumnKey[]): string {
  const out = [keys.map((k) => quote(COLUMN_BY_KEY[k].label)).join(',')]
  for (const r of rows) {
    out.push(keys.map((k) => quote(k === 'total' ? orderTotal(r) : r[k])).join(','))
  }
  return out.join('\n')
}

export interface ImportIssue {
  line: number
  column: string
  value: string
  message: string
}

export interface ImportReport {
  rowsRead: number
  rowsWithIssues: number
  issuesByColumn: Partial<Record<ColumnKey, number>>
  samples: ImportIssue[]
  missingColumns: string[]
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Maps CSV headers to columns by key or label, keeps every row, and reports what failed validation. */
export function importOrders(table: string[][], maxSamples = 8): { rows: Order[]; report: ImportReport } {
  const header = (table[0] ?? []).map(norm)
  const source = COLUMNS.filter((c) => !c.computed)
  const index = new Map<ColumnKey, number>()
  for (const c of source) {
    const byKey = header.indexOf(norm(c.key))
    const i = byKey >= 0 ? byKey : header.indexOf(norm(c.label))
    if (i >= 0) index.set(c.key, i)
  }
  const report: ImportReport = {
    rowsRead: Math.max(0, table.length - 1),
    rowsWithIssues: 0,
    issuesByColumn: {},
    samples: [],
    missingColumns: source.filter((c) => !index.has(c.key)).map((c) => c.label),
  }
  const rows: Order[] = []
  for (let n = 1; n < table.length; n++) {
    const line = table[n] ?? []
    const rec: Record<string, string | number> = {}
    for (const c of source) {
      const i = index.get(c.key)
      rec[c.key] = parseInput(c.key, i === undefined ? '' : (line[i] ?? ''))
    }
    if (!rec.id) rec.id = `ROW-${String(n).padStart(6, '0')}`
    const order = rec as unknown as Order
    rows.push(order)
    if (countErrors(order)) {
      report.rowsWithIssues++
      for (const c of source) {
        if (!c.editable) continue
        const message = validateCell(c.key, order[c.key as keyof Order])
        if (!message) continue
        report.issuesByColumn[c.key] = (report.issuesByColumn[c.key] ?? 0) + 1
        if (report.samples.length < maxSamples) {
          report.samples.push({ line: n + 1, column: c.label, value: String(order[c.key as keyof Order]), message })
        }
      }
    }
  }
  return { rows, report }
}
