import { COLUMN_BY_KEY, type ColumnKey } from '../../domain/schema'
import type { ColumnTotals } from '../../domain/totals'

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const int = new Intl.NumberFormat('en-US')

interface TotalsRowProps {
  columns: ColumnKey[]
  totals: Partial<Record<ColumnKey, ColumnTotals>>
  /** Explains what the row covers, shown on the Σ cell. */
  hint: string
}

/** The row pinned to the bottom of the grid: counts, sums and averages over every filtered row. */
export function TotalsRow({ columns, totals, hint }: TotalsRowProps) {
  return (
    <div className="sticky-foot" role="row">
      <div className="arow">
        <div className="acell idx" title={hint}>
          Σ
        </div>
        {columns.map((id) => (
          <TotalCell key={id} id={id} totals={totals[id]} />
        ))}
      </div>
    </div>
  )
}

function TotalCell({ id, totals }: { id: ColumnKey; totals: ColumnTotals | undefined }) {
  const meta = COLUMN_BY_KEY[id]
  let label = ''
  let value = ''
  if (totals) {
    if (id === 'customer') [label, value] = ['count', int.format(totals.rows)]
    else if (id === 'qty') [label, value] = ['sum', int.format(totals.sum)]
    else if (id === 'total') [label, value] = ['sum', money.format(totals.sum)]
    else if (id === 'price') [label, value] = ['avg', totals.valid ? money.format(totals.sum / totals.valid) : '—']
    else if (id === 'rating') [label, value] = ['avg', totals.valid ? (totals.sum / totals.valid).toFixed(2) : '—']
  }
  const skipped = totals && id !== 'customer' ? totals.skipped : 0
  return (
    <div
      className={`acell${meta.kind === 'number' ? ' right' : ''}${skipped ? ' skipped' : ''}`}
      title={skipped ? `${int.format(skipped)} invalid or missing values are not counted` : undefined}
    >
      {value && (
        <>
          <em>{label}</em> {value}
        </>
      )}
    </div>
  )
}
