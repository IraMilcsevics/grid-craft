import { describe, expect, it } from 'vitest'
import { generateOrders } from './generate'
import type { Order } from './schema'
import { computeTotals } from './totals'
import { orderTotal, validateCell } from './validate'

/** The slow, obvious version: one validateCell call per cell. */
function reference(rows: Order[]) {
  const out = { qty: [0, 0], price: [0, 0], rating: [0, 0], total: [0, 0], customer: [0, 0] }
  for (const r of rows) {
    if (!validateCell('customer', r.customer)) out.customer[0]!++
    if (!validateCell('qty', r.qty)) {
      out.qty[0]!++
      out.qty[1]! += r.qty as number
    }
    if (!validateCell('price', r.price)) {
      out.price[0]!++
      out.price[1]! += r.price as number
    }
    if (!validateCell('rating', r.rating)) {
      out.rating[0]!++
      out.rating[1]! += r.rating as number
    }
    if (!validateCell('qty', r.qty) && !validateCell('price', r.price)) {
      out.total[0]!++
      out.total[1]! += orderTotal(r)!
    }
  }
  return out
}

describe('computeTotals', () => {
  it('matches a cell-by-cell calculation on generated data with bad rows', () => {
    const rows = generateOrders(5000, 11)
    const t = computeTotals(rows)
    const ref = reference(rows)
    for (const k of ['qty', 'price', 'rating', 'total', 'customer'] as const) {
      expect(t[k].valid).toBe(ref[k][0])
      expect(t[k].sum).toBeCloseTo(ref[k][1]!, 6)
      expect(t[k].skipped).toBe(5000 - ref[k][0]!)
      expect(t[k].rows).toBe(5000)
    }
  })

  it('leaves invalid values out of sums and counts them as skipped', () => {
    const base = generateOrders(3, 1)
    const rows = [
      { ...base[0]!, qty: 2, price: 10, rating: 4 },
      { ...base[1]!, qty: -3, price: 10, rating: 9 },
      { ...base[2]!, qty: 'n/a', price: 'abc', rating: 3 },
    ]
    const t = computeTotals(rows)
    expect(t.qty).toMatchObject({ valid: 1, sum: 2, skipped: 2 })
    expect(t.price).toMatchObject({ valid: 2, sum: 20, skipped: 1 })
    expect(t.total).toMatchObject({ valid: 1, sum: 20, skipped: 2 })
    expect(t.rating).toMatchObject({ valid: 2, sum: 7, skipped: 1 })
  })

  it('handles an empty list', () => {
    expect(computeTotals([]).qty).toEqual({ rows: 0, valid: 0, sum: 0, skipped: 0 })
  })
})
