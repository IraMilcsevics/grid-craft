import type { ColumnKey, Order } from './schema'

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
  return { rows, index: new Map(rows.map((r, i) => [r.id, i])), past: [], future: [], dirty }
}

function setCell(rows: Order[], index: Map<string, number>, id: string, key: EditKey, value: Order[EditKey]) {
  const i = index.get(id)
  if (i === undefined) return rows
  const next = rows.slice()
  next[i] = { ...(rows[i] as Order), [key]: value }
  return next
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
        rows: setCell(state.rows, state.index, action.id, action.key, action.value),
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
        rows: setCell(state.rows, state.index, edit.id, edit.key, edit.before),
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
        rows: setCell(state.rows, state.index, edit.id, edit.key, edit.after),
        past: [...state.past, edit],
        future: state.future.slice(0, -1),
        dirty: { ...state.dirty, [dirtyKey(edit.id, edit.key)]: true },
      }
    }
  }
}
