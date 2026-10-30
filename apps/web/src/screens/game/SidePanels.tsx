import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Recap } from '../../game/recap.ts'
import { RecapCard } from './RecapCard.tsx'
import { SPACES, isOwnable, legalActions, mortgageValue, unmortgageCost, type Action } from '@skyline/engine'
import { hintFor, type Hint } from '../../game/hints.ts'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { TIMINGS } from '../../game/timings.ts'
import type { LogEntry } from '../../game/log.ts'
import { cssHex, spaceInfo } from '../../spaceInfo.ts'
import { activeRow, familyOf } from './deed.ts'
import { DiceTray } from './DiceTray.tsx'
import { ConfirmBtn } from './ConfirmBtn.tsx'
import { Icon } from './icons.tsx'
import { DeedCard } from './TitleDeed.tsx'
import { Btn, Eyebrow, Kbd, Panel, TokenAvatar, FX } from './ui.tsx'
import { fmtMoney } from './format.ts'
import { Sheet } from './Sheet.tsx'

/** Property names, longest first, so a hint can highlight the one it talks about. */
const NAME_RE = new RegExp(
  `(${SPACES.flatMap((s, i) => (isOwnable(i) ? [s.name] : []))
    .toSorted((x, y) => y.length - x.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})`,
)

/** Hint copy with any property name set in a teal chip. */
function HintText({ text }: { text: string }) {
  return text.split(NAME_RE).map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="rounded-[5px] bg-teal/15 px-1.5 font-bold text-teal">
        {part}
      </strong>
    ) : (
      part
    ),
  )
}

/** Left column: last roll, then either the selected tile's deed or a situational hint. */
export function LeftColumn({
  snap,
  store,
  selected,
  recap,
  onCity,
  onDeselect,
  onCloseRecap,
}: {
  snap: Snapshot
  store: GameStore
  selected: number | null
  /** What happened since your last turn; shown instead of the hint until you roll. */
  recap: Recap | null
  onCity: () => void
  onDeselect: () => void
  onCloseRecap: () => void
}) {
  const viewer = snap.viewer
  const hint = viewer !== null && !snap.busy ? hintFor(snap.state, viewer) : null
  const roller = snap.presented.players[snap.presented.current]!
  const rollerName = soloHuman(store) && store.seatKind(roller.id) === 'human' ? 'You' : roller.name
  const doubles = snap.dice !== null && snap.dice[0] === snap.dice[1]
  return (
    <div className="pointer-events-none absolute top-32 left-5 flex w-72 flex-col gap-3">
      {snap.dice && (
        // With a deed open, a short window gives the deed the room.
        <Panel
          className={`flex items-center gap-3.5 p-3.5 ${selected !== null ? '[@media(max-height:899px)]:hidden' : ''}`}
        >
          <DiceTray
            dice={snap.dice}
            speedFace={snap.speedFace}
            roll={snap.diceRoll}
            landing={snap.diceLanding}
            speed={store.settings.speed}
            reduced={store.settings.reducedMotion}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <Eyebrow className="text-ink-muted">Last roll</Eyebrow>
            {/* While 3D dice are on the board the result is not shown here yet. */}
            <span className="font-display text-xl leading-tight font-bold">
              {snap.diceLanding
                ? `${rollerName} ${rollerName === 'You' ? 'are' : 'is'} rolling…`
                : `${rollerName} rolled ${snap.dice[0] + snap.dice[1] + (typeof snap.speedFace === 'number' ? snap.speedFace : 0)}`}
            </span>
            {doubles && !snap.diceLanding && (
              <span
                key={snap.diceRoll}
                className="mt-1 origin-left self-start animate-tag-pop rounded-full bg-accent px-2.5 py-0.5 font-display text-[11px] font-bold text-accent-ink shadow-[0_0_14px_rgba(245,181,74,0.45)]"
              >
                Doubles!
              </span>
            )}
          </div>
        </Panel>
      )}

      {selected !== null ? (
        <SelectedSpace index={selected} snap={snap} store={store} onCity={onCity} onClose={onDeselect} />
      ) : recap ? (
        <RecapCard recap={recap} store={store} onClose={onCloseRecap} />
      ) : (
        hint && <HintCard key={hint.text} hint={hint} onCity={onCity} />
      )}
    </div>
  )
}

