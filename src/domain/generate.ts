import { CATEGORIES, COUNTRIES, STATUSES, type Order } from './schema'

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FIRST = ['Anna', 'Bence', 'Clara', 'Daniel', 'Emma', 'Felix', 'Gabor', 'Hana', 'Ivan', 'Julia', 'Kenji', 'Lena', 'Marco', 'Nora', 'Oscar', 'Petra', 'Quinn', 'Reka', 'Sofia', 'Tamas']
const LAST = ['Kovacs', 'Nagy', 'Muller', 'Dubois', 'Rossi', 'Smith', 'Tanaka', 'Silva', 'Novak', 'Horvath', 'Garcia', 'Kim', 'Weber', 'Lopez', 'Szabo', 'Martin', 'Brown', 'Costa', 'Kiss', 'Nowak']
const DOMAINS = ['acme.io', 'northwind.com', 'globex.eu', 'initech.co', 'umbrella.net', 'hooli.dev']
const BASE_PRICE: Record<string, number> = { Hardware: 240, Software: 90, Services: 160, Accessories: 25, Subscriptions: 40 }

/**
 * Deterministic demo data. About 6% of rows carry one deliberately bad value
 * (malformed email, missing name, negative quantity, unknown status, ...), so
 * the validation and error-review features always have something to show.
 */
export function generateOrders(count: number, seed = 42): Order[] {
  const rnd = mulberry32(seed)
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T
  const start = Date.UTC(2023, 0, 1)
  const span = Date.UTC(2025, 5, 30) - start
  const rows: Order[] = new Array(count)

  for (let i = 0; i < count; i++) {
    const first = pick(FIRST)
    const last = pick(LAST)
    const category = pick(CATEGORIES)
    const row: Order = {
      id: `ORD-${String(i + 1).padStart(6, '0')}`,
      customer: `${first} ${last}`,
      email: `${first}.${last}@${pick(DOMAINS)}`.toLowerCase(),
      country: pick(COUNTRIES),
      status: pick(STATUSES),
      category,
      qty: 1 + Math.floor(rnd() * rnd() * 20),
      price: Math.round((BASE_PRICE[category] ?? 50) * (0.6 + rnd() * 1.6) * 100) / 100,
      created: new Date(start + rnd() * span).toISOString().slice(0, 10),
      rating: Math.min(5, 1 + Math.floor(rnd() * 5.4)),
    }
    const x = rnd()
    if (x < 0.012) row.email = row.email.replace('@', ' at ')
    else if (x < 0.02) row.customer = ''
    else if (x < 0.03) row.qty = rnd() < 0.5 ? -1 - Math.floor(rnd() * 5) : 'n/a'
    else if (x < 0.036) row.price = rnd() < 0.5 ? 0 : 'abc'
    else if (x < 0.046) row.created = rnd() < 0.5 ? '2024-13-45' : '31/12/2024'
    else if (x < 0.052) row.rating = rnd() < 0.5 ? 9 : 0
    else if (x < 0.058) row.status = 'Unknown'
    rows[i] = row
  }
  return rows
}
