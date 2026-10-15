import { useEffect, useRef } from 'react'
import { defaultRangeExtractor, useVirtualizer, type Virtualizer } from '@tanstack/react-virtual'
import { dirtyKey, type CellEdit, type EditKey } from '../domain/editing'
import { COLUMN_BY_KEY, type ColumnKey, type Order } from '../domain/schema'
import type { ColumnTotals } from '../domain/totals'
import { CellEditor } from './CellEditor'
import { ERRORS_COLUMN, cellProblem, renderValue, type OrderTable } from './columns'
import { GridHead } from './grid/GridHead'
import { FOOT, HEAD, IDX_W, ROW_H } from './grid/layout'
import { TotalsRow } from './grid/TotalsRow'
import type { GridRows } from './grid/types'
import { useGridCursor } from './grid/useGridCursor'

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
  rows: GridRows
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

/** The scrolling table: headers and filters on top, virtualized rows, totals pinned at the bottom. */
export function Grid({ table, dirty, onEdit, onUndo, onRedo, notify, onRendered, rows, indexOffset, totals, totalsHint, scrollKey, virtualize = true }: GridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizerRef = useRef<Virtualizer<HTMLDivElement, Element> | null>(null)
  const leaf = table.getVisibleLeafColumns().filter((c) => c.id !== ERRORS_COLUMN)

  const { editing, selIndex, selId, selCol, finishEdit, cancelEdit, onKeyDown, onBodyClick, onBodyDoubleClick } = useGridCursor({
    rows,
    leaf,
    scrollRef,
    scrollKey,
    scrollToRow: (index) => virtualizerRef.current?.scrollToIndex(index, { align: 'auto' }),
    onEdit,
    onUndo,
    onRedo,
    notify,
  })

  // TanStack Virtual hands back functions that React Compiler cannot memoize. This app does not use the compiler,
  // and the grid re-renders on scroll by design, so the warning does not apply.
  // eslint-disable-next-line react/incompatible-library
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
  useEffect(() => {
    virtualizerRef.current = virtualizer
  })
  const items = virtualize ? virtualizer.getVirtualItems() : rows.map((_, index) => ({ index, start: HEAD + index * ROW_H }))
  const domRows = items.length
  useEffect(() => onRendered?.(domRows), [domRows, onRendered])

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
        <GridHead table={table} leaf={leaf} />

        <div className="body" style={{ height: rows.length ? rows.length * ROW_H : 180 }} onClick={onBodyClick} onDoubleClick={onBodyDoubleClick}>
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
                        <CellEditor field={key as EditKey} row={row.original} initial={editing.initial} onCommit={finishEdit} onCancel={cancelEdit} />
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

        <TotalsRow columns={leaf.map((c) => c.id as ColumnKey)} totals={totals} hint={totalsHint} />
      </div>
    </div>
  )
}