/** The current tip: what to watch out for or do next. */
function HintCard({ hint, onCity }: { hint: Hint; onCity: () => void }) {
  const warn = hint.tone === 'warn'
  return (
    <Panel className={`flex animate-rise flex-col gap-2 px-4 py-3.5 ${warn ? 'border-alert/35' : ''}`}>
      <Eyebrow className={`flex items-center gap-2 ${warn ? 'text-alert' : 'text-accent'}`}>
        <span
          className={`flex size-6 items-center justify-center rounded-full ${warn ? 'bg-alert/15' : 'bg-accent/15'}`}
        >
          <Icon name={warn ? 'alert' : 'bulb'} size={13} />
        </span>
        {hint.title}
      </Eyebrow>
      <p className="text-sm leading-[1.45]">
        <HintText text={hint.text} />
      </p>
      {hint.city && (
        <button
          type="button"
          onClick={onCity}
          className="self-start rounded-md text-[13px] font-bold text-accent transition-colors hover:text-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Open My city →
        </button>
      )}
    </Panel>
  )
}
/** Phones: the dice tray, riding in the floating row above the dock (the 3D dice fly into it). */
export function CompactDice({ snap, store }: { snap: Snapshot; store: GameStore }) {
  if (!snap.dice) return null
  return (
    <Panel className="pointer-events-auto flex shrink-0 items-center self-end p-2">
      <DiceTray
        dice={snap.dice}
        speedFace={snap.speedFace}
        roll={snap.diceRoll}
        landing={snap.diceLanding}
        speed={store.settings.speed}
        reduced={store.settings.reducedMotion}
      />
    </Panel>
  )
}

/**
 * Phones: what the desktop shows in the left column, one sheet at a time: the tapped tile, else
 * the recap of the last round, else the current hint. Null when there is nothing to show.
 */
export function InfoSheet({
  snap,
  store,
  selected,
  recap,
  onCity,
  onClose,
  onCloseRecap,
}: {
  snap: Snapshot
  store: GameStore
  selected: number | null
  recap: Recap | null
  onCity: () => void
  onClose: () => void
  onCloseRecap: () => void
}) {
  const hint = snap.viewer !== null && !snap.busy ? hintFor(snap.state, snap.viewer) : null
  const body =
    selected !== null ? (
      <SelectedSpace index={selected} snap={snap} store={store} onCity={onCity} onClose={onClose} />
    ) : recap ? (
      <RecapCard recap={recap} store={store} onClose={onCloseRecap} />
    ) : hint ? (
      <HintCard hint={hint} onCity={onCity} />
    ) : null
  if (!body) return null
  return (
    <Sheet kind="browse" onClose={onClose}>
      {/* A tile's deed keeps its card width, centered; the hint and recap fill the sheet. */}
      <div className={`flex flex-col px-3 pb-3 ${selected !== null ? 'items-center' : '[&>*]:w-full'}`}>
        {body}
      </div>
    </Sheet>
  )
}

/** Phones: the game log as a sheet, newest first. */
export function LogSheet({ snap, onClose }: { snap: Snapshot; onClose: () => void }) {
  const dot = { normal: 'bg-sky', good: 'bg-teal', bad: 'bg-alert', muted: 'bg-ink-muted' }
  const tone = { normal: 'text-ink', good: 'text-teal', bad: 'text-alert', muted: 'text-ink-muted' }
  return (
    <Sheet kind="browse" onClose={onClose} aria-label="Game log">
      <div className="flex flex-col">
        <Eyebrow className="px-5 pb-2 text-ink-muted">Game log</Eyebrow>
        <ol className="flex flex-col gap-2 px-5 pb-4 text-sm leading-relaxed">
          {snap.log.map((e) => (
            <li key={e.id} className={`flex gap-2.5 ${tone[e.tone]}`}>
              <span className={`mt-2 size-1.5 shrink-0 rounded-full ${dot[e.tone]}`} />
              <span className="min-w-0">{e.text}</span>
            </li>
          ))}
        </ol>
      </div>
    </Sheet>
  )
}

