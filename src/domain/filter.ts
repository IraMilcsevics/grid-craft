import type { ColumnKind } from './schema'

export type Predicate = (value: unknown) => boolean

const OPERATOR = /^(>=|<=|>|<|=)?\s*(.*)$/

/**
 * Column filter syntax:
 * - text: case-insensitive "contains"
 * - enum: exact match
 * - number: optional operator (>, >=, <, <=, =) and a number, e.g. ">= 2000"
 * - date: optional operator and an ISO date prefix, e.g. "> 2024-06" or "2024"
 *
 * Returns null for an empty filter. A malformed number yields a predicate that
 * matches nothing; use `filterError` to tell the user why.
 */
export function compileFilter(kind: ColumnKind, text: string): Predicate | null {
  const t = text.trim()
  if (!t) return null

  if (kind === 'enum') return (v) => v === t
  if (kind === 'text') {
    const needle = t.toLowerCase()
    return (v) => typeof v === 'string' && v.toLowerCase().includes(needle)
  }

  const [, op = '', rest = ''] = OPERATOR.exec(t) ?? []
  const operand = rest.trim()

  if (kind === 'number') {
    const n = Number(operand)
    if (operand === '' || !Number.isFinite(n)) return () => false
    return (v) => {
      if (typeof v !== 'number') return false
      switch (op) {
        case '>': return v > n
        case '>=': return v >= n
        case '<': return v < n
        case '<=': return v <= n
        default: return v === n
      }
    }
  }

  // date
  if (operand === '') return () => false
  return (v) => {
    if (typeof v !== 'string') return false
    switch (op) {
      case '>': return v > operand
      case '>=': return v >= operand
      case '<': return v < operand
      case '<=': return v <= operand
      case '=': return v === operand
      default: return v.startsWith(operand)
    }
  }
}

/** A user-facing message when the filter text cannot work, otherwise null. */
export function filterError(kind: ColumnKind, text: string): string | null {
  const t = text.trim()
  if (!t || (kind !== 'number' && kind !== 'date')) return null
  const operand = (OPERATOR.exec(t)?.[2] ?? '').trim()
  if (kind === 'number' && (operand === '' || !Number.isFinite(Number(operand)))) return 'Enter a number, for example > 100'
  if (kind === 'date' && operand === '') return 'Enter a date, for example > 2024-06'
  return null
}
