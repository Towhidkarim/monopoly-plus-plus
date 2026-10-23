import { usePanelSound } from '../../audio/usePanelSound.ts'
import type { ReactNode } from 'react'
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
import { Icon } from './icons.tsx'
import { Btn, HousePips } from './ui.tsx'
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
 * Everything the viewer owns, by set: progress, house pips, rent now, one-click Build evenly,
 * and mortgage controls. Shows the presented board; legality comes from the engine state.
 */
export function MyCity({
  snap,
  store,
  seat,
  onClose,
  onFocus,
}: {
  snap: Snapshot
  store: GameStore
  seat: number
  onClose: () => void
  onFocus: (space: number) => void
}) {
  usePanelSound()
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

  return (
    <aside
      aria-label="My city"
      className="pointer-events-auto absolute top-26 right-4 bottom-4 flex w-120 max-w-[calc(100%-2rem)] animate-slide-in flex-col overflow-hidden rounded-[22px] border border-line bg-panel shadow-[-16px_0_48px_#0007]"
    >
      <div className="flex flex-col gap-3.5 border-b border-line px-5 pt-5 pb-4">
        <div className="flex items-center">
          <span className="flex-1 text-[26px] font-bold">
            My city
            {store.setup.seats.filter((x) => x.kind === 'human').length > 1 && (
              <span
                className="ml-2 text-base font-semibold"
                style={{ color: cssHex(store.setup.seats[seat]!.color) }}
              >
                {me.name}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close My city"
            title="Close (Esc)"
            className="flex size-10 items-center justify-center rounded-xl border border-line bg-panel-2 hover:bg-white/10"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Cash" value={fmtMoney(me.cash)} />
          <Stat label="Net worth" value={fmtMoney(Math.max(0, worth[seat]!))} />
          <Stat label="Rank" value={me.bankrupt ? 'Out' : `${ordinal(rank)} of ${alive}`} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-4">
        {families.length === 0 && (
          <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">
            You don't own anything yet. Land on a space that is for sale to buy it.
          </p>
        )}
        {families.map(({ f, mine }) => {
          const complete = mine === f.spaces.length
          const buildable = complete && f.group >= 0
          const build = buildable && canManage ? buildEvenlyPlan(s, id, f.group) : null
          const sell = buildable && canManage ? sellEvenlyPlan(s, id, f.group) : null
          const levels = f.spaces.map((i) => p.houses[i]!)
          return (
            <section
              key={f.key}
              className={`shrink-0 overflow-hidden rounded-2xl border ${buildable ? 'border-gold/45 bg-gold/5' : 'border-line'}`}
            >
              <header className="flex items-center gap-2.5 px-3.5 py-3">
                <span className="size-3.5 rounded" style={{ background: f.color }} />
                <span className="flex-1 font-bold">{f.name}</span>
                {complete ? (
                  <span className="text-xs font-bold tracking-wider text-gold">SET COMPLETE</span>
                ) : (
                  <span className="text-[13px] text-ink-muted">
                    {mine} of {f.spaces.length}
                  </span>
                )}
              </header>

              {f.spaces.map((i) => {
                const owner = p.owner[i]!
                const sp = SPACES[i]!
                if (owner !== seat) {
                  const other = owner >= 0 ? p.players[owner]! : null
                  const auction = s.pending?.kind === 'auction' && s.pending.space === i
                  return (
                    <Row key={i} onFocus={() => onFocus(i)} muted name={sp.name}>
                      {other ? (
                        <span className="flex items-center gap-1.5 text-[13px]">
                          <span
                            className="size-2 rounded-full"
                            style={{ background: cssHex(store.setup.seats[owner]!.color) }}
                          />
                          {other.name}
                        </span>
                      ) : (
                        <span className="text-[13px]">
                          {auction ? 'at auction now' : `for sale · ${fmtMoney(sp.price)}`}
                        </span>
                      )}
                    </Row>
                  )
                }
                const mortgaged = p.mortgaged[i]
                const mortgage: Action = { type: 'MORTGAGE', space: i }
                const lift: Action = { type: 'UNMORTGAGE', space: i }
                return (
                  <Row key={i} onFocus={() => onFocus(i)} name={sp.name}>
                    {sp.kind === 'property' && complete && <HousePips level={p.houses[i]!} />}
                    <span
                      className={`w-24 text-right text-[13px] tabular-nums ${mortgaged ? 'text-alert' : 'text-ink-muted'}`}
                    >
                      {mortgaged
                        ? 'mortgaged'
                        : sp.kind === 'utility'
                          ? `${mine === 2 ? 10 : 4}× dice`
                          : `rent ${fmtMoney(rentFor(s, i, 7))}`}
                    </span>
                    {canManage &&
                      (mortgaged ? (
                        <SmallBtn disabled={!can(lift)} onClick={() => act(lift)} tone="accent">
                          Lift −{fmtMoney(unmortgageCost(s, i))}
                        </SmallBtn>
                      ) : (
                        <SmallBtn
                          disabled={!can(mortgage)}
                          onClick={() => act(mortgage)}
                          title={can(mortgage) ? undefined : 'Sell the buildings in this set first'}
                        >
                          Mortgage +{fmtMoney(mortgageValue(i))}
                        </SmallBtn>
                      ))}
                  </Row>
                )
              })}

              {buildable && canManage && build && sell && (
                <>
                  <div className="flex gap-2 border-t border-line px-3.5 py-3">
                    <Btn
                      kind="primary"
                      disabled={build.actions.length === 0}
                      onClick={() => store.run(id, build.actions)}
                      className="h-11.5 flex-1 rounded-xl text-[15px]"
                    >
                      {build.actions.length > 0
                        ? `${levels.every((l) => l >= HOTEL - 1) ? 'Build hotels' : 'Build evenly'} · ${fmtMoney(build.amount)} for ${build.actions.length} ${levels.every((l) => l >= HOTEL - 1) ? (build.actions.length > 1 ? 'hotels' : 'hotel') : build.actions.length > 1 ? 'houses' : 'house'}`
                        : buildBlocker(
                            levels,
                            f.spaces.some((i) => p.mortgaged[i]),
                            SPACES[f.spaces[0]!]!.houseCost,
                          )}
                    </Btn>
                    <Btn
                      disabled={sell.actions.length === 0}
                      onClick={() => store.run(id, sell.actions)}
                      title={
                        sell.actions.length
                          ? `Sell one level for +${fmtMoney(sell.amount)}`
                          : 'No buildings to sell'
                      }
                      className="h-11.5 rounded-xl"
                    >
                      Sell
                    </Btn>
                  </div>
                  {build.actions.length > 0 && (
                    <div className="px-3.5 pb-3 text-xs text-ink-muted">
                      Next level: rent{' '}
                      {f.spaces
                        .map((i) => fmtMoney(SPACES[i]!.rent[Math.min(HOTEL, p.houses[i]! + 1)]!))
                        .join(', ')}
                      .
                    </div>
                  )}
                </>
              )}
            </section>
          )
        })}
      </div>

      <div className="border-t border-line px-5 pt-3 pb-4 text-xs leading-relaxed text-ink-muted">
        You can build, sell and mortgage at any time, even on other players' turns. Mortgaged properties earn
        no rent.
      </div>
    </aside>
  )
}

function buildBlocker(levels: number[], mortgaged: boolean, houseCost: number): string {
  if (levels.every((l) => l === HOTEL)) return 'Fully built'
  if (mortgaged) return 'Lift mortgages to build'
  return `Need ${fmtMoney(houseCost)} per house`
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-panel-2 px-3 py-2.5">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  )
}

function Row({
  name,
  muted = false,
  onFocus,
  children,
}: {
  name: string
  muted?: boolean
  onFocus: () => void
  children: ReactNode
}) {
  return (
    <div
      className={`flex items-center gap-3 border-t border-line px-3.5 py-2 ${muted ? 'text-ink-muted' : ''}`}
    >
      <button
        type="button"
        onClick={onFocus}
        className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
        title="Show on the board"
      >
        {name}
      </button>
      {children}
    </div>
  )
}

function SmallBtn({
  children,
  onClick,
  disabled,
  title,
  tone = 'muted',
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string | undefined
  tone?: 'muted' | 'accent'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`h-8 shrink-0 rounded-lg border border-line px-2.5 text-xs font-semibold tabular-nums transition hover:bg-white/5 active:scale-95 disabled:opacity-35 ${tone === 'accent' ? 'text-accent' : 'text-ink-muted'}`}
    >
      {children}
    </button>
  )
}

function ordinal(n: number): string {
  return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`
}
