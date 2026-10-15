import { emptyView, sanitizeView, type ViewState } from './view'

export interface Preset {
  id: string
  name: string
  description: string
  view: ViewState
}

const make = (patch: Partial<ViewState>): ViewState => sanitizeView({ ...emptyView(), ...patch })

/** Built-in starting points. They are read-only and always available. */
export const PRESETS: Preset[] = [
  {
    id: 'preset:attention',
    name: 'Needs attention',
    description: 'Rows with validation errors, newest first',
    view: make({ errorsOnly: true, sorting: [{ id: 'created', desc: true }] }),
  },
  {
    id: 'preset:high-value',
    name: 'High-value paid orders',
    description: 'Paid orders with a total of 2,000 or more',
    view: make({ filters: { status: 'Paid', total: '>= 2000' }, sorting: [{ id: 'total', desc: true }], hidden: ['email'] }),
  },
  {
    id: 'preset:pending-hu',
    name: 'Pending in Hungary',
    description: 'Open orders from Hungary, newest first',
    view: make({ filters: { country: 'Hungary', status: 'Pending' }, sorting: [{ id: 'created', desc: true }] }),
  },
]
