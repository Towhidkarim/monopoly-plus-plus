import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react'
import { useLayout } from '../../layout.ts'

/** What stays on screen of a peeking sheet: the handle and the top of its header. */
const PEEK = 76
/** Browse sheets taller than this share of the screen open at half height (`HALF`) and grow on a swipe up. */
const TALL = 0.7
/** How much of the screen a half-height sheet covers. */
const HALF = 0.56
/** A finger moves this far (px) before the gesture is a drag rather than a tap. */
const SLOP = 6
/** A release keeps travelling this long (ms) at its speed, so a flick reaches the next level. */
const FLING_MS = 180
/** Faster than this (px per ms) a release is a flick: at most one level on, however hard. */
const FLICK_SPEED = 0.4

type Level = 'full' | 'half' | 'peek'

/** Where each level puts the sheet, as a CSS transform (the sheet's own height is the 100%). */
const LEVEL_TRANSFORM: Record<Level, string> = {
  full: '',
  half: `translateY(max(0px, calc(100% - ${HALF * 100}dvh)))`,
  peek: `translateY(calc(100% - ${PEEK}px))`,
}

/**
 * The outer frame of a game panel (D64). On desktop it is exactly the wrapper the panel always
 * had (`className`). On phones it becomes a bottom sheet: it slides up above the home bar, scrolls
 * inside, and restyles the panel it holds (`[&>*]` below) into the sheet's body.
 *
 * The whole sheet follows a finger like an app's drawer: it settles on the nearest level and a flick
 * goes one further. Inside the scrolling body a swipe scrolls, until the body is back at its top.
 *
 * - `decision` sheets (buy, auction, debt, offer, card) cannot be closed: a swipe down or a tap on
 *   the handle tucks them into a peek bar so the board can be seen, a swipe up or a tap brings them back.
 * - `browse` sheets (log, My city, a player): tall ones open at half height and grow on a swipe up;
 *   a swipe down past the lowest level, a handle tap at full height or a tap on the dim closes them.
 *
 * Per-frame drag offsets go straight to the element's transform, never through React state.
 */
