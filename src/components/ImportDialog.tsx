import { useRef, useState } from 'react'
import { toCsv } from '../domain/csv'
import { generateOrders } from '../domain/generate'
import { COLUMNS, COLUMN_BY_KEY, type ColumnKey, type Order } from '../domain/schema'
import { parseCsvInWorker } from '../lib/parseCsvInWorker'
import type { ImportResponse } from '../workers/importCsv.worker'
import { Modal } from './Modal'

const MAX_BYTES = 100 * 1024 * 1024
const fmt = (n: number) => n.toLocaleString('en-US')
const size = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)
const SOURCE_KEYS = COLUMNS.filter((c) => !c.computed).map((c) => c.key)

type Phase =
  | { kind: 'idle' }
  | { kind: 'parsing'; name: string }
  | { kind: 'ready'; name: string; bytes: number; result: ImportResponse }
  | { kind: 'error'; message: string }

interface ImportDialogProps {
  existingRows: number
  unsavedEdits: number
  onClose: () => void
  onImport: (rows: Order[], name: string, reviewErrors: boolean) => void
}

export function ImportDialog({ existingRows, unsavedEdits, onClose, onImport }: ImportDialogProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const run = async (text: string, name: string, bytes: number) => {
    setPhase({ kind: 'parsing', name })
    try {
      const result = await parseCsvInWorker(text)
      if (result.report.rowsRead === 0) setPhase({ kind: 'error', message: 'That file has a header but no data rows.' })
      else setPhase({ kind: 'ready', name, bytes, result })
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'The file could not be processed.' })
    }
  }

  const readFile = async (file: File) => {
    if (file.size > MAX_BYTES) {
      setPhase({ kind: 'error', message: `That file is ${size(file.size)}. The limit is ${size(MAX_BYTES)}.` })
      return
    }
    setPhase({ kind: 'parsing', name: file.name })
    await run(await file.text(), file.name, file.size)
  }

  const sample = (rows: number, name: string) => {
    const text = toCsv(generateOrders(rows, 7), SOURCE_KEYS)
    void run(text, name, new Blob([text]).size)
  }

  const ready = phase.kind === 'ready' ? phase : null
  const report = ready?.result.report

  return (
    <Modal
      title="Import CSV"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          {ready && report && report.rowsWithIssues > 0 && (
            <button className="btn" onClick={() => onImport(ready.result.rows, ready.name, true)}>
              Import and review errors
            </button>
          )}
          <button className="btn primary" disabled={!ready} onClick={() => ready && onImport(ready.result.rows, ready.name, false)}>
            Import {ready ? fmt(ready.result.rows.length) : ''} rows
          </button>
        </>
      }
    >
      {(phase.kind === 'idle' || phase.kind === 'error') && (
        <div
          className={`dropzone${over ? ' over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            const file = e.dataTransfer.files[0]
            if (file) void readFile(file)
          }}
        >
          <p>Drop a .csv file here</p>
          <button className="btn" onClick={() => input.current?.click()}>
            Choose file…
          </button>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv,text/plain"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void readFile(file)
              e.target.value = ''
            }}
          />
          <p className="dz-sub">
            Or try a sample: <button className="linkbtn" onClick={() => sample(400, 'sample-orders.csv')}>400 rows with errors</button>
            {' · '}
            <button className="linkbtn" onClick={() => sample(100_000, 'sample-orders-100k.csv')}>100,000 rows</button>
          </p>
        </div>
      )}

      {phase.kind === 'error' && <p className="callout bad" role="alert">{phase.message}</p>}

      {phase.kind === 'parsing' && (
        <p className="parsing" role="status">
          Reading <b>{phase.name}</b>… parsing and validating in a background thread.
        </p>
      )}

      {ready && report && (
        <>
          <p className="file-line">
            <b>{ready.name}</b> · {size(ready.bytes)} · parsed and validated in <b>{Math.round(ready.result.ms)} ms</b>
          </p>
          <div className="kpis">
            <div className="kpi"><b>{fmt(report.rowsRead)}</b><span>rows read</span></div>
            <div className="kpi"><b>{fmt(report.rowsRead - report.rowsWithIssues)}</b><span>clean rows</span></div>
            <div className={`kpi${report.rowsWithIssues ? ' bad' : ''}`}><b>{fmt(report.rowsWithIssues)}</b><span>rows with problems</span></div>
          </div>

          {report.missingColumns.length > 0 && (
            <p className="callout">
              Columns not found in the file: <b>{report.missingColumns.join(', ')}</b>. They will be empty and flagged.
            </p>
          )}

          {report.rowsWithIssues > 0 ? (
            <>
              <IssueBars counts={report.issuesByColumn} />
              <div className="table-wrap">
                <table className="report">
                  <thead>
                    <tr><th>Line</th><th>Column</th><th>Value</th><th>Problem</th></tr>
                  </thead>
                  <tbody>
                    {report.samples.map((s, i) => (
                      <tr key={i}>
                        <td>{s.line}</td>
                        <td>{s.column}</td>
                        <td className="mono">{s.value === '' ? '(empty)' : s.value}</td>
                        <td>{s.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="note">
                Showing the first {report.samples.length} problems. Rows with problems are still imported and highlighted, so you
                can fix them in the grid.
              </p>
            </>
          ) : (
            <p className="callout ok">No problems found.</p>
          )}

          {existingRows > 0 && (
            <p className="note">
              Importing replaces the current {fmt(existingRows)} rows
              {unsavedEdits > 0 && <> and discards <b>{fmt(unsavedEdits)}</b> unsaved edits</>}.
            </p>
          )}
        </>
      )}
    </Modal>
  )
}

function IssueBars({ counts }: { counts: Partial<Record<ColumnKey, number>> }) {
  const entries = (Object.entries(counts) as [ColumnKey, number][]).sort((a, b) => b[1] - a[1])
  const max = entries[0]?.[1] ?? 1
  return (
    <div className="bars" aria-label="Problems by column">
      {entries.map(([key, n]) => (
        <div className="bar-row" key={key}>
          <span>{COLUMN_BY_KEY[key].label}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${(n / max) * 100}%` }} /></span>
          <b>{fmt(n)}</b>
        </div>
      ))}
    </div>
  )
}
