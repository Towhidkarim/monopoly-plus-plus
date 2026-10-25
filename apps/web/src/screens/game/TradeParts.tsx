import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { GROUPS, SPACES, type Bundle, type GameState } from '@skyline/engine'
import { sound } from '../../audio/engine.ts'
import type { SeatSetup } from '../../game/setup.ts'
import type { TradeOutcome } from '../../game/store.ts'
import { setsBroken, setsCompleted, type Mood } from '../../game/trade.ts'
import { cssHex, groupColor, groupName } from '../../spaceInfo.ts'
import { useReducedMotion } from './cardEnv.tsx'
import { Stamp } from './cardMotion.tsx'
import { Icon } from './icons.tsx'
import { DeedCard } from './TitleDeed.tsx'
import { HAND_SCALE, dropIn, slideFrom, tiltOf } from './tradeFx.ts'
import { Money, FX, FX_BRIGHT } from './ui.tsx'

/** Shared pieces of the trade table and the incoming-offer panel (felt, mats, cards, coins, bot). */

/** Compact deed width in px, before scaling (see DeedCard). */
const CARD_W = 140
/** Its design height in the mockup; the empty slot uses it. */
const CARD_H = 182

/**
 * Where cards were when clicked, so they can fly to wherever they show up next (FLIP). Keys:
 * `in:<space>` (hand card clicked, the mat card consumes it) and `out:<space>` (mat card clicked,
 * the hand card consumes it).
 */
export type FlyRects = RefObject<Map<string, DOMRect>>

/** A space's compact deed as it stands in `s` (owner, houses, mortgage), scaled by `k`. */
export function DeedFace({
  s,
  seats,
  space,
  k,
  selected = false,
}: {
  s: GameState
  seats: readonly SeatSetup[]
  space: number
  k: number
  selected?: boolean
}) {
  const sp = SPACES[space]!
  const seat = s.owner[space]!
  const seatInfo = seat >= 0 ? seats[seat] : undefined
  const owner = seatInfo
    ? { name: s.players[seat]!.name, color: cssHex(seatInfo.color), piece: seatInfo.piece }
    : null
  return (
    // `zoom` scales the layout too, so the box needs no height guess; the card stays crisp.
    <div className="flex" style={{ zoom: k }}>
      <DeedCard
        index={space}
        variant="compact"
        state={s.mortgaged[space] ? 'mortgaged' : 'owned'}
        owner={owner}
        level={sp.kind === 'property' ? s.houses[space]! : 0}
        selected={selected}
      />
    </div>
  )
}

/**
 * A property in a hand. On the table it stays in place, dimmed with a gold outline; clicking it
 * again takes it back. Blocked cards (buildings in the set) are veiled with the reason.
 */
export function HandCard({
  s,
  seats,
  space,
  k,
  onTable,
  blocked,
  onPick,
  fly,
}: {
  s: GameState
  seats: readonly SeatSetup[]
  space: number
  k: number
  onTable: boolean
  blocked: string | null
  /** Omitted while the table is locked (an offer is out). */
  onPick?: (rect: DOMRect) => void
  fly: FlyRects
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const reduced = useReducedMotion()
  const was = useRef(onTable)
  // Taken back from the mat: fly in from where the mat card was.
  useLayoutEffect(() => {
    const el = ref.current
    if (was.current && !onTable && el) {
      const from = fly.current.get(`out:${space}`)
      fly.current.delete(`out:${space}`)
      if (from && !reduced) slideFrom(el, from, 1.1)
    }
    was.current = onTable
  }, [onTable, reduced, fly, space])
  const sp = SPACES[space]!
  return (
    <button
      ref={ref}
      type="button"
      disabled={blocked !== null || !onPick}
      title={blocked ?? sp.name}
      aria-label={`${sp.name}${onTable ? ', on the table, click to take back' : ', click to add to the deal'}`}
      aria-pressed={onTable}
      onClick={(e) => onPick?.(e.currentTarget.getBoundingClientRect())}
      className={`relative block shrink-0 rounded-[14px] text-left transition-[translate,scale,opacity] duration-200 ease-spring focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent enabled:hover:-translate-y-1 enabled:active:scale-[0.97] ${onTable ? 'opacity-35' : ''}`}
    >
      <DeedFace s={s} seats={seats} space={space} k={k} selected={onTable} />
      {blocked && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-[14px] bg-table/70 px-2 text-center text-[10px] leading-tight font-bold text-ink">
          <Icon name="lock" size={16} />
          {blocked}
        </span>
      )}
    </button>
  )
}

