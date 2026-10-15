import { useEffect, useMemo } from 'react'
import { computeTotals } from '../domain/totals'
import type { RowMode } from '../domain/view'
import { fmt } from '../lib/format'
import type { OrderTable } from '../components/columns'

type FilteredRows = ReturnType<OrderTable['getPrePaginatedRowModel']>['rows']

/**
 * What the grid actually shows: every filtered row in virtual mode, one page in paged mode. Also owns the
 * page rules (filters and sorting go back to page one, edits stay on the page) and the totals row.
 */
export function useRowList(table: OrderTable, mode: RowMode, allRows: FilteredRows) {
  const { columnFilters, globalFilter, sorting, pagination } = table.state
  const rows = mode === 'paged' ? table.getRowModel().rows : allRows
  const viewRows = useMemo(() => allRows.map((r) => r.original), [allRows])

  // Filters and sorting send paged mode back to page one. Cell edits do not, so they keep the page.
  const listSig = JSON.stringify([columnFilters, globalFilter, sorting])
  useEffect(() => {
    table.setPageIndex(0)
    // `table` is a stable instance; this must run only when the list changes (filters, search, sorting).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listSig])

  const lastPage = Math.max(0, table.getPageCount() - 1)
  useEffect(() => {
    // Functional form, so it composes with the reset above instead of overwriting it with a stale index.
    if (pagination.pageIndex > lastPage) table.setPageIndex((i) => Math.min(i, lastPage))
    // `table` is a stable instance; only the page index and the number of pages matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.pageIndex, lastPage])

  const totals = useMemo(() => computeTotals(viewRows), [viewRows])
  const totalsHint = `Totals cover all ${fmt(allRows.length)} filtered rows${mode === 'paged' ? ', not just this page' : ''}`
  const indexOffset = mode === 'paged' ? pagination.pageIndex * pagination.pageSize : 0
  // Changes whenever the list is replaced (filter, sort, page, mode): the grid scrolls to the top and drops its selection.
  const scrollKey = JSON.stringify([listSig, mode, pagination.pageIndex, pagination.pageSize])

  return { rows, viewRows, totals, totalsHint, indexOffset, scrollKey }
}
