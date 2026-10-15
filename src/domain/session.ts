import { dirtyKey, type EditKey, type OrdersState } from './editing'
import { COLUMN_BY_KEY, type Order } from './schema'

/** Which edits are worth keeping: only the cells the user changed, not the whole dataset. */
export interface StoredEdit {
  id: string
  key: EditKey
  value: Order[EditKey]
}

/**
 * What survives a reload. The demo data is regenerated from its seed, an imported file is stored once,
 * and edits are a small overlay on top of either, so an edit costs a few bytes to save, not a rewrite of every row.
 */
export interface StoredDataset {
  /** Changes whenever the dataset is replaced; edits only apply to the dataset they were made on. */
  id: string
  kind: 'demo' | 'import'
  name: string
  /** For `kind: 'import'`: the rows exactly as imported, before any edit. */
  rows?: Order[]
  /** For `kind: 'demo'`: how many generated rows. */
  demoRows?: number
  savedAt: string
}

export interface StoredEdits {
  datasetId: string
  cells: StoredEdit[]
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const EDITABLE = new Set(Object.values(COLUMN_BY_KEY).filter((c) => c.editable).map((c) => c.key as string))

/** Checks data read back from the browser. Anything unusable becomes null so the app starts clean instead of crashing. */
export function sanitizeDataset(raw: unknown): StoredDataset | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string') return null
  const savedAt = typeof raw.savedAt === 'string' ? raw.savedAt : ''
  if (raw.kind === 'demo') {
    const n = raw.demoRows
    return typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= 250_000 ? { id: raw.id, kind: 'demo', name: raw.name, demoRows: n, savedAt } : null
  }
  if (raw.kind === 'import' && Array.isArray(raw.rows) && raw.rows.length > 0) {
    // Every row has to look like an order; one bad row means the copy cannot be trusted.
    const ok = raw.rows.every((r) => isRecord(r) && typeof r.id === 'string' && typeof r.customer === 'string')
    return ok ? { id: raw.id, kind: 'import', name: raw.name, rows: raw.rows as Order[], savedAt } : null
  }
  return null
}

export function sanitizeEdits(raw: unknown): StoredEdits | null {
  if (!isRecord(raw) || typeof raw.datasetId !== 'string' || !Array.isArray(raw.cells)) return null
  const cells: StoredEdit[] = []
  for (const c of raw.cells) {
    if (isRecord(c) && typeof c.id === 'string' && typeof c.key === 'string' && EDITABLE.has(c.key) && (typeof c.value === 'string' || typeof c.value === 'number')) {
      cells.push({ id: c.id, key: c.key as EditKey, value: c.value })
    }
  }
  return { datasetId: raw.datasetId, cells }
}

/** Lays saved edits over the base rows. Edits for rows that no longer exist are dropped. */
export function applyStoredEdits(base: Order[], cells: StoredEdit[]): { rows: Order[]; dirty: Record<string, true> } {
  if (!cells.length) return { rows: base, dirty: {} }
  const index = new Map(base.map((r, i) => [r.id, i]))
  const rows = base.slice()
  const dirty: Record<string, true> = {}
  for (const c of cells) {
    const i = index.get(c.id)
    if (i === undefined) continue
    rows[i] = { ...(rows[i] as Order), [c.key]: c.value }
    dirty[dirtyKey(c.id, c.key)] = true
  }
  return { rows, dirty }
}

/** The current value of every edited cell, ready to store. */
export function collectEdits(state: Pick<OrdersState, 'rows' | 'index' | 'dirty'>, datasetId: string): StoredEdits {
  const cells: StoredEdit[] = []
  for (const k of Object.keys(state.dirty)) {
    // Row ids can contain colons, column keys cannot, so split at the last one.
    const cut = k.lastIndexOf(':')
    const id = k.slice(0, cut)
    const key = k.slice(cut + 1) as EditKey
    const i = state.index.get(id)
    if (i !== undefined) cells.push({ id, key, value: (state.rows[i] as Order)[key] })
  }
  return { datasetId, cells }
}
