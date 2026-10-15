import { useState } from 'react'
import { generateOrders } from '../domain/generate'
import type { ColumnKey, Order } from '../domain/schema'
import { countErrors } from '../domain/validate'
import { fromSearchParams, type RowMode } from '../domain/view'
import { useNotice } from '../hooks/useNotice'
import { useOrdersStore } from '../hooks/useOrdersStore'
import { useRowList } from '../hooks/useRowList'
import { useUpdateTiming } from '../hooks/useUpdateTiming'
import { useViews } from '../hooks/useViews'
import { DEFAULT_DEMO_ROWS, DEMO_NAME, type Session } from '../lib/bootSession'
import { fmt } from '../lib/format'
import { AppHeader, type DialogName } from './AppHeader'
import { BenchmarkDialog } from './BenchmarkDialog'
import { ExportDialog } from './ExportDialog'
import { Grid } from './Grid'
import { ImportDialog } from './ImportDialog'
import { PerfPanel } from './PerfPanel'
import { StatusBar } from './StatusBar'
import { applyView, viewFromTable } from './tableView'
import { Chips, Toolbar } from './Toolbar'
import { ViewsMenu } from './ViewsMenu'
import { ERRORS_COLUMN, useOrderTable } from './columns'

/** The whole app screen. It only wires the pieces together; each piece lives in its own hook or component. */
export function GridScreen({ session }: { session: Session }) {
  // Read during render on purpose: the performance panel times from the start of this render to the next paint.
  // eslint-disable-next-line react/purity
  const renderStart = performance.now()
  const { notice, notify } = useNotice()
  const orders = useOrdersStore(session, notify)
  const { state, dispatch, base, datasetId } = orders
  const data = state.rows
  const dirtyCount = Object.keys(state.dirty).length

  // A shared link or reload restores the view from the address bar before the first render.
  const [initialView] = useState(() => fromSearchParams(new URLSearchParams(window.location.search)))
  const table = useOrderTable(data, initialView)
  const [mode, setMode] = useState<RowMode>(initialView.mode)
  const viewsMenu = useViews({ table, mode, setMode, notify })

  const { allRows, modelMs } = useUpdateTiming({ table, data, datasetId, mode, renderStart })
  const { rows, viewRows, totals, totalsHint, indexOffset, scrollKey } = useRowList(table, mode, allRows)
  const visibleKeys = table
    .getVisibleLeafColumns()
    .filter((c) => c.id !== ERRORS_COLUMN)
    .map((c) => c.id as ColumnKey)

  const [domRows, setDomRows] = useState(0)
  const [dialog, setDialog] = useState<DialogName | null>(null)
  const [perfOpen, setPerfOpen] = useState(false)
  // Developer flag: ?virtual=off draws every row, to compare against the virtualized grid.
  const [virtualize] = useState(() => new URLSearchParams(window.location.search).get('virtual') !== 'off')

  // A new dataset starts with no filters and on the first page.
  const showFromTheTop = () => {
    table.setGlobalFilter(undefined)
    table.resetColumnFilters(true)
    table.setPageIndex(0)
  }

  const importRows = async (imported: Order[], name: string, reviewErrors: boolean) => {
    const stored = await orders.replaceDataset('import', name, imported)
    showFromTheTop()
    if (reviewErrors) table.getColumn(ERRORS_COLUMN)?.setFilterValue(true)
    setDialog(null)
    const bad = imported.filter((r) => countErrors(r) > 0).length
    notify(`Imported ${fmt(imported.length)} rows${bad ? `, ${fmt(bad)} with problems` : ''}${stored || !orders.store ? '' : '. Too large to keep in this browser.'}`)
  }

  const loadDemo = async () => {
    await orders.replaceDataset('demo', DEMO_NAME, generateOrders(DEFAULT_DEMO_ROWS))
    showFromTheTop()
    notify('Demo data loaded')
  }

  return (
    <>
      <AppHeader
        dataset={{
          name: base.name,
          rowCount: data.length,
          kind: base.kind,
          editedCells: dirtyCount,
          status: orders.saveStatus,
          onDiscardEdits: orders.discardEdits,
          onLoadDemo: () => void loadDemo(),
        }}
        onOpen={setDialog}
      />
      <main className="main">
      <Toolbar
        table={table}
        badRows={state.errorRows}
        undoCount={state.past.length}
        redoCount={state.future.length}
        onUndo={() => void orders.undo()}
        onRedo={() => void orders.redo()}
        mode={mode}
        onModeChange={(m) => {
          setMode(m)
          table.setPageIndex(0)
        }}
        viewsMenu={<ViewsMenu {...viewsMenu} />}
      />
      <Chips table={table} />
      <Grid
        key={datasetId}
        table={table}
        dirty={state.dirty}
        onEdit={orders.edit}
        onUndo={orders.undo}
        onRedo={orders.redo}
        notify={notify}
        onRendered={setDomRows}
        rows={rows}
        indexOffset={indexOffset}
        totals={totals}
        totalsHint={totalsHint}
        scrollKey={scrollKey}
        virtualize={virtualize}
      />
      </main>
      <StatusBar
        table={table}
        mode={mode}
        filteredRows={allRows.length}
        totalRows={data.length}
        errorRows={state.errorRows}
        editedCells={dirtyCount}
        shownRows={rows.length}
        domRows={domRows}
        modelMs={modelMs}
        perfOpen={perfOpen}
        onTogglePerf={() => setPerfOpen((open) => !open)}
      />

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
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}

      {dialog === 'import' && <ImportDialog existingRows={data.length} unsavedEdits={dirtyCount} onClose={() => setDialog(null)} onImport={importRows} />}
      {dialog === 'benchmark' && (
        <BenchmarkDialog
          table={table}
          rowCount={data.length}
          firstRowId={data[0]?.id ?? ''}
          getRows={() => data}
          virtualized={virtualize}
          edit={orders.edit}
          undo={() => dispatch({ type: 'undo' })}
          getView={() => viewFromTable(table, mode)}
          setView={(v) => {
            applyView(table, v)
            setMode(v.mode)
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'export' && <ExportDialog viewRows={viewRows} allRows={data} visibleKeys={visibleKeys} onClose={() => setDialog(null)} onDone={notify} />}
    </>
  )
}
