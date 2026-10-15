/**
 * Checks the text colors in src/styles/tokens.css against the surfaces they are drawn on, for both themes,
 * and fails when text is under WCAG AA (4.5:1) or graphics under 3:1. Run with `npm run contrast`.
 */
import { readFileSync } from 'node:fs'

const css = readFileSync('src/styles/tokens.css', 'utf8')

/** Reads `--name: value;` declarations out of one block. */
const declarations = (block) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
const darkBlock = css.slice(css.indexOf(':root {'), css.indexOf('@media'))
const lightBlock = css.slice(css.indexOf('@media'))
const dark = declarations(darkBlock)
const light = { ...dark, ...declarations(lightBlock) }

function parse(value, under) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16))
  const rgba = /^rgba\(([^)]+)\)$/.exec(value)
  if (rgba) {
    const [r, g, b, a] = rgba[1].split(',').map(Number)
    return [r, g, b].map((c, i) => Math.round(c * a + under[i] * (1 - a)))
  }
  throw new Error(`Cannot read color: ${value}`)
}
const lum = ([r, g, b]) => {
  const c = [r, g, b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// [color token, surfaces it appears on, minimum ratio]
// Text needs 4.5:1. Colors that only paint dots and borders (status, saved) are graphics and need 3:1.
// `faint` is never drawn on the selected-cell background, so that pair is not checked.
const TEXT = 4.5
const GRAPHIC = 3
const PAIRS = [
  ['fg', ['bg', 'panel', 'raised', 'sel'], TEXT],
  ['muted', ['bg', 'panel', 'raised', 'sel'], TEXT],
  ['faint', ['bg', 'panel', 'raised'], TEXT],
  ['accent', ['bg', 'panel', 'raised'], TEXT],
  ['err', ['bg', 'panel', 'err-soft'], TEXT],
  ['ok', ['bg', 'panel'], GRAPHIC],
  ['s-paid', ['panel'], GRAPHIC],
  ['s-pending', ['panel'], GRAPHIC],
  ['s-shipped', ['panel'], GRAPHIC],
  ['s-refunded', ['panel'], GRAPHIC],
  ['s-cancelled', ['panel'], GRAPHIC],
]

let failed = 0
for (const [name, theme] of [['dark', dark], ['light', light]]) {
  console.log(`\n${name} theme`)
  for (const [text, surfaces, min] of PAIRS) {
    const out = surfaces.map((s) => {
      const bg = parse(theme[s], parse(theme.panel))
      const fg = parse(theme[text], bg)
      const r = ratio(fg, bg)
      if (r < min) failed++
      return `${s} ${r.toFixed(1)}${r < min ? ' FAIL' : ''}`
    })
    console.log(`  ${text.padEnd(12)} ${out.join('   ')}`)
  }
}
console.log(failed ? `\n${failed} pair(s) below their minimum` : '\nAll pairs meet their minimum')
process.exit(failed ? 1 : 0)
