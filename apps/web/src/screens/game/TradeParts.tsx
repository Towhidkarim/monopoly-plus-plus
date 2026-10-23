import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { GROUPS, SPACES, mortgageValue, type Bundle, type GameState } from '@skyline/engine'
import type { TradeOutcome } from '../../game/store.ts'
import { setsBroken, setsCompleted, type Mood } from '../../game/trade.ts'
import { cssHex, groupColor, groupName } from '../../spaceInfo.ts'
import { Icon } from './icons.tsx'
import { Money } from './ui.tsx'

/** Shared pieces of the trade table and the incoming-offer panel. */

export function Avatar({ name, color, size = 'size-7' }: { name: string; color: number; size?: string }) {
  return (
    <span
      className={`flex ${size} shrink-0 items-center justify-center rounded-full text-xs font-bold text-table`}
      style={{ background: cssHex(color) }}
    >
      {name.trim()[0]?.toUpperCase()}
    </span>
  )
}

const bandColor = (i: number) => {
  const g = SPACES[i]!.group
  return g >= 0 ? groupColor(g) : '#94a3b8'
}

/** Where cards were when clicked, so they can fly to wherever they show up next (FLIP). */
export type FlyRects = RefObject<Map<number, DOMRect>>

/**
 * A property as a small playing card: color band, name, price. Clicking it moves it between a
 * hand and the table; on mount it flies in from wherever it was clicked.
 */
