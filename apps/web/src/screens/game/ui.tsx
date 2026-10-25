import { useLayoutEffect, useRef, type ReactNode } from 'react'
import type { PieceKind } from '@skyline/board'
import { TIMINGS } from '../../game/timings.ts'
import { sound } from '../../audio/engine.ts'
import { fmtMoney } from './format.ts'
import { PieceIcon } from './icons.tsx'

/** Small shared building blocks for the game screen. */

type BtnKind = 'primary' | 'secondary' | 'danger' | 'ghost'

const BTN_STYLES: Record<BtnKind, string> = {
  primary: 'bg-accent font-display text-accent-ink shadow-gold hover:brightness-105',
  secondary: 'border border-line bg-transparent text-ink hover:bg-white/5',
  danger: 'bg-alert text-accent-ink shadow-[inset_0_-4px_0_rgba(0,0,0,0.18)] hover:brightness-105',
  ghost: 'text-ink-muted hover:bg-white/5 hover:text-ink',
}

export function Btn({
  children,
  onClick,
  kind = 'secondary',
  disabled,
  title,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  kind?: BtnKind
  disabled?: boolean
  title?: string | undefined
  className?: string
}) {
  // Press squashes (transform only) and springs back; hover lifts a pixel.
  return (
    <button
      type="button"
      onClick={() => {
        sound.play('ui.click')
        onClick?.()
      }}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-extrabold transition-[translate,scale,filter,background-color,color] duration-200 ease-spring hover:-translate-y-px active:scale-95 active:duration-75 disabled:pointer-events-none disabled:opacity-40 ${BTN_STYLES[kind]} ${className}`}
    >
      {children}
    </button>
  )
}

/** Keyboard hint: a cream keycap. */
export function Kbd({ children }: { children: ReactNode; onAccent?: boolean }) {
  return (
    <kbd className="rounded-md bg-card px-1.5 py-0.5 font-sans text-[11px] font-extrabold text-card-ink shadow-keycap">
      {children}
    </kbd>
  )
}

/** Lamplight panel: ink-blue glass with a warm edge, a top highlight and a soft drop shadow. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`pointer-events-auto rounded-[20px] border border-line bg-panel/95 shadow-panel backdrop-blur ${className}`}
    >
      {children}
    </div>
  )
}

/** A player's color disc with their piece glyph; `halo` adds a ring (used for the active player). */
export function TokenAvatar({
  color,
  piece,
  size = 34,
  halo,
  shadow,
  className = '',
}: {
  color: string
  piece: PieceKind
  size?: number
  halo?: string | undefined
  /** Replaces the default box-shadow (for example a glowing ring). */
  shadow?: string
  className?: string
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: color,
        boxShadow: shadow ?? `inset 0 -3px 0 rgba(0,0,0,0.18)${halo ? `, 0 0 0 2px ${halo}` : ''}`,
      }}
    >
      <PieceIcon piece={piece} size={Math.round(size * 0.59)} />
    </span>
  )
}

export function Money({ value, className = '' }: { value: number; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{fmtMoney(value)}</span>
}

/**
 * Money that counts to its new value. Frames write `textContent` directly; React only owns the
 * empty span, so per-frame values never pass through React state (CLAUDE.md principle 9).
 */
export function TickingMoney({ value, className = '' }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef<number | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const from = shown.current ?? value
    shown.current = value
    if (from === value) {
      el.textContent = fmtMoney(value)
      return
    }
    const start = performance.now()
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / TIMINGS.cashTick)
      const eased = 1 - (1 - k) ** 3
      el.textContent = fmtMoney(Math.round(from + (value - from) * eased))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    el.textContent = fmtMoney(from)
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      el.textContent = fmtMoney(value)
    }
  }, [value])
  return <span ref={ref} className={`tabular-nums ${className}`} />
}

/** Small uppercase label. */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`text-[11px] font-extrabold tracking-[0.12em] uppercase ${className}`}>{children}</div>
  )
}

/** Owned-of-total progress bar for a color set. */
export function SetBar({ total, filled, color }: { total: number; filled: number; color: string }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className="h-2 flex-1 rounded-full"
          style={{ background: i < filled ? color : 'var(--color-line)' }}
        />
      ))}
    </div>
  )
}

/** Four house pips plus a hotel pip. */
export function HousePips({ level }: { level: number }) {
  return (
    <span className="flex gap-0.5" aria-label={level === 5 ? 'hotel' : `${level} of 4 houses`}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`size-3 rounded-[3px] transition-colors ${i < level && level < 5 ? 'bg-emerald-500' : level === 5 ? 'bg-emerald-500/30' : 'bg-white/12'}`}
        />
      ))}
      <span
        className={`size-3 rounded-[3px] ${level === 5 ? 'bg-rose-600' : 'border border-dashed border-slate-700'}`}
      />
    </span>
  )
}

/** A tiny deed card: cream stock with the set's color band (dashed outline when someone else holds it). */
export function DeedSwatch({
  color,
  small = false,
  dashed = false,
  gray = false,
}: {
  color: string
  small?: boolean
  dashed?: boolean
  /** Mortgaged: desaturated. */
  gray?: boolean
}) {
  const size = small ? 'h-8 w-6' : 'h-9 w-7'
  if (dashed) {
    return (
      <span
        aria-hidden="true"
        className={`${size} shrink-0 rounded border-[1.5px] border-dashed`}
        style={{ borderColor: `${color}99` }}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={`${size} shrink-0 overflow-hidden rounded bg-card shadow-[0_2px_6px_rgba(0,0,0,0.3)] ${gray ? 'saturate-[0.35]' : ''}`}
    >
      <span className={`block ${small ? 'h-2.5' : 'h-[11px]'}`} style={{ background: color }} />
    </span>
  )
}
