import { useEffect, useMemo, useRef, useState } from 'react'
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual'
import { dirtyKey, type CellEdit, type EditKey } from '../domain/editing'
import { filterError } from '../domain/filter'
import { COLUMN_BY_KEY, type ColumnKey, type Order } from '../domain/schema'
import type { ColumnTotals } from '../domain/totals'
import { CellEditor, type Move } from './CellEditor'
import { ERRORS_COLUMN, cellProblem, renderValue, type OrderTable } from './columns'
import { useDebouncedField } from './useDebouncedField'

const ROW_H = 34
const IDX_W = 56
/** Height of the sticky header block (column headers + filter row). */
const HEAD = 72
/** Height of the sticky totals row. */
const FOOT = 38
const KIND_GLYPH = { text: 'Aa', enum: '≡', number: '123', date: 'D' } as const
const PLACEHOLDER = { text: 'contains…', enum: '', number: '> 100', date: '> 2024-06' } as const

interface Sel {
  id: string
  col: ColumnKey
}
interface Editing extends Sel {
  initial?: string
}

function FilterCell({ table, id }: { table: OrderTable; id: ColumnKey }) {
  const column = table.getColumn(id)
  const meta = COLUMN_BY_KEY[id]
  const committed = String(column?.getFilterValue() ?? '')
  const [text, setText] = useDebouncedField(committed, (v) => column?.setFilterValue(v.trim() ? v : undefined))
  const error = filterError(meta.kind, committed)

  if (meta.kind === 'enum') {
    return (
      <div className="fcell">
        <select
          value={committed}
          className={committed ? 'active' : ''}
          aria-label={`Filter ${meta.label}`}
          onChange={(e) => column?.setFilterValue(e.target.value || undefined)}
        >
          <option value="">All</option>
          {meta.options?.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>
    )
  }
  return (
    <div className="fcell">
      <input
        value={text}
        className={error ? 'invalid' : committed ? 'active' : ''}
        placeholder={PLACEHOLDER[meta.kind]}
        title={error ?? undefined}
        aria-label={`Filter ${meta.label}`}
        aria-invalid={!!error}
        autoComplete="off"
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  )
}

interface GridProps {
  table: OrderTable
  dirty: Record<string, true>
  onEdit: (id: string, key: EditKey, value: Order[EditKey]) => void
  /** Undo/redo return the change they applied, so the grid can select that cell. */
  onUndo: () => CellEdit | undefined
  onRedo: () => CellEdit | undefined
  notify: (message: string) => void
  onRendered?: (domRows: number) => void
  /** Rows to show: every filtered row in virtual mode, the current page in paged mode. */
  rows: ReturnType<OrderTable['getRowModel']>['rows']
  /** Position of the first shown row within the full filtered list (page offset). */
  indexOffset: number
  totals: Partial<Record<ColumnKey, ColumnTotals>>
  /** Explains what the totals row covers. */
  totalsHint: string
  /** Changes whenever the list is replaced (filter, sort, page, mode): scroll to top, drop the selection. */
  scrollKey: string
  /** Developer flag. When false every row is drawn, to show what virtualization saves. */
  virtualize?: boolean
}

export function Grid({ table, dirty, onEdit, onUndo, onRedo, notify, onRendered, rows, indexOffset, totals, totalsHint, scrollKey, virtualize = true }: GridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const leaf = table.getVisibleLeafColumns().filter((c) => c.id !== ERRORS_COLUMN)
  const headers = new Map(table.getHeaderGroups().flatMap((g) => g.headers).map((h) => [h.column.id, h]))

  const [sel, setSel] = useState<Sel | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [drag, setDrag] = useState<{ id: string; over: string | null } | null>(null)
  // Pressing a resize handle must not start a header drag-reorder.
  const resizing = useRef(false)
  useEffect(() => {
    const stop = () => (resizing.current = false)
    window.addEventListener('mouseup', stop)
    window.addEventListener('touchend', stop)
    return () => {
      window.removeEventListener('mouseup', stop)
      window.removeEventListener('touchend', stop)
    }
  }, [])

  // A hidden column cannot keep the selection or an open editor.
  const leafIds = leaf.map((c) => c.id).join()
  useEffect(() => {
    if (sel && !leafIds.split(',').includes(sel.col)) {
      setSel(null)
      setEditing(null)
    }
  }, [leafIds, sel])

  const reorder = (activeId: string, overId: string) => {
    if (activeId === overId) return
    const ids = table.getAllLeafColumns().map((c) => c.id)
    const from = ids.indexOf(activeId)
    const to = ids.indexOf(overId)
    ids.splice(from, 1)
    ids.splice(to, 0, activeId)
    table.setColumnOrder(ids)
  }

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

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    getItemKey: (i) => rows[i]?.id ?? i,
    overscan: 8,
    scrollMargin: HEAD,
    scrollPaddingStart: HEAD,
    scrollPaddingEnd: FOOT,
    // Keep the selected row mounted so keyboard focus and an open editor survive scrolling away.
    rangeExtractor: (range) => {
      const base = defaultRangeExtractor(range)
      if (selIndex >= 0 && !base.includes(selIndex)) return [...base, selIndex].sort((a, b) => a - b)
      return base
    },
  })
  const items = virtualize ? virtualizer.getVirtualItems() : rows.map((_, index) => ({ index, start: HEAD + index * ROW_H }))
  const domRows = items.length
  useEffect(() => onRendered?.(domRows), [domRows, onRendered])

  // A different list (new filter, sort, page or mode) starts at the top with nothing selected.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    setSel(null)
    setEditing(null)
  }, [scrollKey])

  // Keep the selected cell on screen after any selection change.
  useEffect(() => {
    if (!selId || !selCol) return
    virtualizer.scrollToIndex(selIndex, { align: 'auto' })
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
    // Deliberately keyed on the selection only: selIndex and the virtualizer change on every data update,
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
      notify(meta.computed ? 'Total is calculated from Qty × Unit price' : `${meta.label} cannot be edited`)
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

  const cellFromEvent = (e: React.MouseEvent): Sel | null => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-col]')
    const row = el?.closest<HTMLElement>('[data-row]')
    return el && row?.dataset.row ? { id: row.dataset.row, col: el.dataset.col as ColumnKey } : null
  }

  const widths = leaf.map((c) => c.getSize())
  const rowW = IDX_W + widths.reduce((a, b) => a + b, 0)
  const style = {
    '--cols': `${IDX_W}px ${widths.map((w) => `${w}px`).join(' ')}`,
    '--row-w': `${rowW}px`,
    '--row-h': `${ROW_H}px`,
  } as React.CSSProperties

  return (
    <div
      className="scroller"
      ref={scrollRef}
      role="grid"
      tabIndex={0}
      aria-rowcount={rows.length + 2}
      aria-label="Orders. Arrow keys move, Enter edits, Ctrl+Z undoes."
      onKeyDown={onKeyDown}
    >
      <div className="inner" style={style}>
        <div className="sticky-head">
          <div className="hrow" role="row">
            <div className="hcell idx" role="columnheader">#</div>
            {leaf.map((c) => {
              const meta = COLUMN_BY_KEY[c.id as ColumnKey]
              const dir = c.getIsSorted()
              const header = headers.get(c.id)
              const dropSide =
                drag?.over === c.id && drag.id !== c.id
                  ? leaf.findIndex((x) => x.id === drag.id) < leaf.findIndex((x) => x.id === c.id)
                    ? ' drop-after'
                    : ' drop-before'
                  : ''
              return (
                <div
                  key={c.id}
                  className={`hcell${drag?.id === c.id ? ' dragging' : ''}${dropSide}`}
                  role="columnheader"
                  draggable
                  aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
                  onClick={c.getToggleSortingHandler()}
                  onDragStart={(e) => {
                    if (resizing.current) {
                      e.preventDefault()
                      return
                    }
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', c.id)
                    setDrag({ id: c.id, over: null })
                  }}
                  onDragOver={(e) => {
                    if (!drag) return
                    e.preventDefault()
                    if (drag.over !== c.id) setDrag({ ...drag, over: c.id })
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (drag) reorder(drag.id, c.id)
                    setDrag(null)
                  }}
                  onDragEnd={() => setDrag(null)}
                >
                  <span className="ty">{KIND_GLYPH[meta.kind]}</span>
                  <span className="lbl">{meta.label}</span>
                  <span className="srt">{dir === 'asc' ? '↑' : dir === 'desc' ? '↓' : ''}</span>
                  {header && (
                    <span
                      className={`rs${c.getIsResizing() ? ' active' : ''}`}
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${meta.label}. Double-click to reset.`}
                      draggable={false}
                      onMouseDown={(e) => {
                        resizing.current = true
                        header.getResizeHandler()(e)
                      }}
                      onTouchStart={(e) => {
                        resizing.current = true
                        header.getResizeHandler()(e)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        c.resetSize()
                      }}
                    />
                  )}
                </div>
              )
            })}
          </div>
          <div className="frow" role="row">
            <div className="fcell idx" />
            {leaf.map((c) => (
              <FilterCell key={c.id} table={table} id={c.id as ColumnKey} />
            ))}
          </div>
        </div>

        <div
          className="body"
          style={{ height: rows.length ? rows.length * ROW_H : 180 }}
          onClick={(e) => {
            const cell = cellFromEvent(e)
            if (cell) setSel(cell)
          }}
          onDoubleClick={(e) => {
            const cell = cellFromEvent(e)
            if (!cell) return
            setSel(cell)
            const meta = COLUMN_BY_KEY[cell.col]
            if (!meta.editable) notify(meta.computed ? 'Total is calculated from Qty × Unit price' : `${meta.label} cannot be edited`)
            else setEditing(cell)
          }}
        >
          {rows.length === 0 && (
            <div className="empty">
              <div>No rows match the current filters.</div>
              <button
                className="btn"
                onClick={() => {
                  table.setGlobalFilter(undefined)
                  table.resetColumnFilters(true)
                }}
              >
                Clear filters
              </button>
            </div>
          )}
          {items.map((item) => {
            const row = rows[item.index]
            if (!row) return null
            const isEditRow = editing?.id === row.id
            return (
              <div
                key={row.id}
                role="row"
                data-row={row.id}
                aria-rowindex={indexOffset + item.index + 3}
                className={`row${item.index & 1 ? ' odd' : ''}${isEditRow ? ' editing-row' : ''}`}
                style={{ transform: `translateY(${item.start - HEAD}px)` }}
              >
                <div className="cell idx" role="gridcell">{indexOffset + item.index + 1}</div>
                {leaf.map((c) => {
                  const key = c.id as ColumnKey
                  const meta = COLUMN_BY_KEY[key]
                  const problem = cellProblem(key, row.original)
                  const bad = problem !== null
                  const isSel = row.id === selId && key === selCol
                  const isEditing = isEditRow && editing?.col === key
                  const cls = [
                    'cell',
                    meta.kind === 'number' && 'right',
                    meta.kind === 'date' && 'mono',
                    meta.computed && 'calc',
                    bad && 'bad',
                    dirty[dirtyKey(row.id, key)] && 'dirty',
                    isSel && 'sel',
                    isEditing && 'editing',
                  ]
                    .filter(Boolean)
                    .join(' ')
                  return (
                    <div key={c.id} className={cls} role="gridcell" data-col={key} aria-selected={isSel} title={problem ?? undefined}>
                      {isEditing ? (
                        <CellEditor
                          field={key as EditKey}
                          row={row.original}
                          initial={editing.initial}
                          onCommit={finishEdit}
                          onCancel={cancelEdit}
                        />
                      ) : (
                        renderValue(key, row.original, bad)
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        <div className="sticky-foot" role="row">
          <div className="arow">
            <div className="acell idx" title={totalsHint}>Σ</div>
            {leaf.map((c) => (
              <TotalCell key={c.id} id={c.id as ColumnKey} totals={totals[c.id as ColumnKey]} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const int = new Intl.NumberFormat('en-US')

function TotalCell({ id, totals }: { id: ColumnKey; totals: ColumnTotals | undefined }) {
  const meta = COLUMN_BY_KEY[id]
  let label = ''
  let value = ''
  if (totals) {
    if (id === 'customer') [label, value] = ['count', int.format(totals.rows)]
    else if (id === 'qty') [label, value] = ['sum', int.format(totals.sum)]
    else if (id === 'total') [label, value] = ['sum', money.format(totals.sum)]
    else if (id === 'price') [label, value] = ['avg', totals.valid ? money.format(totals.sum / totals.valid) : '—']
    else if (id === 'rating') [label, value] = ['avg', totals.valid ? (totals.sum / totals.valid).toFixed(2) : '—']
  }
  const skipped = totals && id !== 'customer' ? totals.skipped : 0
  return (
    <div
      className={`acell${meta.kind === 'number' ? ' right' : ''}${skipped ? ' skipped' : ''}`}
      title={skipped ? `${int.format(skipped)} invalid or missing values are not counted` : undefined}
    >
      {value && (
        <>
          <em>{label}</em> {value}
        </>
      )}
    </div>
  )
}
