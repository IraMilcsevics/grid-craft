import { DataMenu, type DataMenuProps } from './DataMenu'

export type DialogName = 'import' | 'export' | 'benchmark'

interface AppHeaderProps {
  dataset: DataMenuProps
  onOpen: (dialog: DialogName) => void
}

/** The top bar: the app name, what data is loaded, and the actions that open a dialog. */
export function AppHeader({ dataset, onOpen }: AppHeaderProps) {
  return (
    <header className="top">
      <h1 className="logo">
        <i>
          {Array.from({ length: 9 }, (_, i) => (
            <b key={i} />
          ))}
        </i>
        GridCraft
      </h1>
      <DataMenu {...dataset} />
      <div className="spacer" />
      <button className="btn" onClick={() => onOpen('benchmark')}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z" />
        </svg>
        Benchmark
      </button>
      <button className="btn" onClick={() => onOpen('import')}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 11V2.5M4.5 6 8 2.5 11.5 6M2.5 10.5v3h11v-3" />
        </svg>
        Import CSV
      </button>
      <button className="btn" onClick={() => onOpen('export')}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 2.5V11M4.5 7.5 8 11l3.5-3.5M2.5 10.5v3h11v-3" />
        </svg>
        Export CSV
      </button>
    </header>
  )
}
