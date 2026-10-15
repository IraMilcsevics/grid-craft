import type { OrderTable } from '../components/columns'
import { ERRORS_COLUMN } from '../components/columns'
import { toCsv } from '../domain/csv'
import type { EditKey } from '../domain/editing'
import { COLUMNS, type Order } from '../domain/schema'
import { emptyView, type ViewState } from '../domain/view'
import { parseCsvInWorker } from '../lib/parseCsvInWorker'
import { afterPaint, perf } from './perfStore'

export interface BenchContext {
  table: OrderTable
  getRows: () => Order[]
  firstRowId: string
  edit: (id: string, key: EditKey, value: Order[EditKey]) => void
  undo: () => void
  getView: () => ViewState
  setView: (view: ViewState) => void
  scroller: () => HTMLElement | null
}

export interface BenchResult {
  id: string
  label: string
  unit: 'ms' | 'fps'
  /** For ms: the median run. For fps: the average over the whole scroll. */
  value: number
  /** For ms: the slowest run. For fps: the 95th percentile frame time in ms. */
  worst: number
  runs: number
  note?: string
}

interface Scenario {
  id: string
  label: string
  note?: string
  setup?: (ctx: BenchContext, run: number) => void
  act: (ctx: BenchContext, run: number) => void | Promise<void>
  cleanup?: (ctx: BenchContext) => void
}

const SORT_TOTAL = [{ id: 'total', desc: true }]

/**
 * Each scenario applies a change through the real table API and waits for the browser to paint
 * the result, so the time includes the row model, React rendering and layout, not just the data work.
 */
const SCENARIOS: Scenario[] = [
  {
    id: 'baseline',
    label: 'Baseline: no change, wait for paint',
    note: 'The cost of the measurement itself (about two frames). Subtract it from the rows below.',
    act: () => undefined,
  },
  {
    id: 'search',
    label: 'Global search "an"',
    act: ({ table }) => table.setGlobalFilter('an'),
    cleanup: ({ table }) => table.setGlobalFilter(undefined),
  },
  {
    id: 'column-filter',
    label: 'Column filter: Qty > 5',
    act: ({ table }) => table.getColumn('qty')?.setFilterValue('> 5'),
    cleanup: ({ table }) => table.getColumn('qty')?.setFilterValue(undefined),
  },
  {
    id: 'combined-filter',
    label: 'Search + Status + Total filters',
    act: ({ table }) => {
      table.setGlobalFilter('ko')
      table.getColumn('status')?.setFilterValue('Paid')
      table.getColumn('total')?.setFilterValue('>= 500')
    },
    cleanup: ({ table }) => {
      table.setGlobalFilter(undefined)
      table.resetColumnFilters(true)
    },
  },
  {
    id: 'errors-only',
    label: 'Errors only',
    act: ({ table }) => table.getColumn(ERRORS_COLUMN)?.setFilterValue(true),
    cleanup: ({ table }) => table.resetColumnFilters(true),
  },
  {
    id: 'sort-text',
    label: 'Sort by Customer (text)',
    act: ({ table }) => table.setSorting([{ id: 'customer', desc: false }]),
    cleanup: ({ table }) => table.setSorting([]),
  },
  {
    id: 'sort-total',
    label: 'Sort by Total (computed)',
    act: ({ table }) => table.setSorting(SORT_TOTAL),
    cleanup: ({ table }) => table.setSorting([]),
  },
  {
    id: 'sort-multi',
    label: 'Sort by Country, then Created',
    act: ({ table }) =>
      table.setSorting([
        { id: 'country', desc: false },
        { id: 'created', desc: true },
      ]),
    cleanup: ({ table }) => table.setSorting([]),
  },
  {
    id: 'edit',
    label: 'Edit one cell (data sorted by Total)',
    note: 'Rebuilds the whole row model',
    setup: ({ table }) => table.setSorting(SORT_TOTAL),
    act: (ctx, run) => ctx.edit(ctx.firstRowId, 'qty', 7 + (run % 2)),
    cleanup: (ctx) => {
      ctx.undo()
      ctx.table.setSorting([])
    },
  },
]

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const settle = async () => {
  await afterPaint()
  await wait(30)
}
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0
const percentile = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.ceil(a.length * p) - 1)] ?? 0