/** The clicked tile: its deed (or what the space does) and, for your own property, quick controls. */
function SelectedSpace({
  index,
  snap,
  store,
  onCity,
  onClose,
}: {
  index: number
  snap: Snapshot
  store: GameStore
  onCity: () => void
  onClose: () => void
}) {
  const s = snap.state
  const p = snap.presented
  const ownerSeat = p.owner[index]!
  const owner = ownerSeat >= 0 ? p.players[ownerSeat]! : null
  const mine = owner !== null && ownerSeat === snap.viewer && store.seatKind(owner.id) === 'human'
  const options = mine
    ? legalActions(s, owner.id).filter(
        (a): a is Extract<Action, { space: number }> => 'space' in a && a.space === index,
      )
    : []
  const sp = SPACES[index]!
  const label = (a: Extract<Action, { space: number }>) =>
    a.type === 'BUILD'
      ? `${p.houses[index] === 4 ? 'Hotel' : 'House'} −${fmtMoney(sp.houseCost)}`
      : a.type === 'SELL_BUILDING'
        ? `Sell +${fmtMoney(sp.houseCost / 2)}`
        : a.type === 'MORTGAGE'
          ? `Mortgage +${fmtMoney(mortgageValue(index))}`
          : `Lift −${fmtMoney(unmortgageCost(s, index))}`

  const seatInfo = ownerSeat >= 0 ? store.setup.seats[ownerSeat] : undefined
  const deedOwner =
    owner && seatInfo ? { name: owner.name, color: cssHex(seatInfo.color), piece: seatInfo.piece } : null
  const heldInSet = ownerSeat >= 0 ? familyOf(index).filter((i) => p.owner[i] === ownerSeat).length : 0
  // Houses for a property; for stations and utilities, the number owned minus one.
  const deedLevel = sp.kind === 'property' ? p.houses[index]! : Math.max(0, heldInSet - 1)

  const close = (place: string) => (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close tile details"
      className={`absolute flex size-8 items-center justify-center text-ink ${place} ${FX}`}
    >
      <Icon name="close" size={16} />
    </button>
  )

  if (!isOwnable(index)) {
    const info = spaceInfo(index)
    return (
      <div className="pointer-events-auto relative animate-rise rounded-[20px] border border-line bg-panel/95 px-4 py-3.5 shadow-panel">
        {close('top-2 right-2 rounded-lg bg-table/40 enabled:hover:bg-table/70')}
        <Eyebrow className="text-ink-muted">{info.kind}</Eyebrow>
        <div className="mt-0.5 text-lg font-bold">{info.name}</div>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{describeSpace(index, snap)}</p>
      </div>
    )
  }

  return (
    <FitHeight className="pointer-events-auto relative flex animate-rise flex-col gap-2">
      <div className="relative">
        <DeedCard
          index={index}
          active={activeRow(s, index)}
          state={ownerSeat < 0 ? 'forSale' : p.mortgaged[index] ? 'mortgaged' : 'owned'}
          owner={deedOwner}
          level={deedLevel}
          setOwned={heldInSet}
          moment
          dealFrom={{ x: -160, y: 60 }}
        />
        {/* A chip on the card's corner, clear of the header and the FOR SALE ribbon. */}
        {close(
          '-top-2.5 -right-2.5 z-10 rounded-full border border-line bg-panel shadow-panel enabled:hover:bg-panel-2',
        )}
      </div>
      <div className="rounded-[20px] border border-line bg-panel/95 px-4 py-3 text-sm shadow-panel">
        {owner ? (
          <>
            Owned by <span className="font-semibold">{mine && soloHuman(store) ? 'you' : owner.name}</span>
            {p.mortgaged[index] && <span className="text-alert"> · mortgaged</span>}
          </>
        ) : (
          <span className="text-ink-muted">For sale · {fmtMoney(sp.price)}</span>
        )}
        {options.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {options.map((a) =>
              a.type === 'SELL_BUILDING' || a.type === 'MORTGAGE' ? (
                <ConfirmBtn
                  key={a.type}
                  onConfirm={() => void store.dispatch(owner!.id, a)}
                  armedLabel={
                    a.type === 'MORTGAGE'
                      ? `Mortgage? +${fmtMoney(mortgageValue(index))}`
                      : `Sell? +${fmtMoney(sp.houseCost / 2)}`
                  }
                  armedAriaLabel={
                    a.type === 'MORTGAGE'
                      ? `Press again to mortgage ${sp.name} for ${mortgageValue(index)}`
                      : `Press again to sell ${p.houses[index] === 5 ? 'the hotel' : 'a house'} on ${sp.name} for ${sp.houseCost / 2}`
                  }
                  idleClass="border-line bg-transparent text-ink enabled:hover:bg-white/5"
                  className="rounded-xl px-3 py-1.5 text-xs"
                >
                  {label(a)}
                </ConfirmBtn>
              ) : (
                <Btn
                  key={a.type}
                  onClick={() => void store.dispatch(owner!.id, a)}
                  className="px-3 py-1.5 text-xs"
                >
                  {label(a)}
                </Btn>
              ),
            )}
          </div>
        )}
        {mine && (
          <button
            type="button"
            onClick={onCity}
            className="mt-2 rounded-md text-[13px] font-bold text-accent transition-colors hover:text-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Manage the whole set in My city →
          </button>
        )}
      </div>
    </FitHeight>
  )
}

