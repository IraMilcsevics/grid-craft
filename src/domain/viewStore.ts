import { sanitizeView, type ViewState } from './view'

export interface SavedView {
  id: string
  name: string
  savedAt: string
  view: ViewState
}

export const STORAGE_KEY = 'gridcraft.views'
const VERSION = 1

type ReadableStorage = Pick<Storage, 'getItem'>
type WritableStorage = Pick<Storage, 'setItem'>

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Reads saved views. Missing, corrupt or future-version data yields an empty list instead of an error. */
export function loadSavedViews(storage: ReadableStorage | undefined = safeStorage()): SavedView[] {
  try {
    const text = storage?.getItem(STORAGE_KEY)
    if (!text) return []
    const data: unknown = JSON.parse(text)
    if (!isRecord(data) || data.version !== VERSION || !Array.isArray(data.views)) return []
    const out: SavedView[] = []
    for (const v of data.views) {
      if (isRecord(v) && typeof v.id === 'string' && typeof v.name === 'string' && v.name.trim()) {
        out.push({
          id: v.id,
          name: v.name.trim().slice(0, 60),
          savedAt: typeof v.savedAt === 'string' ? v.savedAt : '',
          view: sanitizeView(v.view),
        })
      }
    }
    return out
  } catch {
    return []
  }
}

/** Returns false when the browser refuses (private mode, quota, blocked storage). */
export function persistSavedViews(views: SavedView[], storage: WritableStorage | undefined = safeStorage()): boolean {
  try {
    if (!storage) return false
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, views }))
    return true
  } catch {
    return false
  }
}

/** Saves under a name. An existing view with the same name (ignoring case) is replaced in place. */
export function upsertView(views: SavedView[], name: string, view: ViewState, now: Date, makeId: () => string): { views: SavedView[]; saved: SavedView } {
  const clean = name.trim().slice(0, 60)
  const existing = views.find((v) => v.name.toLowerCase() === clean.toLowerCase())
  const saved: SavedView = { id: existing?.id ?? makeId(), name: existing?.name ?? clean, savedAt: now.toISOString(), view: sanitizeView(view) }
  return { saved, views: existing ? views.map((v) => (v.id === existing.id ? saved : v)) : [...views, saved] }
}

export const removeView = (views: SavedView[], id: string) => views.filter((v) => v.id !== id)

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}
