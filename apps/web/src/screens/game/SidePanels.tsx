import { SPACES, isOwnable, legalActions, mortgageValue, unmortgageCost, type Action } from '@skyline/engine'
import { hintFor } from '../../game/hints.ts'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { TIMINGS } from '../../game/timings.ts'
import { spaceInfo } from '../../spaceInfo.ts'
import { activeRow } from './deed.ts'
import { DiceTray } from './DiceTray.tsx'
import { Icon } from './icons.tsx'
import { TitleDeed } from './TitleDeed.tsx'
import { Btn, Eyebrow } from './ui.tsx'
import { fmtMoney } from './format.ts'

/** Left column: last roll, then either the selected tile's deed or a situational hint. */
export function LeftColumn({
  snap,
  store,
  selected,
  onCity,
  onDeselect,
}: {
  snap: Snapshot
  store: GameStore
  selected: number | null
  onCity: () => void
  onDeselect: () => void
}) {
  const viewer = snap.viewer
  const hint = viewer !== null && !snap.busy ? hintFor(snap.state, viewer) : null
  const roller = snap.presented.players[snap.presented.current]!
  return (
    <div className="pointer-events-none absolute top-26 left-4 flex w-72 flex-col gap-3">
      {snap.dice && (
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-line bg-panel/95 px-4 py-3.5">
          <DiceTray
            dice={snap.dice}
            roll={snap.diceRoll}
            speed={store.settings.speed}
            reduced={store.settings.reducedMotion}
          />
          <div className="flex flex-col">
            <span className="text-xs text-ink-muted">Last roll</span>
            <span className="text-[15px] font-semibold">
              {roller.name} rolled {snap.dice[0] + snap.dice[1]}
              {snap.dice[0] === snap.dice[1] && <span className="text-gold"> · doubles</span>}
            </span>
          </div>
        </div>
      )}

      {selected !== null ? (
        <SelectedSpace index={selected} snap={snap} store={store} onCity={onCity} onClose={onDeselect} />
      ) : (
        hint && (
          <div
            key={hint.text}
            className={`pointer-events-auto flex animate-rise flex-col gap-1.5 rounded-2xl border px-4 py-3.5 ${hint.tone === 'warn' ? 'border-alert/35 bg-alert/10' : 'border-accent/30 bg-accent/5'}`}
          >
            <Eyebrow
              className={`flex items-center gap-2 ${hint.tone === 'warn' ? 'text-alert' : 'text-accent'}`}
            >
              <Icon name={hint.tone === 'warn' ? 'alert' : 'bulb'} size={16} />
              {hint.title}
            </Eyebrow>
            <div className="text-sm leading-relaxed">{hint.text}</div>
            {hint.city && (
              <button
                type="button"
                onClick={onCity}
                className="self-start text-[13px] font-semibold text-accent hover:underline"
              >
                Open My city
              </button>
            )}
          </div>
        )
      )}
    </div>
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

  const close = (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-lg bg-table/40 text-ink hover:bg-table/70"
    >
      <Icon name="close" size={16} />
    </button>
  )

  if (!isOwnable(index)) {
    const info = spaceInfo(index)
    return (
      <div className="pointer-events-auto relative animate-rise rounded-2xl border border-line bg-panel/95 px-4 py-3.5">
        {close}
        <Eyebrow className="text-ink-muted">{info.kind}</Eyebrow>
        <div className="mt-0.5 text-lg font-bold">{info.name}</div>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{describeSpace(index, snap)}</p>
      </div>
    )
  }

  return (
    <div className="pointer-events-auto relative flex animate-rise flex-col gap-2">
      <div className="relative">
        <TitleDeed index={index} active={activeRow(s, index)} className="w-72" />
        {close}
      </div>
      <div className="rounded-2xl border border-line bg-panel/95 px-4 py-3 text-sm">
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
            {options.map((a) => (
              <Btn
                key={a.type}
                onClick={() => void store.dispatch(owner!.id, a)}
                className="px-3 py-1.5 text-xs"
              >
                {label(a)}
              </Btn>
            ))}
          </div>
        )}
        {mine && (
          <button
            type="button"
            onClick={onCity}
            className="mt-2 text-[13px] font-semibold text-accent hover:underline"
          >
            Manage the whole set in My city
          </button>
        )}
      </div>
    </div>
  )
}

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

/** Right column: the latest few events as fading toasts, with the full log on demand. */
export function ActivityFeed({
  snap,
  showLog,
  onToggleLog,
}: {
  snap: Snapshot
  showLog: boolean
  onToggleLog: () => void
}) {
  const dot = { normal: 'bg-sky', good: 'bg-teal', bad: 'bg-alert', muted: 'bg-ink-muted' }
  const tone = { normal: 'text-ink', good: 'text-teal', bad: 'text-alert', muted: 'text-ink-muted' }
  return (
    <div className="pointer-events-none absolute top-26 right-4 flex max-h-[calc(100%-15rem)] w-75 flex-col gap-2">
      {showLog ? (
        <div className="pointer-events-auto flex min-h-0 flex-col rounded-2xl border border-line bg-panel/95 backdrop-blur">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <Eyebrow className="text-ink-muted">Game log</Eyebrow>
            <button
              type="button"
              onClick={onToggleLog}
              aria-label="Close log"
              className="text-ink-muted hover:text-ink"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <ol
            className="flex min-h-0 flex-col gap-1 overflow-y-auto px-4 pb-3 text-xs leading-relaxed"
            aria-live="polite"
          >
            {snap.log.map((e) => (
              <li key={e.id} className={tone[e.tone]}>
                {e.text}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <>
          {snap.log.slice(0, 4).map((e) => (
            <div
              key={e.id}
              className="flex animate-toast items-center gap-2.5 rounded-xl border border-line bg-panel/95 px-3.5 py-2.5 text-[13px] shadow-lg shadow-black/30"
              style={{ animationDuration: `${TIMINGS.toastLife}ms` }}
            >
              <span className={`size-2 shrink-0 rounded-full ${dot[e.tone]}`} />
              <span className="min-w-0 flex-1">{e.text}</span>
            </div>
          ))}
          <button
            type="button"
            onClick={onToggleLog}
            className="pointer-events-auto self-end px-0.5 py-1 text-xs font-semibold text-accent hover:underline"
          >
            Full log (L)
          </button>
        </>
      )}
    </div>
  )
}
