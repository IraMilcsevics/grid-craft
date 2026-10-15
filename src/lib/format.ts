/** A whole number with thousands separators. */
export const fmt = (n: number) => n.toLocaleString('en-US')

/** Milliseconds with one decimal below 10, whole numbers above. */
export const ms = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toString())
