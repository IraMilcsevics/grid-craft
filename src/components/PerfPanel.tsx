import { usePerf } from '../perf/perfStore'

const fmt = (n: number) => n.toLocaleString('en-US')
const ms = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toString())

interface PerfPanelProps {
  totalRows: number
  filteredRows: number
  domRows: number
  virtualized: boolean
  onClose: () => void
  onBenchmark: () => void
}

export function PerfPanel({ totalRows, filteredRows, domRows, virtualized, onClose, onBenchmark }: PerfPanelProps) {
  const { events } = usePerf()
  const latest = events[0]
  // Chrome only. Shown when available, otherwise left out rather than faked.
  const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize
  const domNodes = document.getElementsByTagName('*').length

  return (
    <section className="perf-panel" aria-label="Performance">
      <header>
        <h2>Performance</h2>
        <button className="btn ghost" onClick={onClose} aria-label="Close performance panel">
          ✕
        </button>
      </header>

      <dl>
        <div>
          <dt>Rows</dt>
          <dd>
            {fmt(filteredRows)} <small>of {fmt(totalRows)}</small>
          </dd>
        </div>
        <div>
          <dt>Rows in the DOM</dt>
          <dd>
            {fmt(domRows)} <small>{virtualized ? 'virtualized' : 'virtualization off'}</small>
          </dd>
        </div>
        <div>
          <dt>DOM nodes</dt>
          <dd>{fmt(domNodes)}</dd>
        </div>
        {heap !== undefined && (
          <div>
            <dt>JS heap</dt>
            <dd>{(heap / 1024 / 1024).toFixed(0)} <small>MB</small></dd>
          </div>
        )}
        <div>
          <dt>Last update to paint</dt>
          <dd>{latest ? <>{ms(latest.paintMs)} <small>ms · {latest.cause}</small></> : <small>make a change</small>}</dd>
        </div>
      </dl>

      <h3>Recent updates</h3>
      {events.length === 0 ? (
        <p className="empty-note">Search, sort, filter or edit a cell to see timings.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Change</th>
              <th>Row model</th>
              <th>To paint</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>{e.cause}</td>
                <td>{ms(e.modelMs)} ms</td>
                <td>{ms(e.paintMs)} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button className="btn primary" onClick={onBenchmark}>
        Run benchmark…
      </button>
    </section>
  )
}