export function MiniCard({
  s,
  space,
  onClick,
  blocked = null,
  fly,
}: {
  s: GameState
  space: number
  onClick?: (rect: DOMRect) => void
  blocked?: string | null
  fly?: FlyRects
}) {
  const ref = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    const from = fly?.current.get(space)
    const el = ref.current
    if (!from || !el) return
    fly!.current.delete(space)
    const to = el.getBoundingClientRect()
    el.animate(
      [
        { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(0.92)` },
        { transform: 'translate(0, 0) scale(1.06)', offset: 0.8 },
        { transform: 'none' },
      ],
      { duration: 280, easing: 'cubic-bezier(.2,.8,.3,1)' },
    )
  }, [fly, space])
  const sp = SPACES[space]!
  const mortgaged = s.mortgaged[space]
  return (
    <button
      ref={ref}
      type="button"
      disabled={!onClick || blocked !== null}
      title={blocked ?? (mortgaged ? 'Mortgaged' : sp.name)}
      onClick={(e) => onClick?.(e.currentTarget.getBoundingClientRect())}
      className="relative flex h-24 w-[78px] shrink-0 flex-col overflow-hidden rounded-lg bg-slate-50 text-left text-table shadow-md shadow-black/40 transition enabled:hover:-translate-y-1 enabled:hover:shadow-lg enabled:active:scale-95 disabled:cursor-default"
    >
      <span className="h-4 shrink-0" style={{ background: bandColor(space) }} />
      <span className="line-clamp-3 px-1.5 pt-1 text-[10.5px] leading-tight font-bold">{sp.name}</span>
      <span className="mt-auto px-1.5 pb-1 text-[10px] font-semibold text-slate-500">
        <Money value={mortgaged ? mortgageValue(space) : sp.price} />
      </span>
      {mortgaged && (
        <span className="absolute inset-0 flex items-center justify-center bg-[repeating-linear-gradient(135deg,#0b142633_0_4px,transparent_4px_9px)]">
          <span className="rounded bg-table/80 px-1 text-[8px] font-bold tracking-wider text-slate-100">
            MORTGAGED
          </span>
        </span>
      )}
      {blocked && <span className="absolute inset-0 bg-slate-900/55" />}
    </button>
  )
}

/** An empty slot the size of a card (keeps a hand's layout while its card is on the table). */
export function CardSlot() {
  return <span className="h-24 w-[78px] shrink-0 rounded-lg border border-dashed border-line" />
}

/** A hand's cards grouped by set, with how much of each set the player holds. */
export function SetHeader({ s, seat, group }: { s: GameState; seat: number; group: number }) {
  if (group < 0) return <div className="text-[11px] font-semibold text-ink-muted">Stations and utilities</div>
  const spaces = GROUPS[group]!
  const owned = spaces.filter((i) => s.owner[i] === seat).length
  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold text-ink-muted">
      <span className="size-2 rounded-full" style={{ background: groupColor(group) }} />
      {groupName(group)}
      <span className="flex gap-0.5">
        {spaces.map((i) => (
          <span
            key={i}
            className="h-1.5 w-3 rounded-full"
            style={{ background: s.owner[i] === seat ? groupColor(group) : 'var(--color-line)' }}
          />
        ))}
      </span>
      <span>
        {owned}/{spaces.length}
      </span>
    </div>
  )
}

/** Cash on one side of the deal: an editable amount with quick chips. */
export function CashEditor({
  value,
  max,
  onChange,
  label,
}: {
  value: number
  max: number
  onChange: (v: number) => void
  label: string
}) {
  const set = (v: number) =>
    onChange(Math.max(0, Math.min(Math.floor(max / 10) * 10, Math.round(v / 10) * 10)))
  const [text, setText] = useState<string | null>(null)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <label className="flex items-center gap-1 rounded-lg border border-line bg-table px-2 py-1 focus-within:border-accent">
        <span className="text-sm font-bold text-gold">₵</span>
        <input
          aria-label={label}
          inputMode="numeric"
          value={text ?? String(value)}
          onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={() => {
            if (text !== null) set(Number(text || 0))
            setText(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          className="w-16 bg-transparent text-[15px] font-bold tabular-nums outline-none"
        />
      </label>
      {[10, 50, 100].map((step) => (
        <Chip key={step} onClick={() => set(value + step)} disabled={value + step > max}>
          +{step}
        </Chip>
      ))}
      <Chip onClick={() => set(0)} disabled={value === 0}>
        Clear
      </Chip>
    </div>
  )
}

function Chip({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-line bg-panel-2 px-2.5 py-1 text-xs font-semibold transition hover:bg-white/10 active:scale-95 disabled:opacity-30"
    >
      {children}
    </button>
  )
}

/** Read-only view of one side of a deal (incoming offers). */
export function BundleCards({ s, bundle }: { s: GameState; bundle: Bundle }) {
  const empty = bundle.spaces.length === 0 && bundle.cash === 0 && bundle.jailCards === 0
  return (
    <div className="flex flex-wrap items-center gap-2">
      {bundle.spaces.map((i) => (
        <MiniCard key={i} s={s} space={i} />
      ))}
      {bundle.cash > 0 && <CashPill value={bundle.cash} />}
      {bundle.jailCards > 0 && <JailPill count={bundle.jailCards} />}
      {empty && <span className="text-sm text-ink-muted">Nothing</span>}
    </div>
  )
}

export function CashPill({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 py-1 pr-3 pl-1 text-[15px] font-bold text-gold">
      <span className="flex size-6 items-center justify-center rounded-full border-2 border-amber-600 bg-amber-300 text-[11px] text-amber-900">
        ₵
      </span>
      <Money value={value} />
    </span>
  )
}

export function JailPill({ count }: { count: number }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-line bg-panel-2 px-3 py-1.5 text-xs font-semibold">
      <Icon name="lock" size={14} />
      {count === 1 ? 'Lockup card' : `${count} Lockup cards`}
    </span>
  )
}

/**
 * The bot's feeling about the deal as a meter from "No way" to "Deal!". The marker moves with a
 * transform transition; 0.5 is where the bot starts saying yes.
 */
export function DealMeter({ mood }: { mood: number | null }) {
  const at = Math.max(0.02, Math.min(0.98, mood ?? 0.15))
  return (
    <div className="flex w-full flex-col gap-1">
      <div className="relative h-2.5 rounded-full bg-[linear-gradient(90deg,#fb7185_0%,#fbbf24_42%,#fbbf24_50%,#14b8a6_58%,#14b8a6_100%)] opacity-90">
        <span className="absolute inset-y-0 left-1/2 w-px bg-table/60" />
        <span
          className="absolute -top-1 left-0 h-4.5 w-full transition-transform duration-500 ease-[cubic-bezier(.3,1.4,.5,1)]"
          style={{ transform: `translateX(${at * 100}%)` }}
        >
          <span
            className={`absolute -left-2 size-4.5 rounded-full border-[3px] border-table bg-ink shadow-md ${mood === null ? 'opacity-40' : ''}`}
          />
        </span>
      </div>
      <div className="flex justify-between text-[10px] font-bold tracking-wider text-ink-muted uppercase">
        <span>No way</span>
        <span>Hmm…</span>
        <span>Deal!</span>
      </div>
    </div>
  )
}

const MOOD_TONE: Record<Mood | 'thinking', string> = {
  empty: 'border-line',
  thinking: 'border-line',
  no: 'border-alert/50',
  close: 'border-gold/50',
  yes: 'border-teal/60',
}

/** What the bot says, in a speech bubble that pops when the line changes. */
export function SpeechBubble({ text, mood }: { text: string; mood: Mood | 'thinking' }) {
  return (
    <div
      key={text}
      className={`relative animate-pop rounded-2xl rounded-tl-sm border bg-panel-2 px-3 py-2 text-sm font-medium ${MOOD_TONE[mood]}`}
    >
      {mood === 'thinking' ? (
        <span className="flex gap-1 py-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-1.5 animate-bounce rounded-full bg-ink-muted"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </span>
      ) : (
        `“${text}”`
      )}
    </div>
  )
}

/** The big result stamp on the table. */
export function Stamp({ outcome }: { outcome: TradeOutcome }) {
  const accepted = outcome === 'accepted'
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div
        className={`animate-stamp rounded-2xl border-[5px] px-8 py-3 text-5xl font-black tracking-widest uppercase ${
          accepted ? 'border-teal text-teal' : 'border-alert text-alert'
        } bg-panel/85 shadow-2xl shadow-black/50`}
      >
        {accepted ? 'Deal!' : outcome === 'declined' ? 'Declined' : 'Withdrawn'}
      </div>
    </div>
  )
}

/**
 * What the deal does to sets, from `me`'s side (giving `give`, getting `get` from `them`):
 * sets completed (good), sets handed to the partner or broken (warnings), and the mortgage fee.
 */
export function DealNotes({
  s,
  me,
  them,
  themName,
  give,
  get,
  fee,
}: {
  s: GameState
  me: number
  them: number
  themName: string
  give: Bundle
  get: Bundle
  fee: number
}) {
  const mine = setsCompleted(s, me, get.spaces, give.spaces)
  const theirs = setsCompleted(s, them, give.spaces, get.spaces)
  const broken = setsBroken(s, me, give.spaces)
  if (mine.length + theirs.length + broken.length === 0 && fee === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      {mine.map((g) => (
        <Note key={`m${g}`} tone="good" color={groupColor(g)}>
          Completes your {groupName(g)} set
        </Note>
      ))}
      {theirs.map((g) => (
        <Note key={`t${g}`} tone="warn" color={groupColor(g)}>
          Gives {themName} the {groupName(g)} set
        </Note>
      ))}
      {broken.map((g) => (
        <Note key={`b${g}`} tone="warn" color={groupColor(g)}>
          Breaks up your {groupName(g)} set
        </Note>
      ))}
      {fee > 0 && (
        <Note tone="info">
          <Money value={fee} /> fee to take over mortgages
        </Note>
      )}
    </div>
  )
}

function Note({
  tone,
  color,
  children,
}: {
  tone: 'good' | 'warn' | 'info'
  color?: string
  children: ReactNode
}) {
  const cls = {
    good: 'border-gold/50 bg-gold/10 text-gold',
    warn: 'border-alert/40 bg-alert/10 text-alert',
    info: 'border-line bg-panel-2 text-ink-muted',
  }[tone]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold ${cls}`}>
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}
      {children}
    </span>
  )
}
