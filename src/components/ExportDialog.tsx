import { useMemo, useState } from 'react'
import { toCsv } from '../domain/csv'
import { COLUMNS, type ColumnKey, type Order } from '../domain/schema'
import { downloadCsv, exportFilename } from '../lib/download'
import { Modal } from './Modal'

const fmt = (n: number) => n.toLocaleString('en-US')
const size = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

interface ExportDialogProps {
  /** Rows after filters and sorting, in grid order. */
  viewRows: Order[]
  allRows: Order[]
  /** Visible columns, in grid order. */
  visibleKeys: ColumnKey[]
  onClose: () => void
  onDone: (message: string) => void
}

export function ExportDialog({ viewRows, allRows, visibleKeys, onClose, onDone }: ExportDialogProps) {
  const filtered = viewRows.length !== allRows.length
  const [scope, setScope] = useState<'view' | 'all'>('view')
  const [columns, setColumns] = useState<'visible' | 'all'>('visible')

  const rows = scope === 'view' ? viewRows : allRows
  const visibleSig = visibleKeys.join()
  const keys = useMemo(
    () => (columns === 'visible' ? visibleSig.split(',') : COLUMNS.map((c) => c.key)) as ColumnKey[],
    [columns, visibleSig],
  )
  const csv = useMemo(() => toCsv(rows, keys), [rows, keys])
  const preview = useMemo(() => csv.split('\n', 7).join('\n'), [csv])
  const bytes = useMemo(() => new Blob([csv]).size, [csv])

  const save = () => {
    downloadCsv(exportFilename(), csv)
    onDone(`Exported ${fmt(rows.length)} rows and ${keys.length} columns`)
    onClose()
  }

  return (
    <Modal
      title="Export CSV"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!rows.length}>
            Download {size(bytes)}
          </button>
        </>
      }
    >
      <fieldset className="choice">
        <legend>Rows</legend>
        <label>
          <input type="radio" name="scope" checked={scope === 'view'} onChange={() => setScope('view')} />
          <span>
            Current view <em>{fmt(viewRows.length)} rows{filtered ? ', filters and sorting applied' : ''}</em>
          </span>
        </label>
        <label>
          <input type="radio" name="scope" checked={scope === 'all'} onChange={() => setScope('all')} disabled={!filtered} />
          <span>
            All rows <em>{fmt(allRows.length)} rows</em>
          </span>
        </label>
      </fieldset>

      <fieldset className="choice">
        <legend>Columns</legend>
        <label>
          <input type="radio" name="cols" checked={columns === 'visible'} onChange={() => setColumns('visible')} />
          <span>
            Visible columns <em>{visibleKeys.length}, in grid order</em>
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="cols"
            checked={columns === 'all'}
            onChange={() => setColumns('all')}
            disabled={visibleKeys.length === COLUMNS.length}
          />
          <span>
            All columns <em>{COLUMNS.length}</em>
          </span>
        </label>
      </fieldset>

      <div>
        <div className="preview-title">Preview</div>
        <pre className="csv-preview" tabIndex={0}>{preview}{rows.length > 6 ? '\n…' : ''}</pre>
      </div>
      <p className="note">
        Cells with invalid values are exported exactly as they appear. The file is UTF-8 with a byte-order mark so Excel
        shows accents correctly.
      </p>
    </Modal>
  )
}
