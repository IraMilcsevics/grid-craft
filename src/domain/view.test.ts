import { describe, expect, it } from 'vitest'
import { PRESETS } from './presets'
import { DEFAULT_ORDER, canonicalView, emptyView, fromSearchParams, mergeSearchParams, sanitizeView, toSearchParams, viewsEqual } from './view'
import { STORAGE_KEY, loadSavedViews, persistSavedViews, removeView, upsertView } from './viewStore'

describe('sanitizeView', () => {
  it('falls back to defaults for junk input', () => {
    expect(sanitizeView(null)).toEqual(emptyView())
    expect(sanitizeView('x')).toEqual(emptyView())
    expect(sanitizeView({ sorting: 5, filters: [], hidden: 'email' })).toEqual(emptyView())
  })

  it('drops unknown columns and clamps widths', () => {
    const v = sanitizeView({
      filters: { status: ' Paid ', nope: 'x', qty: '' },
      sorting: [{ id: 'total', desc: true }, { id: 'total', desc: false }, { id: 'bogus' }],
      hidden: ['email', 'ghost'],
      widths: { customer: 5000, email: 10, qty: 'wide' },
    })
    expect(v.filters).toEqual({ status: 'Paid' })
    expect(v.sorting).toEqual([{ id: 'total', desc: true }])
    expect(v.hidden).toEqual(['email'])
    expect(v.widths).toEqual({ customer: 640, email: 60 })
  })

  it('never hides every column and always returns a complete column order', () => {
    expect(sanitizeView({ hidden: DEFAULT_ORDER }).hidden).toEqual([])
    const v = sanitizeView({ order: ['rating', 'id', 'rating', 'unknown'] })
    expect(v.order.slice(0, 2)).toEqual(['rating', 'id'])
    expect([...v.order].sort()).toEqual([...DEFAULT_ORDER].sort())
  })
})

describe('URL codec', () => {
  it('writes nothing for the default view', () => {
    expect(toSearchParams(emptyView()).toString()).toBe('')
  })

  it('round-trips every preset', () => {
    for (const p of PRESETS) {
      const back = fromSearchParams(new URLSearchParams(toSearchParams(p.view).toString()))
      expect(viewsEqual(back, p.view)).toBe(true)
    }
  })

  it('round-trips characters that need escaping', () => {
    const v = sanitizeView({ search: 'o\'brien & sons, 100%', filters: { qty: '>= 5', customer: 'a=b&c' }, widths: { email: 300 } })
    const back = fromSearchParams(new URLSearchParams(toSearchParams(v).toString()))
    expect(back).toEqual(v)
  })

  it('ignores a hostile or mangled query string', () => {
    const v = fromSearchParams(new URLSearchParams('sort=-nope,total&hide=,,&f.zzz=1&w.qty=abc&order=x,y&err=yes'))
    expect(v.sorting).toEqual([{ id: 'total', desc: false }])
    expect(v.hidden).toEqual([])
    expect(v.errorsOnly).toBe(false)
    expect(v.widths).toEqual({})
  })
})

describe('row mode', () => {
  it('defaults to virtual scrolling and accepts only known page sizes', () => {
    expect(emptyView().mode).toBe('virtual')
    expect(sanitizeView({ mode: 'weird', pageSize: 77 })).toMatchObject({ mode: 'virtual', pageSize: 50 })
    expect(sanitizeView({ mode: 'paged', pageSize: 100 })).toMatchObject({ mode: 'paged', pageSize: 100 })
  })

  it('round-trips through the URL and writes defaults as nothing', () => {
    const v = sanitizeView({ mode: 'paged', pageSize: 500 })
    expect(toSearchParams(v).toString()).toBe('mode=paged&size=500')
    expect(fromSearchParams(new URLSearchParams('mode=paged&size=500'))).toEqual(v)
    expect(toSearchParams(sanitizeView({ mode: 'paged' })).toString()).toBe('mode=paged')
    expect(fromSearchParams(new URLSearchParams('size=abc')).pageSize).toBe(50)
  })

  it('treats a different mode as a different view', () => {
    expect(viewsEqual(emptyView(), sanitizeView({ mode: 'paged' }))).toBe(false)
  })
})

describe('mergeSearchParams', () => {
  it('keeps unrelated parameters and replaces every view parameter', () => {
    const current = new URLSearchParams('rows=100000&virtual=off&q=old&f.status=Paid&sort=-total&w.qty=90')
    const next = mergeSearchParams(current, sanitizeView({ search: 'new', filters: { country: 'Japan' } }))
    expect(next.get('rows')).toBe('100000')
    expect(next.get('virtual')).toBe('off')
    expect(next.get('q')).toBe('new')
    expect(next.get('f.country')).toBe('Japan')
    expect(next.has('f.status')).toBe(false)
    expect(next.has('sort')).toBe(false)
    expect(next.has('w.qty')).toBe(false)
  })
})

describe('viewsEqual', () => {
  it('ignores key and hidden-list ordering', () => {
    const a = sanitizeView({ filters: { status: 'Paid', qty: '> 1' }, hidden: ['email', 'country'] })
    const b = sanitizeView({ filters: { qty: '> 1', status: 'Paid' }, hidden: ['country', 'email'] })
    expect(canonicalView(a)).toBe(canonicalView(b))
    expect(viewsEqual(a, sanitizeView({ ...b, search: 'x' }))).toBe(false)
  })
})

function fakeStorage(initial?: string) {
  const data = new Map<string, string>(initial === undefined ? [] : [[STORAGE_KEY, initial]])
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}

describe('saved views storage', () => {
  const now = new Date('2025-01-02T03:04:05Z')
  const ids = () => {
    let n = 0
    return () => `id${++n}`
  }

  it('saves, reloads, replaces by name and deletes', () => {
    const makeId = ids()
    let { views } = upsertView([], 'My view', sanitizeView({ search: 'a' }), now, makeId)
    ;({ views } = upsertView(views, 'Other', emptyView(), now, makeId))
    const replaced = upsertView(views, 'my VIEW', sanitizeView({ search: 'b' }), now, makeId)
    expect(replaced.views).toHaveLength(2)
    expect(replaced.saved.id).toBe('id1')
    expect(replaced.views[0]?.view.search).toBe('b')

    const store = fakeStorage()
    expect(persistSavedViews(replaced.views, store)).toBe(true)
    expect(loadSavedViews(store).map((v) => v.name)).toEqual(['My view', 'Other'])
    expect(removeView(replaced.views, 'id1').map((v) => v.name)).toEqual(['Other'])
  })

  it('survives corrupt, wrong-version and missing data', () => {
    expect(loadSavedViews(fakeStorage('{not json'))).toEqual([])
    expect(loadSavedViews(fakeStorage(JSON.stringify({ version: 99, views: [] })))).toEqual([])
    expect(loadSavedViews(fakeStorage())).toEqual([])
    expect(loadSavedViews(undefined)).toEqual([])
  })

  it('cleans individual bad entries and reports a refused write', () => {
    const raw = JSON.stringify({ version: 1, views: [{ id: 'a', name: 'Ok', view: { hidden: ['ghost'] } }, { id: 5 }, null] })
    const views = loadSavedViews(fakeStorage(raw))
    expect(views).toHaveLength(1)
    expect(views[0]?.view.hidden).toEqual([])
    const refusing = { setItem: () => { throw new Error('quota') } }
    expect(persistSavedViews(views, refusing)).toBe(false)
  })
})
