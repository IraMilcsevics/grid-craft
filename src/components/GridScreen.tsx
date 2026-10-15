import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { initOrders, ordersReducer, type CellEdit, type EditKey } from '../domain/editing'
import { generateOrders } from '../domain/generate'
import { collectEdits, type StoredDataset } from '../domain/session'
import { DEFAULT_DEMO_ROWS, DEMO_NAME, type Session } from '../lib/bootSession'
import { COLUMN_BY_KEY, type ColumnKey, type Order } from '../domain/schema'
import { PRESETS } from '../domain/presets'
import { countErrors } from '../domain/validate'
import { computeTotals } from '../domain/totals'
import { canonicalView, fromSearchParams, mergeSearchParams, toSearchParams, viewsEqual, emptyView, type RowMode, type ViewState } from '../domain/view'
import { loadSavedViews, persistSavedViews, removeView, upsertView, type SavedView } from '../domain/viewStore'
import { afterPaint, perf } from '../perf/perfStore'
import { BenchmarkDialog } from './BenchmarkDialog'
import { DataMenu, type SaveStatus } from './DataMenu'
import { ExportDialog } from './ExportDialog'
import { Grid } from './Grid'
import { ImportDialog } from './ImportDialog'
import { PerfPanel } from './PerfPanel'
import { ViewsMenu } from './ViewsMenu'
import { applyView, viewFromTable } from './tableView'
import { Chips, Pager, Toolbar } from './Toolbar'
import { ERRORS_COLUMN, useOrderTable } from './columns'

const fmt = (n: number) => n.toLocaleString('en-US')
const ms = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toString())

