import { useCallback, useEffect, useRef, useState } from 'react'

/** A short message shown at the bottom of the screen for a moment. */
export function useNotice() {
  const [notice, setNotice] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const notify = useCallback((message: string) => {
    setNotice(message)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setNotice(null), 2600)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])

  return { notice, notify }
}
