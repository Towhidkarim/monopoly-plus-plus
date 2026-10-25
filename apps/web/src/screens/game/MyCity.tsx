import { usePanelSound } from '../../audio/usePanelSound.ts'
import { sound } from '../../audio/engine.ts'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  GROUPS,
  HOTEL,
  RAILROADS,
  SPACES,
  UTILITIES,
  legalActions,
  mortgageValue,
  netWorth,
  rentFor,
  unmortgageCost,
  type Action,
} from '@skyline/engine'
import { buildEvenlyPlan, sellEvenlyPlan } from '@skyline/bots'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { cssHex, groupColor, groupName } from '../../spaceInfo.ts'
import { useReducedMotion } from './cardEnv.tsx'
import { useDialogFocus } from './useDialogFocus.ts'
import { BuildIcon, Icon, MedalIcon, SkylineIcon, StarIcon } from './icons.tsx'
import { DeedCard } from './TitleDeed.tsx'
import { DeedSwatch, TickingMoney, FX, FX_BRIGHT, FX_GHOST } from './ui.tsx'
import { ARMED, ConfirmBar, ConfirmBtn } from './ConfirmBtn.tsx'
import { useConfirmPress } from './useConfirmPress.ts'
import { fmtMoney } from './format.ts'

interface Family {
  key: string
  name: string
  color: string
  spaces: readonly number[]
  /** Color group index, or -1 for stations and utilities. */
  group: number
}

const FAMILIES: Family[] = [
  ...GROUPS.map((spaces, g) => ({
    key: `g${g}`,
    name: groupName(g),
    color: groupColor(g),
    spaces,
    group: g,
  })),
  { key: 'rail', name: 'Stations', color: '#94a3b8', spaces: RAILROADS, group: -1 },
  { key: 'util', name: 'Utilities', color: '#64748b', spaces: UTILITIES, group: -1 },
]

/**
 * Everything the viewer owns, by set: the cards of a finished set fanned out with one-click Build
 * evenly, the rest as rows with mortgage controls and a way to ask the owner in a trade. Shows the
 * presented board; legality comes from the engine state.
 */
