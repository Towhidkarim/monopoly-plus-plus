import { useEffect, useRef, type ReactNode } from 'react'
import { SPACES, mortgageValue } from '@skyline/engine'
import type { PieceKind } from '@skyline/board'
import { groupColor, groupName } from '../../spaceInfo.ts'
import { useCardEnv, useLotPortrait, useReducedMotion } from './cardEnv.tsx'
import { CardStage, Stamp } from './cardMotion.tsx'
import { familyOf } from './deed.ts'
import { fmtMoney } from './format.ts'
import { PieceIcon } from './icons.tsx'

/** Card-stock design tokens (index.css), spelled out where inline styles need them. */
const INK = '#1f2a3d'
const MONEY = '#1d7354'
const NOW_MONEY = '#14513b'
const RULE = '#e7dfcd'
const SLATE = '#33415c'
const SKY_DAY = '#dcebe3'
const SKY_NIGHT = '#16213a'
const STRIPES = (n: number) =>
  `repeating-linear-gradient(135deg, rgba(255,255,255,0.14) 0 ${n}px, rgba(255,255,255,0) ${n}px ${n * 2}px)`

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

/** Dark ink on light bands, white on deep ones. */
function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.5 ? '#0b2a3a' : '#ffffff'
}

/** Who owns the card's space: their seat color and piece (the token emblem on the card). */
export interface DeedOwner {
  name: string
  color: string
  piece: PieceKind
}

export type DeedState = 'forSale' | 'owned' | 'mortgaged'

export interface DeedCardProps {
  index: number
  /**
   * Legacy row marker (see `activeRow` in deed.ts): properties 0 = base, 1 = full set,
   * 2..6 = 1 house..hotel; stations, the number owned minus one; utilities, 0 or 1.
   * Ignored when `level` is given.
   */
  active?: number
  className?: string
  variant?: 'full' | 'compact'
  /** Default: `owned` when `owner` is given, else `forSale`. */
  state?: DeedState
  owner?: DeedOwner | null
  /** Houses 0 to 4, hotel 5 (properties); for stations and utilities, the number owned minus one. */
  level?: number
  /** How many of the set the viewer (or owner) holds, for the set progress row. */
  setOwned?: number
  /** Deal in from the deck and flip over, with sway and tilt (for card moments). */
  moment?: boolean
  /** Where a dealt card starts, in px from its place. */
  dealFrom?: { x: number; y: number }
  /** Gold outline (compact cards in a picker). */
  selected?: boolean
  /** Overrides the game's sky for the hero window. */
  night?: boolean
  /** Rubber stamp over the card (SOLD, DEAL!). */
  stamp?: string | undefined
}

const HOUSE = 'M1.5 6 L6.5 1.5 L11.5 6 V11 H1.5 Z'
const HOTEL = 'M2 13 V4 L7 1 L12 4 V13 Z M5 6 H6 M8 6 H9 M5 9 H6 M8 9 H9'

