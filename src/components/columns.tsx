import {
  columnFilteringFeature,
  columnOrderingFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  constructFilterFn,
  createPaginatedRowModel,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { compileFilter } from '../domain/filter'
import { COLUMN_BY_KEY, type ColumnKey, type ColumnKind, type Order } from '../domain/schema'
import { ERRORS_FILTER_ID, type ViewState } from '../domain/view'
import { countErrors, orderTotal, validateCell } from '../domain/validate'

/** Stable registry: only the features the grid uses, so nothing else is bundled. */
export const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { basic: sortFn_basic, text: sortFn_text },
  columnSizingFeature,
  columnResizingFeature,
  columnVisibilityFeature,
  columnOrderingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
})

const helper = createColumnHelper<typeof features, Order>()

/** Id of the hidden column that powers the "errors only" filter. It is never rendered. */
export const ERRORS_COLUMN = ERRORS_FILTER_ID

/**
 * One filter function per column kind. The filter text is compiled to a
 * predicate once per filter change (resolveFilterValue), not once per row.
 */
const filterFor = (kind: ColumnKind) =>
  constructFilterFn({
    resolveFilterValue: (text: unknown) => compileFilter(kind, String(text ?? '')),
    filter: (value, predicate: ((v: unknown) => boolean) | null) => (predicate ? predicate(value) : true),
    autoRemove: (text: unknown) => !String(text ?? '').trim(),
  })
const FILTERS = { text: filterFor('text'), enum: filterFor('enum'), number: filterFor('number'), date: filterFor('date') }

const errorsOnly = constructFilterFn({
  filter: (errorCount: number, on: boolean) => !on || errorCount > 0,
  autoRemove: (on: unknown) => !on,
})

/** Empty text and unparseable numbers become undefined so those rows sort last instead of first. */
const str = (v: string) => (v === '' ? undefined : v)
const num = (v: unknown) => (typeof v === 'number' ? v : undefined)
const w = (k: ColumnKey) => COLUMN_BY_KEY[k].width

export const columns = helper.columns([
  helper.accessor((r) => str(r.id), { id: 'id', header: 'Order', size: w('id'), sortFn: 'text', filterFn: FILTERS.text }),
  helper.accessor((r) => str(r.customer), { id: 'customer', header: 'Customer', size: w('customer'), sortFn: 'text', sortUndefined: 'last', filterFn: FILTERS.text }),
  helper.accessor((r) => str(r.email), { id: 'email', header: 'Email', size: w('email'), sortFn: 'text', sortUndefined: 'last', filterFn: FILTERS.text }),
  helper.accessor((r) => str(r.country), { id: 'country', header: 'Country', size: w('country'), sortFn: 'text', sortUndefined: 'last', filterFn: FILTERS.enum }),
  helper.accessor((r) => str(r.status), { id: 'status', header: 'Status', size: w('status'), sortFn: 'text', sortUndefined: 'last', filterFn: FILTERS.enum }),
  helper.accessor((r) => str(r.category), { id: 'category', header: 'Category', size: w('category'), sortFn: 'text', sortUndefined: 'last', filterFn: FILTERS.enum }),
  helper.accessor((r) => num(r.qty), { id: 'qty', header: 'Qty', size: w('qty'), sortFn: 'basic', sortUndefined: 'last', filterFn: FILTERS.number }),
  helper.accessor((r) => num(r.price), { id: 'price', header: 'Unit price', size: w('price'), sortFn: 'basic', sortUndefined: 'last', filterFn: FILTERS.number }),
  helper.accessor((r) => orderTotal(r) ?? undefined, { id: 'total', header: 'Total', size: w('total'), sortFn: 'basic', sortUndefined: 'last', filterFn: FILTERS.number }),
  helper.accessor((r) => str(r.created), { id: 'created', header: 'Created', size: w('created'), sortFn: 'text', sortUndefined: 'last', filterFn: FILTERS.date }),
  helper.accessor((r) => num(r.rating), { id: 'rating', header: 'Rating', size: w('rating'), sortFn: 'basic', sortUndefined: 'last', filterFn: FILTERS.number }),
  helper.accessor((r) => countErrors(r), { id: ERRORS_COLUMN, header: 'Errors', size: 0, enableSorting: false, enableHiding: false, enableResizing: false, filterFn: errorsOnly }),
])

/** Table state that matches a view. Used for the first render and when a view is applied. */
export function initialTableState(view: ViewState) {
  return {
    globalFilter: view.search || undefined,
    columnFilters: [
      ...Object.entries(view.filters).map(([id, value]) => ({ id, value })),
      ...(view.errorsOnly ? [{ id: ERRORS_COLUMN, value: true }] : []),
    ],
    sorting: view.sorting,
    columnVisibility: Object.fromEntries(view.hidden.map((id) => [id, false])),
    columnOrder: [...view.order, ERRORS_COLUMN] as string[],
    columnSizing: { ...view.widths } as Record<string, number>,
    pagination: { pageIndex: 0, pageSize: view.pageSize },
  }
}

export function useOrderTable(data: Order[], initialView: ViewState) {
  return useTable({
    initialState: initialTableState(initialView),
    features,
    columns,
    data,
    getRowId: (r) => r.id,
    columnResizeMode: 'onChange',
    // The grid decides when to return to page one (on filter, sort or view changes), so a cell edit keeps the page.
    autoResetPageIndex: false,
    defaultColumn: { minSize: 60, maxSize: 640 },
    globalFilterFn: 'includesString',
    // Search the text-like columns only; numbers and dates have their own column filters.
    getColumnCanGlobalFilter: (column) => {
      const meta = COLUMN_BY_KEY[column.id as ColumnKey]
      return !!meta && (meta.kind === 'text' || meta.kind === 'enum')
    },
  })
}
export type OrderTable = ReturnType<typeof useOrderTable>

const STATUS_COLOR: Record<string, string> = {
  Paid: '--s-paid',
  Pending: '--s-pending',
  Shipped: '--s-shipped',
  Refunded: '--s-refunded',
  Cancelled: '--s-cancelled',
}
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const int = new Intl.NumberFormat('en-US')

/** What a cell shows. Invalid raw values are shown as typed, never hidden. */
export function renderValue(key: ColumnKey, o: Order, invalid: boolean) {
  if (key === 'total') {
    const t = orderTotal(o)
    return t == null ? '—' : money.format(t)
  }
  const v = o[key]
  if (invalid) return v === '' ? <span className="muted-empty">empty</span> : String(v)
  switch (key) {
    case 'price':
      return money.format(v as number)
    case 'qty':
      return int.format(v as number)
    case 'status':
      return (
        <span className="pill" style={{ ['--c' as string]: `var(${STATUS_COLOR[v as string]})` }}>
          {v}
        </span>
      )
    case 'rating': {
      const n = v as number
      return (
        <span className="dots">
          {'●'.repeat(n)}
          <s>{'●'.repeat(5 - n)}</s>
        </span>
      )
    }
    default:
      return String(v)
  }
}

/** The validation message for a cell, or null when it is valid or not validated (computed columns). */
export const cellProblem = (key: ColumnKey, o: Order) => (COLUMN_BY_KEY[key].editable ? validateCell(key, o[key as keyof Order]) : null)
