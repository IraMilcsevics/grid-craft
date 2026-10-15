import { describe, expect, it } from 'vitest'
import { generateOrders } from './generate'
import { importOrders, parseCsv, toCsv } from './csv'
import { countErrors, orderTotal, parseInput, validateCell } from './validate'

describe('validateCell', () => {
  it('accepts good values and rejects bad ones with a message', () => {
    expect(validateCell('email', 'a@b.io')).toBeNull()
    expect(validateCell('email', 'a at b.io')).toMatch(/valid email/)
    expect(validateCell('qty', 3)).toBeNull()
    expect(validateCell('qty', -1)).toMatch(/whole number/)
    expect(validateCell('qty', 'n/a')).not.toBeNull()
    expect(validateCell('price', 0)).not.toBeNull()
    expect(validateCell('rating', 6)).not.toBeNull()
    expect(validateCell('status', 'Unknown')).toMatch(/Pick one of/)
  })

  it('rejects dates that match the pattern but do not exist', () => {
    expect(validateCell('created', '2024-02-29')).toBeNull()
    expect(validateCell('created', '2023-02-29')).toMatch(/does not exist/)
    expect(validateCell('created', '2024-13-45')).not.toBeNull()
    expect(validateCell('created', '31/12/2024')).toMatch(/YYYY-MM-DD/)
  })
})

describe('parseInput / orderTotal', () => {
  it('keeps unparseable numbers as text so validation can reject them', () => {
    expect(parseInput('qty', ' 12 ')).toBe(12)
    expect(parseInput('qty', 'abc')).toBe('abc')
    expect(parseInput('qty', '')).toBe('')
    expect(parseInput('customer', '  Ada ')).toBe('Ada')
  })
  it('computes the total only from valid numbers', () => {
    expect(orderTotal({ qty: 3, price: 19.99 })).toBe(59.97)
    expect(orderTotal({ qty: 'n/a', price: 5 })).toBeNull()
  })
})

describe('generateOrders', () => {
  it('is deterministic for a seed', () => {
    expect(generateOrders(50, 1)).toEqual(generateOrders(50, 1))
    expect(generateOrders(50, 1)).not.toEqual(generateOrders(50, 2))
  })
  it('has unique ids and a realistic share of bad rows', () => {
    const rows = generateOrders(10_000)
    expect(new Set(rows.map((r) => r.id)).size).toBe(10_000)
    const bad = rows.filter((r) => countErrors(r) > 0).length
    expect(bad).toBeGreaterThan(300)
    expect(bad).toBeLessThan(900)
  })
})

describe('csv', () => {
  it('parses quotes, escaped quotes, embedded newlines and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n"l1\nl2",z')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['l1\nl2', 'z'],
    ])
  })

  it('round-trips generated data and flags the same bad rows', () => {
    const rows = generateOrders(500, 7)
    const keys = ['id', 'customer', 'email', 'country', 'status', 'category', 'qty', 'price', 'created', 'rating'] as const
    const { rows: back, report } = importOrders(parseCsv(toCsv(rows, keys)))
    expect(back).toHaveLength(500)
    expect(report.rowsRead).toBe(500)
    expect(report.rowsWithIssues).toBe(rows.filter((r) => countErrors(r) > 0).length)
    expect(report.missingColumns).toEqual([])
    expect(back[0]?.id).toBe(rows[0]?.id)
  })

  it('imports files with missing columns and reports them', () => {
    const { rows, report } = importOrders(parseCsv('Order,Customer\nA-1,Ada\nA-2,'))
    expect(rows).toHaveLength(2)
    expect(report.missingColumns).toContain('Email')
    expect(report.rowsWithIssues).toBe(2)
    expect(report.issuesByColumn.customer).toBe(1)
  })
})

describe('csv edge cases', () => {
  it('imports a file with a BOM and CRLF line endings', () => {
    const { rows, report } = importOrders(parseCsv('﻿Order,Customer,Email\r\nA-1,Ada,ada@x.io\r\n'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.customer).toBe('Ada')
    expect(report.missingColumns).not.toContain('Customer')
    expect(report.missingColumns).not.toContain('Order')
  })

  it('keeps invalid values as typed so they survive an export and re-import', () => {
    const bad = { ...generateOrders(1)[0]!, qty: 'n/a', email: 'a at b' }
    const keys = ['id', 'customer', 'email', 'country', 'status', 'category', 'qty', 'price', 'created', 'rating'] as const
    const { rows } = importOrders(parseCsv(toCsv([bad], keys)))
    expect(rows[0]?.qty).toBe('n/a')
    expect(rows[0]?.email).toBe('a at b')
  })

  it('quotes fields that contain commas, quotes or newlines', () => {
    const o = { ...generateOrders(1)[0]!, customer: 'Doe, "Jane"\nSr.' }
    const { rows } = importOrders(parseCsv(toCsv([o], ['id', 'customer'])))
    expect(rows[0]?.customer).toBe('Doe, "Jane"\nSr.')
  })
})