function Coin({ size = 18 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-coin font-bold text-[#5a3a00] shadow-[inset_0_-2px_0_var(--color-coin-dark)]"
      style={{ width: size, height: size, fontSize: size * 0.55 }}
    >
      ₵
    </span>
  )
}

/** Station and utility emblems for the hero window. */
function Emblem({ kind, color }: { kind: 'railroad' | 'utility'; color: string }) {
  return (
    <svg width="84" height="84" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      {kind === 'railroad' ? (
        <g stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="11" y="6" width="26" height="28" rx="6" />
          <path d="M11 20 H37 M17 26 H18 M30 26 H31" />
          <rect x="16" y="10" width="16" height="8" rx="2" />
          <path d="M16 34 L12 42 M32 34 L36 42 M8 42 H40" />
        </g>
      ) : (
        <g stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="24" cy="24" r="18" />
          <path d="M27 7 L16 26 H24 L21 41 L33 20 H25 Z" fill={color} fillOpacity="0.25" />
        </g>
      )}
    </svg>
  )
}

interface Row {
  key: string
  label?: string
  slots?: number
  hotel?: boolean
  amount: string
  small?: boolean
}

function rowsFor(index: number): Row[] {
  const sp = SPACES[index]!
  if (sp.kind === 'property') {
    return [
      { key: 'base', label: 'Rent', amount: fmtMoney(sp.rent[0]!) },
      ...[1, 2, 3, 4].map((n) => ({ key: `h${n}`, slots: n, amount: fmtMoney(sp.rent[n]!) })),
      { key: 'hotel', hotel: true, amount: fmtMoney(sp.rent[5]!) },
    ]
  }
  if (sp.kind === 'railroad') {
    return sp.rent.map((r, i) => ({
      key: `s${i}`,
      label: `${i + 1} station${i ? 's' : ''}`,
      slots: i + 1,
      amount: fmtMoney(r),
    }))
  }
  return [
    { key: 'u1', label: '1 utility', amount: '4 × dice', small: true },
    { key: 'u2', label: '2 utilities', amount: '10 × dice', small: true },
  ]
}

/** Which row is "now": from `level`, or from the legacy `active` marker. */
function nowRow(index: number, level: number | undefined, active: number): number {
  const sp = SPACES[index]!
  if (level !== undefined) return level
  if (active < 0) return -1
  return sp.kind === 'property' ? Math.max(0, active - 1) : active
}

function levelLabel(kind: string, state: DeedState | 'plain', level: number, owned: number): string {
  if (kind === 'railroad') return state === 'forSale' ? 'Station' : `${level + 1} of ${owned || 4} owned`
  if (kind === 'utility') return state === 'forSale' ? 'Utility' : 'Powering the city'
  if (state === 'forSale') return 'Empty lot'
  if (level === 0) return 'No houses yet'
  return level >= 5 ? 'Hotel' : `${level} ${level === 1 ? 'house' : 'houses'}`
}

/**
 * The printed card for an ownable space (D32): striped group band, hero window with the lot's
 * real building from the board, rent ladder with the current row marked NOW, Build and Mortgage
 * footer. States: for sale (ribbon), owned (token emblem), mortgaged (desaturated, stamped).
 * Stations and utilities share the style with a slate band and an emblem. Keeps the old
 * `{ index, active, className }` props working.
 */
export function DeedCard({
  index,
  active = -1,
  className = '',
  variant = 'full',
  state,
  owner = null,
  level,
  setOwned,
  moment = false,
  dealFrom,
  selected = false,
  night,
  stamp,
}: DeedCardProps) {
  const sp = SPACES[index]!
  const env = useCardEnv()
  const reduced = useReducedMotion()
  const dark = night ?? env.night
  const st: DeedState = state ?? (owner ? 'owned' : 'forSale')
  const mortgaged = st === 'mortgaged'
  const isProp = sp.kind === 'property'
  const family = familyOf(index)
  const color = isProp ? groupColor(sp.group) : SLATE
  const ink = inkOn(color)
  const frame = rgba(color, 0.9)
  const frameSoft = rgba(color, 0.3)
  const now = st === 'forSale' || mortgaged ? -1 : nowRow(index, level, active)
  const houses = isProp ? Math.min(5, Math.max(0, level ?? Math.max(0, active - 1))) : 0
  const portrait = useLotPortrait(index, st === 'forSale' || !isProp ? -1 : houses, dark)
  const rows = rowsFor(index)
  const total = family.length
  const have = setOwned ?? (owner ? 1 : 0)
  const number = `${isProp ? groupName(sp.group) : sp.kind === 'railroad' ? 'Stations' : 'Utilities'} · ${family.indexOf(index) + 1} / ${total}`
  const stateLabel = mortgaged
    ? 'mortgaged'
    : st === 'forSale'
      ? 'for sale'
      : `owned by ${owner?.name ?? 'a player'}`
  const sky = dark ? SKY_NIGHT : SKY_DAY
  const label = levelLabel(sp.kind, st, Math.max(0, now), have)

  // Rent jiggle when the building level changes after the first paint.
  const cardRef = useRef<HTMLElement>(null)
  const lastLevel = useRef(houses)
  useEffect(() => {
    if (lastLevel.current !== houses && !reduced) {
      cardRef.current?.animate(
        [
          { transform: 'none' },
          { transform: 'rotate(-3deg) scale(1.03)', offset: 0.25 },
          { transform: 'rotate(2.5deg) scale(1.03)', offset: 0.5 },
          { transform: 'rotate(-1deg)', offset: 0.75 },
          { transform: 'none' },
        ],
        { duration: 420, easing: 'ease-out' },
      )
    }
    lastLevel.current = houses
  }, [houses, reduced])

  const shell = (node: ReactNode, w: number, radius: number) =>
    moment ? (
      <CardStage
        deal
        radius={radius}
        {...(dealFrom ? { dealFrom } : {})}
        back={{ color: '#1d2944', edge: '#f5b54a', label: 'DEEDS' }}
        className={`inline-block ${className}`}
      >
        <div style={{ width: w }}>{node}</div>
      </CardStage>
    ) : (
      <div className={`inline-block ${className}`} style={{ width: w }}>
        {node}
      </div>
    )

  if (variant === 'compact') {
    const slots = isProp && houses < 5 ? [0, 1, 2, 3] : []
    return shell(
      <article
        ref={cardRef}
        aria-label={`${sp.name}, ${stateLabel}`}
        className="relative overflow-hidden rounded-[14px] bg-card font-card-body text-card-ink"
        style={{
          width: 140,
          boxShadow: selected
            ? '0 18px 34px rgba(2,6,16,0.6), 0 2px 0 var(--color-card-edge)'
            : '0 14px 30px rgba(2,6,16,0.55), 0 2px 0 var(--color-card-edge)',
          filter: mortgaged ? 'saturate(0.35)' : undefined,
          outline: selected ? '3px solid #f5b54a' : undefined,
          outlineOffset: 2,
        }}
      >
        <div className="h-[50px] px-2.5 py-2" style={{ background: color, backgroundImage: STRIPES(7) }}>
          <span
            className="block text-[8px] font-bold tracking-[0.16em] uppercase opacity-80"
            style={{ color: ink }}
          >
            {isProp ? groupName(sp.group) : sp.kind === 'railroad' ? 'Station' : 'Utility'}
          </span>
          <span className="block font-card text-[15px] leading-[1.05] font-extrabold" style={{ color: ink }}>
            {sp.name}
          </span>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-[5px] rounded-[10px] border"
          style={{ borderColor: frame }}
        />
        <div
          className="relative mx-2.5 mt-2 h-[76px] overflow-hidden rounded-[9px] px-3 pt-0.5 shadow-[inset_0_2px_6px_rgba(0,0,0,0.22)]"
          style={{ background: sky }}
        >
          <Hero portrait={portrait} kind={sp.kind} name={sp.name} color={dark ? '#cbd5f5' : SLATE} small />
        </div>
        <div className="flex items-center justify-between px-2.5 pt-2 pb-2.5">
          <span className="font-card text-sm font-extrabold" style={{ color: MONEY }}>
            {fmtMoney(sp.price)}
          </span>
          <span className="flex items-center gap-0.5" aria-hidden="true">
            {slots.map((k) => (
              <svg key={k} width="11" height="10" viewBox="0 0 13 12">
                <path
                  d={HOUSE}
                  fill={k < houses && !mortgaged && st === 'owned' ? color : 'transparent'}
                  stroke={k < houses && st === 'owned' ? INK : '#c9c1ae'}
                  strokeWidth="1.2"
                />
              </svg>
            ))}
          </span>
        </div>
        {st === 'owned' && owner && (
          <span
            aria-label={`Owned by ${owner.name}`}
            className="absolute top-[38px] right-2 size-6 rounded-full border-[3px] border-card shadow-[0_3px_6px_rgba(0,0,0,0.3)]"
            style={{ background: owner.color }}
          />
        )}
        {mortgaged && (
          <Stamp
            word="MORTGAGED"
            color="#b42318"
            size={11}
            rotate={-10}
            className="absolute inset-x-1.5 top-24 text-center"
          />
        )}
      </article>,
      140,
      14,
    )
  }

  const nameSize = sp.name.length > 15 ? 22 : 27
  return shell(
    <article
      ref={cardRef}
      aria-label={`${sp.name} title deed, ${stateLabel}`}
      className="relative overflow-hidden rounded-[20px] bg-card font-card-body text-card-ink"
      style={{
        width: 300,
        boxShadow: '0 24px 50px rgba(2,6,16,0.6), 0 3px 0 var(--color-card-edge)',
        filter: mortgaged ? 'saturate(0.35)' : undefined,
      }}
    >
      <div className="relative h-[92px]" style={{ background: color, backgroundImage: STRIPES(9) }}>
        <svg
          width="14"
          height="13"
          viewBox="0 0 13 12"
          aria-hidden="true"
          className="absolute top-4 left-[18px]"
        >
          <path d="M1 6 L6.5 1 L12 6 V11 H1 Z" fill={ink} opacity="0.7" />
        </svg>
        <span
          className="absolute inset-x-0 top-4 text-center text-[11px] font-bold tracking-[0.2em] uppercase opacity-80"
          style={{ color: ink }}
        >
          {isProp ? groupName(sp.group) : sp.kind === 'railroad' ? 'Station' : 'Utility'}
        </span>
        <span
          className="absolute inset-x-5 top-9 text-center font-card leading-[1.05] font-extrabold"
          style={{ color: ink, fontSize: nameSize }}
        >
          {sp.name}
        </span>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-2 rounded-[14px] border-[1.5px]"
        style={{ borderColor: frame }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-3 rounded-[11px] border"
        style={{ borderColor: frameSoft }}
      />
      {st === 'owned' && owner && (
        <span
          className="absolute top-[66px] right-[18px] flex size-[46px] items-center justify-center rounded-full border-4 border-card shadow-[0_6px_14px_rgba(20,16,8,0.3),inset_0_-4px_0_rgba(0,0,0,0.18)]"
          style={{ background: owner.color }}
        >
          <span className="sr-only">Owned by {owner.name}</span>
          <PieceIcon piece={owner.piece} size={24} />
        </span>
      )}
      <div
        className="relative mx-5 mt-3.5 h-[150px] overflow-hidden rounded-[14px]"
        style={{
          background: sky,
          boxShadow: `inset 0 2px 8px rgba(0,0,0,0.25), 0 0 0 3px #fbf8f1, 0 0 0 4px ${frameSoft}`,
        }}
      >
        <div className="absolute inset-x-[22px] top-1.5 bottom-0">
          <Hero portrait={portrait} kind={sp.kind} name={sp.name} color={dark ? '#cbd5f5' : SLATE} />
        </div>
        <span className="absolute top-2.5 left-2.5 rounded-full bg-card/90 px-[9px] py-1 text-[11px] font-bold text-card-ink">
          {label}
        </span>
        <span className="absolute right-2.5 bottom-2.5 flex items-center gap-[5px] rounded-full bg-card py-1 pr-2.5 pl-[5px] font-card text-[15px] font-extrabold text-card-ink shadow-[0_3px_8px_rgba(0,0,0,0.25)]">
          <Coin />
          {sp.price}
        </span>
      </div>
      <div className="flex items-center gap-2 px-[22px] pt-3 pb-1">
        <span className="flex gap-1" aria-hidden="true">
          {family.map((_, k) => (
            <span
              key={k}
              className="h-5 w-4 rounded-[4px] border-[1.5px]"
              style={{ background: k < have ? color : 'transparent', borderColor: color }}
            />
          ))}
        </span>
        <span className="text-xs font-bold text-card-muted">
          {isProp ? 'Set' : sp.kind === 'railroad' ? 'Stations' : 'Utilities'} {have} of {total}
          {have === total ? ' · complete' : ''}
        </span>
      </div>
      <div className="flex flex-col px-4 pt-1.5 pb-1">
        {rows.map((r, i) => {
          const isNow = i === now
          return (
            <div
              key={r.key}
              className="flex items-center gap-2 rounded-[10px] px-2 py-1.5 transition-colors"
              style={{
                background: isNow ? rgba(color, 0.28) : 'transparent',
                borderBottom: `1px dashed ${i === rows.length - 1 || isNow ? 'transparent' : RULE}`,
              }}
            >
              <span className="w-[34px] text-[9px] font-extrabold tracking-[0.1em]" style={{ color: INK }}>
                {isNow ? 'NOW' : ''}
              </span>
              <span className="flex flex-1 items-center gap-[3px] text-[13px] font-bold text-card-muted">
                {r.label}
                {r.slots !== undefined && (
                  <span className="flex gap-[3px]" aria-label={`${r.slots} ${isProp ? 'houses' : 'owned'}`}>
                    {isProp
                      ? Array.from({ length: r.slots }, (_, k) => (
                          <svg key={k} width="14" height="13" viewBox="0 0 13 12" aria-hidden="true">
                            <path d={HOUSE} fill={isNow ? color : '#d8cfbb'} stroke={INK} strokeWidth="1.2" />
                          </svg>
                        ))
                      : null}
                  </span>
                )}
                {r.hotel && (
                  <>
                    <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
                      <path d={HOTEL} fill={isNow ? color : '#efe7d4'} stroke={INK} strokeWidth="0.8" />
                    </svg>
                    <span>Hotel</span>
                  </>
                )}
              </span>
              <span
                className={`font-card font-extrabold tabular-nums ${r.small ? 'text-sm' : 'text-base'}`}
                style={{ color: isNow ? NOW_MONEY : MONEY }}
              >
                {r.amount}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between gap-2 px-[22px] pt-2.5 pb-1.5">
        {isProp && (
          <span className="flex items-center gap-1.5 text-xs font-bold text-[#3d4757]">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M3 13 L9 7 M7 3 L13 9 M6 4 L10 2 L14 6 L12 10"
                fill="none"
                stroke="#3d4757"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Build {fmtMoney(sp.houseCost)}
          </span>
        )}
        <span className="flex items-center gap-1.5 text-xs font-bold text-[#3d4757]">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M2 6 L8 2 L14 6 Z M3 7 V12 M6.5 7 V12 M9.5 7 V12 M13 7 V12 M2 14 H14"
              fill="none"
              stroke="#3d4757"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          Mortgage {fmtMoney(mortgageValue(index))}
        </span>
      </div>
      <div className="flex items-center justify-between px-[22px] pt-1 pb-[18px] text-[10px] text-[#7a8293]">
        <span>
          {isProp
            ? '×2 rent with the full set'
            : sp.kind === 'railroad'
              ? 'Rent grows with each station'
              : 'Own both for 10 × dice'}
        </span>
        <span>{number}</span>
      </div>
      {st === 'forSale' && (
        <div
          aria-hidden="true"
          className="absolute top-[22px] -right-11 w-[170px] rotate-[38deg] bg-[#c94a31] py-1.5 text-center text-[11px] font-extrabold tracking-[0.18em] text-white shadow-[0_4px_10px_rgba(0,0,0,0.25)]"
        >
          FOR SALE
        </div>
      )}
      {mortgaged && (
        <Stamp
          word="MORTGAGED"
          color="#b42318"
          size={26}
          rotate={-12}
          className="absolute top-[250px] left-[34px]"
        />
      )}
      {stamp && <Stamp word={stamp} size={44} rotate={-9} shake className="absolute top-[190px] left-10" />}
    </article>,
    300,
    20,
  )
}

/**
 * The hero window's picture: the lot's building (fades in when ready) or, for stations and
 * utilities, an emblem. Empty while loading, so the window never changes size.
 */
function Hero({
  portrait,
  kind,
  name,
  color,
  small = false,
}: {
  portrait: string | null
  kind: string
  name: string
  color: string
  small?: boolean
}) {
  if (kind === 'railroad' || kind === 'utility') {
    return (
      <div
        className="flex size-full items-center justify-center"
        style={small ? { transform: 'scale(0.6)' } : undefined}
      >
        <Emblem kind={kind} color={color} />
      </div>
    )
  }
  return portrait ? (
    <img
      src={portrait}
      alt={`${name}, as built on the board`}
      draggable={false}
      className="size-full animate-fade object-contain object-bottom"
      style={small ? { transform: 'scale(1.1)' } : undefined}
    />
  ) : null
}

/** The old name; the card grew into DeedCard. */
export const TitleDeed = DeedCard
