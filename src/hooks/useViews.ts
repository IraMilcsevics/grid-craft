import { useEffect, useState } from 'react'
import { PRESETS } from '../domain/presets'
import { canonicalView, emptyView, mergeSearchParams, toSearchParams, viewsEqual, type RowMode, type ViewState } from '../domain/view'
import { loadSavedViews, persistSavedViews, removeView, upsertView, type SavedView } from '../domain/viewStore'
import type { ViewsMenuProps } from '../components/ViewsMenu'
import type { OrderTable } from '../components/columns'
import { applyView, viewFromTable } from '../components/tableView'

interface Options {
  table: OrderTable
  mode: RowMode
  setMode: (mode: RowMode) => void
  notify: (message: string) => void
}

/**
 * Saved views, the one currently active, and the address bar. Returns everything the Views menu needs.
 * Saved views live in localStorage; if the browser refuses, they stay in memory for this session.
 */
export function useViews({ table, mode, setMode, notify }: Options): ViewsMenuProps {
  const [saved, setSaved] = useState<SavedView[]>(() => loadSavedViews())
  const [canPersist, setCanPersist] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)

  const currentView = viewFromTable(table, mode)
  const viewSig = canonicalView(currentView)
  const active = [...PRESETS, ...saved].find((v) => v.id === activeId)
  const modified = !!active && !viewsEqual(active.view, currentView)

  // Keep the address bar in step with the table so the URL always reproduces what is on screen.
  useEffect(() => {
    const timer = setTimeout(() => {
      // Other parameters (such as ?rows= and ?virtual=) are not part of a view and must survive.
      const query = mergeSearchParams(new URLSearchParams(window.location.search), currentView).toString()
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
    }, 250)
    return () => clearTimeout(timer)
    // Keyed on the view's canonical text, not the currentView object, which is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewSig])

  const commit = (views: SavedView[]) => {
    setSaved(views)
    setCanPersist(persistSavedViews(views))
  }

  const apply = (view: ViewState) => {
    applyView(table, view)
    setMode(view.mode)
  }

  const save = (name: string) => {
    const { views, saved: entry } = upsertView(saved, name, currentView, new Date(), () => crypto.randomUUID())
    commit(views)
    setActiveId(entry.id)
    notify(`Saved view “${entry.name}”`)
  }

  return {
    presets: PRESETS,
    saved,
    activeId,
    modified,
    canPersist,
    onApply: (id, name, view) => {
      apply(view)
      setActiveId(id)
      notify(`Applied “${name}”`)
    },
    onSave: save,
    onUpdate: () => {
      if (!active || !saved.some((v) => v.id === active.id)) return
      save(active.name)
    },
    onDelete: (id) => {
      const gone = saved.find((v) => v.id === id)
      commit(removeView(saved, id))
      if (activeId === id) setActiveId(null)
      if (gone) notify(`Deleted view “${gone.name}”`)
    },
    onRename: (id, name) => {
      if (saved.some((v) => v.id !== id && v.name.toLowerCase() === name.toLowerCase())) {
        notify(`A view named “${name}” already exists`)
        return
      }
      commit(saved.map((v) => (v.id === id ? { ...v, name } : v)))
      notify(`Renamed to “${name}”`)
    },
    // Leaving keeps what is on screen; the default view also clears it.
    onLeave: () => {
      setActiveId(null)
      notify('Left the view. Filters and columns are unchanged.')
    },
    onReset: () => {
      apply(emptyView())
      setActiveId(null)
      notify('Default view')
    },
    onDiscard: () => {
      if (!active) return
      apply(active.view)
      notify(`Back to “${active.name}”`)
    },
    onCopyLink: () => {
      const query = toSearchParams(currentView).toString()
      const url = `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ''}`
      navigator.clipboard.writeText(url).then(
        () => notify('Link copied. It restores filters, sorting and columns.'),
        () => notify('Could not copy. The link is in the address bar.'),
      )
    },
  }
}
