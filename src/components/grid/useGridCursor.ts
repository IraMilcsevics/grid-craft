import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { CellEdit, EditKey } from '../../domain/editing'
import { COLUMN_BY_KEY, type ColumnKey, type Order } from '../../domain/schema'
import type { Move } from '../CellEditor'
import { ROW_H } from './layout'
import type { CellRef, EditingCell, GridRows, LeafColumns } from './types'

interface Options {
  rows: GridRows
  leaf: LeafColumns
  scrollRef: RefObject<HTMLDivElement | null>
  /** Changes whenever the list is replaced (filter, sort, page, mode): the cursor starts over. */
  scrollKey: string
  /** Brings a row into view. Supplied by the grid, which owns the virtualizer. */
  scrollToRow: (index: number) => void
  onEdit: (id: string, key: EditKey, value: Order[EditKey]) => void
  /** Undo and redo return the change they applied, so the cursor can go to that cell. */
  onUndo: () => CellEdit | undefined
  onRedo: () => CellEdit | undefined
  notify: (message: string) => void
}

const readOnlyMessage = (col: ColumnKey) => {
  const meta = COLUMN_BY_KEY[col]
  return meta.computed ? 'Total is calculated from Qty × Unit price' : `${meta.label} cannot be edited`
}

/**
 * Everything about where the user is in the grid: the selected cell, the cell being edited, keyboard
 * and mouse handling, and keeping the selection on screen.
 */