async function measure(ctx: BenchContext, scenario: Scenario, runs: number): Promise<number[]> {
  const times: number[] = []
  // Run 0 warms up code paths and memoization and is not counted.
  for (let run = 0; run <= runs; run++) {
    scenario.setup?.(ctx, run)
    await settle()
    const start = performance.now()
    await scenario.act(ctx, run)
    await afterPaint()
    const elapsed = performance.now() - start
    scenario.cleanup?.(ctx)
    await settle()
    if (run > 0) times.push(elapsed)
  }
  return times
}

/** Scrolls the grid from top to bottom in 2 seconds and records how smoothly frames were produced. */
async function scrollTest(ctx: BenchContext): Promise<BenchResult | null> {
  const el = ctx.scroller()
  if (!el) return null
  const distance = el.scrollHeight - el.clientHeight
  if (distance <= 0) return null
  const duration = 2000
  el.scrollTop = 0
  await settle()
  const frames: number[] = []
  await new Promise<void>((resolve) => {
    let last = performance.now()
    const start = last
    const step = (now: number) => {
      frames.push(now - last)
      last = now
      const t = Math.min(1, (now - start) / duration)
      el.scrollTop = distance * t
      if (t < 1) requestAnimationFrame(step)
      else resolve()
    }
    requestAnimationFrame(step)
  })
  el.scrollTop = 0
  const body = frames.slice(1)
  const total = body.reduce((a, b) => a + b, 0)
  return {
    id: 'scroll',
    label: 'Scroll top to bottom in 2 s',
    unit: 'fps',
    value: total ? (body.length / total) * 1000 : 0,
    worst: percentile(body, 0.95),
    runs: 1,
    note: `${Math.round(distance / 34).toLocaleString('en-US')} rows scrolled, 95th percentile frame time`,
  }
}

async function csvScenarios(ctx: BenchContext): Promise<BenchResult[]> {
  const rows = ctx.getRows()
  const keys = COLUMNS.map((c) => c.key)
  const results: BenchResult[] = []

  const exportTimes: number[] = []
  let csv = ''
  for (let i = 0; i < 4; i++) {
    const t = performance.now()
    csv = toCsv(rows, keys)
    if (i > 0) exportTimes.push(performance.now() - t)
  }
  results.push({ id: 'export', label: 'Build CSV for every row', unit: 'ms', value: median(exportTimes), worst: Math.max(...exportTimes), runs: exportTimes.length })

  const importTimes: number[] = []
  const inWorker: number[] = []
  for (let i = 0; i < 4; i++) {
    const t = performance.now()
    const res = await parseCsvInWorker(csv)
    if (i > 0) {
      importTimes.push(performance.now() - t)
      inWorker.push(res.ms)
    }
  }
  results.push({
    id: 'import',
    label: 'Import CSV (worker, parse + validate)',
    unit: 'ms',
    value: median(importTimes),
    worst: Math.max(...importTimes),
    runs: importTimes.length,
    note: `${Math.round(median(inWorker))} ms of that inside the worker; the page stays responsive`,
  })
  return results
}

export async function runBenchmark(
  ctx: BenchContext,
  onProgress: (done: number, total: number, label: string) => void,
  signal: { aborted: boolean },
  runs = 6,
): Promise<BenchResult[]> {
  const saved = ctx.getView()
  const results: BenchResult[] = []
  const total = SCENARIOS.length + 3
  perf.setPaused(true)
  try {
    ctx.setView(emptyView())
    await settle()

    for (const [i, scenario] of SCENARIOS.entries()) {
      if (signal.aborted) break
      onProgress(i, total, scenario.label)
      const times = await measure(ctx, scenario, runs)
      results.push({ id: scenario.id, label: scenario.label, unit: 'ms', value: median(times), worst: Math.max(...times), runs: times.length, note: scenario.note })
    }

    if (!signal.aborted) {
      onProgress(SCENARIOS.length, total, 'Scroll test')
      const scroll = await scrollTest(ctx)
      if (scroll) results.push(scroll)
    }
    if (!signal.aborted) {
      onProgress(SCENARIOS.length + 1, total, 'CSV export and import')
      results.push(...(await csvScenarios(ctx)))
    }
    onProgress(total, total, 'Done')
  } finally {
    ctx.setView(saved)
    perf.setPaused(false)
  }
  return results
}
