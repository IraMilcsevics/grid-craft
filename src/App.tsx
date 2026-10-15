import { useEffect, useState } from 'react'
import { GridScreen } from './components/GridScreen'
import { bootSession, type Session } from './lib/bootSession'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    let cancelled = false
    void bootSession(window.location.search).then((s) => {
      if (cancelled) return
      performance.mark('gridcraft:data-ready')
      setSession(s)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="app">
      {session ? (
        <GridScreen session={session} />
      ) : (
        <div className="boot" role="status">
          Loading your data…
        </div>
      )}
    </div>
  )
}
