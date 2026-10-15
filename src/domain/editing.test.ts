import { describe, expect, it } from 'vitest'
import { dirtyKey, initOrders, ordersReducer } from './editing'
import { countErrors } from './validate'
import { generateOrders } from './generate'

const fresh = () => initOrders(generateOrders(20, 3))

describe('ordersReducer', () => {
  it('edits one cell immutably and marks it dirty', () => {
    const s0 = fresh()
    const id = s0.rows[4]!.id
    const s1 = ordersReducer(s0, { type: 'edit', id, key: 'qty', value: 99 })
    expect(s1.rows[4]!.qty).toBe(99)
    expect(s0.rows[4]!.qty).not.toBe(99)
    expect(s1.rows).not.toBe(s0.rows)
    expect(s1.rows[5]).toBe(s0.rows[5])
    expect(s1.dirty[dirtyKey(id, 'qty')]).toBe(true)
    expect(s1.past).toHaveLength(1)
  })

  it('ignores an edit that changes nothing', () => {
    const s0 = fresh()
    const r = s0.rows[0]!
    expect(ordersReducer(s0, { type: 'edit', id: r.id, key: 'customer', value: r.customer })).toBe(s0)
  })

  it('undoes and redoes, restoring the dirty marker', () => {
    let s = fresh()
    const id = s.rows[2]!.id
    const original = s.rows[2]!.status
    s = ordersReducer(s, { type: 'edit', id, key: 'status', value: 'Paid' })
    s = ordersReducer(s, { type: 'edit', id, key: 'status', value: 'Shipped' })
    s = ordersReducer(s, { type: 'undo' })
    expect(s.rows[2]!.status).toBe('Paid')
    expect(s.dirty[dirtyKey(id, 'status')]).toBe(true)
    s = ordersReducer(s, { type: 'undo' })
    expect(s.rows[2]!.status).toBe(original)
    expect(s.dirty[dirtyKey(id, 'status')]).toBeUndefined()
    s = ordersReducer(s, { type: 'redo' })
    expect(s.rows[2]!.status).toBe('Paid')
    expect(s.dirty[dirtyKey(id, 'status')]).toBe(true)
  })

  it('drops the redo stack after a new edit and no-ops on empty history', () => {
    let s = fresh()
    const id = s.rows[1]!.id
    expect(ordersReducer(s, { type: 'undo' })).toBe(s)
    expect(ordersReducer(s, { type: 'redo' })).toBe(s)
    s = ordersReducer(s, { type: 'edit', id, key: 'qty', value: 1 })
    s = ordersReducer(s, { type: 'undo' })
    expect(s.future).toHaveLength(1)
    s = ordersReducer(s, { type: 'edit', id, key: 'qty', value: 2 })
    expect(s.future).toHaveLength(0)
  })

  it('can restore an invalid original value', () => {
    let s = initOrders([{ ...generateOrders(1)[0]!, qty: 'n/a' }])
    const id = s.rows[0]!.id
    s = ordersReducer(s, { type: 'edit', id, key: 'qty', value: 4 })
    s = ordersReducer(s, { type: 'undo' })
    expect(s.rows[0]!.qty).toBe('n/a')
  })
})

describe('errorRows', () => {
  const recount = (rows: ReturnType<typeof generateOrders>) => rows.filter((r) => countErrors(r) > 0).length

  it('starts at the number of rows with errors', () => {
    const rows = generateOrders(500, 4)
    expect(initOrders(rows).errorRows).toBe(recount(rows))
  })

  it('follows edits, undo and redo without recounting every row', () => {
    const rows = generateOrders(500, 4)
    let s = initOrders(rows)
    const bad = rows.find((r) => countErrors(r) > 0)!
    const good = rows.find((r) => countErrors(r) === 0)!
    const start = s.errorRows

    s = ordersReducer(s, { type: 'edit', id: good.id, key: 'qty', value: -5 })
    expect(s.errorRows).toBe(start + 1)
    s = ordersReducer(s, { type: 'edit', id: good.id, key: 'qty', value: 'n/a' })
    expect(s.errorRows).toBe(start + 1)
    s = ordersReducer(s, { type: 'edit', id: bad.id, key: 'email', value: 'fixed@example.com' })
    const fixedOne = countErrors(s.rows[s.index.get(bad.id)!]!) === 0
    expect(s.errorRows).toBe(start + 1 - (fixedOne ? 1 : 0))
    expect(s.errorRows).toBe(recount(s.rows))

    s = ordersReducer(s, { type: 'undo' })
    expect(s.errorRows).toBe(recount(s.rows))
    s = ordersReducer(s, { type: 'undo' })
    s = ordersReducer(s, { type: 'undo' })
    expect(s.errorRows).toBe(start)
    s = ordersReducer(s, { type: 'redo' })
    expect(s.errorRows).toBe(recount(s.rows))
  })
})