export function MyCity({
  snap,
  store,
  seat,
  onClose,
  onFocus,
  onAsk,
}: {
  snap: Snapshot
  store: GameStore
  seat: number
  onClose: () => void
  onFocus: (space: number) => void
  /** Opens the trade table asking `partner` for `space`; null when trading is not possible. */
  onAsk: ((partner: number, space: number) => void) | null
}) {
  usePanelSound()
  // A drawer beside the board, not a modal: the board stays usable, so Tab is not trapped.
  const dialog = useDialogFocus({ modal: false })
  const s = snap.state
  const p = snap.presented
  const me = p.players[seat]!
  const id = me.id
  const canManage = store.seatKind(id) === 'human' && !me.bankrupt && s.phase !== 'gameOver'
  const legal = canManage ? legalActions(s, id) : []
  const can = (a: Action) =>
    legal.some((x) => x.type === a.type && 'space' in x && 'space' in a && x.space === a.space)
  const act = (a: Action) => void store.dispatch(id, a)

  const worth = s.players.map((pl, i) => (pl.bankrupt ? -1 : netWorth(s, i)))
  const rank = worth.filter((w) => w > worth[seat]!).length + 1
  const alive = s.players.filter((pl) => !pl.bankrupt).length

  const families = FAMILIES.map((f) => ({ f, mine: f.spaces.filter((i) => p.owner[i] === seat).length }))
    .filter((x) => x.mine > 0)
    .toSorted(
      (a, b) =>
        Number(b.mine === b.f.spaces.length) - Number(a.mine === a.f.spaces.length) || b.mine - a.mine,
    )

  const seatInfo = store.setup.seats[seat]!

  return (
    <aside
      {...dialog.props}
      className="pointer-events-auto absolute top-26 right-4 bottom-35 flex w-120 max-w-[calc(100%-2rem)] animate-slide-in flex-col overflow-hidden rounded-[26px] border border-line bg-panel shadow-[inset_0_1px_0_rgba(255,255,255,0.08),-20px_0_60px_rgba(2,6,16,0.55)]"
    >
      <header className="flex items-center justify-between px-5 pt-4.5 pb-3 [@media(max-height:760px)]:pt-3 [@media(max-height:760px)]:pb-2">
        <h2 id={dialog.titleId} className="flex items-center gap-2.5 font-display text-2xl font-bold">
          <SkylineIcon />
          My city
          {store.setup.seats.filter((x) => x.kind === 'human').length > 1 && (
            <span className="text-base font-semibold" style={{ color: cssHex(seatInfo.color) }}>
              {me.name}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close My city"
          title="Close (Esc)"
          className={`flex size-9.5 items-center justify-center rounded-xl border border-line ${FX} enabled:hover:bg-white/10`}
        >
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="grid grid-cols-3 gap-2 px-5 pb-3.5">
        <Stat label="Cash">
          <TickingMoney value={me.cash} className="text-gold" />
        </Stat>
        <Stat label="Net worth">{fmtMoney(Math.max(0, worth[seat]!))}</Stat>
        <Stat label="Rank">
          {me.bankrupt ? (
            'Out'
          ) : (
            <span className="flex items-center gap-1.5">
              <MedalIcon rank={rank} />
              {ordinal(rank)} <span className="text-[13px] font-semibold text-ink-muted">of {alive}</span>
            </span>
          )}
        </Stat>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3.5 pb-3">
        {families.length === 0 && (
          <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">
            You don't own anything yet. Land on a space that is for sale to buy it.
          </p>
        )}
        {families.map(({ f, mine }) => (
          <SetSection
            key={f.key}
            f={f}
            mine={mine}
            snap={snap}
            store={store}
            seat={seat}
            canManage={canManage}
            can={can}
            act={act}
            onFocus={onFocus}
            onAsk={onAsk}
          />
        ))}
      </div>

      <p className="border-t border-line/50 px-5 pt-3 pb-4 text-xs leading-relaxed text-ink-muted [@media(max-height:760px)]:hidden">
        Build, sell and mortgage any time, even on other players' turns. Mortgaged properties earn no rent.
      </p>
    </aside>
  )
}

function SetSection({
  f,
  mine,
  snap,
  store,
  seat,
  canManage,
  can,
  act,
  onFocus,
  onAsk,
}: {
  f: Family
  mine: number
  snap: Snapshot
  store: GameStore
  seat: number
  canManage: boolean
  can: (a: Action) => boolean
  act: (a: Action) => void
  onFocus: (space: number) => void
  onAsk: ((partner: number, space: number) => void) | null
}) {
  const s = snap.state
  const p = snap.presented
  const id = p.players[seat]!.id
  const reduced = useReducedMotion()
  const [rows, setRows] = useState(false)
  const complete = mine === f.spaces.length
  const buildable = complete && f.group >= 0
  const build = buildable && canManage ? buildEvenlyPlan(s, id, f.group) : null
  const sell = buildable && canManage ? sellEvenlyPlan(s, id, f.group) : null
  const levels = f.spaces.map((i) => p.houses[i]!)
  const anyMortgaged = f.spaces.some((i) => p.mortgaged[i])
  const hotels = levels.every((l) => l >= HOTEL - 1)

  // A set that becomes complete while the drawer is open pops its pill (and the section nods).
  const sectionRef = useRef<HTMLElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const wasComplete = useRef(complete)
  useEffect(() => {
    if (complete && !wasComplete.current && !reduced) {
      pillRef.current?.animate(
        [
          { transform: 'scale(0.3) rotate(-12deg)', opacity: 0 },
          { transform: 'scale(1.25) rotate(3deg)', opacity: 1, offset: 0.6 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 520, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)' },
      )
      sectionRef.current?.animate(
        [{ transform: 'none' }, { transform: 'scale(1.02)', offset: 0.4 }, { transform: 'none' }],
        { duration: 420, easing: 'ease-out' },
      )
    }
    wasComplete.current = complete
  }, [complete, reduced])

  const seatInfo = store.setup.seats[seat]!
  const owner = { name: p.players[seat]!.name, color: cssHex(seatInfo.color), piece: seatInfo.piece }
  const fan = buildable && f.spaces.length <= 3
  const rent = (i: number) => rentFor(s, i, 7)
  const lo = Math.min(...levels)
  const hi = Math.max(...levels)
  const houseLine =
    hi >= HOTEL && lo >= HOTEL
      ? 'Hotels'
      : lo === hi
        ? `${lo} ${lo === 1 ? 'house' : 'houses'} each`
        : `${lo}–${hi} houses`
  const showRows = !fan || rows

  return (
    <section
      ref={sectionRef}
      aria-label={`${f.name} set`}
      className={`shrink-0 rounded-[20px] p-3.5 ${complete ? 'border-[1.5px] border-accent/55 bg-accent/5 shadow-[0_0_24px_rgba(245,181,74,0.08)]' : 'border border-line/60 bg-white/3'}`}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-display text-base font-bold">
          <span className="size-3.5 rounded" style={{ background: f.color }} />
          {f.name}
        </span>
        {complete ? (
          <span
            ref={pillRef}
            className="flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-0.75 text-[10px] font-extrabold tracking-widest text-accent-ink"
          >
            <StarIcon color="#1c1205" />
            SET COMPLETE
          </span>
        ) : (
          <span className="text-xs text-ink-muted">
            {mine} of {f.spaces.length}
          </span>
        )}
      </div>

      {fan && (
        <div className="mt-3 mb-2.5 flex items-center">
          <div className="flex shrink-0">
            {f.spaces.map((i, k) => {
              const mortgaged = p.mortgaged[i]
              const tilt = f.spaces.length === 2 ? (k === 0 ? -2.5 : 2.5) : (k - 1) * 3.5
              return (
                <div
                  key={i}
                  className={`flex flex-col items-center gap-1.5 ${k > 0 ? '-ml-2' : ''}`}
                  style={{ zIndex: k }}
                >
                  <button
                    type="button"
                    onClick={() => onFocus(i)}
                    title={`${SPACES[i]!.name}: show on the board`}
                    aria-label={`${SPACES[i]!.name}, show on the board`}
                    className="block rounded-[14px] text-left transition-[translate,scale] duration-200 ease-spring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent hover:-translate-y-1 active:scale-[0.97]"
                    style={{ rotate: `${tilt}deg` }}
                  >
                    <div style={{ zoom: 0.7 }}>
                      <DeedCard
                        index={i}
                        variant="compact"
                        owner={owner}
                        state={mortgaged ? 'mortgaged' : 'owned'}
                        level={p.houses[i]!}
                        setOwned={mine}
                      />
                    </div>
                  </button>
                  {buildable && canManage && (
                    <LotStepper
                      name={SPACES[i]!.name}
                      cost={SPACES[i]!.houseCost}
                      level={p.houses[i]!}
                      canBuild={can({ type: 'BUILD', space: i })}
                      canSell={can({ type: 'SELL_BUILDING', space: i })}
                      onBuild={() => act({ type: 'BUILD', space: i })}
                      onSell={() => act({ type: 'SELL_BUILDING', space: i })}
                    />
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 pl-3 text-xs text-ink-muted">
            <span>{houseLine}</span>
            <span>
              Rent now <strong className="text-gold tabular-nums">{range(f.spaces.map(rent))}</strong>
            </span>
            {build && build.actions.length > 0 && (
              <span>
                Next level{' '}
                <strong className="text-ink tabular-nums">
                  {range(f.spaces.map((i) => rentAt(i, p.houses[i]! + 1)))}
                </strong>
              </span>
            )}
          </div>
        </div>
      )}

      {buildable && canManage && build && sell && (
        <div className="flex gap-2">
          <GoldBtn
            disabled={build.actions.length === 0}
            onClick={() => store.run(id, build.actions)}
            label={
              build.actions.length > 0
                ? `${hotels ? 'Build hotels' : 'Build evenly'} · ${fmtMoney(build.amount)} for ${build.actions.length} ${hotels ? (build.actions.length > 1 ? 'hotels' : 'hotel') : build.actions.length > 1 ? 'houses' : 'house'}`
                : buildBlocker(levels, anyMortgaged, SPACES[f.spaces[0]!]!.houseCost)
            }
          />
          <ConfirmBtn
            disabled={sell.actions.length === 0}
            onConfirm={() => store.run(id, sell.actions)}
            title={
              sell.actions.length ? `Sell one level for +${fmtMoney(sell.amount)}` : 'No buildings to sell'
            }
            armedLabel={`${sell.actions.length > 1 ? `Sell ${sell.actions.length}` : 'Sell'}? +${fmtMoney(sell.amount)}`}
            armedAriaLabel={`Press again to sell ${sell.actions.length > 1 ? `${sell.actions.length} levels` : 'one level'} in ${f.name} for ${sell.amount}`}
            idleClass="border-line bg-transparent text-ink enabled:hover:bg-white/5"
            className="h-11.5 gap-2 rounded-[14px] px-4 text-sm"
          >
            Sell
          </ConfirmBtn>
        </div>
      )}

      {fan && (
        <button
          type="button"
          onClick={() => setRows((v) => !v)}
          aria-expanded={rows}
          className={`mt-2.5 rounded-md px-1 py-0.5 text-xs font-bold text-ink-muted ${FX_GHOST}`}
        >
          {rows ? 'Hide mortgages ▴' : 'Mortgages ▾'}
        </button>
      )}

      {showRows && (
        <div className="mt-2.5 flex flex-col gap-1.5">
          {f.spaces.map((i) => {
            const ownerSeat = p.owner[i]!
            const sp = SPACES[i]!
            if (ownerSeat !== seat) {
              const other = ownerSeat >= 0 ? p.players[ownerSeat]! : null
              const auction = s.pending?.kind === 'auction' && s.pending.space === i
              return (
                <div
                  key={i}
                  className="flex items-center gap-2.5 rounded-xl border border-dashed border-white/14 px-2.5 py-2 opacity-80"
                >
                  <DeedSwatch color={f.color} small dashed />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <RowName name={sp.name} onFocus={() => onFocus(i)} bold={false} />
                    {other ? (
                      <span className="flex items-center gap-1.25 text-xs text-ink-muted">
                        <span
                          className="size-2 rounded-full"
                          style={{ background: cssHex(store.setup.seats[ownerSeat]!.color) }}
                        />
                        {other.name} owns
                      </span>
                    ) : (
                      <span className="text-xs text-ink-muted">
                        {auction ? 'at auction now' : `for sale · ${fmtMoney(sp.price)}`}
                      </span>
                    )}
                  </div>
                  {other && onAsk && !other.bankrupt && (
                    <button
                      type="button"
                      onClick={() => {
                        sound.play('ui.click')
                        onAsk(ownerSeat, i)
                      }}
                      className={`h-9 shrink-0 rounded-[10px] px-3 text-[13px] font-extrabold text-accent ${FX} enabled:hover:bg-accent/10`}
                    >
                      Ask in a trade →
                    </button>
                  )}
                </div>
              )
            }
            const mortgaged = p.mortgaged[i]
            const mortgage: Action = { type: 'MORTGAGE', space: i }
            const lift: Action = { type: 'UNMORTGAGE', space: i }
            const level = p.houses[i]!
            return (
              <div
                key={i}
                className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${mortgaged ? 'border border-alert/25 bg-[rgba(180,35,24,0.12)]' : 'bg-white/4'}`}
              >
                <DeedSwatch color={f.color} small gray={!!mortgaged} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <RowName name={sp.name} onFocus={() => onFocus(i)} bold />
                  <span className={`text-xs ${mortgaged ? 'text-rose-300' : 'text-ink-muted'}`}>
                    {mortgaged
                      ? 'mortgaged · earns no rent'
                      : sp.kind === 'utility'
                        ? `${mine === 2 ? 10 : 4}× dice`
                        : `rent ${fmtMoney(rent(i))}${sp.kind === 'property' && complete && level > 0 ? ` · ${level >= HOTEL ? 'hotel' : `${level} ${level === 1 ? 'house' : 'houses'}`}` : ''}`}
                  </span>
                </div>
                {canManage &&
                  (mortgaged ? (
                    <RowBtn tone="gold" disabled={!can(lift)} onClick={() => act(lift)}>
                      Lift −{fmtMoney(unmortgageCost(s, i))}
                    </RowBtn>
                  ) : (
                    <ConfirmBtn
                      disabled={!can(mortgage)}
                      onConfirm={() => act(mortgage)}
                      title={can(mortgage) ? undefined : 'Sell the buildings in this set first'}
                      armedLabel={`Mortgage? +${fmtMoney(mortgageValue(i))}`}
                      armedAriaLabel={`Press again to mortgage ${sp.name} for ${mortgageValue(i)}`}
                      idleClass="border-teal/45 bg-teal/8 text-teal enabled:hover:bg-teal/15"
                      className="h-9 shrink-0 rounded-[10px] px-3 text-[13px]"
                    >
                      Mortgage +{fmtMoney(mortgageValue(i))}
                    </ConfirmBtn>
                  ))}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

/** "₵a–₵b", or one amount when they match. */
function range(vals: number[]): string {
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  return lo === hi ? fmtMoney(lo) : `${fmtMoney(lo)}–${fmtMoney(hi)}`
}

/** Rent of `space` at `level` (clamped to a hotel). */
const rentAt = (space: number, level: number) => SPACES[space]!.rent[Math.min(HOTEL, level)]!

function buildBlocker(levels: number[], mortgaged: boolean, houseCost: number): string {
  if (levels.every((l) => l === HOTEL)) return 'Fully built'
  if (mortgaged) return 'Lift mortgages to build'
  return `Need ${fmtMoney(houseCost)} per house`
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[14px] border border-line/60 bg-white/4 px-3 py-2.5 [@media(max-height:760px)]:py-1.5">
      <div className="text-[11px] font-extrabold tracking-widest text-ink-muted uppercase">{label}</div>
      <div className="font-display text-xl font-bold tabular-nums">{children}</div>
    </div>
  )
}

function RowName({ name, onFocus, bold }: { name: string; onFocus: () => void; bold: boolean }) {
  return (
    <button
      type="button"
      onClick={onFocus}
      className={`min-w-0 truncate rounded-sm text-left text-sm transition-colors hover:text-gold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${bold ? 'font-extrabold' : 'font-bold'}`}
      title="Show on the board"
    >
      {name}
    </button>
  )
}

function RowBtn({
  children,
  onClick,
  disabled,
  title,
  tone,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string | undefined
  tone: 'gold'
}) {
  return (
    <button
      type="button"
      onClick={() => {
        sound.play('ui.click')
        onClick()
      }}
      disabled={disabled}
      title={title}
      className={`h-9 shrink-0 rounded-[10px] border px-3 text-[13px] font-extrabold tabular-nums ${FX_BRIGHT} disabled:pointer-events-none disabled:opacity-35 ${tone === 'gold' ? 'border-accent/50 bg-accent/10 text-gold enabled:hover:bg-accent/20' : ''}`}
    >
      {children}
    </button>
  )
}

/** − / + under one lot: sell or build a single level there (the engine enforces even building). */
function LotStepper({
  name,
  cost,
  level,
  canBuild,
  canSell,
  onBuild,
  onSell,
}: {
  name: string
  cost: number
  level: number
  canBuild: boolean
  canSell: boolean
  onBuild: () => void
  onSell: () => void
}) {
  const what = level >= HOTEL - 1 ? 'a hotel' : 'a house'
  const sellWhat = level >= HOTEL ? 'the hotel' : 'a house'
  const refund = fmtMoney(cost / 2)
  const sell = useConfirmPress(onSell, { enabled: canSell })
  const btn = `flex size-7 items-center justify-center rounded-lg text-sm font-extrabold ${FX_BRIGHT} disabled:opacity-30`
  return (
    <div className="flex items-center gap-1 rounded-[10px] border border-line/70 bg-panel-2/80 p-0.5">
      <button
        type="button"
        disabled={!canSell}
        {...sell.bind}
        onClick={sell.press}
        title={
          sell.armed
            ? undefined
            : canSell
              ? `Sell ${sellWhat} on ${name} for +${refund}`
              : `Nothing to sell on ${name} yet (sell evenly)`
        }
        aria-label={
          sell.armed
            ? `Press again to sell ${sellWhat} on ${name} for ${cost / 2}`
            : `Sell one level on ${name}`
        }
        className={`relative overflow-hidden ${sell.armed ? `confirm-nudge h-7 rounded-lg border px-2 text-[12px] font-extrabold whitespace-nowrap tabular-nums ${FX_BRIGHT} ${ARMED}` : `${btn} text-ink-muted enabled:hover:bg-white/8 enabled:hover:text-ink`}`}
      >
        {sell.armed ? `Sell? +${refund}` : '−'}
        {sell.armed && <ConfirmBar ms={2500} />}
      </button>
      {!sell.armed && (
        <button
          type="button"
          disabled={!canBuild}
          onClick={() => {
            sound.play('ui.click')
            onBuild()
          }}
          title={
            canBuild
              ? `Build ${what} on ${name} for ${fmtMoney(cost)}`
              : `Can't build on ${name} now (build evenly, or not enough cash)`
          }
          aria-label={`Build ${what} on ${name}, ${fmtMoney(cost)}`}
          className={`${btn} bg-accent/15 text-gold enabled:hover:bg-accent/25`}
        >
          +
        </button>
      )}
    </div>
  )
}

/** The gold Build button: squashes and springs on press. */
function GoldBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  const ref = useRef<HTMLButtonElement>(null)
  const reduced = useReducedMotion()
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      onClick={() => {
        sound.play('ui.click')
        if (!reduced)
          ref.current?.animate(
            [
              { scale: '1' },
              { scale: '0.93 0.88', offset: 0.28 },
              { scale: '1.05 1.06', offset: 0.62 },
              { scale: '1' },
            ],
            { duration: 360, easing: 'ease-out' },
          )
        onClick()
      }}
      className="inline-flex h-11.5 min-w-0 flex-1 items-center justify-center gap-2 rounded-[14px] bg-accent px-3 font-display text-sm font-bold text-accent-ink shadow-[inset_0_-3px_0_rgba(0,0,0,0.18)] transition-[translate,filter] duration-200 ease-spring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:hover:-translate-y-px enabled:hover:brightness-[1.06] disabled:pointer-events-none disabled:opacity-40"
    >
      <BuildIcon color="#1c1205" />
      <span className="truncate">{label}</span>
    </button>
  )
}

function ordinal(n: number): string {
  return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`
}