/**
 * A property lying on a mat, tilted a little. With `onClick` it is a button (click to take it
 * back) and flies in from the hand card that was clicked; without, it is a plain card (offers).
 * `reg` hands the element to the caller (for the deal's flight to the new owner).
 */
export function MatCard({
  s,
  seats,
  space,
  k,
  onClick,
  fly,
  reg,
}: {
  s: GameState
  seats: readonly SeatSetup[]
  space: number
  k: number
  onClick?: (rect: DOMRect) => void
  fly?: FlyRects
  reg?: (el: HTMLElement | null) => void
}) {
  const ref = useRef<HTMLElement | null>(null)
  const reduced = useReducedMotion()
  const ran = useRef(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || ran.current) return
    ran.current = true
    if (reduced || !fly) return
    const from = fly.current.get(`in:${space}`)
    fly.current.delete(`in:${space}`)
    if (from) slideFrom(el, from, HAND_SCALE / k)
    else dropIn(el)
  }, [fly, reduced, space, k])
  const sp = SPACES[space]!
  const style = { rotate: `${tiltOf(space)}deg` }
  const face = <DeedFace s={s} seats={seats} space={space} k={k} />
  const setRef = (el: HTMLElement | null) => {
    ref.current = el
    reg?.(el)
  }
  if (!onClick)
    return (
      <div ref={setRef} className="shrink-0 rounded-[14px]" style={style}>
        {face}
      </div>
    )
  return (
    <button
      ref={setRef}
      type="button"
      title={`Take ${sp.name} back`}
      aria-label={`${sp.name}, on the table, click to take back`}
      onClick={(e) => onClick(e.currentTarget.getBoundingClientRect())}
      className="block shrink-0 rounded-[14px] text-left transition-[translate,scale] duration-200 ease-spring hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent active:scale-[0.97]"
      style={style}
    >
      {face}
    </button>
  )
}

/** The dashed, card-shaped invitation on an empty mat. */
export function CardSlot({ k, children }: { k: number; children: ReactNode }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[14px] border-2 border-dashed border-white/18 p-3 text-center text-xs text-white/50"
      style={{ width: CARD_W * k, height: CARD_H * k }}
    >
      {children}
    </span>
  )
}

/** A hand's cards grouped by set, with how much of each set the player holds. */
export function SetHeader({ s, seat, group }: { s: GameState; seat: number; group: number }) {
  if (group < 0) return <div className="text-[11px] font-bold text-ink-muted">Stations and utilities</div>
  const spaces = GROUPS[group]!
  const owned = spaces.filter((i) => s.owner[i] === seat).length
  return (
    <div className="flex items-center gap-2 text-[11px] font-bold text-ink-muted">
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

/** The green felt: dot texture, an inset rim and an inner shadow. */
export function Felt({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`relative rounded-3xl bg-felt ${className}`}
      style={{
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.035) 1px, rgba(255,255,255,0) 1px)',
        backgroundSize: '6px 6px',
        boxShadow:
          'inset 0 0 0 6px #122e2a, inset 0 0 0 7px rgba(255,255,255,0.08), inset 0 8px 24px rgba(0,0,0,0.35)',
      }}
    >
      {children}
    </div>
  )
}

const MAT_TONE = {
  give: { border: 'rgba(251,113,133,0.55)', ink: '#fda4af', label: 'You give' },
  get: { border: 'rgba(94,234,212,0.55)', ink: '#5eead4', label: 'You get' },
} as const

