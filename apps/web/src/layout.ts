import { useSyncExternalStore } from 'react'

/**
 * Shell layouts (D64). `compact` is the phone layout: a narrow screen, or a short one (a phone
 * held sideways). Everything else keeps the desktop layout.
 */
export const COMPACT_QUERY = '(max-width: 767px), (max-height: 499px)'
const LANDSCAPE_QUERY = '(orientation: landscape)'

export interface Layout {
  compact: boolean
  /** Wider than tall (with `compact`: a phone held sideways). */
  landscape: boolean
}

const WIDE: Layout = { compact: false, landscape: true }
let cached: Layout = WIDE

function read(): Layout {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return WIDE
  const compact = window.matchMedia(COMPACT_QUERY).matches
  const landscape = window.matchMedia(LANDSCAPE_QUERY).matches
  // Same object while nothing changed, so useSyncExternalStore does not re-render.
  if (compact !== cached.compact || landscape !== cached.landscape) cached = { compact, landscape }
  return cached
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const queries = [COMPACT_QUERY, LANDSCAPE_QUERY].map((q) => window.matchMedia(q))
  for (const m of queries) m.addEventListener('change', onChange)
  return () => {
    for (const m of queries) m.removeEventListener('change', onChange)
  }
}

export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, read, () => WIDE)
}

interface Span {
  top: number
  bottom: number
}

/**
 * Board insets from the shell's measured chrome: the lowest edge of the top bars and the highest
 * edge of the bottom bars, relative to the canvas. Bars outside the canvas or empty are ignored.
 */
export function insetsFrom(
  canvas: Span,
  tops: readonly Span[],
  bottoms: readonly Span[],
): { top: number; right: number; bottom: number; left: number } {
  const height = canvas.bottom - canvas.top
  const visible = (r: Span) => r.bottom > r.top && r.bottom > canvas.top && r.top < canvas.bottom
  let top = 0
  for (const r of tops) if (visible(r)) top = Math.max(top, r.bottom - canvas.top)
  let bottom = 0
  for (const r of bottoms) if (visible(r)) bottom = Math.max(bottom, canvas.bottom - r.top)
  const clamp = (v: number) => Math.round(Math.min(Math.max(v, 0), height))
  return { top: clamp(top), right: 0, bottom: clamp(bottom), left: 0 }
}
