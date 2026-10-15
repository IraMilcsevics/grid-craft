/**
 * Takes the README screenshots from the production build in headless Chrome.
 *   npm run build && npm run screenshots
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const PORT = 4177
const BASE = `http://localhost:${PORT}/`
const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => p && existsSync(p))
if (!chrome) throw new Error('No Chrome found. Set CHROME_PATH.')
mkdirSync('docs', { recursive: true })

const server = spawn('node', ['scripts/serve-dist.mjs', String(PORT), '/'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 1000))

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const click = (page, selector, text) =>
  page.evaluate((s, t) => [...document.querySelectorAll(s)].find((e) => e.textContent.includes(t)).click(), selector, text)

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 860, deviceScaleFactor: 1 })
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
  await page.goto(BASE, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.scroller .row')
  await page.evaluate(() => document.fonts.ready)

  // 1. The grid with a cell being corrected: a broken value, its message and the edit marker on a neighbour.
  await page.evaluate(() => {
    const bad = document.querySelector('.cell.bad[data-col="email"]') ?? document.querySelector('.cell.bad')
    bad.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    bad.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  })
  await sleep(400)
  await page.screenshot({ path: 'docs/grid.png' })
  await page.keyboard.press('Escape')

  // 2. Import with a validation report.
  await click(page, 'header button', 'Import CSV')
  await page.waitForSelector('dialog[open]')
  await click(page, 'dialog button', '400 rows')
  await page.waitForSelector('dialog .file-line')
  await sleep(400)
  await page.screenshot({ path: 'docs/import-report.png' })
  await click(page, 'dialog button', 'Cancel')
  await sleep(300)

  // 3. Filters, a saved view and the performance panel after a few changes.
  await click(page, '.menu-root button', 'Views')
  await sleep(200)
  await click(page, '.menu-item', 'High-value paid orders')
  await sleep(3200) // let the confirmation toast fade out
  await page.evaluate(() => document.activeElement?.blur())
  await page.mouse.click(700, 5)
  await click(page, '.status button', 'Performance')
  await sleep(500)
  await page.screenshot({ path: 'docs/views-and-performance.png' })
} finally {
  await browser.close()
  server.kill()
}
console.log('Saved docs/grid.png, docs/import-report.png, docs/views-and-performance.png')
