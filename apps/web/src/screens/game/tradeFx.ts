import { useSyncExternalStore } from 'react'
import { flyToChip } from './finale.ts'

/** Motion helpers for the trade table and the incoming-offer panel. */

/** Where the trade table switches from stacked mats and small cards to the full felt layout. */
const WIDE = '(min-width: 1180px)'

const subscribeWide = (cb: () => void) => {
  const m = window.matchMedia(WIDE)
  m.addEventListener('change', cb)
  return () => m.removeEventListener('change', cb)
}

/** Whether the window is wide enough for full-size cards on the mats. */
export const useWide = (): boolean =>
  useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => true,
  )

/** Scale of the compact cards in a hand (the mockup scales its 140px cards to 112px). */
export const HAND_SCALE = 0.8

/** A tiny, stable tilt per card so a pile on the felt looks dealt by hand (never exactly 0). */
export function tiltOf(space: number): number {
  return [-4, 3, -2.5, 4, -3, 2.5, -1.5, 3.5][space % 8]!
}

/**
 * Slides `el` from where `from` was to where it sits now, with a tiny overshoot and settle.
 * Transform only, no fill: when it ends the element is simply at rest. `fromScale` is how big the
 * element was at `from` relative to now.
 */
export function slideFrom(el: HTMLElement, from: DOMRect, fromScale: number): void {
  const to = el.getBoundingClientRect()
  const dx = from.left + from.width / 2 - (to.left + to.width / 2)
  const dy = from.top + from.height / 2 - (to.top + to.height / 2)
  el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${fromScale})` },
      { transform: 'translate(0, 0) scale(1.05)', offset: 0.72 },
      { transform: 'none' },
    ],
    { duration: 340, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
  )
}

/** A card dropped from just above (when it has no hand position to come from). */
export function dropIn(el: HTMLElement): void {
  el.animate(
    [
      { transform: 'translateY(-26px) scale(1.08)', opacity: 0 },
      { transform: 'translateY(2px) scale(1.02)', opacity: 1, offset: 0.7 },
      { transform: 'none', opacity: 1 },
    ],
    { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
  )
}

/**
 * A copy of `el` on a fixed layer above everything, exactly where `el` is, and `el` hidden. The
 * copy can fly out of a clipped panel (modals clip their content). Call the returned `remove`
 * when it is done.
 */
export function ghostOf(el: HTMLElement): { ghost: HTMLElement; remove: () => void } {
  const r = el.getBoundingClientRect()
  const w = el.offsetWidth
  const h = el.offsetHeight
  const copy = el.cloneNode(true)
  const ghost = copy instanceof HTMLElement ? copy : el
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${r.left + r.width / 2 - w / 2}px`,
    top: `${r.top + r.height / 2 - h / 2}px`,
    width: `${w}px`,
    height: `${h}px`,
    margin: '0',
    zIndex: '60',
    pointerEvents: 'none',
    translate: 'none',
    scale: 'none',
  })
  ghost.setAttribute('aria-hidden', 'true')
  ghost.removeAttribute('title')
  document.body.append(ghost)
  el.style.visibility = 'hidden'
  return { ghost, remove: () => ghost.remove() }
}

export interface DealPiece {
  el: HTMLElement | null
  /** Player id whose top-bar chip it flies to. */
  to: string
}

/**
 * The end of a done deal: every piece flies (as a copy) to its new owner's chip, one after the
 * other, and `done` runs once when the last one has landed. Returns a cancel that calls nothing.
 */
export function flyDeal(pieces: readonly DealPiece[], reduced: boolean, done: () => void): () => void {
  const live = pieces.filter((p): p is DealPiece & { el: HTMLElement } => p.el !== null)
  if (live.length === 0) {
    done()
    return () => {}
  }
  let left = live.length
  let cancelled = false
  const timers: number[] = []
  const stops: (() => void)[] = []
  live.forEach((p, i) => {
    const { ghost, remove } = ghostOf(p.el)
    timers.push(
      window.setTimeout(
        () => {
          if (cancelled) return
          stops.push(
            flyToChip(ghost, p.to, reduced, () => {
              remove()
              if (--left === 0 && !cancelled) done()
            }),
          )
        },
        reduced ? 0 : i * 70,
      ),
    )
    stops.push(remove)
  })
  return () => {
    cancelled = true
    for (const t of timers) window.clearTimeout(t)
    for (const s of stops) s()
  }
}