/**
 * Shrinks its content (CSS `zoom`, which scales layout and stays crisp) just enough to fit between
 * its top and the bottom of the window, clear of the action dock on narrow windows. Never grows.
 */
function FitHeight({ children, className }: { children: ReactNode; className: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      // offsetHeight is the natural (unzoomed) height; the top does not move with zoom.
      const reserve = window.innerWidth < DOCK_CLEAR_AT ? 132 : 24
      const room = window.innerHeight - el.getBoundingClientRect().top - reserve
      setK(Math.max(0.55, Math.min(1, room / el.offsetHeight)))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    if (el.parentElement) ro.observe(el.parentElement)
    window.addEventListener('resize', fit)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [])
  return (
    <div
      ref={ref}
      className={className} // The width shrinks with the zoom so the content is laid out at the column's own width.
      style={k < 1 ? { zoom: k, width: `${k * 100}%` } : undefined}
    >
      {children}
    </div>
  )
}

/** Window width from which the centered action dock no longer reaches the left column. */
const DOCK_CLEAR_AT = 1190

const soloHuman = (store: GameStore) => store.setup.seats.filter((x) => x.kind === 'human').length === 1

function describeSpace(index: number, snap: Snapshot): string {
  const sp = SPACES[index]!
  const c = snap.state.config
  switch (sp.kind) {
    case 'go':
      return `Collect ₵${c.goSalary} every time you pass.`
    case 'tax':
      return `Pay ₵${sp.tax} to the bank.`
    case 'chance':
      return 'Draw an Opportunity card.'
    case 'chest':
      return 'Draw a City Fund card.'
    case 'jail':
      return `Just visiting, unless you were sent here. Leave by rolling doubles, paying ₵${c.jailFine}, or using a free card.`
    case 'parking':
      return c.freeParkingPot ? `Collect the pot (₵${snap.presented.pot}).` : 'A free rest. Nothing happens.'
    case 'goToJail':
      return 'Go directly to the Lockup. Do not pass Launch.'
    default:
      return ''
  }
}

