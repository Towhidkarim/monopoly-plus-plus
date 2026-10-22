import { CHANCE_CARDS, CHEST_CARDS, netWorth } from '@skyline/engine'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { cssHex } from '../../spaceInfo.ts'
import { Btn, Money, Panel } from './ui.tsx'

/** The drawn card, shown while the engine's CARD_DRAWN event plays. */
export function CardPopup({ snap, store }: { snap: Snapshot; store: GameStore }) {
  const c = snap.card
  if (!c) return null
  const card = (c.deck === 'chance' ? CHANCE_CARDS : CHEST_CARDS)[c.cardId]
  const chance = c.deck === 'chance'
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="w-72 animate-pop overflow-hidden rounded-2xl bg-ink shadow-2xl shadow-black/60">
        <div
          className={`px-5 py-3 text-sm font-bold tracking-widest uppercase ${chance ? 'bg-indigo text-ink' : 'bg-teal text-table'}`}
        >
          {chance ? 'Opportunity' : 'City Fund'}
        </div>
        <div className="px-5 py-6 text-center text-lg leading-snug font-semibold text-table">
          {card?.text}
        </div>
        <div className="px-5 pb-3 text-center text-xs text-table/60">drawn by {store.nameOf(c.playerId)}</div>
      </div>
    </div>
  )
}

export function GameOver({ snap, store, onQuit }: { snap: Snapshot; store: GameStore; onQuit: () => void }) {
  const s = snap.state
  if (!snap.presented.over || snap.busy) return null
  const standings = s.players
    .map((p, seat) => ({ p, seat, worth: p.bankrupt ? 0 : netWorth(s, seat) }))
    .toSorted((a, b) => b.worth - a.worth)
  const winner = s.players[s.winner]!
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-table/60 backdrop-blur-sm">
      <Panel className="w-96 animate-pop p-6 text-center">
        <div className="text-xs font-semibold tracking-widest text-ink-muted uppercase">Game over</div>
        <div
          className="mt-2 text-3xl font-bold"
          style={{ color: cssHex(store.setup.seats[s.winner]!.color) }}
        >
          {winner.name} wins!
        </div>
        <div className="mt-5 flex flex-col gap-1.5 text-left text-sm">
          {standings.map(({ p, seat, worth }, rank) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
              <span className="w-4 text-ink-muted">{rank + 1}</span>
              <span
                className="size-2.5 rounded-full"
                style={{ background: cssHex(store.setup.seats[seat]!.color) }}
              />
              <span className="text-ink">{p.name}</span>
              <span className="ml-auto">
                {p.bankrupt ? <span className="text-alert">bankrupt</span> : <Money value={worth} />}
              </span>
            </div>
          ))}
        </div>
        <Btn kind="primary" onClick={onQuit} className="mt-6 w-full py-3">
          New game
        </Btn>
      </Panel>
    </div>
  )
}

export function EventLog({ snap }: { snap: Snapshot }) {
  const tone = { normal: 'text-ink', good: 'text-teal', bad: 'text-alert', muted: 'text-ink-muted' }
  return (
    <ol className="flex flex-col gap-1 text-xs leading-relaxed" aria-live="polite">
      {snap.log.slice(0, 80).map((e) => (
        <li key={e.id} className={`animate-rise ${tone[e.tone]}`}>
          {e.text}
        </li>
      ))}
    </ol>
  )
}
