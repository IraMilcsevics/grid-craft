import { COLUMN_BY_KEY, type ColumnKey, type Order } from './schema'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Returns a user-facing message, or null when the value is valid. */
export function validateCell(key: ColumnKey, v: unknown): string | null {
  switch (key) {
    case 'customer':
      return typeof v === 'string' && v.trim() ? null : 'Customer name is required'
    case 'email':
      return typeof v === 'string' && EMAIL.test(v) ? null : 'Enter a valid email address'
    case 'country':
    case 'status':
    case 'category': {
      const opts = COLUMN_BY_KEY[key].options ?? []
      return typeof v === 'string' && opts.includes(v) ? null : `Pick one of: ${opts.join(', ')}`
    }
    case 'qty':
      return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? null : 'Quantity must be a whole number, 0 or more'
    case 'price':
      return typeof v === 'number' && Number.isFinite(v) && v > 0 ? null : 'Unit price must be a number above 0'
    case 'created': {
      if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Use the format YYYY-MM-DD'
      const d = new Date(`${v}T00:00:00Z`)
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? null : 'That date does not exist'
    }
    case 'rating':
      return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5 ? null : 'Rating must be a whole number from 1 to 5'
    default:
      return null
  }
}

/** Parses editor text into the cell's value type. Unparseable numbers stay as text so validation can reject them. */
export function parseInput(key: ColumnKey, text: string): string | number {
  const t = text.trim()
  if (COLUMN_BY_KEY[key].kind === 'number') {
    if (t === '') return ''
    const n = Number(t)
    return Number.isFinite(n) ? n : t
  }
  return t
}

export function orderTotal(o: Pick<Order, 'qty' | 'price'>): number | null {
  if (typeof o.qty !== 'number' || typeof o.price !== 'number') return null
  const t = o.qty * o.price
  return Number.isFinite(t) ? Math.round(t * 100) / 100 : null
}

/** Number of invalid editable cells in a row. */
export function countErrors(o: Order): number {
  let n = 0
  for (const col of Object.values(COLUMN_BY_KEY)) {
    if (col.editable && validateCell(col.key, o[col.key as keyof Order])) n++
  }
  return n
}