export function GridScreen({ session }: { session: Session }) {
  const renderStart = performance.now()
  const [state, dispatch] = useReducer(ordersReducer, session, (s) => initOrders(s.rows, s.dirty))
  const data = state.rows
  // A shared link or reload restores the view from the address bar before the first render.
  const [initialView] = useState(() => fromSearchParams(new URLSearchParams(window.location.search)))
  const table = useOrderTable(data, initialView)
  const [mode, setMode] = useState<RowMode>(initialView.mode)
  const badRows = state.errorRows
  const [domRows, setDomRows] = useState(0)
  const dirtyCount = Object.keys(state.dirty).length

  // The dataset the edits sit on top of. Edits are saved as an overlay on it, never as a rewrite of every row.
  const [base, setBase] = useState({ id: session.datasetId, kind: session.kind, name: session.name, rows: session.baseRows })
  const [persistOn, setPersistOn] = useState(session.persistent)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(session.persistent ? { kind: 'saved' } : { kind: 'off', reason: session.reason ?? 'Nothing is stored' })
  const store = session.store
  // Bumped on every import so the grid drops its selection, editor and scroll position.
  const [datasetId, setDatasetId] = useState(0)
  // Marks for startup timing: first commit and first painted frame, measured from navigation start.
  useEffect(() => {
    performance.mark('gridcraft:committed')
    void afterPaint().then(() => performance.mark('gridcraft:painted'))
  }, [])

  const [dialog, setDialog] = useState<'import' | 'export' | 'benchmark' | null>(null)
  const [perfOpen, setPerfOpen] = useState(false)
  // Developer flag: ?virtual=off draws every row, to compare against the virtualized grid.
  const [virtualize] = useState(() => new URLSearchParams(window.location.search).get('virtual') !== 'off')

  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const notify = useCallback((message: string) => {
    setNotice(message)
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 2600)
  }, [])
  useEffect(() => () => clearTimeout(noticeTimer.current), [])

  // Saved views live in localStorage; if the browser refuses, they stay in memory for this session.
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => loadSavedViews())
  const [canPersist, setCanPersist] = useState(true)
  const [activeViewId, setActiveViewId] = useState<string | null>(null)

  const currentView = viewFromTable(table, mode)
  const viewSig = canonicalView(currentView)
  const activeView = [...PRESETS, ...savedViews].find((v) => v.id === activeViewId)
  const viewModified = !!activeView && !viewsEqual(activeView.view, currentView)

  // Keep the address bar in step with the table so the URL always reproduces what is on screen.
  useEffect(() => {
    const timer = setTimeout(() => {
      // Other parameters (such as ?rows= and ?virtual=) are not part of a view and must survive.
      const query = mergeSearchParams(new URLSearchParams(window.location.search), currentView).toString()
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
    }, 250)
    return () => clearTimeout(timer)
    // currentView is derived from viewSig
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewSig])

  const commitViews = (views: SavedView[]) => {
    setSavedViews(views)
    setCanPersist(persistSavedViews(views))
  }
  const saveView = (name: string) => {
    const { views, saved } = upsertView(savedViews, name, currentView, new Date(), () => crypto.randomUUID())
    commitViews(views)
    setActiveViewId(saved.id)
    notify(`Saved view “${saved.name}”`)
  }
  const updateView = () => {
    if (!activeView || !savedViews.some((v) => v.id === activeView.id)) return
    saveView(activeView.name)
  }
  const deleteView = (id: string) => {
    const gone = savedViews.find((v) => v.id === id)
    commitViews(removeView(savedViews, id))
    if (activeViewId === id) setActiveViewId(null)
    if (gone) notify(`Deleted view “${gone.name}”`)
  }
  const renameView = (id: string, name: string) => {
    if (savedViews.some((v) => v.id !== id && v.name.toLowerCase() === name.toLowerCase())) {
      notify(`A view named “${name}” already exists`)
      return
    }
    commitViews(savedViews.map((v) => (v.id === id ? { ...v, name } : v)))
    notify(`Renamed to “${name}”`)
  }
  // Leaving keeps what is on screen; the default view also clears it.
  const leaveView = () => {
    setActiveViewId(null)
    notify('Left the view. Filters and columns are unchanged.')
  }
  const resetToDefault = () => {
    applyView(table, emptyView())
    setMode('virtual')
    setActiveViewId(null)
    notify('Default view')
  }
  const discardChanges = () => {
    if (!activeView) return
    applyView(table, activeView.view)
    setMode(activeView.view.mode)
    notify(`Back to “${activeView.name}”`)
  }
  const chooseView = (id: string, name: string, view: ViewState) => {
    applyView(table, view)
    setMode(view.mode)
    setActiveViewId(id)
    notify(`Applied “${name}”`)
  }
  const copyLink = () => {
    const query = toSearchParams(currentView).toString()
    const url = `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ''}`
    navigator.clipboard.writeText(url).then(
      () => notify('Link copied. It restores filters, sorting and columns.'),
      () => notify('Could not copy. The link is in the address bar.'),
    )
  }

  const label = (e: CellEdit) => `${COLUMN_BY_KEY[e.key].label} on ${e.id}`
  const onEdit = (id: string, key: EditKey, value: Order[EditKey]) => dispatch({ type: 'edit', id, key, value })
  const onUndo = (): CellEdit | undefined => {
    const edit = state.past[state.past.length - 1]
    if (!edit) {
      notify('Nothing to undo')
      return undefined
    }
    dispatch({ type: 'undo' })
    notify(`Undid ${label(edit)}`)
    return edit
  }
  const onRedo = (): CellEdit | undefined => {
    const edit = state.future[state.future.length - 1]
    if (!edit) {
      notify('Nothing to redo')
      return undefined
    }
    dispatch({ type: 'redo' })
    notify(`Redid ${label(edit)}`)
    return edit
  }

  /**
   * Swaps in a new dataset. The copy in browser storage is replaced first; if that fails (storage full or
   * blocked) the app keeps working in memory, says so, and removes the stale copy so a reload cannot bring back old data.
   */
  const replaceDataset = async (kind: 'demo' | 'import', name: string, rows: Order[]) => {
    const id = crypto.randomUUID()
    let stored = persistOn
    if (store && persistOn) {
      const record: StoredDataset =
        kind === 'import'
          ? { id, kind, name, rows, savedAt: new Date().toISOString() }
          : { id, kind, name, demoRows: rows.length, savedAt: new Date().toISOString() }
      try {
        await store.saveDataset(record)
        await store.saveEdits({ datasetId: id, cells: [] })
      } catch {
        stored = false
        setPersistOn(false)
        setSaveStatus({ kind: 'error', reason: 'This data is too large or storage is blocked, so it will not survive a reload.' })
        await store.clear().catch(() => undefined)
      }
    }
    setBase({ id, kind, name, rows })
    dispatch({ type: 'load', rows })
    setDatasetId((n) => n + 1)
    table.setGlobalFilter(undefined)
    table.resetColumnFilters(true)
    table.setPageIndex(0)
    return stored
  }

  const importRows = async (rows: Order[], name: string, reviewErrors: boolean) => {
    const stored = await replaceDataset('import', name, rows)
    if (reviewErrors) table.getColumn(ERRORS_COLUMN)?.setFilterValue(true)
    setDialog(null)
    const bad = rows.filter((r) => countErrors(r) > 0).length
    notify(`Imported ${fmt(rows.length)} rows${bad ? `, ${fmt(bad)} with problems` : ''}${stored || !store ? '' : '. Too large to keep in this browser.'}`)
  }

  const discardEdits = () => {
    dispatch({ type: 'load', rows: base.rows })
    setDatasetId((n) => n + 1)
    notify('Edits discarded')
  }

  const loadDemo = async () => {
    await replaceDataset('demo', DEMO_NAME, generateOrders(DEFAULT_DEMO_ROWS))
    notify('Demo data loaded')
  }

  // Save the edited cells shortly after each change, and straight away when the page is being hidden or closed.
  const latest = useRef({ state, baseId: base.id, persistOn })
  latest.current = { state, baseId: base.id, persistOn }
  const pendingSave = useRef(false)
  const flush = useCallback(async () => {
    const cur = latest.current
    if (!store || !cur.persistOn || !pendingSave.current) return
    pendingSave.current = false
    try {
      await store.saveEdits(collectEdits(cur.state, cur.baseId))
      setSaveStatus({ kind: 'saved' })
    } catch {
      setSaveStatus({ kind: 'error', reason: 'Storage is full or blocked, so recent edits will be lost on reload.' })
    }
  }, [store])
  const firstRows = useRef(state.rows)
  useEffect(() => {
    if (!store || !persistOn || state.rows === firstRows.current) return
    pendingSave.current = true
    setSaveStatus({ kind: 'saving' })
    const timer = setTimeout(() => void flush(), 250)
    return () => clearTimeout(timer)
  }, [state.rows, store, persistOn, flush])
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    const onPageHide = () => void flush()
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [flush])

  // Time every change that rebuilds what is on screen: the row model first, then the wait until
  // the browser has painted. TanStack memoizes the model, so the timed call only does real work
  // on the first render after a change.
  const { columnFilters, globalFilter, sorting, columnVisibility, columnOrder } = table.state
  const stateKey = JSON.stringify([columnFilters, globalFilter, sorting])
  const last = useRef<{ key: string; data: Order[]; modelMs: number }>({ key: '', data, modelMs: 0 })
  const modelStart = performance.now()
  const allRows = table.getPrePaginatedRowModel().rows
  if (last.current.key !== stateKey || last.current.data !== data) {
    last.current = { key: stateKey, data, modelMs: performance.now() - modelStart }
  }

  const seen = useRef<{ filters: string; search: unknown; sorting: string; data: Order[]; dataset: number; layout: string; mode: RowMode; page: string } | null>(null)
  const pending = useRef<{ cause: string; start: number; modelMs: number } | null>(null)
  const nowSeen = {
    filters: JSON.stringify(columnFilters),
    search: globalFilter,
    sorting: JSON.stringify(sorting),
    data,
    dataset: datasetId,
    layout: JSON.stringify([columnVisibility, columnOrder]),
    mode,
    page: JSON.stringify(table.state.pagination),
  }
  const before = seen.current
  if (before) {
    const cause =
      before.dataset !== nowSeen.dataset ? 'import'
      : before.data !== nowSeen.data ? 'edit'
      : before.search !== nowSeen.search ? 'search'
      : before.filters !== nowSeen.filters ? 'filter'
      : before.sorting !== nowSeen.sorting ? 'sort'
      : before.layout !== nowSeen.layout ? 'columns'
      : before.mode !== nowSeen.mode ? 'mode'
      : before.page !== nowSeen.page ? 'page'
      : null
    if (cause) pending.current = { cause, start: renderStart, modelMs: last.current.modelMs }
  }
  seen.current = nowSeen
  useEffect(() => {
    const p = pending.current
    if (!p) return
    pending.current = null
    void afterPaint().then(() => perf.record({ cause: p.cause, modelMs: p.modelMs, paintMs: performance.now() - p.start }))
  })

  const rows = mode === 'paged' ? table.getRowModel().rows : allRows
  const { pagination } = table.state
  const viewRows = useMemo(() => allRows.map((r) => r.original), [allRows])

  // Filters and sorting send paged mode back to page one. Cell edits do not, so they keep the page.
  const listSig = JSON.stringify([columnFilters, globalFilter, sorting])
  useEffect(() => {
    table.setPageIndex(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listSig])
  const lastPage = Math.max(0, table.getPageCount() - 1)
  useEffect(() => {
    // Functional form, so it composes with the reset above instead of overwriting it with a stale index.
    if (pagination.pageIndex > lastPage) table.setPageIndex((i) => Math.min(i, lastPage))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.pageIndex, lastPage])

  const totals = useMemo(() => computeTotals(viewRows), [viewRows])
  const totalsHint = `Totals cover all ${fmt(allRows.length)} filtered rows${mode === 'paged' ? ', not just this page' : ''}`
  const scrollKey = JSON.stringify([listSig, mode, pagination.pageIndex, pagination.pageSize])

  const visibleKeys = table
    .getVisibleLeafColumns()
    .filter((c) => c.id !== ERRORS_COLUMN)
    .map((c) => c.id as ColumnKey)

  return (
    <>
      <header className="top">
        <div className="logo">
          <i>
            {Array.from({ length: 9 }, (_, i) => (
              <b key={i} />
            ))}
          </i>
          GridCraft
        </div>
        <DataMenu
          name={base.name}
          rowCount={data.length}
          kind={base.kind}
          editedCells={dirtyCount}
          status={saveStatus}
          onDiscardEdits={discardEdits}
          onLoadDemo={() => void loadDemo()}
        />
        <div className="spacer" />
        <button className="btn" onClick={() => setDialog('benchmark')}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z" />
          </svg>
          Benchmark
        </button>
        <button className="btn" onClick={() => setDialog('import')}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 11V2.5M4.5 6 8 2.5 11.5 6M2.5 10.5v3h11v-3" />
          </svg>
          Import CSV
        </button>
        <button className="btn" onClick={() => setDialog('export')}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 2.5V11M4.5 7.5 8 11l3.5-3.5M2.5 10.5v3h11v-3" />
          </svg>
          Export CSV
        </button>
      </header>
      <Toolbar
        table={table}
        badRows={badRows}
        undoCount={state.past.length}
        redoCount={state.future.length}
        onUndo={() => void onUndo()}
        onRedo={() => void onRedo()}
        mode={mode}
        onModeChange={(m) => {
          setMode(m)
          table.setPageIndex(0)
        }}
        viewsMenu={
          <ViewsMenu
            presets={PRESETS}
            saved={savedViews}
            activeId={activeViewId}
            modified={viewModified}
            canPersist={canPersist}
            onApply={chooseView}
            onSave={saveView}
            onUpdate={updateView}
            onDelete={deleteView}
            onRename={renameView}
            onLeave={leaveView}
            onReset={resetToDefault}
            onDiscard={discardChanges}
            onCopyLink={copyLink}
          />
        }
      />
      <Chips table={table} />
      <Grid
        key={datasetId}
        table={table}
        dirty={state.dirty}
        onEdit={onEdit}
        onUndo={onUndo}
        onRedo={onRedo}
        notify={notify}
        onRendered={setDomRows}
        rows={rows}
        indexOffset={mode === 'paged' ? pagination.pageIndex * pagination.pageSize : 0}
        totals={totals}
        totalsHint={totalsHint}
        scrollKey={scrollKey}
        virtualize={virtualize}
      />
      <footer className="status">
        <div>
          <b>{fmt(allRows.length)}</b> of <b>{fmt(data.length)}</b> rows ·{' '}
          <span className="errn"><b>{fmt(badRows)}</b> with errors</span>
          {dirtyCount > 0 && <> · <span className="edited"><b>{fmt(dirtyCount)}</b> edited</span></>}
        </div>
        <div className="perf">
          <span>row model <b>{ms(last.current.modelMs)} ms</b></span>
          <span>DOM rows <b>{domRows}</b> / {fmt(rows.length)}</span>
        </div>
        <button className={`linkbtn${perfOpen ? ' on' : ''}`} aria-expanded={perfOpen} onClick={() => setPerfOpen((o) => !o)}>
          Performance
        </button>
        <div className="spacer" />
        {mode === 'paged' ? (
          <Pager table={table} />
        ) : (
          <div className="hint">
            <kbd>↑↓←→</kbd> move <kbd>Enter</kbd> edit <kbd>Tab</kbd> next <kbd>Esc</kbd> cancel <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo
          </div>
        )}
      </footer>
      {perfOpen && (
        <PerfPanel
          totalRows={data.length}
          filteredRows={allRows.length}
          domRows={domRows}
          virtualized={virtualize}
          onClose={() => setPerfOpen(false)}
          onBenchmark={() => setDialog('benchmark')}
        />
      )}
      {notice && <div className="toast" role="status">{notice}</div>}

      {dialog === 'import' && (
        <ImportDialog existingRows={data.length} unsavedEdits={dirtyCount} onClose={() => setDialog(null)} onImport={importRows} />
      )}
      {dialog === 'benchmark' && (
        <BenchmarkDialog
          table={table}
          rowCount={data.length}
          firstRowId={data[0]?.id ?? ''}
          getRows={() => data}
          virtualized={virtualize}
          edit={(id, key, value) => dispatch({ type: 'edit', id, key, value })}
          undo={() => dispatch({ type: 'undo' })}
          getView={() => viewFromTable(table, mode)}
          setView={(v) => {
            applyView(table, v)
            setMode(v.mode)
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'export' && (
        <ExportDialog
          viewRows={viewRows}
          allRows={data}
          visibleKeys={visibleKeys}
          onClose={() => setDialog(null)}
          onDone={notify}
        />
      )}
    </>
  )
}
