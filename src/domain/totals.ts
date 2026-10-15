import type { Order } from './schema'
import { isPrice, isQty, isRating, orderTotal } from './validate'

/** What the totals row needs from one column. Invalid cells are left out of sums and averages and counted separately. */
export interface ColumnTotals {
  rows: number
  valid: number
  sum: number
  skipped: number
}

export type TotalKey = 'customer' | 'qty' | 'price' | 'total' | 'rating'
export type TotalsByColumn = Record<TotalKey, ColumnTotals>

/**
 * Totals for every filtered row in one pass. This replaced TanStack's aggregation for the totals row:
 * it has to run after every edit, and at 100,000 rows the generic version spent most of the time
 * normalizing rows and building messages, not adding numbers.
 */
export function computeTotals(rows: readonly Order[]): TotalsByColumn {
  let customers = 0
  let qtyValid = 0
  let qtySum = 0
  let priceValid = 0
  let priceSum = 0
  let ratingValid = 0
  let ratingSum = 0
  let totalValid = 0
  let totalSum = 0

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] as Order
    if (typeof r.customer === 'string' && r.customer.trim()) customers++
    const qtyOk = isQty(r.qty)
    const priceOk = isPrice(r.price)
    if (qtyOk) {
      qtyValid++
      qtySum += r.qty as number
    }
    if (priceOk) {
      priceValid++
      priceSum += r.price as number
    }
    if (isRating(r.rating)) {
      ratingValid++
      ratingSum += r.rating
    }
    // A total only counts when both of its inputs are valid, so a negative quantity never leaks into the sum.
    if (qtyOk && priceOk) {
      const t = orderTotal(r)
      if (t !== null) {
        totalValid++
        totalSum += t
      }
    }
  }

  const n = rows.length
  const col = (valid: number, sum: number): ColumnTotals => ({ rows: n, valid, sum, skipped: n - valid })
  return {
    customer: col(customers, 0),
    qty: col(qtyValid, qtySum),
    price: col(priceValid, priceSum),
    total: col(totalValid, totalSum),
    rating: col(ratingValid, ratingSum),
  }
}
