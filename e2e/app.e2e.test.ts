import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  accessibilityProblems,
  BASE,
  cellHasClass,
  cellText,
  clickButton,
  dblclickCell,
  scenario,
  selectedCell,
  sleep,
  startEnv,
  statusLine,
  stopEnv,
  waitUntilSaved,
  type Env,
} from './support/browser'

// The demo data is generated from a fixed seed, so these rows are always the same:
// ORD-000001 has Qty 4, ORD-000005 has no customer name, ORD-000002 has a unit price of 0, and 608 of 10,000 rows have an error.
let env: Env
beforeAll(async () => {
  env = await startEnv()
})
afterAll(async () => {
  if (env) await stopEnv(env)
})

describe('editing', () => {
  it('shows why a cell is wrong, and fixing it removes the error and can be undone', () =>
    scenario(env, 'fix-and-undo', async ({ page }) => {
      expect(await statusLine(page)).toContain('608 with errors')
      expect(await cellHasClass(page, 'ORD-000005', 'customer', 'bad')).toBe(true)

      await dblclickCell(page, 'ORD-000005', 'customer')
      expect(await page.$eval('.edit-tip', (e) => e.textContent)).toBe('Customer name is required')

      await page.keyboard.type('Ada Lovelace')
      await page.keyboard.press('Enter')
      await page.waitForFunction(() => document.querySelector('.status')?.textContent?.includes('607 with errors'))

      expect(await cellText(page, 'ORD-000005', 'customer')).toBe('Ada Lovelace')
      expect(await cellHasClass(page, 'ORD-000005', 'customer', 'bad')).toBe(false)
      expect(await cellHasClass(page, 'ORD-000005', 'customer', 'dirty')).toBe(true)
      // Enter moves down to the next row, as in a spreadsheet.
      expect(await selectedCell(page)).toBe('ORD-000006/customer')

      await page.keyboard.down('Control')
      await page.keyboard.press('z')
      await page.keyboard.up('Control')
      await page.waitForFunction(() => document.querySelector('.status')?.textContent?.includes('608 with errors'))
      expect(await cellHasClass(page, 'ORD-000005', 'customer', 'bad')).toBe(true)
      expect(await cellHasClass(page, 'ORD-000005', 'customer', 'dirty')).toBe(false)
    }))

  it('refuses an invalid value and keeps the original when cancelled', () =>
    scenario(env, 'invalid-value', async ({ page }) => {
      await dblclickCell(page, 'ORD-000001', 'qty')
      await page.keyboard.type('abc')
      expect(await page.$eval('.edit-tip', (e) => e.textContent)).toContain('whole number')

      await page.keyboard.press('Enter')
      await sleep(200)
      expect(await page.$('.cell.editing input')).not.toBeNull() // still open

      await page.keyboard.press('Escape')
      await page.waitForFunction(() => !document.querySelector('.cell.editing'))
      expect(await cellText(page, 'ORD-000001', 'qty')).toBe('4')
    }))

  it('keeps focus where the user clicked after leaving an invalid edit', () =>
    // Regression: closing an invalid editor used to pull focus back to the grid,
    // so text typed into the search box after clicking it went nowhere.
    scenario(env, 'focus-after-invalid-edit', async ({ page }) => {
      await dblclickCell(page, 'ORD-000001', 'rating')
      await page.keyboard.type('8') // a rating of 8 is not valid

      await page.type('input[aria-label="Search all text columns"]', 'kov')
      await page.waitForSelector('.chip')

      expect(await page.$eval('input[aria-label="Search all text columns"]', (e) => (e as HTMLInputElement).value)).toBe('kov')
      expect(await page.$eval('.chips', (e) => e.textContent)).toContain('kov')
      expect(await cellText(page, 'ORD-000001', 'rating')).toBeNull() // the row is filtered out
    }))

  it('moves with the keyboard and starts editing when typing', () =>
    scenario(env, 'keyboard', async ({ page }) => {
      await page.click('[data-row="ORD-000001"] [data-col="customer"]')
      expect(await selectedCell(page)).toBe('ORD-000001/customer')

      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowRight')
      expect(await selectedCell(page)).toBe('ORD-000002/country')

      await page.keyboard.press('End')
      expect(await selectedCell(page)).toBe('ORD-000002/rating')
      await page.keyboard.press('Home')
      expect(await selectedCell(page)).toBe('ORD-000002/id')

      for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight')
      expect(await selectedCell(page)).toBe('ORD-000002/qty')
      await page.keyboard.type('9') // typing replaces the cell and opens the editor
      await page.waitForSelector('.cell.editing input')
      await page.keyboard.press('Tab')
      await page.waitForFunction(() => !document.querySelector('.cell.editing'))
      expect(await cellText(page, 'ORD-000002', 'qty')).toBe('9')
      expect(await selectedCell(page)).toBe('ORD-000002/price')
    }))
})

