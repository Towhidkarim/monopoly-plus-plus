import type { GameStore, Snapshot } from '../../game/store.ts'
import { cssHex } from '../../spaceInfo.ts'
import type { TurnView } from './turn.ts'

/** "Your turn" pill under the HUD; pops whenever the turn changes hands. */
export function TurnBanner({ snap, store, turn }: { snap: Snapshot; store: GameStore; turn: TurnView }) {
  // Decision panels and cards say it themselves; the banner would only peek out behind them.
  if (snap.presented.over || turn.moment || snap.card) return null
  const seat = snap.presented.current
  const color = cssHex(store.setup.seats[seat]!.color)
  // Centered by flex, not transform: the pop animation owns the inner element's transform.
  return (
    <div className="pointer-events-none absolute inset-x-0 top-26 flex justify-center px-4">
      <div
        key={`${seat}-${snap.presented.round}`}
        className="flex max-w-140 min-w-0 animate-pop flex-col items-center gap-0.5 rounded-2xl border bg-panel/90 px-7 py-2.5 shadow-xl shadow-black/40 backdrop-blur"
        style={{ borderColor: `${color}80` }}
      >
        <div className="text-2xl font-bold tracking-tight" style={{ color }}>
          {turn.title}
        </div>
        <div className="max-w-full truncate text-[13px] text-ink-muted">{turn.subtitle || ' '}</div>
      </div>
    </div>
  )
}
