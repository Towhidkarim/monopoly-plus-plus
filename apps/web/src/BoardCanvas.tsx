import { useEffect, useRef, useState, type ReactNode } from 'react'
import { mountBoard, type BoardHandle } from '@skyline/board'
import { currentCursorSet } from './cursors.ts'
import { TileTooltip } from './TileTooltip.tsx'

interface Props {
  onReady: (handle: BoardHandle | null) => void
  /** Seed of the city in the middle of the board. */
  citySeed?: number
  /** Custom tooltip content for a hovered tile. */
  renderTooltip?: (index: number) => ReactNode
  children?: ReactNode
}

/** Hosts the Pixi board. React owns only the container; Pixi owns everything inside it. */
export function BoardCanvas({ onReady, citySeed, renderTooltip, children }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  // A finger has no hover: after a touch the tooltip stays away (a tap opens the tile instead).
  const [touch, setTouch] = useState(false)

  useEffect(() => {
    const host = hostRef.current! // effects run after the ref is attached
    let handle: BoardHandle | undefined
    let cancelled = false
    // init is async; if we unmount first (StrictMode does this in dev), destroy once it resolves.
    void mountBoard(host, { citySeed, cursors: currentCursorSet() }).then((h) => {
      if (cancelled) {
        h.destroy()
        return
      }
      handle = h
      h.board.setListeners({
        hover: setHovered,
        // Per-frame position goes straight to the DOM, never through React state.
        hoverPosition: (x, y) => {
          const el = tooltipRef.current
          if (el) el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
        },
      })
      onReady(h)
    })
    return () => {
      cancelled = true
      onReady(null)
      handle?.destroy()
    }
  }, [onReady, citySeed])

  // Canvas is absolutely positioned so it never feeds back into the host's size (resizeTo loop).
  return (
    <div
      className="relative min-w-0 flex-1 overflow-hidden select-none"
      onPointerDownCapture={(e) => setTouch(e.pointerType === 'touch')}
    >
      <div
        ref={hostRef}
        className="absolute inset-0 cursor-(--cur-grab) touch-none [&>canvas]:absolute [&>canvas]:inset-0"
      />
      <div ref={tooltipRef} className="pointer-events-none absolute top-0 left-0 z-10 will-change-transform">
        {hovered !== null &&
          !touch &&
          (renderTooltip ? renderTooltip(hovered) : <TileTooltip index={hovered} />)}
      </div>
      {children}
    </div>
  )
}
