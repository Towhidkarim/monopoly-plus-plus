/**
 * The game cursor: small code-drawn SVG cursors (no binary assets), in the Lamplight palette.
 * `applyCursorPref` publishes them as CSS custom properties (`--cur-default`, `--cur-pointer`,
 * `--cur-grab`, `--cur-grabbing`); with the system choice the properties are plain keywords.
 */

export type CursorPref = 'game' | 'system'

export interface CursorSet {
  default: string
  pointer: string
  grab: string
  grabbing: string
}

export const SYSTEM_CURSORS: CursorSet = {
  default: 'default',
  pointer: 'pointer',
  grab: 'grab',
  grabbing: 'grabbing',
}

const INK = '#1f2a3d'
const CREAM = '#fbf8f1'
const GOLD = '#f5b54a'
const GOLD_INK = '#3a2606'

/** Arrow outline in a 20 x 26 box; the tip is at (3, 2). */
const ARROW = 'M3 2 L3 21 L7.6 16.8 L10.9 24 L14.2 22.5 L10.9 15.6 L17.2 15.4 Z'

const arrow = (fill: string, stroke: string, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="26" viewBox="0 0 20 26">` +
  `<path d="${ARROW}" transform="translate(0 1.2)" fill="#000" fill-opacity=".28" stroke="#000" stroke-opacity=".28" stroke-width="1.5" stroke-linejoin="round"/>` +
  `<path d="${ARROW}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/>${extra}</svg>`

const hand = (shapes: string, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">` +
  `<g fill="#000" fill-opacity=".25" transform="translate(0 1)">${shapes}</g>` +
  `<g fill="${INK}" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round">${shapes}</g>` +
  `<g fill="${CREAM}">${shapes}</g>${extra}</svg>`

const OPEN_HAND =
  '<rect x="7" y="5" width="3.2" height="11" rx="1.6"/><rect x="10.8" y="3" width="3.2" height="13" rx="1.6"/>' +
  '<rect x="14.6" y="3.8" width="3.2" height="12" rx="1.6"/><rect x="18.4" y="6" width="3.2" height="10" rx="1.6"/>' +
  '<rect x="7" y="11" width="14.6" height="12" rx="5"/><rect x="3.6" y="12" width="3.6" height="9" rx="1.8" transform="rotate(-25 5.4 16.5)"/>'

const FIST =
  '<rect x="6" y="10" width="16" height="12" rx="5"/><circle cx="9.2" cy="11" r="2.8"/><circle cx="12.9" cy="10.2" r="2.8"/>' +
  '<circle cx="16.6" cy="10.2" r="2.8"/><circle cx="20" cy="11.4" r="2.6"/><rect x="5" y="15" width="8.5" height="5" rx="2.5"/>'

const FIST_LINES = `<path d="M11 11.6 V14.4 M14.8 11.2 V14.2 M18.3 12 V14.6" stroke="${INK}" stroke-opacity=".55" stroke-width="1.1" stroke-linecap="round" fill="none"/>`

const uri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`

/** Same drawing at twice the size, for HiDPI screens. */
function at2x(svg: string): string {
  return svg.replace(
    /width="(\d+)" height="(\d+)"/,
    (_, w: string, h: string) => `width="${+w * 2}" height="${+h * 2}"`,
  )
}

interface Art {
  svg: string
  x: number
  y: number
  keyword: string
}

const ART: Record<keyof CursorSet, Art> = {
  default: { svg: arrow(CREAM, INK), x: 3, y: 2, keyword: 'default' },
  pointer: {
    svg: arrow(
      GOLD,
      GOLD_INK,
      `<path d="M5.6 6.2 V14.4" stroke="${CREAM}" stroke-opacity=".85" stroke-width="1.2" stroke-linecap="round" fill="none"/>`,
    ),
    x: 3,
    y: 2,
    keyword: 'pointer',
  },
  grab: { svg: hand(OPEN_HAND), x: 14, y: 14, keyword: 'grab' },
  grabbing: { svg: hand(FIST, FIST_LINES), x: 14, y: 14, keyword: 'grabbing' },
}

/** One CSS cursor value: a 2x `image-set()` (or a plain 1x `url()`), then the keyword fallback. */
export function cursorValue(name: keyof CursorSet, hiDpi = true): string {
  const a = ART[name]
  const one = `url("${uri(a.svg)}")`
  const image = hiDpi ? `image-set(${one} 1x, url("${uri(at2x(a.svg))}") 2x)` : one
  return `${image} ${a.x} ${a.y}, ${a.keyword}`
}

/** Whether this browser accepts `image-set()` inside a `cursor` value. */
function supportsImageSet(): boolean {
  return typeof CSS !== 'undefined' && CSS.supports('cursor', 'image-set(url("data:,") 1x) 0 0, pointer')
}

/** The four cursor values for a preference, ready to use as CSS `cursor` values. */
export function cursorSet(pref: CursorPref, hiDpi = supportsImageSet()): CursorSet {
  if (pref === 'system') return SYSTEM_CURSORS
  return {
    default: cursorValue('default', hiDpi),
    pointer: cursorValue('pointer', hiDpi),
    grab: cursorValue('grab', hiDpi),
    grabbing: cursorValue('grabbing', hiDpi),
  }
}

/** The set matching the current `html[data-cursor]` (for things mounted after the preference was applied). */
export function currentCursorSet(): CursorSet {
  return cursorSet(document.documentElement.dataset.cursor === 'system' ? 'system' : 'game')
}

const STYLE_ID = 'skyline-cursors'

/** Sets `html[data-cursor]` and the `--cur-*` variables (system keywords unless the game cursor is on). */
export function applyCursorPref(pref: CursorPref): CursorSet {
  const set = cursorSet(pref)
  const root = document.documentElement
  root.dataset.cursor = pref
  let style = document.getElementById(STYLE_ID)
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  const vars = (s: CursorSet) =>
    `--cur-default:${s.default};--cur-pointer:${s.pointer};--cur-grab:${s.grab};--cur-grabbing:${s.grabbing};`
  style.textContent = `:root{${vars(SYSTEM_CURSORS)}}html[data-cursor="game"]{${vars(set)}}`
  return set
}
