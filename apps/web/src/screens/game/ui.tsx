import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { TIMINGS } from '../../game/timings.ts'
import { sound } from '../../audio/engine.ts'
import { fmtMoney } from './format.ts'

/** Small shared building blocks for the game screen. */

type BtnKind = 'primary' | 'secondary' | 'danger' | 'ghost'

const BTN_STYLES: Record<BtnKind, string> = {
  primary: 'bg-accent text-table shadow-lg shadow-accent/25 hover:brightness-110',
  secondary: 'border border-line bg-panel-2 text-ink hover:bg-white/10',
  danger: 'bg-alert/90 text-table hover:bg-alert',
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
  return (
    <button
      type="button"
      onClick={() => {
        sound.play('ui.click')
        onClick?.()
      }}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition duration-100 active:scale-95 disabled:pointer-events-none disabled:opacity-40 ${BTN_STYLES[kind]} ${className}`}
    >
      {children}
    </button>
  )
}

/** Keyboard hint chip inside a button. */
export function Kbd({ children, onAccent = false }: { children: ReactNode; onAccent?: boolean }) {
  return (
    <kbd
      className={`rounded-md px-1.5 py-0.5 font-sans text-[10px] font-bold tracking-wide ${onAccent ? 'bg-table/15' : 'bg-white/10'}`}
    >
      {children}
    </kbd>
  )
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`pointer-events-auto rounded-2xl border border-line bg-panel/95 shadow-2xl shadow-black/40 backdrop-blur ${className}`}
    >
      {children}
    </div>
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
  return <div className={`text-xs font-bold tracking-widest uppercase ${className}`}>{children}</div>
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
