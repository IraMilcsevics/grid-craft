import { describe, expect, it } from 'vitest'
import { compileFilter, filterError } from './filter'

describe('compileFilter', () => {
  it('returns null for empty input', () => {
    expect(compileFilter('text', '   ')).toBeNull()
  })

  it('matches text case-insensitively and ignores non-strings', () => {
    const p = compileFilter('text', 'KOV')!
    expect(p('Anna Kovacs')).toBe(true)
    expect(p('Anna Nagy')).toBe(false)
    expect(p(undefined)).toBe(false)
  })

  it('matches enums exactly', () => {
    const p = compileFilter('enum', 'Paid')!
    expect(p('Paid')).toBe(true)
    expect(p('Pending')).toBe(false)
  })

  it('supports numeric operators and rejects non-numbers', () => {
    expect(compileFilter('number', '> 5')!(6)).toBe(true)
    expect(compileFilter('number', '> 5')!(5)).toBe(false)
    expect(compileFilter('number', '>=5')!(5)).toBe(true)
    expect(compileFilter('number', '<= 2')!(3)).toBe(false)
    expect(compileFilter('number', '4')!(4)).toBe(true)
    expect(compileFilter('number', '> 5')!(undefined)).toBe(false)
  })

  it('treats a malformed number as match-nothing and explains why', () => {
    expect(compileFilter('number', '> abc')!(10)).toBe(false)
    expect(filterError('number', '> abc')).toMatch(/Enter a number/)
    expect(filterError('number', '> 5')).toBeNull()
  })

  it('compares dates as ISO strings and treats a bare value as a prefix', () => {
    expect(compileFilter('date', '2024')!('2024-05-01')).toBe(true)
    expect(compileFilter('date', '2024')!('2023-05-01')).toBe(false)
    expect(compileFilter('date', '> 2024-06')!('2024-07-01')).toBe(true)
    expect(compileFilter('date', '< 2024-06')!('2024-07-01')).toBe(false)
  })
})
