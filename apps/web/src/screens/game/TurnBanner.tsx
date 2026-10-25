import type { GameStore, Snapshot } from '../../game/store.ts'
import { cssHex } from '../../spaceInfo.ts'
import type { TurnView } from './turn.ts'
import { TokenAvatar } from './ui.tsx'

/** Cream ribbon under the HUD; swings in with a spring whenever the turn changes hands. */
export function TurnBanner({ snap, store, turn }: { snap: Snapshot; store: GameStore; turn: TurnView }) {
  // Decision panels and cards say it themselves; the banner would only peek out behind them.
  if (snap.presented.over || turn.moment || snap.card) return null
  const seat = snap.presented.current
  const info = store.setup.seats[seat]!
  const color = cssHex(info.color)
  // Centered by flex, not transform: the drop animation owns the inner element's transform.
  return (
    <div className="pointer-events-none absolute inset-x-0 top-28 flex justify-center px-4">
      <output
        key={`${seat}-${snap.presented.round}`}

        className={`flex max-w-140 min-w-0 origin-top items-stretch overflow-hidden rounded-2xl bg-card text-card-ink shadow-card ${store.settings.reducedMotion ? 'animate-fade' : 'animate-banner'}`}
      >
        <span className="w-3 shrink-0" style={{ background: color }} />
        <span className="flex min-w-0 items-center gap-3.5 py-2.5 pr-5.5 pl-4">
          <TokenAvatar color={color} piece={info.piece} />
          <span className="flex min-w-0 flex-col">
            <span className="font-card text-[22px] leading-[1.1] font-extrabold">{turn.title}</span>
            <span className="max-w-full truncate font-card-body text-[13px] text-card-muted">
              {turn.subtitle || ' '}
            </span>
          </span>
        </span>
      </output>
    </div>
  )
}
