import { COLUMNS, COLUMN_BY_KEY, type ColumnKey } from './schema'

/** Id of the hidden column that carries the "errors only" filter in the table. */
export const ERRORS_FILTER_ID = '__errors'

export const MIN_WIDTH = 60
export const MAX_WIDTH = 640

export type RowMode = 'virtual' | 'paged'
export const PAGE_SIZES = [25, 50, 100, 500] as const
export const DEFAULT_PAGE_SIZE = 50

export interface SortSpec {
  id: ColumnKey
  desc: boolean
}

/**
 * Everything a saved view or a shared link restores: how the data is looked at, never the data itself.
 * Cell edits are deliberately not part of it.
 */
export interface ViewState {
  search: string
  errorsOnly: boolean
  filters: Partial<Record<ColumnKey, string>>
  sorting: SortSpec[]
  hidden: ColumnKey[]
  /** Full left-to-right order of every column. */
  order: ColumnKey[]
  widths: Partial<Record<ColumnKey, number>>
  /** How rows are shown: one long virtual scroll, or pages. */
  mode: RowMode
  pageSize: number
}

export const DEFAULT_ORDER: ColumnKey[] = COLUMNS.map((c) => c.key)

export const emptyView = (): ViewState => ({
  search: '',
  errorsOnly: false,
  filters: {},
  sorting: [],
  hidden: [],
  order: [...DEFAULT_ORDER],
  widths: {},
  mode: 'virtual',
  pageSize: DEFAULT_PAGE_SIZE,
})

const isKey = (k: unknown): k is ColumnKey => typeof k === 'string' && k in COLUMN_BY_KEY
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Order from untrusted input: known columns only, no duplicates, anything missing appended in default order. */
function cleanOrder(raw: unknown): ColumnKey[] {
  const seen = new Set<ColumnKey>()
  if (Array.isArray(raw)) for (const k of raw) if (isKey(k)) seen.add(k)
  for (const k of DEFAULT_ORDER) seen.add(k)
  return [...seen]
}

/** Turns anything (parsed JSON, URL data) into a valid view. Unknown or malformed parts fall back to defaults. */
export function sanitizeView(raw: unknown): ViewState {
  const view = emptyView()
  if (!isRecord(raw)) return view

  if (typeof raw.search === 'string') view.search = raw.search.trim().slice(0, 200)
  view.errorsOnly = raw.errorsOnly === true

  if (isRecord(raw.filters)) {
    for (const [k, v] of Object.entries(raw.filters)) {
      if (isKey(k) && typeof v === 'string' && v.trim()) view.filters[k] = v.trim().slice(0, 100)
    }
  }

  if (Array.isArray(raw.sorting)) {
    const seen = new Set<ColumnKey>()
    for (const s of raw.sorting) {
      if (isRecord(s) && isKey(s.id) && !seen.has(s.id)) {
        seen.add(s.id)
        view.sorting.push({ id: s.id, desc: s.desc === true })
      }
    }
  }

  if (Array.isArray(raw.hidden)) view.hidden = [...new Set(raw.hidden.filter(isKey))]
  // At least one column has to stay visible.
  if (view.hidden.length >= COLUMNS.length) view.hidden = []

  view.order = cleanOrder(raw.order)

  if (isRecord(raw.widths)) {
    for (const [k, v] of Object.entries(raw.widths)) {
      if (isKey(k) && typeof v === 'number' && Number.isFinite(v)) {
        view.widths[k] = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(v)))
      }
    }
  }

  if (raw.mode === 'paged') view.mode = 'paged'
  if (typeof raw.pageSize === 'number' && (PAGE_SIZES as readonly number[]).includes(raw.pageSize)) view.pageSize = raw.pageSize
  return view
}

/** Stable text form with sorted keys, so two views that look the same compare equal. */
export function canonicalView(view: ViewState): string {
  const sortedEntries = <T,>(o: Partial<Record<string, T>>) => Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1))
  return JSON.stringify([
    view.search,
    view.errorsOnly,
    sortedEntries(view.filters),
    view.sorting.map((s) => [s.id, s.desc]),
    [...view.hidden].sort(),
    view.order,
    sortedEntries(view.widths),
    view.mode,
    view.pageSize,
  ])
}

export const viewsEqual = (a: ViewState, b: ViewState) => canonicalView(a) === canonicalView(b)

/** Fields that differ from the defaults are the only ones written, which keeps shared links short. */
export function toSearchParams(view: ViewState): URLSearchParams {
  const p = new URLSearchParams()
  if (view.search) p.set('q', view.search)
  if (view.errorsOnly) p.set('err', '1')
  if (view.sorting.length) p.set('sort', view.sorting.map((s) => (s.desc ? '-' : '') + s.id).join(','))
  if (view.hidden.length) p.set('hide', view.hidden.join(','))
  if (view.order.join() !== DEFAULT_ORDER.join()) p.set('order', view.order.join(','))
  if (view.mode === 'paged') p.set('mode', 'paged')
  if (view.pageSize !== DEFAULT_PAGE_SIZE) p.set('size', String(view.pageSize))
  for (const [k, v] of Object.entries(view.filters)) p.set(`f.${k}`, v)
  for (const [k, v] of Object.entries(view.widths)) p.set(`w.${k}`, String(v))
  return p
}

export function fromSearchParams(p: URLSearchParams): ViewState {
  const raw: Record<string, unknown> = {
    search: p.get('q') ?? '',
    errorsOnly: p.get('err') === '1',
    sorting: (p.get('sort') ?? '')
      .split(',')
      .filter(Boolean)
      .map((s) => (s.startsWith('-') ? { id: s.slice(1), desc: true } : { id: s, desc: false })),
    hidden: (p.get('hide') ?? '').split(',').filter(Boolean),
    order: (p.get('order') ?? '').split(',').filter(Boolean),
    filters: {} as Record<string, string>,
    widths: {} as Record<string, number>,
    mode: p.get('mode'),
    pageSize: Number(p.get('size')),
  }
  for (const [name, value] of p.entries()) {
    if (name.startsWith('f.')) (raw.filters as Record<string, string>)[name.slice(2)] = value
    else if (name.startsWith('w.')) (raw.widths as Record<string, number>)[name.slice(2)] = Number(value)
  }
  return sanitizeView(raw)
}

const MANAGED = /^(q|err|sort|hide|order|mode|size|f\..+|w\..+)$/

/** Writes a view into an existing query string and leaves parameters that are not view state (such as dev flags) alone. */
export function mergeSearchParams(current: URLSearchParams, view: ViewState): URLSearchParams {
  const out = new URLSearchParams()
  for (const [k, v] of current.entries()) if (!MANAGED.test(k)) out.append(k, v)
  for (const [k, v] of toSearchParams(view).entries()) out.append(k, v)
  return out
}
