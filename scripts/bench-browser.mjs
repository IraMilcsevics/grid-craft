/**
 * Runs the in-app benchmark in headless Chrome against the production build and prints Markdown tables.
 *
 *   npm run build
 *   npm run bench:browser
 *
 * Needs a Chrome or Edge install. Set CHROME_PATH if it is not in the usual place.
 * Optional: BENCH_SIZES=1000,10000,100000  BENCH_OFF=1000,10000 (sizes to also run with virtualization off)
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import os from 'node:os'
import puppeteer from 'puppeteer-core'

const PORT = 4173
const BASE = `http://localhost:${PORT}/`
const SIZES = (process.env.BENCH_SIZES ?? '1000,10000,100000').split(',').map(Number)
const OFF_SIZES = (process.env.BENCH_OFF ?? '1000,10000').split(',').filter(Boolean).map(Number)

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)
const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!executablePath) throw new Error('No Chrome or Edge found. Set CHROME_PATH.')

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' })
const stop = () => server.kill()
process.on('exit', stop)

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('vite preview did not start. Run `npm run build` first.')
}

const browser = await (async () => {
  await waitForServer()
  return puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'], protocolTimeout: 1_800_000 })
})()

async function runOnce(rows, virtual) {
  console.error(`running ${rows} rows, virtualization ${virtual ? 'on' : 'off'} ...`)
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  await page.goto(`${BASE}?rows=${rows}${virtual ? '' : '&virtual=off'}`, { waitUntil: 'load' })
  await page.waitForSelector('.scroller .row', { timeout: 120_000 })

  // Initial render cost: navigation start to the first drawn row, plus what is in the DOM then.
  await page.waitForFunction(() => performance.getEntriesByName('gridcraft:painted').length > 0)
  const load = await page.evaluate(() => ({
    dataMs: Math.round(performance.getEntriesByName('gridcraft:data-ready')[0].startTime),
    paintedMs: Math.round(performance.getEntriesByName('gridcraft:painted')[0].startTime),
    domNodes: document.getElementsByTagName('*').length,
    heapMb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
  }))

  await page.evaluate(() => [...document.querySelectorAll('header button')].find((b) => b.textContent.includes('Benchmark')).click())
  await page.waitForSelector('dialog[open]')
  await page.evaluate(() => [...document.querySelectorAll('dialog footer button')].find((b) => b.textContent.includes('Run benchmark')).click())
  await page.waitForFunction(() => document.querySelector('dialog table.bench tbody tr:nth-child(12)'), { timeout: 900_000 })

  const results = await page.evaluate(() =>
    [...document.querySelectorAll('dialog table.bench tbody tr')].map((tr) => {
      const cells = tr.querySelectorAll('td')
      return { label: cells[0].childNodes[0].textContent.trim(), value: cells[1].textContent.trim(), worst: cells[2].textContent.trim() }
    }),
  )
  await page.close()
  return { rows, virtual, load, results }
}

const all = []
try {
  for (const n of SIZES) all.push(await runOnce(n, true))
  for (const n of OFF_SIZES) all.push(await runOnce(n, false))
} finally {
  await browser.close()
  stop()
}

const fmt = (n) => n.toLocaleString('en-US')
const cpu = os.cpus()[0]
console.log(`Chrome headless, ${cpu.model.trim()} (${os.cpus().length} logical cores), ${Math.round(os.totalmem() / 2 ** 30)} GB RAM, production build\n`)

const virtualRuns = all.filter((r) => r.virtual)
const labels = virtualRuns[0].results.map((r) => r.label)
console.log('### Interaction time (median, applied to paint)\n')
console.log(`| Operation | ${virtualRuns.map((r) => `${fmt(r.rows)} rows`).join(' | ')} |`)
console.log(`| --- | ${virtualRuns.map(() => '---:').join(' | ')} |`)
labels.forEach((label, i) => console.log(`| ${label} | ${virtualRuns.map((r) => r.results[i].value).join(' | ')} |`))

console.log('\n### Virtualization on and off\n')
console.log('Times are from navigation start, so they include downloading and starting the app.\n')
console.log('| Rows | Virtualization | Data ready | Grid painted | DOM nodes | Scroll |')
console.log('| ---: | --- | ---: | ---: | ---: | ---: |')
for (const r of all) {
  const scroll = r.results.find((x) => x.label.startsWith('Scroll'))
  console.log(`| ${fmt(r.rows)} | ${r.virtual ? 'on' : 'off'} | ${fmt(r.load.dataMs)} ms | ${fmt(r.load.paintedMs)} ms | ${fmt(r.load.domNodes)} | ${scroll ? `${scroll.value}, p95 frame ${scroll.worst}` : '-'} |`)
}
