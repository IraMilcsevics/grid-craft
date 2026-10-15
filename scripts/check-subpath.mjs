/**
 * Loads the production build from a subfolder URL and checks that the grid renders, no request fails,
 * and the CSV worker (a separate file) loads. Start the server first:
 *   MSYS_NO_PATHCONV=1 node scripts/serve-dist.mjs 4175 /grid-craft/
 *   node scripts/check-subpath.mjs http://localhost:4175/grid-craft/
 */
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const url = process.argv[2] ?? 'http://localhost:4175/grid-craft/'
const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => p && existsSync(p))
if (!chrome) throw new Error('No Chrome found. Set CHROME_PATH.')

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const failed = []
const errors = []
page.on('requestfailed', (r) => failed.push(r.url()))
page.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`))
page.on('pageerror', (e) => errors.push(e.message))

await page.goto(url, { waitUntil: 'load' })
await page.waitForSelector('.scroller .row', { timeout: 30_000 })
const rows = await page.evaluate(() => document.querySelectorAll('.scroller .row').length)

await page.evaluate(() => [...document.querySelectorAll('header button')].find((b) => b.textContent.includes('Import CSV')).click())
await page.waitForSelector('dialog[open]')
await page.evaluate(() => [...document.querySelectorAll('dialog button')].find((b) => b.textContent.includes('400 rows')).click())
await page.waitForSelector('dialog .file-line', { timeout: 30_000 })
const report = await page.evaluate(() => document.querySelector('dialog .file-line').innerText)

await browser.close()
// Fonts come from Google and may be unreachable offline; they are not part of the check.
const real = failed.filter((u) => !u.includes('fonts.g'))
console.log({ url, rowsRendered: rows, workerReport: report, failedRequests: real, pageErrors: errors })
process.exit(real.length || errors.length || !rows ? 1 : 0)
