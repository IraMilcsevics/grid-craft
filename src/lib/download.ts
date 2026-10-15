/** Saves text as a file. The BOM makes Excel read the file as UTF-8, so accented names survive. */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportFilename(now = new Date()) {
  return `gridcraft-orders-${now.toISOString().slice(0, 10)}.csv`
}
