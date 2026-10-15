export const COUNTRIES = ['Germany', 'France', 'United States', 'Hungary', 'Poland', 'Japan', 'Brazil', 'Canada', 'Spain', 'Australia'] as const
export const STATUSES = ['Paid', 'Pending', 'Shipped', 'Refunded', 'Cancelled'] as const
export const CATEGORIES = ['Hardware', 'Software', 'Services', 'Accessories', 'Subscriptions'] as const

/**
 * A row as it exists in the grid. Numeric fields may hold the raw string when
 * the source value could not be parsed, so bad data stays visible and editable
 * instead of being dropped on import.
 */
export interface Order {
  id: string
  customer: string
  email: string
  country: string
  status: string
  category: string
  qty: number | string
  price: number | string
  created: string
  rating: number | string
}

export type ColumnKey = keyof Order | 'total'
export type ColumnKind = 'text' | 'enum' | 'number' | 'date'

export interface ColumnMeta {
  key: ColumnKey
  label: string
  kind: ColumnKind
  width: number
  editable: boolean
  computed?: boolean
  options?: readonly string[]
}

export const COLUMNS: readonly ColumnMeta[] = [
  { key: 'id', label: 'Order', kind: 'text', width: 108, editable: false },
  { key: 'customer', label: 'Customer', kind: 'text', width: 180, editable: true },
  { key: 'email', label: 'Email', kind: 'text', width: 244, editable: true },
  { key: 'country', label: 'Country', kind: 'enum', width: 132, editable: true, options: COUNTRIES },
  { key: 'status', label: 'Status', kind: 'enum', width: 128, editable: true, options: STATUSES },
  { key: 'category', label: 'Category', kind: 'enum', width: 142, editable: true, options: CATEGORIES },
  { key: 'qty', label: 'Qty', kind: 'number', width: 112, editable: true },
  { key: 'price', label: 'Unit price', kind: 'number', width: 116, editable: true },
  { key: 'total', label: 'Total', kind: 'number', width: 126, editable: false, computed: true },
  { key: 'created', label: 'Created', kind: 'date', width: 122, editable: true },
  { key: 'rating', label: 'Rating', kind: 'number', width: 104, editable: true },
]

export const COLUMN_BY_KEY = Object.fromEntries(COLUMNS.map((c) => [c.key, c])) as Record<ColumnKey, ColumnMeta>
