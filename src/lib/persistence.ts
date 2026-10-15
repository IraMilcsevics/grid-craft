import { sanitizeDataset, sanitizeEdits, type StoredDataset, type StoredEdits } from '../domain/session'

/**
 * Browser storage for the dataset and the edits. IndexedDB, not localStorage: an imported file can be
 * tens of megabytes, which localStorage (about 5 MB) cannot hold.
 */
export interface SessionStore {
  load(): Promise<{ dataset: StoredDataset | null; edits: StoredEdits | null }>
  saveDataset(dataset: StoredDataset): Promise<void>
  saveEdits(edits: StoredEdits): Promise<void>
  clear(): Promise<void>
  close(): void
}

const DB_NAME = 'gridcraft'
const STORE = 'session'
const VERSION = 1

const wrap = <T,>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Storage request failed'))
  })

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Storage write failed'))
    tx.onabort = () => reject(tx.error ?? new Error('Storage write was aborted'))
  })

/** Opens the store, or returns null when the browser cannot provide one (blocked, private mode, no IndexedDB). */
export async function openSessionStore(factory: IDBFactory | null = globalThis.indexedDB ?? null): Promise<SessionStore | null> {
  if (!factory) return null
  let db: IDBDatabase
  try {
    db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(DB_NAME, VERSION)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new Error('Storage is blocked by another tab'))
    })
  } catch {
    return null
  }

  const put = async (key: string, value: unknown) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    await done(tx)
  }

  return {
    async load() {
      try {
        const store = db.transaction(STORE, 'readonly').objectStore(STORE)
        const [dataset, edits] = await Promise.all([wrap(store.get('dataset')), wrap(store.get('edits'))])
        return { dataset: sanitizeDataset(dataset), edits: sanitizeEdits(edits) }
      } catch {
        return { dataset: null, edits: null }
      }
    },
    saveDataset: (dataset) => put('dataset', dataset),
    saveEdits: (edits) => put('edits', edits),
    async clear() {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      await done(tx)
    },
    close: () => db.close(),
  }
}
