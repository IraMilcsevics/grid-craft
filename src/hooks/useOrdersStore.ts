import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { initOrders, ordersReducer, type CellEdit, type EditKey } from '../domain/editing'
import { COLUMN_BY_KEY, type Order } from '../domain/schema'
import { collectEdits, type StoredDataset } from '../domain/session'
import type { Session } from '../lib/bootSession'

export type SaveStatus = { kind: 'saved' } | { kind: 'saving' } | { kind: 'off'; reason: string } | { kind: 'error'; reason: string }

const label = (e: CellEdit) => `${COLUMN_BY_KEY[e.key].label} on ${e.id}`

/**
 * The rows being worked on, their edit history, and keeping them in browser storage.
 * Edits are saved as a small overlay on the dataset, never as a rewrite of every row.
 */
export function useOrdersStore(session: Session, notify: (message: string) => void) {
  const [state, dispatch] = useReducer(ordersReducer, session, (s) => initOrders(s.rows, s.dirty))
  const [base, setBase] = useState({ id: session.datasetId, kind: session.kind, name: session.name, rows: session.baseRows })
  const [persistOn, setPersistOn] = useState(session.persistent)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(session.persistent ? { kind: 'saved' } : { kind: 'off', reason: session.reason ?? 'Nothing is stored' })
  // Bumped whenever the dataset is replaced or reset, so the grid drops its selection, editor and scroll position.
  const [datasetId, setDatasetId] = useState(0)
  const store = session.store

  const edit = (id: string, key: EditKey, value: Order[EditKey]) => dispatch({ type: 'edit', id, key, value })

  /** Undo and redo return the change they applied, so the grid can select that cell. */
  const undo = (): CellEdit | undefined => {
    const last = state.past[state.past.length - 1]
    if (!last) {
      notify('Nothing to undo')
      return undefined
    }
    dispatch({ type: 'undo' })
    notify(`Undid ${label(last)}`)
    return last
  }
  const redo = (): CellEdit | undefined => {
    const next = state.future[state.future.length - 1]
    if (!next) {
      notify('Nothing to redo')
      return undefined
    }
    dispatch({ type: 'redo' })
    notify(`Redid ${label(next)}`)
    return next
  }

  /**
   * Swaps in a new dataset. The copy in browser storage is replaced first; if that fails (storage full or
   * blocked) the app keeps working in memory, says so, and removes the stale copy so a reload cannot bring back old data.
   * Resolves with whether the new dataset is stored.
   */
  const replaceDataset = async (kind: 'demo' | 'import', name: string, rows: Order[]) => {
    const id = crypto.randomUUID()
    let stored = persistOn
    if (store && persistOn) {
      const record: StoredDataset =
        kind === 'import'
          ? { id, kind, name, rows, savedAt: new Date().toISOString() }
          : { id, kind, name, demoRows: rows.length, savedAt: new Date().toISOString() }
      try {
        await store.saveDataset(record)
        await store.saveEdits({ datasetId: id, cells: [] })
      } catch {
        stored = false
        setPersistOn(false)
        setSaveStatus({ kind: 'error', reason: 'This data is too large or storage is blocked, so it will not survive a reload.' })
        await store.clear().catch(() => undefined)
      }
    }
    setBase({ id, kind, name, rows })
    dispatch({ type: 'load', rows })
    setDatasetId((n) => n + 1)
    return stored
  }

  /** Back to the dataset as it was loaded, dropping every edit. */
  const discardEdits = () => {
    dispatch({ type: 'load', rows: base.rows })
    setDatasetId((n) => n + 1)
    notify('Edits discarded')
  }

  // Save the edited cells shortly after each change, and straight away when the page is being hidden or closed.
  const latest = useRef({ state, baseId: base.id, persistOn })
  useEffect(() => {
    latest.current = { state, baseId: base.id, persistOn }
  })
  const pendingSave = useRef(false)
  const flush = useCallback(async () => {
    const cur = latest.current
    if (!store || !cur.persistOn || !pendingSave.current) return
    pendingSave.current = false
    try {
      await store.saveEdits(collectEdits(cur.state, cur.baseId))
      setSaveStatus({ kind: 'saved' })
    } catch {
      setSaveStatus({ kind: 'error', reason: 'Storage is full or blocked, so recent edits will be lost on reload.' })
    }
  }, [store])

  const firstRows = useRef(state.rows)
  useEffect(() => {
    if (!store || !persistOn || state.rows === firstRows.current) return
    pendingSave.current = true
    setSaveStatus({ kind: 'saving' })
    const timer = setTimeout(() => void flush(), 250)
    return () => clearTimeout(timer)
  }, [state.rows, store, persistOn, flush])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    const onPageHide = () => void flush()
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [flush])

  return { state, dispatch, base, datasetId, saveStatus, store, edit, undo, redo, replaceDataset, discardEdits }
}