/** Right column: the latest few events as springy toasts, with the full log on demand. */
export function ActivityFeed({
  snap,
  store,
  showLog,
  onToggleLog,
}: {
  snap: Snapshot
  store: GameStore
  showLog: boolean
  onToggleLog: () => void
}) {
  const dot = { normal: 'bg-sky', good: 'bg-teal', bad: 'bg-alert', muted: 'bg-ink-muted' }
  const tone = { normal: 'text-ink', good: 'text-teal', bad: 'text-alert', muted: 'text-ink-muted' }
  return (
    <div className="pointer-events-none absolute top-32 right-5 flex max-h-[calc(100%-16rem)] w-75 flex-col gap-2.5">
      {showLog ? (
        <Panel className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <Eyebrow className="text-ink-muted">Game log</Eyebrow>
            <button
              type="button"
              onClick={onToggleLog}
              aria-label="Close log"
              className="rounded-md text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <ol className="flex min-h-0 flex-col gap-1.5 overflow-y-auto px-4 pb-3.5 text-xs leading-relaxed">
            {snap.log.map((e) => (
              <li key={e.id} className={`flex gap-2 ${tone[e.tone]}`}>
                <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${dot[e.tone]}`} />
                <span className="min-w-0">{e.text}</span>
              </li>
            ))}
          </ol>
        </Panel>
      ) : (
        <>
          {snap.log.slice(0, 4).map((e) => (
            <div key={e.id} className="animate-toast" style={{ animationDuration: `${TIMINGS.toastLife}ms` }}>
              <Toast entry={e} snap={snap} store={store} />
            </div>
          ))}
          <button
            type="button"
            onClick={onToggleLog}
            className="pointer-events-auto flex items-center gap-1.5 self-end rounded-md px-0.5 py-1 text-[13px] font-bold text-accent transition-colors hover:text-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Full log <Kbd>L</Kbd>
          </button>
        </>
      )}
    </div>
  )
}

/** One activity row. Money moves show who paid whom; bad news gets a rose edge. */
function Toast({ entry: e, snap, store }: { entry: LogEntry; snap: Snapshot; store: GameStore }) {
  const players = snap.presented.players
  const viewerId = snap.viewer !== null ? players[snap.viewer]?.id : undefined
  const nameOf = (id: string | null) =>
    id === null ? 'the bank' : (players.find((p) => p.id === id)?.name ?? '?')
  const avatar = (id: string | null) => {
    const seat = id === null ? -1 : players.findIndex((p) => p.id === id)
    const info = seat >= 0 ? store.setup.seats[seat] : undefined
    return info ? (
      <TokenAvatar color={cssHex(info.color)} piece={info.piece} size={24} />
    ) : (
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-coin text-[12px] font-extrabold text-accent-ink shadow-[inset_0_-2px_0_var(--color-coin-dark)]"
      >
        ₵
      </span>
    )
  }

  const m = e.money
  const bad = e.icon !== undefined || (m !== undefined && viewerId !== undefined && m.from === viewerId)
  const base = `pointer-events-none flex items-center gap-2.5 rounded-2xl border bg-panel px-3.5 py-3 text-[13px] shadow-panel ${bad ? 'border-alert/35' : 'border-line'} ${store.settings.reducedMotion ? 'animate-fade' : 'animate-toast-in'}`

  if (m) {
    const iPay = viewerId !== undefined && m.from === viewerId
    const iGet = viewerId !== undefined && m.to === viewerId
    const label =
      m.reason === 'salary'
        ? 'Launch salary'
        : m.reason === 'underdog'
          ? 'Underdog bonus'
          : m.reason === 'loan'
            ? 'Second Wind loan'
            : m.reason === 'loanRepay'
              ? 'Loan repayment'
              : m.reason === 'tax'
                ? 'Tax to the bank'
                : m.reason === 'fine'
                  ? 'Lockup fine'
                  : iGet
                    ? `Rent from ${nameOf(m.from)}`
                    : iPay
                      ? `Rent to ${nameOf(m.to)}`
                      : `${nameOf(m.from)} paid rent to ${nameOf(m.to)}`
    return (
      <div className={base}>
        <span className="flex items-center gap-[3px]">
          {avatar(m.from)}
          <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden="true">
            <path
              d="M1 5 H15 M11 1 L16 5 L11 9"
              fill="none"
              stroke="#ffcf70"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeDasharray="3 2"
            />
          </svg>
          {avatar(m.to)}
        </span>
        <span className="min-w-0 flex-1">{label}</span>
        <span
          className={`font-display font-bold tabular-nums ${iPay ? 'text-alert' : 'text-gold'}`}
          style={{ textShadow: iPay ? undefined : '0 0 12px rgba(255,207,112,0.45)' }}
        >
          {iPay ? '−' : iGet ? '+' : ''}
          {fmtMoney(m.amount)}
        </span>
      </div>
    )
  }

  if (e.space !== undefined) {
    const info = spaceInfo(e.space)
    return (
      <div className={base}>
        <span className="h-7 w-[22px] shrink-0 overflow-hidden rounded bg-card">
          <span className="block h-[9px]" style={{ background: info.color ?? 'var(--color-ink-muted)' }} />
        </span>
        <span className="min-w-0 flex-1">
          {e.price !== undefined ? e.text.replace(` for ₵${e.price}`, '') : e.text}
        </span>
        {e.price !== undefined && <span className="text-xs text-ink-muted">{fmtMoney(e.price)}</span>}
      </div>
    )
  }

  if (e.icon) {
    return (
      <div className={base}>
        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-alert/15 text-alert">
          <Icon name={e.icon} size={13} />
        </span>
        <span className="min-w-0 flex-1">{e.text}</span>
      </div>
    )
  }

  const dot = { normal: 'bg-sky', good: 'bg-teal', bad: 'bg-alert', muted: 'bg-ink-muted' }
  return (
    <div className={base}>
      <span className={`size-2 shrink-0 rounded-full ${dot[e.tone]}`} />
      <span className="min-w-0 flex-1">{e.text}</span>
    </div>
  )
}
