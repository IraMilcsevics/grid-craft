import { useRef, useState, type ReactNode } from 'react'
import { COLUMN_BY_KEY, type ColumnKey } from '../domain/schema'
import { PAGE_SIZES, type RowMode } from '../domain/view'
import { ERRORS_COLUMN, type OrderTable } from './columns'
import { useDebouncedField } from '../hooks/useDebouncedField'
import { useDismiss } from '../hooks/useDismiss'

interface ToolbarProps {
  table: OrderTable
  badRows: number
  undoCount: number
  redoCount: number
  onUndo: () => void
  onRedo: () => void
  mode: RowMode
  onModeChange: (mode: RowMode) => void
  /** Rendered next to the column controls. */
  viewsMenu?: ReactNode
}

function ColumnsMenu({ table }: { table: OrderTable }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useDismiss(open, () => setOpen(false), root)

  const all = table.getAllLeafColumns().filter((c) => c.id !== ERRORS_COLUMN)
  const visible = all.filter((c) => c.getIsVisible()).length

  const shift = (id: string, delta: number) => {
    const ids = table.getAllLeafColumns().map((c) => c.id)
    const i = ids.indexOf(id)
    const j = ids.indexOf(all[all.findIndex((c) => c.id === id) + delta]?.id ?? '')
    if (i < 0 || j < 0) return
    ids.splice(i, 1)
    ids.splice(j, 0, id)
    table.setColumnOrder(ids)
  }

  return (
    <div className="menu-root" ref={root}>
      <button className={`btn${open ? ' on' : ''}`} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="2" y="3" width="12" height="10" rx="1.5" />
          <path d="M6 3v10M10 3v10" />
        </svg>
        Columns{visible < all.length && <span className="count neutral">{visible}/{all.length}</span>}
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-title">Show, hide and reorder</div>
          {all.map((c, i) => {
            const meta = COLUMN_BY_KEY[c.id as ColumnKey]
            const on = c.getIsVisible()
            return (
              <div className="menu-row" key={c.id}>
                <button
                  className="menu-check"
                  role="menuitemcheckbox"
                  aria-checked={on}
                  disabled={on && visible <= 1}
                  onClick={() => c.toggleVisibility(!on)}
                >
                  <span className={`chk${on ? ' on' : ''}`} />
                  {meta.label}
                </button>
                <button className="icon-btn" aria-label={`Move ${meta.label} left`} disabled={i === 0} onClick={() => shift(c.id, -1)}>←</button>
                <button className="icon-btn" aria-label={`Move ${meta.label} right`} disabled={i === all.length - 1} onClick={() => shift(c.id, 1)}>→</button>
              </div>
            )
          })}
          <div className="menu-foot">
            <button className="linkbtn" onClick={() => table.resetColumnVisibility(true)}>Show all</button>
            <button
              className="linkbtn"
              onClick={() => {
                table.resetColumnVisibility(true)
                table.resetColumnOrder(true)
                table.resetColumnSizing(true)
              }}
            >
              Reset layout
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function Toolbar({ table, badRows, undoCount, redoCount, onUndo, onRedo, mode, onModeChange, viewsMenu }: ToolbarProps) {
  const committed = String(table.state.globalFilter ?? '')
  const [text, setText] = useDebouncedField(committed, (v) => table.setGlobalFilter(v.trim() ? v : undefined))
  const errorsOn = table.getColumn(ERRORS_COLUMN)?.getFilterValue() === true

  return (
    <div className="tools">
      <label className="search">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 3 3" />
        </svg>
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search customer, email, country…"
          aria-label="Search all text columns"
          autoComplete="off"
        />
      </label>
      <ColumnsMenu table={table} />
      {viewsMenu}
      <button
        className={`btn${errorsOn ? ' on' : ''}`}
        aria-pressed={errorsOn}
        onClick={() => table.getColumn(ERRORS_COLUMN)?.setFilterValue(errorsOn ? undefined : true)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6" />
          <path d="M8 5v3.5M8 11h.01" />
        </svg>
        Errors only <span className="count">{badRows.toLocaleString('en-US')}</span>
      </button>
      <div className="seg" role="group" aria-label="Row display">
        <button aria-pressed={mode === 'virtual'} onClick={() => onModeChange('virtual')} title="One continuous list, only visible rows are drawn">
          Virtual scroll
        </button>
        <button aria-pressed={mode === 'paged'} onClick={() => onModeChange('paged')} title="Split rows into pages">
          Paged
        </button>
      </div>
      <div className="spacer" />
      <button className="btn" onClick={onUndo} disabled={!undoCount} title="Undo (Ctrl+Z)">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M6 3.5 3 6.5l3 3M3.5 6.5H10a3.5 3.5 0 0 1 0 7H7" />
        </svg>
        Undo{undoCount > 0 && <span className="count neutral">{undoCount}</span>}
      </button>
      <button className="btn" onClick={onRedo} disabled={!redoCount} title="Redo (Ctrl+Shift+Z)">
        Redo
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="m10 3.5 3 3-3 3M12.5 6.5H6a3.5 3.5 0 0 0 0 7h3" />
        </svg>
      </button>
    </div>
  )
}

export function Chips({ table }: { table: OrderTable }) {
  const { columnFilters, globalFilter } = table.state
  const chips: { key: string; label: string; value: string; remove: () => void }[] = []

  if (globalFilter) chips.push({ key: 'search', label: 'Search', value: `"${globalFilter}"`, remove: () => table.setGlobalFilter(undefined) })
  for (const f of columnFilters) {
    if (f.id === ERRORS_COLUMN) {
      chips.push({ key: f.id, label: 'Rows', value: 'with errors', remove: () => table.getColumn(f.id)?.setFilterValue(undefined) })
    } else {
      const meta = COLUMN_BY_KEY[f.id as ColumnKey]
      const prefix = meta.kind === 'enum' ? '= ' : ''
      chips.push({ key: f.id, label: meta.label, value: prefix + String(f.value), remove: () => table.getColumn(f.id)?.setFilterValue(undefined) })
    }
  }
  if (!chips.length) return null

  return (
    <div className="chips" aria-label="Active filters">
      {chips.map((c) => (
        <span className="chip" key={c.key}>
          <span className="k">{c.label}</span>
          <span className="v">{c.value}</span>
          <button onClick={c.remove} aria-label={`Remove ${c.label} filter`}>×</button>
        </span>
      ))}
      <button
        className="linkbtn"
        onClick={() => {
          table.setGlobalFilter(undefined)
          table.resetColumnFilters(true)
        }}
      >
        Clear all
      </button>
    </div>
  )
}

export function Pager({ table }: { table: OrderTable }) {
  const { pageIndex, pageSize } = table.state.pagination
  const pages = Math.max(1, table.getPageCount())
  return (
    <div className="pager" role="navigation" aria-label="Pages">
      <select value={pageSize} aria-label="Rows per page" onChange={(e) => table.setPageSize(Number(e.target.value))}>
        {PAGE_SIZES.map((n) => (
          <option key={n} value={n}>
            {n} / page
          </option>
        ))}
      </select>
      <button aria-label="First page" disabled={pageIndex === 0} onClick={() => table.setPageIndex(0)}>«</button>
      <button aria-label="Previous page" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>‹</button>
      <span>
        Page <b>{(pageIndex + 1).toLocaleString('en-US')}</b> of {pages.toLocaleString('en-US')}
      </span>
      <button aria-label="Next page" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>›</button>
      <button aria-label="Last page" disabled={!table.getCanNextPage()} onClick={() => table.setPageIndex(pages - 1)}>»</button>
    </div>
  )
}