export function Sheet({
  kind = 'decision',
  className = '',
  onClose,
  above,
  overlay,
  dimRef,
  as: Tag = 'div',
  ref,
  children,
  ...rest
}: {
  kind?: 'decision' | 'browse'
  /** The desktop wrapper classes (unchanged on desktop, unused on phones). */
  className?: string
  /** Browse sheets: called on a drag down, a handle tap or a tap on the dim. */
  onClose?: () => void
  /** Phones: what rides on the sheet's top edge (a deed card), beside it when held sideways. Not used on desktop. */
  above?: ReactNode
  /** Phones: full-screen pieces over the sheet, positioned against the root (flying ghosts). Not used on desktop. */
  overlay?: ReactNode
  /** Phones: the sheet's dim, for panels that animate their own (desktop panels keep theirs). */
  dimRef?: Ref<HTMLDivElement>
  as?: 'div' | 'section' | 'aside'
  ref?: Ref<HTMLElement>
  children: ReactNode
} & HTMLAttributes<HTMLElement>) {
  const { compact, landscape } = useLayout()
  const [level, setLevel] = useState<Level>('full')
  const peek = level === 'peek'
  const sheetRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  /** Set while the click that ends a drag arrives, so it is not taken for a tap. */
  const dragged = useRef(false)
  const live = useRef({ level, kind, onClose })
  useLayoutEffect(() => {
    live.current = { level, kind, onClose }
  })

  // Tall browse sheets open at half height (measured once the sheet is laid out).
  useLayoutEffect(() => {
    const el = sheetRef.current
    if (compact && el && kind === 'browse' && el.offsetHeight > globalThis.innerHeight * TALL)
      setLevel('half')
  }, [compact, kind])

  // Native touch listeners, so a swipe can be taken over from the scrolling body (passive: false).
  useEffect(() => {
    const el = sheetRef.current
    if (!compact || !el) return
    return dragSheet(el, bodyRef, live, (next) => {
      dragged.current = true
      setTimeout(() => (dragged.current = false), 0)
      if (next === 'closed') live.current.onClose?.()
      else setLevel(next)
    })
  }, [compact])

  if (!compact)
    return (
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- div, section and aside all take an HTMLElement ref
      <Tag ref={ref as Ref<HTMLDivElement>} {...rest} className={className}>
        {children}
      </Tag>
    )

  const toggle = () => {
    if (dragged.current) return
    if (kind === 'decision') setLevel((v) => (v === 'peek' ? 'full' : 'peek'))
    else if (level === 'half') setLevel('full')
    else onClose?.()
  }

  return (
    <Tag
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- div, section and aside all take an HTMLElement ref
      ref={ref as Ref<HTMLDivElement>}
      {...rest}
      className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-end"
    >
      {/* The dim: a decision dims lightly (the board stays readable); a peeking sheet does not. */}
      {!peek && (
        <div
          ref={dimRef}
          aria-hidden="true"
          onClick={kind === 'browse' ? onClose : () => setLevel('peek')}
          className="pointer-events-auto absolute inset-0 animate-fade bg-table/45"
        />
      )}
      <div
        ref={sheetRef}
        className={`pointer-events-auto relative flex max-h-[88dvh] w-full animate-sheet ${landscape ? 'mx-auto max-w-lg' : ''} flex-col rounded-t-[26px] border-t border-line bg-panel pb-safe shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_-18px_40px_rgba(2,6,16,0.55)] transition-transform duration-400 ease-spring`}
        style={level === 'full' ? undefined : { transform: LEVEL_TRANSFORM[level] }}
      >
        {above && (
          // Outside the scrolling body, so nothing riding here is clipped when it flies off.
          <div
            className={`pointer-events-none absolute flex ${landscape ? 'right-full bottom-0 pr-4' : 'inset-x-0 bottom-full justify-center pb-3'}`}
          >
            {above}
          </div>
        )}
        <button
          type="button"
          aria-label={
            kind === 'browse'
              ? level === 'half'
                ? 'Show more'
                : 'Close'
              : peek
                ? 'Show the panel'
                : 'Peek at the board'
          }
          aria-expanded={kind === 'decision' ? !peek : level === 'half' ? false : undefined}
          onClick={toggle}
          className="flex h-7 w-full shrink-0 touch-none items-center justify-center"
        >
          <span className="h-1.5 w-11 rounded-full bg-white/25" />
        </button>
        {peek && (
          // The whole visible strip brings a peeking sheet back, not just the handle.
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => !dragged.current && setLevel('full')}
            className="absolute inset-x-0 top-0 z-10"
            style={{ height: PEEK }}
          />
        )}
        {/* The panel inside becomes the sheet's body: full width, no frame of its own. */}
        <div
          ref={bodyRef}
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain [&>*]:max-h-none! [&>*]:w-full! [&>*]:max-w-none! [&>*]:rounded-none! [&>*]:border-0! [&>*]:bg-transparent! [&>*]:shadow-none! [&>*]:backdrop-blur-none! ${peek ? 'pointer-events-none' : ''}`}
          {...(peek ? { inert: true } : {})}
        >
          {children}
        </div>
      </div>
      {overlay}
    </Tag>
  )
}

type Live = { current: { level: Level; kind: 'decision' | 'browse'; onClose?: (() => void) | undefined } }

/** The levels a sheet has (a short browse sheet has no half) and their offsets down from full, in px. */
function levelOffsets(el: HTMLElement, kind: 'decision' | 'browse'): [Level | 'closed', number][] {
  const h = el.offsetHeight
  const vh = globalThis.innerHeight
  if (kind === 'decision')
    return [
      ['full', 0],
      ['peek', h - PEEK],
    ]
  const levels: [Level | 'closed', number][] = [['full', 0]]
  if (h > vh * TALL) levels.push(['half', Math.max(0, h - vh * HALF)])
  levels.push(['closed', h])
  return levels
}

/**
 * Follows one finger on the sheet and settles it on a level when it lifts. A swipe in the body
 * scrolls the body, except down from its top or at a lower level, where it moves the sheet.
 */
function dragSheet(
  el: HTMLElement,
  bodyRef: { current: HTMLElement | null },
  live: Live,
  settle: (level: Level | 'closed') => void,
): () => void {
  let d: {
    x0: number
    y0: number
    base: number
    taken: boolean | null
    trail: { y: number; t: number }[]
  } | null = null

  const start = (e: TouchEvent) => {
    const t = e.touches[0]
    const target = e.target instanceof Element ? e.target : null
    d = null
    if (e.touches.length !== 1 || !t || target?.closest('input[type=range]')) return
    const { level, kind } = live.current
    const base = levelOffsets(el, kind).find(([l]) => l === level)?.[1] ?? 0
    d = { x0: t.clientX, y0: t.clientY, base, taken: null, trail: [{ y: t.clientY, t: e.timeStamp }] }
  }

  const move = (e: TouchEvent) => {
    const t = e.touches[0]
    if (!d || !t || d.taken === false) return
    if (d.taken === null) {
      const dx = t.clientX - d.x0
      const dy = t.clientY - d.y0
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return
      const body = bodyRef.current
      const inBody = e.target instanceof Node && (body?.contains(e.target) ?? false)
      d.taken =
        Math.abs(dy) > Math.abs(dx) &&
        (!inBody || live.current.level !== 'full' || (dy > 0 && (body?.scrollTop ?? 0) <= 0))
      if (!d.taken) return
      d.y0 = t.clientY // the sheet starts from here: no jump by the slop
    }
    e.preventDefault()
    d.trail = [...d.trail.slice(-4), { y: t.clientY, t: e.timeStamp }]
    const y = d.base + t.clientY - d.y0
    el.style.transition = 'none'
    // Above full the sheet resists: it does not grow past its content.
    el.style.transform = `translateY(${y < 0 ? y / 6 : y}px)`
  }

  const end = () => {
    const cur = d
    d = null
    if (!cur?.taken) return
    const first = cur.trail[0]!
    const last = cur.trail.at(-1)!
    const speed = last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0 // px per ms
    const y = cur.base + last.y - cur.y0
    const levels = levelOffsets(el, live.current.kind)
    // The nearest level to where the release would carry the sheet. A short flick goes one level on
    // from where the sheet was, not two; a drag that already passed that level goes on as far as it aims.
    const aim = y + speed * FLING_MS
    let best = levels[0]!
    for (const l of levels) if (Math.abs(l[1] - aim) < Math.abs(best[1] - aim)) best = l
    const from = levels.findIndex(([, o]) => o === cur.base)
    const next = Math.abs(speed) > FLICK_SPEED ? levels[from + Math.sign(speed)] : undefined
    const passed = next !== undefined && Math.sign(speed) * (y - next[1]) > 0
    if (next && !passed && Math.abs(best[1] - cur.base) > Math.abs(next[1] - cur.base)) best = next
    el.style.transition = ''
    el.style.transform = best[0] === 'closed' ? `translateY(${best[1]}px)` : LEVEL_TRANSFORM[best[0]]
    settle(best[0])
  }

  const cancel = () => {
    if (d?.taken) {
      el.style.transition = ''
      el.style.transform = LEVEL_TRANSFORM[live.current.level]
    }
    d = null
  }

  el.addEventListener('touchstart', start, { passive: true })
  el.addEventListener('touchmove', move, { passive: false })
  el.addEventListener('touchend', end)
  el.addEventListener('touchcancel', cancel)
  return () => {
    el.removeEventListener('touchstart', start)
    el.removeEventListener('touchmove', move)
    el.removeEventListener('touchend', end)
    el.removeEventListener('touchcancel', cancel)
  }
}
