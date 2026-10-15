import { useEffect, useRef, useState } from 'react'
import { COLUMN_BY_KEY, type ColumnKey } from '../../domain/schema'
import type { OrderTable } from '../columns'
import { FilterCell } from './FilterCell'
import type { LeafColumns } from './types'

const KIND_GLYPH = { text: 'Aa', enum: '≡', number: '123', date: 'D' } as const

/** Column headers (sort, drag to reorder, drag the edge to resize) and the row of filter boxes under them. */
export function GridHead({ table, leaf }: { table: OrderTable; leaf: LeafColumns }) {
  const headers = new Map(table.getHeaderGroups().flatMap((g) => g.headers).map((h) => [h.column.id, h]))
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

  const reorder = (activeId: string, overId: string) => {
    if (activeId === overId) return
    const ids = table.getAllLeafColumns().map((c) => c.id)
    const from = ids.indexOf(activeId)
    const to = ids.indexOf(overId)
    ids.splice(from, 1)
    ids.splice(to, 0, activeId)
    table.setColumnOrder(ids)
  }

  return (
    <div className="sticky-head">
      <div className="hrow" role="row">
        <div className="hcell idx" role="columnheader">
          #
        </div>
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
  )
}
