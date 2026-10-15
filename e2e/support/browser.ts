import { existsSync, mkdirSync } from 'node:fs'
import type { Server } from 'node:http'
import path from 'node:path'
import puppeteer, { type Browser, type BrowserContext, type Page } from 'puppeteer-core'
import { startStaticServer } from '../../scripts/static-server.mjs'

const PORT = 4190
/** The build is served under a subfolder, as GitHub Pages does, so a broken relative path fails here too. */
const PREFIX = '/grid-craft/'
export const BASE = `http://localhost:${PORT}${PREFIX}`

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

export interface Env {
  browser: Browser
  server: Server
}

export async function startEnv(): Promise<Env> {
  const executablePath = CHROME_CANDIDATES.find((p) => p && existsSync(p))
  if (!executablePath) throw new Error('No Chrome or Edge found. Set CHROME_PATH.')
  if (!existsSync('dist/index.html')) throw new Error('dist/ is missing. Run `npm run build` first.')
  const server = await startStaticServer({ root: 'dist', port: PORT, prefix: PREFIX })
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
  return { browser, server }
}

export async function stopEnv(env: Env) {
  await env.browser.close()
  await new Promise<void>((resolve) => env.server.close(() => resolve()))
}

export interface App {
  page: Page
  /** Opens another tab in the same browser profile, so saved data is shared. */
  open: (query?: string) => Promise<Page>
  /** Problems the app caused while running: script errors and failed requests. */
  problems: string[]
}

/**
 * Runs one scenario in a fresh browser profile, so saved data from one test never leaks into the next.
 * A failing scenario leaves a screenshot in e2e-artifacts/ for the CI run to upload.
 */
export async function scenario(env: Env, name: string, body: (app: App) => Promise<void>, query = '') {
  const context: BrowserContext = await env.browser.createBrowserContext()
  const problems: string[] = []
  const pages: Page[] = []

  const open = async (q = '') => {
    const page = await context.newPage()
    pages.push(page)
    await page.setViewport({ width: 1400, height: 860 })
    page.on('pageerror', (e) => problems.push(`script error: ${e instanceof Error ? e.message : String(e)}`))
    page.on('requestfailed', (r) => !isFont(r.url()) && problems.push(`request failed: ${r.url()}`))
    page.on('response', (r) => r.status() >= 400 && !isFont(r.url()) && problems.push(`${r.status()} ${r.url()}`))
    await page.goto(BASE + q, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.scroller .row', { timeout: 30_000 })
    return page
  }

  try {
    const page = await open(query)
    await body({ page, open, problems })
    if (problems.length) throw new Error(`The app reported problems:\n${problems.join('\n')}`)
  } catch (error) {
    mkdirSync('e2e-artifacts', { recursive: true })
    const file = path.join('e2e-artifacts', `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`)
    await pages.at(-1)?.screenshot({ path: file }).catch(() => undefined)
    throw error
  } finally {
    await context.close()
  }
}

const isFont = (url: string) => url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')

// ---- small helpers that read the page the way a person would

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const cellText = (page: Page, rowId: string, col: string) =>
  page.evaluate((r, c) => document.querySelector(`[data-row="${r}"] [data-col="${c}"]`)?.textContent ?? null, rowId, col)

export const cellHasClass = (page: Page, rowId: string, col: string, cls: string) =>
  page.evaluate((r, c, k) => !!document.querySelector(`[data-row="${r}"] [data-col="${c}"]`)?.classList.contains(k), rowId, col, cls)

/** The first line of the status bar, such as "10,000 of 10,000 rows · 608 with errors". */
export const statusLine = (page: Page) => page.evaluate(() => document.querySelector('.status')?.textContent ?? '')

export async function dblclickCell(page: Page, rowId: string, col: string) {
  await page.evaluate(
    (r, c) => {
      const cell = document.querySelector(`[data-row="${r}"] [data-col="${c}"]`) as HTMLElement
      cell.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    },
    rowId,
    col,
  )
  await page.waitForSelector('.cell.editing input, .cell.editing select')
}

export async function clickButton(page: Page, scope: string, text: string) {
  await page.waitForFunction(
    (s, t) => [...document.querySelectorAll(s)].some((e) => e.textContent?.includes(t)),
    {},
    scope,
    text,
  )
  await page.evaluate((s, t) => ([...document.querySelectorAll(s)].find((e) => e.textContent?.includes(t)) as HTMLElement).click(), scope, text)
}

/** Waits until the data has been written to browser storage. */
export const waitUntilSaved = (page: Page) => page.waitForSelector('.dataset-btn .dot.saved', { timeout: 15_000 })

export const selectedCell = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector('.cell.sel') as HTMLElement | null
    return c ? `${(c.closest('.row') as HTMLElement).dataset.row}/${c.dataset.col}` : null
  })
