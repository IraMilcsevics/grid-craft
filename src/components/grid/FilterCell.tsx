import { filterError } from '../../domain/filter'
import { COLUMN_BY_KEY, type ColumnKey } from '../../domain/schema'
import { useDebouncedField } from '../../hooks/useDebouncedField'
import type { OrderTable } from '../columns'

const PLACEHOLDER = { text: 'contains…', enum: '', number: '> 100', date: '> 2024-06' } as const

/** The filter box under one column header: a dropdown for fixed choices, a text box with operators otherwise. */
export function FilterCell({ table, id }: { table: OrderTable; id: ColumnKey }) {
  const column = table.getColumn(id)
  const meta = COLUMN_BY_KEY[id]
  const committed = String(column?.getFilterValue() ?? '')
  const [text, setText] = useDebouncedField(committed, (v) => column?.setFilterValue(v.trim() ? v : undefined))
  const error = filterError(meta.kind, committed)

  if (meta.kind === 'enum') {
    return (
      <div className="fcell">
        <select
          value={committed}
          className={committed ? 'active' : ''}
          aria-label={`Filter ${meta.label}`}
          onChange={(e) => column?.setFilterValue(e.target.value || undefined)}
        >
          <option value="">All</option>
          {meta.options?.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>
    )
  }
  return (
    <div className="fcell">
      <input
        value={text}
        className={error ? 'invalid' : committed ? 'active' : ''}
        placeholder={PLACEHOLDER[meta.kind]}
        title={error ?? undefined}
        aria-label={`Filter ${meta.label}`}
        aria-invalid={!!error}
        autoComplete="off"
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  )
}
