import { useCallback, useRef, useState } from 'react'
import { useDismiss } from './useDismiss'

export type SaveStatus = { kind: 'saved' } | { kind: 'saving' } | { kind: 'off'; reason: string } | { kind: 'error'; reason: string }

interface DataMenuProps {
  name: string
  rowCount: number
  kind: 'demo' | 'import'
  editedCells: number
  status: SaveStatus
  onDiscardEdits: () => void
  onLoadDemo: () => void
}

const fmt = (n: number) => n.toLocaleString('en-US')

const LABEL: Record<SaveStatus['kind'], string> = {
  saved: 'Saved in this browser',
  saving: 'Saving…',
  off: 'Not saved',
  error: 'Not saved',
}

/** Shows what is loaded and whether it survives a reload, and offers the two ways back to a clean state. */
export function DataMenu({ name, rowCount, kind, editedCells, status, onDiscardEdits, onLoadDemo }: DataMenuProps) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState<'edits' | 'demo' | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    setConfirm(null)
  }, [])
  useDismiss(open, close, root)

  const warn = status.kind === 'off' || status.kind === 'error'

  return (
    <div className="menu-root" ref={root}>
      <button className="dataset-btn" aria-expanded={open} aria-haspopup="true" onClick={() => (open ? close() : setOpen(true))}>
        <strong>{name}</strong>
        <span>· {fmt(rowCount)} rows</span>
        <i className={`dot ${status.kind}`} aria-hidden="true" />
        <span className="sr-only">{LABEL[status.kind]}</span>
      </button>

      {open && (
        <div className="menu data-menu" role="dialog" aria-label="Data">
          <div className={`save-line ${status.kind}`}>
            <i className={`dot ${status.kind}`} aria-hidden="true" />
            <div>
              <b>{LABEL[status.kind]}</b>
              {'reason' in status ? <small>{status.reason}</small> : <small>Edits and imported files stay on this device. Nothing is uploaded.</small>}
            </div>
          </div>

          <dl className="data-facts">
            <div>
              <dt>Source</dt>
              <dd>{kind === 'import' ? 'Imported file' : 'Generated demo data'}</dd>
            </div>
            <div>
              <dt>Edited cells</dt>
              <dd>{fmt(editedCells)}</dd>
            </div>
          </dl>

          {confirm === null && (
            <div className="data-actions">
              <button className="btn" disabled={editedCells === 0} onClick={() => setConfirm('edits')}>
                Discard all edits
              </button>
              <button className="btn" disabled={kind === 'demo'} onClick={() => setConfirm('demo')} title={kind === 'demo' ? 'Already showing the demo data' : undefined}>
                Load demo data
              </button>
            </div>
          )}

          {confirm && (
            <div className="data-confirm" role="alertdialog" aria-label="Confirm">
              <p>
                {confirm === 'edits'
                  ? `Discard ${fmt(editedCells)} edited ${editedCells === 1 ? 'cell' : 'cells'} and go back to the original values? This cannot be undone.`
                  : 'Replace the imported rows with the generated demo data? The imported file will be removed from this browser.'}
              </p>
              <div className="data-actions">
                <button
                  className="btn primary"
                  onClick={() => {
                    if (confirm === 'edits') onDiscardEdits()
                    else onLoadDemo()
                    close()
                  }}
                >
                  {confirm === 'edits' ? 'Discard edits' : 'Load demo data'}
                </button>
                <button className="btn" onClick={() => setConfirm(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {warn && confirm === null && <p className="menu-empty warn">Changes made now will be lost when the page is reloaded.</p>}
        </div>
      )}
    </div>
  )
}