describe('keeping your work', () => {
  it('brings edits back after a reload, and discarding them restores the original values', () =>
    scenario(env, 'edits-survive-reload', async ({ page, open }) => {
      await dblclickCell(page, 'ORD-000001', 'qty')
      await page.keyboard.type('77')
      await page.keyboard.press('Enter')
      await page.waitForFunction(() => document.querySelector('.status')?.textContent?.includes('1 edited'))
      await waitUntilSaved(page)

      const reloaded = await open()
      expect(await cellText(reloaded, 'ORD-000001', 'qty')).toBe('77')
      expect(await cellHasClass(reloaded, 'ORD-000001', 'qty', 'dirty')).toBe(true)
      expect(await statusLine(reloaded)).toContain('1 edited')

      await reloaded.click('.dataset-btn')
      await clickButton(reloaded, '.data-menu button', 'Discard all edits')
      await clickButton(reloaded, '.data-confirm button', 'Discard edits')
      await reloaded.waitForFunction(() => !document.querySelector('.status')?.textContent?.includes('edited'))
      expect(await cellText(reloaded, 'ORD-000001', 'qty')).toBe('4')

      const again = await open()
      expect(await cellText(again, 'ORD-000001', 'qty')).toBe('4')
    }))

  it('imports a CSV with a report of what is wrong, and keeps it after a reload', () =>
    scenario(env, 'import-report', async ({ page, open }) => {
      await clickButton(page, 'header button', 'Import CSV')
      await page.waitForSelector('dialog[open]')
      await clickButton(page, 'dialog button', '400 rows with errors')
      await page.waitForSelector('dialog .file-line')

      expect(await page.$eval('dialog .file-line', (e) => e.textContent)).toContain('sample-orders.csv')
      expect(await page.$eval('dialog .kpi.bad b', (e) => e.textContent)).toBe('27')
      const problems = await page.$$eval('dialog table.report tbody tr', (rows) => rows.map((r) => r.textContent ?? ''))
      expect(problems.length).toBeGreaterThan(0)
      expect(problems.join(' ')).toMatch(/valid email|required|YYYY-MM-DD/)

      await clickButton(page, 'dialog footer button', 'Import and review errors')
      await page.waitForFunction(() => !document.querySelector('dialog[open]'))
      await page.waitForFunction(() => document.querySelector('.status')?.textContent?.startsWith('27 of 400 rows'))
      expect(await page.$eval('.chips', (e) => e.textContent)).toContain('with errors')
      await waitUntilSaved(page)

      const reloaded = await open()
      expect(await reloaded.$eval('.dataset-btn', (e) => e.textContent)).toContain('sample-orders.csv')
      expect(await statusLine(reloaded)).toContain('400 rows')
    }))
})

