import type { RowMode } from '../domain/view'
import { fmt, ms } from '../lib/format'
import type { OrderTable } from './columns'
import { Pager } from './Toolbar'

interface StatusBarProps {
  table: OrderTable
  mode: RowMode
  /** Rows left after filtering. */
  filteredRows: number
  totalRows: number
  errorRows: number
  editedCells: number
  /** Rows the grid is showing (a page, or every filtered row). */
  shownRows: number
  /** Rows actually in the DOM, which virtualization keeps small. */
  domRows: number
  modelMs: number
  perfOpen: boolean
  onTogglePerf: () => void
}

/** The bar at the bottom: counts, a few live timings, and the pager or keyboard hints. */
export function StatusBar({ table, mode, filteredRows, totalRows, errorRows, editedCells, shownRows, domRows, modelMs, perfOpen, onTogglePerf }: StatusBarProps) {
  return (
    <footer className="status">
      <div>
        <b>{fmt(filteredRows)}</b> of <b>{fmt(totalRows)}</b> rows ·{' '}
        <span className="errn">
          <b>{fmt(errorRows)}</b> with errors
        </span>
        {editedCells > 0 && (
          <>
            {' '}
            ·{' '}
            <span className="edited">
              <b>{fmt(editedCells)}</b> edited
            </span>
          </>
        )}
      </div>
      <div className="perf">
        <span>
          row model <b>{ms(modelMs)} ms</b>
        </span>
        <span>
          DOM rows <b>{domRows}</b> / {fmt(shownRows)}
        </span>
      </div>
      <button className={`linkbtn${perfOpen ? ' on' : ''}`} aria-expanded={perfOpen} onClick={onTogglePerf}>
        Performance
      </button>
      <div className="spacer" />
      {mode === 'paged' ? (
        <Pager table={table} />
      ) : (
        <div className="hint">
          <kbd>↑↓←→</kbd> move <kbd>Enter</kbd> edit <kbd>Tab</kbd> next <kbd>Esc</kbd> cancel <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo
        </div>
      )}
    </footer>
  )
}
