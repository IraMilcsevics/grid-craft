import { importOrders, parseCsv, type ImportReport } from '../domain/csv'
import type { Order } from '../domain/schema'

export interface ImportRequest {
  text: string
}
export interface ImportResponse {
  rows: Order[]
  report: ImportReport
  /** Time spent parsing and validating inside the worker. */
  ms: number
}

// Parsing and validating a large file takes long enough to freeze the page, so it runs off the main thread.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<ImportRequest>) => void) | null
  postMessage: (message: ImportResponse) => void
}

ctx.onmessage = (e) => {
  const t0 = performance.now()
  const { rows, report } = importOrders(parseCsv(e.data.text))
  ctx.postMessage({ rows, report, ms: performance.now() - t0 })
}
