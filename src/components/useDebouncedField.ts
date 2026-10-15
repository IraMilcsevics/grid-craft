import { useEffect, useRef, useState } from 'react'

/**
 * Local text state for an input whose committed value lives elsewhere (table state).
 * Typing updates the input immediately and commits after `delay` ms; changes to the
 * committed value from outside (chip removed, Clear all) flow back into the input.
 */
export function useDebouncedField(committed: string, commit: (value: string) => void, delay = 140) {
  const [local, setLocal] = useState(committed)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const commitRef = useRef(commit)
  commitRef.current = commit

  useEffect(() => setLocal(committed), [committed])
  useEffect(() => () => clearTimeout(timer.current), [])

  const onChange = (value: string) => {
    setLocal(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => commitRef.current(value), delay)
  }
  return [local, onChange] as const
}