/** A dashed mat on the felt where one side of the deal lies. */
export function Mat({
  tone,
  label,
  children,
  footer,
  className = '',
}: {
  tone: 'give' | 'get'
  /** Replaces the default "You give" / "You get". */
  label?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  const t = MAT_TONE[tone]
  return (
    <section
      aria-label={label ?? t.label}
      className={`flex min-w-0 flex-col gap-3 rounded-[18px] border-2 border-dashed p-3 min-[1180px]:p-3.5 ${className}`}
      style={{ borderColor: t.border }}
    >
      <span className="text-xs font-extrabold tracking-[0.12em] uppercase" style={{ color: t.ink }}>
        {label ?? t.label}
      </span>
      {/* Padding keeps a tilted card inside the dashed zone and clear of the label. */}
      <div className="flex flex-wrap items-start gap-2.5 px-0.5 py-1">{children}</div>
      {footer && <div className="mt-auto">{footer}</div>}
    </section>
  )
}

/** The arrows between the mats (turned to point down when the mats are stacked). */
export function SwapArrows() {
  return (
    <div className="flex items-center justify-center">
      <svg
        width="34"
        height="60"
        viewBox="0 0 34 60"
        aria-hidden="true"
        className="max-[699px]:my-1 max-[699px]:size-8 max-[699px]:rotate-90 min-[700px]:max-[1179px]:w-7"
      >
        <path
          d="M4 18 H28 M22 10 L30 18 L22 26 M30 42 H6 M12 34 L4 42 L12 50"
          fill="none"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

/** Cash on a mat as a stack of two to four gold coins; the top coin drops when the amount changes. */
export function CoinStack({
  value,
  row = false,
  reg,
}: {
  value: number
  /** Coins and amount side by side, no backing (the small mats of an offer). */
  row?: boolean
  reg?: (el: HTMLElement | null) => void
}) {
  const n = value < 50 ? 2 : value < 200 ? 3 : 4
  return (
    <span
      ref={reg}
      className={`flex shrink-0 items-center gap-1.5 ${row ? 'flex-row gap-2.5' : 'flex-col rounded-[14px] bg-black/20 px-3.5 py-2.5'}`}
    >
      <span className="relative block h-10 w-11" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => {
          const top = i === n - 1
          return (
            <span
              key={top ? `top${value}` : i}
              className="absolute left-1 block h-[18px] w-9 rounded-[50%]"
              style={{
                top: 4 + (n - 1 - i) * 6,
                background: top ? '#f2c14e' : i % 2 === 0 ? '#c8962a' : '#e0ad3e',
                boxShadow: top ? 'inset 0 -2px 0 #c8962a' : undefined,
                animation: top ? 'coin-drop 380ms cubic-bezier(0.3, 0.9, 0.4, 1) backwards' : undefined,
              }}
            />
          )
        })}
      </span>
      <span className={`font-display font-bold text-gold ${row ? 'text-2xl' : 'text-lg'}`}>
        <Money value={value} />
      </span>
    </span>
  )
}

/** A "Lockup cards" count as a small chip with a key. */
export function JailPill({ count }: { count: number }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-[14px] bg-black/20 px-3.5 py-2.5 text-xs font-bold text-ink">
      <Icon name="lock" size={16} />
      {count === 1 ? 'Lockup card' : `${count} Lockup cards`}
    </span>
  )
}

