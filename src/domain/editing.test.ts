import { describe, expect, it } from 'vitest'
import { dirtyKey, initOrders, ordersReducer } from './editing'
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
