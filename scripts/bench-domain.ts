/**
 * Headless benchmark of the data layer (no browser, no React): generating, validating,
 * CSV export and CSV import with validation. Run with `npm run bench:domain`.
 */
import { importOrders, parseCsv, toCsv } from '../src/domain/csv'
import { generateOrders } from '../src/domain/generate'
import { COLUMNS } from '../src/domain/schema'
import { countErrors } from '../src/domain/validate'

const SIZES = [1_000, 10_000, 100_000]
const RUNS = 7

const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0
function time(fn: () => unknown): number {
  fn() // warm-up, not counted
  const times: number[] = []
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now()
    fn()
    times.push(performance.now() - t)
  }
  return median(times)
}
const ms = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toString())

const keys = COLUMNS.map((c) => c.key)
const rows: string[][] = [['Operation', ...SIZES.map((n) => `${n.toLocaleString('en-US')} rows`)]]
const ops: [string, (n: number) => () => unknown][] = [
  ['Generate rows', (n) => () => generateOrders(n)],
  [
    'Validate every cell',
    (n) => {
      const data = generateOrders(n)
      return () => data.reduce((sum, r) => sum + countErrors(r), 0)
    },
  ],
  [
    'Build CSV',
    (n) => {
      const data = generateOrders(n)
      return () => toCsv(data, keys)
    },
  ],
  [
    'Parse CSV text',
    (n) => {
      const csv = toCsv(generateOrders(n), keys)
      return () => parseCsv(csv)
    },
  ],
  [
    'Parse + import with validation report',
    (n) => {
      const csv = toCsv(generateOrders(n), keys)
      return () => importOrders(parseCsv(csv))
    },
  ],
]

for (const [label, make] of ops) rows.push([label, ...SIZES.map((n) => ms(time(make(n))) + ' ms')])

const widths = rows[0]!.map((_, c) => Math.max(...rows.map((r) => r[c]!.length)))
const line = (r: string[]) => '| ' + r.map((cell, c) => (c === 0 ? cell.padEnd(widths[c]!) : cell.padStart(widths[c]!))).join(' | ') + ' |'
console.log(`Node ${process.version}, median of ${RUNS} runs\n`)
console.log(line(rows[0]!))
console.log('| ' + widths.map((w, c) => (c === 0 ? '-'.repeat(w) : '-'.repeat(w - 1) + ':')).join(' | ') + ' |')
for (const r of rows.slice(1)) console.log(line(r))
