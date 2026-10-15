import type { ColumnKey, Order } from './schema'
import { countErrors } from './validate'

export type EditKey = Exclude<keyof Order, 'id'>

export interface CellEdit {
  id: string
  key: EditKey
  before: Order[EditKey]
  after: Order[EditKey]
  /** Whether the cell already carried an edit marker before this change. */
  wasDirty: boolean
}

export interface OrdersState {
  rows: Order[]
  /** Row id to position. Edits never reorder `rows`, so this stays valid for the dataset's lifetime. */
  index: Map<string, number>
  past: CellEdit[]
  future: CellEdit[]
  /** Cells changed since load, keyed by `dirtyKey`. */
  dirty: Record<string, true>
  /** Rows with at least one invalid cell. Kept up to date edit by edit, so it never needs a pass over every row. */
  errorRows: number
}

export type OrdersAction =
  | { type: 'edit'; id: string; key: EditKey; value: Order[EditKey] }
  | { type: 'undo' }
  | { type: 'redo' }
  /** Replaces the dataset and clears the history. `dirty` restores edit markers that were saved earlier. */
  | { type: 'load'; rows: Order[]; dirty?: Record<string, true> }

const HISTORY_LIMIT = 500

export const dirtyKey = (id: string, key: ColumnKey) => `${id}:${key}`

export function initOrders(rows: Order[], dirty: Record<string, true> = {}): OrdersState {
  let errorRows = 0
  for (let i = 0; i < rows.length; i++) if (countErrors(rows[i] as Order) > 0) errorRows++
  return { rows, index: new Map(rows.map((r, i) => [r.id, i])), past: [], future: [], dirty, errorRows }
}

/** Changes one cell. Also reports how the number of rows with errors changed, so the caller does not have to recount. */
function setCell(state: OrdersState, id: string, key: EditKey, value: Order[EditKey]) {
  const i = state.index.get(id)
  if (i === undefined) return { rows: state.rows, errorRows: state.errorRows }
  const before = state.rows[i] as Order
  const after = { ...before, [key]: value }
  const rows = state.rows.slice()
  rows[i] = after
  const delta = (countErrors(after) > 0 ? 1 : 0) - (countErrors(before) > 0 ? 1 : 0)
  return { rows, errorRows: state.errorRows + delta }
}

export function ordersReducer(state: OrdersState, action: OrdersAction): OrdersState {
  switch (action.type) {
    case 'load':
      return initOrders(action.rows, action.dirty)

    case 'edit': {
      const i = state.index.get(action.id)
      if (i === undefined) return state
      const before = (state.rows[i] as Order)[action.key]
      if (before === action.value) return state
      const dk = dirtyKey(action.id, action.key)
      const edit: CellEdit = { id: action.id, key: action.key, before, after: action.value, wasDirty: !!state.dirty[dk] }
      return {
        ...state,
        ...setCell(state, action.id, action.key, action.value),
        past: [...state.past.slice(-(HISTORY_LIMIT - 1)), edit],
        future: [],
        dirty: { ...state.dirty, [dk]: true },
      }
    }

    case 'undo': {
      const edit = state.past[state.past.length - 1]
      if (!edit) return state
      const dirty = { ...state.dirty }
      if (!edit.wasDirty) delete dirty[dirtyKey(edit.id, edit.key)]
      return {
        ...state,
        ...setCell(state, edit.id, edit.key, edit.before),
        past: state.past.slice(0, -1),
        future: [...state.future, edit],
        dirty,
      }
    }

    case 'redo': {
      const edit = state.future[state.future.length - 1]
      if (!edit) return state
      return {
        ...state,
        ...setCell(state, edit.id, edit.key, edit.after),
        past: [...state.past, edit],
        future: state.future.slice(0, -1),
        dirty: { ...state.dirty, [dirtyKey(edit.id, edit.key)]: true },
      }
    }
  }
}
