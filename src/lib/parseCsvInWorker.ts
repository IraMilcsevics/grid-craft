import type { ImportRequest, ImportResponse } from '../workers/importCsv.worker'

/** Parses CSV text in a short-lived worker so large files do not block the UI. */
export function parseCsvInWorker(text: string): Promise<ImportResponse> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/importCsv.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<ImportResponse>) => {
      worker.terminate()
      resolve(e.data)
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message || 'The file could not be processed'))
    }
    const request: ImportRequest = { text }
    worker.postMessage(request)
  })
}
