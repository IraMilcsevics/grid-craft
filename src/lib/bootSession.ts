import { generateOrders } from '../domain/generate'
import type { Order } from '../domain/schema'
import { applyStoredEdits, type StoredDataset } from '../domain/session'
import { openSessionStore, type SessionStore } from './persistence'

export const DEFAULT_DEMO_ROWS = 10_000

export interface Session {
  store: SessionStore | null
  /** True when edits and imports are being saved in this browser. */
  persistent: boolean
  /** Why nothing is saved, when `persistent` is false. */
  reason: string | null
  datasetId: string
  kind: 'demo' | 'import'
  name: string
  /** The dataset before any edits. Edits are layered on top of it, so "discard all edits" can return to it. */
  baseRows: Order[]
  rows: Order[]
  dirty: Record<string, true>
}

export const DEMO_NAME = 'Demo orders'

/** `?rows=100000` is a test switch: it loads a generated dataset of that size and stores nothing. */
function overrideRows(search: string) {
  const n = Number(new URLSearchParams(search).get('rows'))
  return Number.isInteger(n) && n >= 100 && n <= 250_000 ? n : null
}

const demoRecord = (rows: number): StoredDataset => ({
  id: crypto.randomUUID(),
  kind: 'demo',
  name: DEMO_NAME,
  demoRows: rows,
  savedAt: new Date().toISOString(),
})

/** Works out what to show on startup: the saved dataset with its edits, or a fresh demo dataset. */
export async function bootSession(search: string): Promise<Session> {
  const override = overrideRows(search)
  if (override !== null) {
    const rows = generateOrders(override)
    return { store: null, persistent: false, reason: 'Test dataset from ?rows=, nothing is stored', datasetId: 'test', kind: 'demo', name: DEMO_NAME, baseRows: rows, rows, dirty: {} }
  }

  const store = await openSessionStore()
  if (!store) {
    const rows = generateOrders(DEFAULT_DEMO_ROWS)
    return { store: null, persistent: false, reason: 'This browser does not allow storage, so changes are lost on reload', datasetId: 'memory', kind: 'demo', name: DEMO_NAME, baseRows: rows, rows, dirty: {} }
  }

  const saved = await store.load()
  let dataset = saved.dataset
  if (!dataset) {
    dataset = demoRecord(DEFAULT_DEMO_ROWS)
    try {
      await store.saveDataset(dataset)
    } catch {
      const rows = generateOrders(DEFAULT_DEMO_ROWS)
      return { store, persistent: false, reason: 'Storage is full or blocked, so changes are lost on reload', datasetId: dataset.id, kind: 'demo', name: DEMO_NAME, baseRows: rows, rows, dirty: {} }
    }
  }

  const baseRows = dataset.kind === 'import' ? (dataset.rows as Order[]) : generateOrders(dataset.demoRows ?? DEFAULT_DEMO_ROWS)
  // Edits belong to one dataset; if the ids differ they are leftovers and are ignored.
  const edits = saved.edits && saved.edits.datasetId === dataset.id ? saved.edits.cells : []
  const { rows, dirty } = applyStoredEdits(baseRows, edits)
  return { store, persistent: true, reason: null, datasetId: dataset.id, kind: dataset.kind, name: dataset.name, baseRows, rows, dirty }
}
