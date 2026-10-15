import { useRef, useState } from 'react'
import type { EditKey } from '../domain/editing'
import { COLUMN_BY_KEY, type Order } from '../domain/schema'
import { parseInput, validateCell } from '../domain/validate'

export type Move = 'up' | 'down' | 'left' | 'right' | null

interface Props {
  field: EditKey
  row: Order
  /** Set when editing started by typing a character: it replaces the cell content. */
  initial?: string
  onCommit: (value: Order[EditKey], move: Move) => void
  onCancel: () => void
}

/** Inline editor. Validates as you type and refuses to commit an invalid value. */
export function CellEditor({ field, row, initial, onCommit, onCancel }: Props) {
  const meta = COLUMN_BY_KEY[field]
  const current = row[field]
  const [text, setText] = useState(initial ?? (current == null ? '' : String(current)))
  const [shaking, setShaking] = useState(false)
  const finished = useRef(false)

  const value = parseInput(field, text)
  const error = validateCell(field, value)

  const commit = (move: Move) => {
    if (finished.current) return
    if (error) {
      setShaking(true)
      return
    }
    finished.current = true
    onCommit(value as Order[EditKey], move)
  }
  const cancel = () => {
    if (finished.current) return
    finished.current = true
    onCancel()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      commit(e.shiftKey ? 'up' : 'down')
    } else if (e.key === 'Tab') {
      e.preventDefault()
      commit(e.shiftKey ? 'left' : 'right')
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }
  // Leaving the cell keeps a valid value and discards an invalid one.
  const onBlur = () => (error ? cancel() : commit(null))

  return (
    <div className={`editor${shaking ? ' shake' : ''}`} onAnimationEnd={() => setShaking(false)}>
      {meta.kind === 'enum' ? (
        <select
          autoFocus
          value={meta.options?.includes(text) ? text : ''}
          aria-label={meta.label}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          onChange={(e) => {
            finished.current = true
            onCommit(e.target.value as Order[EditKey], null)
          }}
        >
          {!meta.options?.includes(text) && <option value="">Choose…</option>}
          {meta.options?.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          autoFocus
          value={text}
          className={error ? 'bad' : ''}
          aria-label={meta.label}
          aria-invalid={!!error}
          spellCheck={false}
          autoComplete="off"
          onFocus={(e) => (initial === undefined ? e.target.select() : e.target.setSelectionRange(text.length, text.length))}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        />
      )}
      {error && meta.kind !== 'enum' && <div className="edit-tip" role="alert">{error}</div>}
    </div>
  )
}