describe('views and links', () => {
  it('applies a view, puts it in the URL, restores it from a link, and can be left without losing the filters', () =>
    scenario(env, 'views-and-url', async ({ page, open }) => {
      await clickButton(page, '.menu-root button', 'Views')
      await clickButton(page, '.menu-item', 'High-value paid orders')
      await page.waitForFunction(() => window.location.search.includes('f.status=Paid'))

      const query = new URL(page.url()).search
      expect(query).toContain('sort=-total')
      expect(query).toContain('hide=email')

      // A link carries the same screen.
      const fromLink = await open(query)
      const chips = await fromLink.$eval('.chips', (e) => e.textContent ?? '')
      expect(chips).toContain('Paid')
      expect(chips).toContain('2000')
      const headers = await fromLink.$$eval('.hrow .hcell .lbl', (els) => els.map((e) => e.textContent))
      expect(headers).not.toContain('Email')

      // Leaving the view on the first tab keeps what is on screen.
      await page.bringToFront() // a background tab gets no animation frames, and clicks wait for one
      await page.click('.btn-group .leave')
      await page.waitForFunction(() => !document.querySelector('.btn-group .leave'))
      expect(await page.$eval('.btn-group .btn', (e) => e.textContent?.trim())).toBe('Views')
      expect(await page.$eval('.chips', (e) => e.textContent ?? '')).toContain('Paid')
    }))

  it('loads from a subfolder URL with every file and the import worker', () =>
    scenario(env, 'subfolder', async ({ page }) => {
      expect(page.url().startsWith(BASE)).toBe(true)
      // Fonts are bundled: they load from the app's own files, and any request to another site fails the scenario.
      await page.evaluate(() => document.fonts.ready)
      expect(await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family))).toContain('IBM Plex Sans')
      await clickButton(page, 'header button', 'Import CSV')
      await page.waitForSelector('dialog[open]')
      await clickButton(page, 'dialog button', '400 rows with errors')
      await page.waitForSelector('dialog .file-line') // the report comes from a Web Worker file
    }))
})

describe('many rows', () => {
  it('draws only the rows in view, however many there are', () =>
    scenario(
      env,
      'virtualization',
      async ({ page }) => {
        expect(await statusLine(page)).toContain('20,000 of 20,000 rows')
        const drawn = await page.$$eval('.scroller .row', (rows) => rows.length)
        expect(drawn).toBeGreaterThan(5)
        expect(drawn).toBeLessThan(60)

        await page.$eval('.scroller', (el) => (el.scrollTop = el.scrollHeight))
        await page.waitForFunction(() => Number(document.querySelector('.scroller .row:last-child .cell.idx')?.textContent) > 19_900)
        expect(await page.$$eval('.scroller .row', (rows) => rows.length)).toBeLessThan(60)
      },
      '?rows=20000',
    ))
})

describe('accessibility', () => {
  it('has no axe violations in the main screens, in the dark and the light theme', () =>
    scenario(env, 'accessibility', async ({ page }) => {
      for (const scheme of ['dark', 'light'] as const) {
        await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }])
        const found: Record<string, string[]> = {}

        found[`grid (${scheme})`] = await accessibilityProblems(page)

        await clickButton(page, '.menu-root button', 'Views')
        found[`views menu (${scheme})`] = await accessibilityProblems(page)
        await clickButton(page, '.menu-root button', 'Views') // close it

        await clickButton(page, '.menu-root button', 'Columns')
        found[`columns menu (${scheme})`] = await accessibilityProblems(page)
        await page.keyboard.press('Escape')

        await dblclickCell(page, 'ORD-000001', 'rating')
        await page.keyboard.type('9') // an invalid value shows the error tip
        found[`editor with an error (${scheme})`] = await accessibilityProblems(page)
        await page.keyboard.press('Escape')

        await clickButton(page, 'header button', 'Import CSV')
        await page.waitForSelector('dialog[open]')
        await clickButton(page, 'dialog button', '400 rows with errors')
        await page.waitForSelector('dialog .file-line')
        found[`import report (${scheme})`] = await accessibilityProblems(page)
        await page.keyboard.press('Escape')
        await page.waitForFunction(() => !document.querySelector('dialog[open]'))

        const problems = Object.entries(found).flatMap(([where, list]) => list.map((p) => `${where}: ${p}`))
        expect(problems).toEqual([])
      }
    }))
})
