/* eslint-disable react/refs, react/purity -- Timing instrumentation. It has to read the clock and keep a few values across renders
   while rendering, because the render itself is what is being measured. It never changes what is drawn. */
import { useEffect, useRef } from 'react'
import type { Order } from '../domain/schema'
import type { RowMode } from '../domain/view'
import { afterPaint, perf } from '../perf/perfStore'
import type { OrderTable } from '../components/columns'

interface Options {
  table: OrderTable
  data: Order[]
  /** Changes when the dataset is replaced. */
  datasetId: number
  mode: RowMode
  /** `performance.now()` at the start of the screen's render, so the paint time covers all of it. */
  renderStart: number
}

/**
 * Builds the filtered and sorted row list and times it. Every change that rebuilds what is on screen
 * (search, filter, sort, edit, import, column layout, mode, page) is timed from the start of the render to the first
 * painted frame afterwards, and recorded for the performance panel. TanStack memoizes the row model, so the
 * timed call only does real work on the first render after a change.
 */
export function useUpdateTiming({ table, data, datasetId, mode, renderStart }: Options) {
  // Marks for startup timing: first commit and first painted frame, measured from navigation start.
  useEffect(() => {
    performance.mark('gridcraft:committed')
    void afterPaint().then(() => performance.mark('gridcraft:painted'))
  }, [])

  const { columnFilters, globalFilter, sorting, columnVisibility, columnOrder, pagination } = table.state
  const stateKey = JSON.stringify([columnFilters, globalFilter, sorting])
  const last = useRef<{ key: string; data: Order[]; modelMs: number }>({ key: '', data, modelMs: 0 })
  const modelStart = performance.now()
  const allRows = table.getPrePaginatedRowModel().rows
  if (last.current.key !== stateKey || last.current.data !== data) {
    last.current = { key: stateKey, data, modelMs: performance.now() - modelStart }
  }

  const seen = useRef<{ filters: string; search: unknown; sorting: string; data: Order[]; dataset: number; layout: string; mode: RowMode; page: string } | null>(null)
  const pending = useRef<{ cause: string; start: number; modelMs: number } | null>(null)
  const now = {
    filters: JSON.stringify(columnFilters),
    search: globalFilter,
    sorting: JSON.stringify(sorting),
    data,
    dataset: datasetId,
    layout: JSON.stringify([columnVisibility, columnOrder]),
    mode,
    page: JSON.stringify(pagination),
  }
  const before = seen.current
  if (before) {
    const cause =
      before.dataset !== now.dataset ? 'import'
      : before.data !== now.data ? 'edit'
      : before.search !== now.search ? 'search'
      : before.filters !== now.filters ? 'filter'
      : before.sorting !== now.sorting ? 'sort'
      : before.layout !== now.layout ? 'columns'
      : before.mode !== now.mode ? 'mode'
      : before.page !== now.page ? 'page'
      : null
    if (cause) pending.current = { cause, start: renderStart, modelMs: last.current.modelMs }
  }
  seen.current = now

  useEffect(() => {
    const p = pending.current
    if (!p) return
    pending.current = null
    void afterPaint().then(() => perf.record({ cause: p.cause, modelMs: p.modelMs, paintMs: performance.now() - p.start }))
  })

  return { allRows, modelMs: last.current.modelMs }
}