export function useGridCursor({ rows, leaf, scrollRef, scrollKey, scrollToRow, onEdit, onUndo, onRedo, notify }: Options) {
  const [sel, setSel] = useState<CellRef | null>(null)
  const [editing, setEditing] = useState<EditingCell | null>(null)

  // A hidden column cannot keep the selection or an open editor.
  const leafIds = leaf.map((c) => c.id).join()
  useEffect(() => {
    if (sel && !leafIds.split(',').includes(sel.col)) {
      setSel(null)
      setEditing(null)
    }
  }, [leafIds, sel])

  // Selection follows the row id. If that row leaves the list (a fix moved it out of an
  // active filter), the selection falls to the row now at the same position.
  const lastIndex = useRef(0)
  const selIndex = useMemo(() => {
    if (!sel || !rows.length) return -1
    const i = rows.findIndex((r) => r.id === sel.id)
    return i >= 0 ? i : Math.min(lastIndex.current, rows.length - 1)
  }, [rows, sel])
  useEffect(() => {
    if (selIndex >= 0) lastIndex.current = selIndex
  }, [selIndex])
  const selId = selIndex >= 0 ? rows[selIndex]?.id : undefined
  const selCol = sel?.col

  // A different list starts at the top with nothing selected.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    setSel(null)
    setEditing(null)
  }, [scrollKey, scrollRef])

  // Keep the selected cell on screen after any selection change.
  useEffect(() => {
    if (!selId || !selCol) return
    scrollToRow(selIndex)
    const frame = requestAnimationFrame(() => {
      const scroller = scrollRef.current
      const cell = scroller?.querySelector<HTMLElement>(`[data-row="${CSS.escape(selId)}"] [data-col="${selCol}"]`)
      if (!scroller || !cell) return
      const left = cell.offsetLeft
      const right = left + cell.offsetWidth
      if (left < scroller.scrollLeft) scroller.scrollLeft = left
      else if (right > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = right - scroller.clientWidth
    })
    return () => cancelAnimationFrame(frame)
    // Deliberately keyed on the selection only: selIndex changes on every data update,
    // and the grid must not jump back to the selected cell each time a value is edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId, selCol])

  const focusGrid = () => scrollRef.current?.focus({ preventScroll: true })
  const colIndex = sel ? leaf.findIndex((c) => c.id === sel.col) : -1
  const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n))

  const select = (rowIdx: number, colIdx: number) => {
    const row = rows[clamp(rowIdx, rows.length - 1)]
    const col = leaf[clamp(colIdx, leaf.length - 1)]
    if (row && col) setSel({ id: row.id, col: col.id as ColumnKey })
  }
  const move = (dr: number, dc: number) => {
    if (selIndex < 0) select(0, 0)
    else select(selIndex + dr, colIndex + dc)
  }

  const startEdit = (initial?: string) => {
    if (!sel || selIndex < 0) return
    const meta = COLUMN_BY_KEY[sel.col]
    if (!meta.editable) {
      notify(readOnlyMessage(sel.col))
      return
    }
    setEditing({ id: rows[selIndex]!.id, col: sel.col, initial: meta.kind === 'enum' ? undefined : initial })
  }

  // When the editor closed because the user clicked somewhere else, focus must stay where they put it.
  const finishEdit = (value: Order[EditKey], direction: Move, fromBlur: boolean) => {
    if (!editing) return
    const { id, col } = editing
    setEditing(null)
    onEdit(id, col as EditKey, value)
    if (direction) {
      const dr = direction === 'down' ? 1 : direction === 'up' ? -1 : 0
      const dc = direction === 'right' ? 1 : direction === 'left' ? -1 : 0
      select(selIndex + dr, colIndex + dc)
    }
    if (!fromBlur) focusGrid()
  }
  const cancelEdit = (fromBlur: boolean) => {
    setEditing(null)
    if (!fromBlur) focusGrid()
  }

  const applyHistory = (edit: CellEdit | undefined) => {
    if (edit) setSel({ id: edit.id, col: edit.key })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return
    const mod = e.ctrlKey || e.metaKey
    const k = e.key
    const page = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 400) / ROW_H) - 3)

    const handled = (action: () => void) => {
      e.preventDefault()
      action()
    }

    if (mod && (k.toLowerCase() === 'z' || k.toLowerCase() === 'y')) {
      const redo = k.toLowerCase() === 'y' || e.shiftKey
      return handled(() => applyHistory(redo ? onRedo() : onUndo()))
    }
    switch (k) {
      case 'ArrowDown':
        return handled(() => move(1, 0))
      case 'ArrowUp':
        return handled(() => move(-1, 0))
      case 'ArrowRight':
        return handled(() => move(0, 1))
      case 'ArrowLeft':
        return handled(() => move(0, -1))
      case 'PageDown':
        return handled(() => move(page, 0))
      case 'PageUp':
        return handled(() => move(-page, 0))
      case 'Home':
        return handled(() => (mod ? select(0, Math.max(colIndex, 0)) : select(Math.max(selIndex, 0), 0)))
      case 'End':
        return handled(() => (mod ? select(rows.length - 1, Math.max(colIndex, 0)) : select(Math.max(selIndex, 0), leaf.length - 1)))
      case 'Enter':
      case 'F2':
        if (sel) return handled(() => startEdit())
        return
    }
    // Typing a character starts editing with that character.
    if (sel && k.length === 1 && !mod && !e.altKey) handled(() => startEdit(k))
  }

  const cellFromEvent = (e: React.MouseEvent): CellRef | null => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-col]')
    const row = el?.closest<HTMLElement>('[data-row]')
    return el && row?.dataset.row ? { id: row.dataset.row, col: el.dataset.col as ColumnKey } : null
  }
  const onBodyClick = (e: React.MouseEvent) => {
    const cell = cellFromEvent(e)
    if (cell) setSel(cell)
  }
  const onBodyDoubleClick = (e: React.MouseEvent) => {
    const cell = cellFromEvent(e)
    if (!cell) return
    setSel(cell)
    if (COLUMN_BY_KEY[cell.col].editable) setEditing(cell)
    else notify(readOnlyMessage(cell.col))
  }

  return { editing, selIndex, selId, selCol, finishEdit, cancelEdit, onKeyDown, onBodyClick, onBodyDoubleClick }
}
