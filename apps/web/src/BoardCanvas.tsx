import { useEffect, useRef } from 'react'
import { mountBoard, type BoardHandle } from '@skyline/board'

/** Hosts the Pixi board. React owns only the container; Pixi owns everything inside it. */
export function BoardCanvas() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current! // effects run after the ref is attached
    let handle: BoardHandle | undefined
    let cancelled = false
    // init is async; if we unmount first (StrictMode does this in dev), destroy once it resolves.
    void mountBoard(host).then((h) => {
      if (cancelled) h.destroy()
      else handle = h
    })
    return () => {
      cancelled = true
      handle?.destroy()
    }
  }, [])

  // Canvas is absolutely positioned so it never feeds back into the host's size (resizeTo loop).
  return (
    <div
      ref={hostRef}
      className="relative min-w-0 flex-1 overflow-hidden [&>canvas]:absolute [&>canvas]:inset-0"
    />
  )
}
