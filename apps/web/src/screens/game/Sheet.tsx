import { useRef, useState, type HTMLAttributes, type ReactNode, type Ref } from 'react'
import { useLayout } from '../../layout.ts'

/** How far a drag must travel down (px) to peek or close; less springs back. */
const DRAG_COMMIT = 70
/** What stays on screen of a peeking sheet: the handle and the top of its header. */
const PEEK = 76

/**
 * The outer frame of a game panel (D64). On desktop it is exactly the wrapper the panel always
 * had (`className`). On phones it becomes a bottom sheet: it slides up above the home bar, scrolls
 * inside, and restyles the panel it holds (`[&>*]` below) into the sheet's body.
 *
 * - `decision` sheets (buy, auction, debt, offer, card) cannot be closed: a drag down or a tap on
 *   the handle tucks them into a peek bar so the board can be seen, a tap brings them back.
 * - `browse` sheets (log, My city, a player) close on a drag down, a tap on the handle or the dim.
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
  const [peek, setPeek] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; id: number; moved: number } | null>(null)

  if (!compact)
    return (
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- div, section and aside all take an HTMLElement ref
      <Tag ref={ref as Ref<HTMLDivElement>} {...rest} className={className}>
        {children}
      </Tag>
    )

  const settle = (offset: number) => {
    const el = sheetRef.current
    if (!el) return
    el.style.transition = ''
    el.style.transform = ''
    if (offset < DRAG_COMMIT) return
    if (kind === 'browse') onClose?.()
    else setPeek(true)
  }
  const toggle = () => {
    if (kind === 'browse') onClose?.()
    else setPeek((v) => !v)
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
          onClick={kind === 'browse' ? onClose : () => setPeek(true)}
          className="pointer-events-auto absolute inset-0 animate-fade bg-table/45"
        />
      )}
      <div
        ref={sheetRef}
        className={`pointer-events-auto relative flex max-h-[88dvh] w-full animate-sheet ${landscape ? 'mx-auto max-w-lg' : ''} flex-col rounded-t-[26px] border-t border-line bg-panel pb-safe shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_-18px_40px_rgba(2,6,16,0.55)] transition-transform duration-400 ease-spring`}
        style={peek ? { transform: `translateY(calc(100% - ${PEEK}px))` } : undefined}
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
          aria-label={kind === 'browse' ? 'Close' : peek ? 'Show the panel' : 'Peek at the board'}
          aria-expanded={kind === 'decision' ? !peek : undefined}
          onClick={() => {
            // A drag ends in a click too: only a tap toggles.
            if ((drag.current?.moved ?? 0) < 6) toggle()
            drag.current = null
          }}
          onPointerDown={(e) => {
            if (peek) return
            drag.current = { y: e.clientY, id: e.pointerId, moved: 0 }
            e.currentTarget.setPointerCapture(e.pointerId)
            if (sheetRef.current) sheetRef.current.style.transition = 'none'
          }}
          onPointerMove={(e) => {
            const d = drag.current
            if (!d || d.id !== e.pointerId || !sheetRef.current) return
            const dy = e.clientY - d.y
            d.moved = Math.max(d.moved, Math.abs(dy))
            // Down follows the finger; up resists (a sheet does not grow past its content).
            const y = dy > 0 ? dy : dy / 6
            sheetRef.current.style.transform = `translateY(${y}px)`
          }}
          onPointerUp={(e) => {
            const d = drag.current
            if (!d || d.id !== e.pointerId) return
            settle(e.clientY - d.y)
          }}
          onPointerCancel={() => settle(0)}
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
            onClick={() => setPeek(false)}
            className="absolute inset-x-0 top-0 z-10"
            style={{ height: PEEK }}
          />
        )}
        {/* The panel inside becomes the sheet's body: full width, no frame of its own. */}
        <div
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
