import { useEffect, useRef, useState } from 'react'
import { loadPrefs } from '../game/prefs.ts'
import { mountBoard, type BoardHandle } from '@skyline/board'

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The bare board with the city the next game will use, behind the setup panel.
 * One Pixi app, mounted after first paint; a new seed rebuilds the city in place (no remount).
 */
const WIDE = '(min-width: 1024px)' // Tailwind lg

/** Reports whether the left-column layout is active. */
function useWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches)
  useEffect(() => {
    const mq = window.matchMedia(WIDE)
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

export function SetupBackdrop({ citySeed, panelWidth }: { citySeed: number; panelWidth: number }) {
  const wide = useWide()
  const hostRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [handle, setHandle] = useState<BoardHandle | null>(null)
  const seedRef = useRef(citySeed)

  useEffect(() => {
    const host = hostRef.current! // effects run after the ref is attached
    let mounted: BoardHandle | undefined
    let cancelled = false
    // init is async; if we unmount first (StrictMode, or Start pressed), destroy once it resolves.
    void mountBoard(host, { citySeed: seedRef.current }).then((h) => {
      if (cancelled) {
        h.destroy()
        return
      }
      mounted = h
      h.app.ticker.maxFPS = 30 // static scene: half the frames are plenty
      h.board.setTuning({ reducedMotion: reducedMotion(), ambient: loadPrefs().cityLife ?? true })
      setHandle(h)
    })
    return () => {
      cancelled = true
      setHandle(null)
      mounted?.destroy()
    }
  }, [])

  // On wide screens the panel owns the left column; frame the board in the free area to its right.
  useEffect(() => {
    handle?.board.setInsets({ top: 0, right: 0, bottom: 0, left: wide ? panelWidth : 0 })
  }, [handle, wide, panelWidth])

  const shown = useRef(citySeed)
  useEffect(() => {
    seedRef.current = citySeed
    if (!handle || shown.current === citySeed) return
    shown.current = citySeed
    handle.board.setCitySeed(citySeed)
    if (!reducedMotion()) {
      popRef.current?.animate(
        [
          { opacity: 0.55, transform: 'scale(0.97)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
        { duration: 380, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
      )
    }
  }, [citySeed, handle])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden="true">
      <div ref={popRef} className="absolute inset-0">
        <div ref={hostRef} className="absolute inset-0 [&>canvas]:absolute [&>canvas]:inset-0" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-table/70 via-table/55 to-table/85 lg:bg-none" />
      <div className="absolute inset-0 hidden bg-table/25 lg:block" />
    </div>
  )
}