/** Cash on one side of the deal: an editable amount with gold coin chips. */
export function CashEditor({
  value,
  max,
  onChange,
  label,
  locked = false,
}: {
  value: number
  max: number
  onChange: (v: number) => void
  label: string
  locked?: boolean
}) {
  const set = (v: number) =>
    onChange(Math.max(0, Math.min(Math.floor(max / 10) * 10, Math.round(v / 10) * 10)))
  const [text, setText] = useState<string | null>(null)
  return (
    // One row: amount, +10, +50, +100, Clear. Only a mat too narrow for that lets Clear wrap.
    <div className="@container">
      <div className="flex flex-wrap items-center gap-1 @min-[14rem]:flex-nowrap">
        <label className="flex h-10 min-w-14 flex-1 items-center gap-1 rounded-xl bg-black/25 px-2 focus-within:ring-2 focus-within:ring-accent/70">
          <span className="text-ink-muted">₵</span>
          <input
            aria-label={label}
            inputMode="numeric"
            value={text ?? String(value)}
            disabled={locked}
            placeholder="0"
            onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={() => {
              if (text !== null) set(Number(text || 0))
              setText(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            className="w-full min-w-0 bg-transparent font-display text-[15px] outline-none"
          />
        </label>
        {[10, 50, 100].map((step) => (
          <button
            key={step}
            type="button"
            disabled={locked || value + step > max}
            onClick={() => {
              sound.play('money.coin')
              set(value + step)
            }}
            className={`h-10 shrink-0 rounded-xl bg-coin px-2 text-sm font-extrabold text-[#3a2400] shadow-[inset_0_-3px_0_var(--color-coin-dark)] ${FX_BRIGHT} disabled:opacity-30`}
          >
            +{step}
          </button>
        ))}
        <button
          type="button"
          disabled={locked || value === 0}
          onClick={() => set(0)}
          className={`h-10 shrink-0 rounded-xl px-1.5 text-xs font-bold text-ink-muted underline decoration-white/25 underline-offset-4 ${FX} enabled:hover:bg-white/10 enabled:hover:text-ink disabled:pointer-events-none disabled:no-underline disabled:opacity-30`}
        >
          Clear
        </button>
      </div>
    </div>
  )
}

/** What one side of an offer holds: tilted cards, a coin stack, Lockup cards (read-only). */
export function BundleOnMat({
  s,
  seats,
  bundle,
  k,
  reg,
}: {
  s: GameState
  seats: readonly SeatSetup[]
  bundle: Bundle
  k: number
  /** Called with every piece's element under a key (`space:12`, `cash`, `jail`). */
  reg?: (key: string, el: HTMLElement | null) => void
}) {
  const empty = bundle.spaces.length === 0 && bundle.cash === 0 && bundle.jailCards === 0
  return (
    <>
      {bundle.spaces.map((i) => (
        <MatCard key={i} s={s} seats={seats} space={i} k={k} reg={(el) => reg?.(`space:${i}`, el)} />
      ))}
      {bundle.cash > 0 && <CoinStack value={bundle.cash} row reg={(el) => reg?.('cash', el)} />}
      {bundle.jailCards > 0 && <JailPill count={bundle.jailCards} />}
      {empty && <span className="py-2 text-sm text-white/50">Nothing</span>}
    </>
  )
}

const KNOB_LABEL = [
  ['No way', '#fda4af'],
  ['Hmm…', '#ffcf70'],
  ['Deal!', '#5eead4'],
] as const

/**
 * The bot's feeling about the deal as a meter from "No way" to "Deal!". The knob moves with a
 * transform transition that overshoots (a spring); 0.5 is where the bot starts saying yes.
 */
export function DealMeter({ mood }: { mood: number | null }) {
  const at = Math.max(0.02, Math.min(0.98, mood ?? 0.15))
  const active: number = mood === null ? -1 : mood > 0.5 ? 2 : mood > 0.3 ? 1 : 0
  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="relative h-3 rounded-md bg-[linear-gradient(90deg,#fb7185,#f5b54a_55%,#5eead4)]">
        <output className="sr-only">
          The bot&apos;s answer so far: {active < 0 ? 'nothing yet' : KNOB_LABEL[active]?.[0]}
        </output>
        <span
          className="absolute inset-y-0 left-0 w-full transition-transform duration-500 ease-[cubic-bezier(.3,1.5,.5,1)]"
          style={{ transform: `translateX(${at * 100}%)` }}
        >
          <span
            aria-hidden="true"
            className={`absolute -top-[5px] -left-[11px] size-[22px] rounded-full bg-card shadow-[0_0_0_4px_rgba(245,181,74,0.5),0_4px_8px_rgba(0,0,0,0.4)] transition-opacity ${mood === null ? 'opacity-40' : ''}`}
          />
        </span>
      </div>
      <div className="flex justify-between text-[11px] font-extrabold text-ink-muted">
        {KNOB_LABEL.map(([text, tone], i) => (
          <span key={text} style={i === active ? { color: tone } : undefined}>
            {text}
          </span>
        ))}
      </div>
    </div>
  )
}

const MOOD_RING: Record<Mood | 'thinking', string> = {
  empty: 'rgba(0,0,0,0)',
  thinking: 'rgba(0,0,0,0)',
  no: 'rgba(251,113,133,0.7)',
  close: 'rgba(245,181,74,0.8)',
  yes: 'rgba(94,234,212,0.85)',
}

/** What the bot says, in a cream speech bubble that pops when the line changes. */
export function SpeechBubble({
  text,
  mood,
  tail = 'bottom',
}: {
  text: string
  mood: Mood | 'thinking'
  /** Which corner is squared off (where the speaker is). */
  tail?: 'bottom' | 'top'
}) {
  return (
    <div
      key={`${mood}:${text}`}
      aria-live="polite"
      className={`animate-pop bg-card px-3.5 py-3 font-card-body text-sm font-medium text-card-ink shadow-[0_8px_18px_rgba(2,6,16,0.4)] ${tail === 'bottom' ? 'origin-bottom-left rounded-[16px_16px_16px_4px]' : 'origin-top-left rounded-[4px_16px_16px_16px]'}`}
      style={{ outline: `2px solid ${MOOD_RING[mood]}`, outlineOffset: 0 }}
    >
      {mood === 'thinking' ? (
        <output className="flex gap-1 py-1" aria-label="Thinking">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-1.5 animate-bounce rounded-full bg-card-muted"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </output>
      ) : (
        `“${text}”`
      )}
    </div>
  )
}

const STAMP_WORD: Record<TradeOutcome, [string, string]> = {
  accepted: ['Deal!', '#0f766e'],
  declined: ['Declined', '#be123c'],
  withdrawn: ['Withdrawn', '#be123c'],
}

/**
 * The big result stamp over the table. `outAfter` fades it out after that many ms (a refusal that
 * is about to reopen the table); `out` fades it out now (the cards are leaving).
 */
export function ResultStamp({
  outcome,
  size = 56,
  out = false,
  outAfter,
}: {
  outcome: TradeOutcome
  size?: number
  out?: boolean
  outAfter?: number
}) {
  const [word, color] = STAMP_WORD[outcome]
  return (
    <div
      className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center transition-opacity duration-200 ${out ? 'opacity-0' : ''}`}
      style={
        outAfter !== undefined
          ? { animation: `result-out 260ms ease-in ${Math.max(0, outAfter)}ms forwards` }
          : undefined
      }
    >
      <Stamp word={word.toUpperCase()} color={color} size={size} rotate={-8} bg="rgba(251,248,241,0.94)" />
      <output className="sr-only">{word}</output>
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
  column = false,
}: {
  s: GameState
  me: number
  them: number
  themName: string
  give: Bundle
  get: Bundle
  fee: number
  /** Stack the chips (the trade footer) instead of wrapping them. */
  column?: boolean
}) {
  const mine = setsCompleted(s, me, get.spaces, give.spaces)
  const theirs = setsCompleted(s, them, give.spaces, get.spaces)
  const broken = setsBroken(s, me, give.spaces)
  if (mine.length + theirs.length + broken.length === 0 && fee === 0) return null
  return (
    <div className={`flex gap-1.5 text-xs ${column ? 'flex-col items-start' : 'flex-wrap'}`}>
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
    good: 'bg-accent/14 text-gold',
    warn: 'bg-alert/12 text-[#fda4af]',
    info: 'bg-white/8 text-ink-muted',
  }[tone]
  return (
    <span
      className={`inline-flex animate-pop items-center gap-1.5 rounded-full px-2.5 py-1 font-extrabold ${cls}`}
    >
      {color && <span className="size-2.5 rounded-[3px]" style={{ background: color }} />}
      {children}
    </span>
  )
}
