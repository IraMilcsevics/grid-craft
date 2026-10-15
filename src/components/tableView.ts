import { DEFAULT_ORDER, sanitizeView, type RowMode, type ViewState } from '../domain/view'
import { ERRORS_COLUMN, initialTableState, type OrderTable } from './columns'

/** Reads the current look of the table as a view (filters, sorting, columns). */
export function viewFromTable(table: OrderTable, mode: RowMode): ViewState {
  const s = table.state
  const filters: Record<string, string> = {}
  let errorsOnly = false
  for (const f of s.columnFilters) {
    if (f.id === ERRORS_COLUMN) errorsOnly = f.value === true
    else if (typeof f.value === 'string') filters[f.id] = f.value
  }
  return sanitizeView({
    search: typeof s.globalFilter === 'string' ? s.globalFilter : '',
    errorsOnly,
    filters,
    sorting: s.sorting.map((x) => ({ id: x.id, desc: x.desc })),
    hidden: Object.entries(s.columnVisibility)
      .filter(([, visible]) => visible === false)
      .map(([id]) => id),
    order: s.columnOrder.length ? s.columnOrder : DEFAULT_ORDER,
    widths: s.columnSizing,
    mode,
    pageSize: s.pagination.pageSize,
  })
}

/** Replaces the table's filters, sorting and column layout with those of a view. */
export function applyView(table: OrderTable, view: ViewState) {
  const next = initialTableState(view)
  table.setGlobalFilter(next.globalFilter)
  table.setColumnFilters(next.columnFilters)
  table.setSorting(next.sorting)
  table.setColumnVisibility(next.columnVisibility)
  table.setColumnOrder(next.columnOrder)
  table.setColumnSizing(next.columnSizing)
  table.setPagination(next.pagination)
}
