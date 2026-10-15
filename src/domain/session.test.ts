// @vitest-environment node
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { initOrders, ordersReducer } from './editing'
import { generateOrders } from './generate'
import { openSessionStore } from '../lib/persistence'
import { applyStoredEdits, collectEdits, sanitizeDataset, sanitizeEdits, type StoredDataset } from './session'

describe('applyStoredEdits / collectEdits', () => {
  it('round-trips the edited cells over the same base rows', () => {
    const base = generateOrders(50, 5)
    let s = initOrders(base)
    s = ordersReducer(s, { type: 'edit', id: base[3]!.id, key: 'qty', value: 99 })
    s = ordersReducer(s, { type: 'edit', id: base[7]!.id, key: 'customer', value: 'Ada Lovelace' })
    const stored = collectEdits(s, 'ds1')
    expect(stored.cells).toHaveLength(2)

    const restored = applyStoredEdits(base, JSON.parse(JSON.stringify(stored.cells)))
    expect(restored.rows[3]!.qty).toBe(99)
    expect(restored.rows[7]!.customer).toBe('Ada Lovelace')
    expect(Object.keys(restored.dirty).sort()).toEqual(Object.keys(s.dirty).sort())
    expect(base[3]!.qty).not.toBe(99)
  })

  it('does not store an edit that was undone and ignores rows that no longer exist', () => {
    const base = generateOrders(10, 5)
    let s = initOrders(base)
    s = ordersReducer(s, { type: 'edit', id: base[1]!.id, key: 'qty', value: 5 })
    s = ordersReducer(s, { type: 'undo' })
    expect(collectEdits(s, 'x').cells).toEqual([])
    expect(applyStoredEdits(base, [{ id: 'GONE', key: 'qty', value: 1 }]).dirty).toEqual({})
  })

  it('handles row ids that contain colons', () => {
    const row = { ...generateOrders(1)[0]!, id: 'A:1:2' }
    let s = initOrders([row])
    s = ordersReducer(s, { type: 'edit', id: 'A:1:2', key: 'qty', value: 3 })
    expect(collectEdits(s, 'x').cells).toEqual([{ id: 'A:1:2', key: 'qty', value: 3 }])
  })
})

describe('sanitize stored data', () => {
  it('rejects shapes it cannot trust', () => {
    expect(sanitizeDataset(null)).toBeNull()
    expect(sanitizeDataset({ id: 'a', name: 'x', kind: 'import', rows: [] })).toBeNull()
    expect(sanitizeDataset({ id: 'a', name: 'x', kind: 'import', rows: [{ id: 1 }] })).toBeNull()
    expect(sanitizeDataset({ id: 'a', name: 'x', kind: 'demo', demoRows: -5 })).toBeNull()
    expect(sanitizeDataset({ id: 'a', name: 'x', kind: 'demo', demoRows: 500 })).toMatchObject({ kind: 'demo', demoRows: 500 })
    expect(sanitizeEdits({ datasetId: 'a', cells: 'no' })).toBeNull()
  })

  it('keeps only editable cells with usable values', () => {
    const e = sanitizeEdits({
      datasetId: 'a',
      cells: [
        { id: 'r1', key: 'qty', value: 4 },
        { id: 'r1', key: 'total', value: 4 },
        { id: 'r1', key: 'id', value: 'x' },
        { id: 'r1', key: 'qty', value: { a: 1 } },
        { id: 7, key: 'qty', value: 1 },
      ],
    })
    expect(e?.cells).toEqual([{ id: 'r1', key: 'qty', value: 4 }])
  })
})

describe('IndexedDB session store', () => {
  beforeEach(() => {
    ;(globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
  })

  const imported = (): StoredDataset => ({ id: 'ds-1', kind: 'import', name: 'orders.csv', rows: generateOrders(200, 9), savedAt: '2025-01-01T00:00:00.000Z' })

  it('returns nothing from an empty database', async () => {
    const store = await openSessionStore()
    expect(await store!.load()).toEqual({ dataset: null, edits: null })
  })

  it('stores an imported dataset and edits, and reads them back after reopening', async () => {
    const first = await openSessionStore()
    const ds = imported()
    await first!.saveDataset(ds)
    await first!.saveEdits({ datasetId: 'ds-1', cells: [{ id: ds.rows![0]!.id, key: 'qty', value: 12 }] })
    first!.close()

    const second = await openSessionStore()
    const loaded = await second!.load()
    expect(loaded.dataset?.rows).toHaveLength(200)
    expect(loaded.dataset?.rows).toEqual(ds.rows)
    expect(loaded.edits?.cells).toEqual([{ id: ds.rows![0]!.id, key: 'qty', value: 12 }])
  })

  it('keeps an invalid value as typed', async () => {
    const store = await openSessionStore()
    const ds = imported()
    await store!.saveDataset(ds)
    await store!.saveEdits({ datasetId: 'ds-1', cells: [{ id: ds.rows![1]!.id, key: 'qty', value: 'n/a' }] })
    expect((await store!.load()).edits?.cells[0]?.value).toBe('n/a')
  })

  it('clears everything', async () => {
    const store = await openSessionStore()
    await store!.saveDataset(imported())
    await store!.clear()
    expect(await store!.load()).toEqual({ dataset: null, edits: null })
  })

  it('ignores a corrupt record instead of failing', async () => {
    const raw = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('gridcraft', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('session')
      req.onsuccess = () => resolve(req.result)
    })
    const tx = raw.transaction('session', 'readwrite')
    tx.objectStore('session').put({ kind: 'import', rows: 'garbage' }, 'dataset')
    tx.objectStore('session').put('nope', 'edits')
    await new Promise((r) => (tx.oncomplete = r))
    raw.close()
    const store = await openSessionStore()
    expect(await store!.load()).toEqual({ dataset: null, edits: null })
  })

  it('reports no store when IndexedDB is missing', async () => {
    expect(await openSessionStore(null)).toBeNull()
  })
})
