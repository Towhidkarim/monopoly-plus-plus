import { useLayoutEffect, useRef, type HTMLAttributes, type ReactNode } from 'react'
import type { PieceKind } from '@skyline/board'
import { UNDERDOG_MAX } from '@skyline/engine'
import { TIMINGS } from '../../game/timings.ts'
import { TWISTS, type Twists } from '../../game/setup.ts'
import { sound } from '../../audio/engine.ts'
import { fmtMoney } from './format.ts'
import { useReducedMotion } from './cardEnv.tsx'
import { PieceIcon } from './icons.tsx'

/** Small shared building blocks for the game screen. */

type BtnKind = 'primary' | 'secondary' | 'danger' | 'ghost'

/**
 * Shared hover and press feel for anything clickable: a one-pixel spring lift, a small press
 * squash, and an accent focus ring. Transform (translate, scale), filter and color only.
 * Add FX_BRIGHT on gold or colored fills, FX_GHOST on outline and text buttons.
 */
export const FX =
  'transition-[translate,scale,filter,background-color,color,border-color,opacity] duration-200 ease-spring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:hover:-translate-y-px enabled:active:scale-[0.97] active:duration-75'
export const FX_BRIGHT = `${FX} enabled:hover:brightness-[1.06]`
export const FX_GHOST = `${FX} enabled:hover:bg-white/5 enabled:hover:text-ink`

const BTN_STYLES: Record<BtnKind, string> = {
  primary: `bg-accent font-display text-accent-ink shadow-gold ${FX_BRIGHT}`,
  secondary: `border border-line bg-transparent text-ink ${FX_GHOST}`,
  danger: `bg-alert text-accent-ink shadow-[inset_0_-4px_0_rgba(0,0,0,0.18)] ${FX_BRIGHT}`,
  ghost: `text-ink-muted ${FX_GHOST}`,
}

export function Btn({
  children,
  onClick,
  kind = 'secondary',
  disabled,
  title,
  className = '',
  autofocus,
}: {
  children: ReactNode
  onClick?: () => void
  kind?: BtnKind
  disabled?: boolean
  title?: string | undefined
  className?: string
  /** The control a dialog focuses when it opens (see useDialogFocus). */
  autofocus?: boolean
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
      data-autofocus={autofocus || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-extrabold disabled:opacity-40 ${BTN_STYLES[kind]} ${className}`}
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
export function Panel({
  children,
  className = '',
  ...rest
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
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
  const reduced = useReducedMotion()
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const from = shown.current ?? value
    shown.current = value
    if (from === value || reduced) {
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
  }, [value, reduced])
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

/** One twist: its name, a line about it, and a switch. */
export function TwistSwitch({
  label,
  blurb,
  on,
  disabled = false,
  onChange,
}: {
  label: string
  blurb: string
  on: boolean
  disabled?: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${label}: ${blurb}`}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`flex items-center gap-3 rounded-[14px] border px-3.5 py-2.5 text-left transition-[border-color,background-color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default ${
        on ? 'border-accent/70 bg-accent/10' : 'border-line enabled:hover:bg-white/5'
      }`}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-display text-[15px] font-bold text-ink">{label}</span>
        <span className="text-xs leading-snug text-ink-muted">{blurb}</span>
      </span>
      <span
        aria-hidden="true"
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 ${on ? 'bg-accent' : 'bg-table'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-card shadow-keycap transition-transform duration-200 ease-spring ${on ? 'translate-x-4' : ''}`}
        />
      </span>
    </button>
  )
}

/** The twist switches, with the Comeback bonus cap under its switch while it is on. */
export function TwistList({
  twists,
  salary,
  disabled = false,
  onChange,
}: {
  twists: Twists
  /** The preset's Launch salary, to show the cap in money. */
  salary: number
  disabled?: boolean
  onChange: (next: Twists) => void
}) {
  return (
    <>
      {TWISTS.map((t) => (
        <div key={t.key} className="flex flex-col gap-1.5">
          <TwistSwitch
            label={t.label}
            blurb={t.blurb}
            on={twists[t.key] === true}
            disabled={disabled}
            onChange={(on) =>
              // The cap is always written with the switch, so a saved game replays with it.
              onChange({
                ...twists,
                [t.key]: on,
                ...(t.key === 'underdogSalary' && on
                  ? { underdogMax: twists.underdogMax ?? UNDERDOG_MAX }
                  : {}),
              })
            }
          />
          {t.key === 'underdogSalary' && twists.underdogSalary && (
            <BonusCap
              value={twists.underdogMax ?? UNDERDOG_MAX}
              salary={salary}
              disabled={disabled}
              onChange={(underdogMax) => onChange({ ...twists, underdogMax })}
            />
          )}
        </div>
      ))}
    </>
  )
}

/** Slider for the biggest underdog bonus, from half a salary to four salaries. */
function BonusCap({
  value,
  salary,
  disabled,
  onChange,
}: {
  value: number
  salary: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  const pct = Math.round(value * 100)
  return (
    <label
      className={`ml-3 flex flex-col gap-1.5 rounded-xl border border-line/70 px-3 py-2 ${disabled ? 'opacity-70' : ''}`}
    >
      <span className="flex items-baseline justify-between gap-2 text-xs text-ink-muted">
        <span>Biggest bonus</span>
        <span className="font-display text-sm font-bold text-ink tabular-nums">
          +{pct}% <span className="font-normal text-ink-muted">({fmtMoney(salary * value)})</span>
        </span>
      </span>
      <input
        type="range"
        min={0.5}
        max={4}
        step={0.5}
        value={value}
        disabled={disabled}
        aria-valuetext={`plus ${pct} percent of the salary`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-accent)]"
      />
      <span className="text-[11px] leading-snug text-ink-muted">
        Paid in full to anyone two thirds behind the leader; less the closer they are.
      </span>
    </label>
  )
}
