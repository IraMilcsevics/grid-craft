import { useSyncExternalStore } from 'react'

export interface PerfEvent {
  id: number
  /** What changed: search, filter, sort, edit, layout, page, mode or data. */
  cause: string
  /** Time spent building the filtered and sorted row model. */
  modelMs: number
  /** From the start of the render to the first painted frame afterwards. */
  paintMs: number
}

interface PerfState {
  events: PerfEvent[]
  paused: boolean
}

const HISTORY = 12
let state: PerfState = { events: [], paused: false }
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export const perf = {
  record(event: Omit<PerfEvent, 'id'>) {
    if (state.paused) return
    state = { ...state, events: [{ ...event, id: nextId++ }, ...state.events].slice(0, HISTORY) }
    emit()
  },
  /** The benchmark drives the table itself, so its own updates must not show up as user activity. */
  setPaused(paused: boolean) {
    state = { ...state, paused }
  },
  clear() {
    state = { ...state, events: [] }
    emit()
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  get: () => state,
}

export const usePerf = () => useSyncExternalStore(perf.subscribe, perf.get)

/** Resolves after the browser has painted the frame that follows the current update. */
export const afterPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
