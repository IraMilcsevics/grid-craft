import { useEffect, useRef, useState } from 'react'
import type { EditKey } from '../domain/editing'
import type { Order } from '../domain/schema'
import type { ViewState } from '../domain/view'
import { runBenchmark, type BenchResult } from '../perf/runBenchmark'
import { Modal } from './Modal'
import type { OrderTable } from './columns'

interface Props {
  table: OrderTable
  rowCount: number
  firstRowId: string
  virtualized: boolean
  getRows: () => Order[]
  edit: (id: string, key: EditKey, value: Order[EditKey]) => void
  undo: () => void
  getView: () => ViewState
  setView: (view: ViewState) => void
  onClose: () => void
}

const fmt = (n: number) => n.toLocaleString('en-US')
const ms = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toString())

function environment() {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\/([\d.]+)/.test(ua) ? `Chrome ${/Chrome\/(\d+)/.exec(ua)?.[1]}` : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Unknown browser'
  return `${browser}, ${navigator.hardwareConcurrency ?? '?'} logical cores`
}

export function toMarkdown(results: BenchResult[], rowCount: number, virtualized: boolean, build: string) {
  const lines = [
    `Benchmark on ${fmt(rowCount)} rows, ${build} build, ${virtualized ? 'virtualized' : 'virtualization off'}, ${environment()}`,
    '',
    '| Operation | Result | Worst |',
    '| --- | ---: | ---: |',
  ]
  for (const r of results) {
    lines.push(r.unit === 'ms' ? `| ${r.label} | ${ms(r.value)} ms | ${ms(r.worst)} ms |` : `| ${r.label} | ${r.value.toFixed(0)} fps | ${ms(r.worst)} ms frame (p95) |`)
  }
  return lines.join('\n')
}

export function BenchmarkDialog({ table, rowCount, firstRowId, virtualized, getRows, edit, undo, getView, setView, onClose }: Props) {
  const [results, setResults] = useState<BenchResult[] | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const signal = useRef({ aborted: false })
  const ctx = useRef({ table, getRows, firstRowId, edit, undo, getView, setView, scroller: () => document.querySelector<HTMLElement>('.scroller') })
  ctx.current = { table, getRows, firstRowId, edit, undo, getView, setView, scroller: () => document.querySelector<HTMLElement>('.scroller') }

  // Closing the dialog stops a run; the runner puts the original view back.
  useEffect(() => {
    const s = signal.current
    return () => {
      s.aborted = true
    }
  }, [])

  const running = progress !== null && progress.done < progress.total
  const dev = import.meta.env.DEV
  const build = dev ? 'development' : 'production'

  const run = async () => {
    signal.current.aborted = false
    setResults(null)
    setCopied(false)
    const out = await runBenchmark(ctx.current, (done, total, label) => setProgress({ done, total, label }), signal.current)
    setResults(out)
  }

  const slowest = results ? Math.max(...results.filter((r) => r.unit === 'ms').map((r) => r.value), 1) : 1

  return (
    <Modal
      title={`Benchmark · ${fmt(rowCount)} rows`}
      onClose={onClose}
      footer={
        <>
          {results && (
            <button
              className="btn"
              onClick={() => {
                navigator.clipboard.writeText(toMarkdown(results, rowCount, virtualized, build)).then(
                  () => setCopied(true),
                  () => setCopied(false),
                )
              }}
            >
              {copied ? 'Copied' : 'Copy as Markdown'}
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" onClick={run} disabled={running}>
            {running ? 'Running…' : results ? 'Run again' : 'Run benchmark'}
          </button>
        </>
      }
    >
      <p className="note">
        Each operation is applied through the real table and timed until the browser has painted the result, so React rendering
        and layout are included. The first run of each is discarded; the rest give the median and the slowest run. Your current
        filters and columns are restored afterwards.
      </p>
      <p className="note">
        <b>{build}</b> build · {virtualized ? 'virtualized rows' : 'every row drawn (virtualization off)'} · {environment()}
      </p>
      {dev && <p className="callout">This is the development build, where React is slower. Use <code>npm run build</code> and <code>npm run preview</code> for numbers worth quoting.</p>}

      {running && progress && (
        <div role="status" aria-live="polite">
          <div className="progress"><span style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
          <p className="note">{progress.label}…</p>
        </div>
      )}

      {results && (
        <div className="table-wrap">
          <table className="report bench">
            <thead>
              <tr>
                <th>Operation</th>
                <th className="num">Result</th>
                <th className="num">Worst</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.label}
                    {r.note && <small>{r.note}</small>}
                  </td>
                  <td className="num">{r.unit === 'ms' ? `${ms(r.value)} ms` : `${r.value.toFixed(0)} fps`}</td>
                  <td className="num">{r.unit === 'ms' ? `${ms(r.worst)} ms` : `${ms(r.worst)} ms`}</td>
                  <td className="bar-cell">
                    {r.unit === 'ms' && <span className="bar-track"><span className="bar-fill accent" style={{ width: `${Math.max(2, (r.value / slowest) * 100)}%` }} /></span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
