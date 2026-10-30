import type { GameStore, Snapshot } from '../../game/store.ts'
import { cssHex } from '../../spaceInfo.ts'
import type { TurnView } from './turn.ts'
import { TokenAvatar } from './ui.tsx'

/**
 * Cream ribbon under the HUD; swings in with a spring whenever the turn changes hands. Not a live
 * region: the Announcer speaks turn changes, so screen readers hear them once.
 */
export function TurnBanner({
  snap,
  store,
  turn,
  cityOpen = false,
  compact = false,
}: {
  snap: Snapshot
  store: GameStore
  turn: TurnView
  /** My city is open on the right: the banner steps aside (the top bar still shows whose turn it is). */
  cityOpen?: boolean
  /** Phone: hangs under the compact top bar instead of at a fixed height (D64). */
  compact?: boolean
}) {
  // Decision panels and cards say it themselves; the banner would only peek out behind them.
  // The Speed die's move choice keeps the banner: its subtitle says what to do.
  if (snap.presented.over || (turn.moment && turn.moment !== 'move') || snap.card) return null
  const seat = snap.presented.current
  const info = store.setup.seats[seat]!
  const color = cssHex(info.color)
  // Centered by flex, not transform: the drop animation owns the inner element's transform.
  return (
    <div
      className={`pointer-events-none flex justify-center transition-opacity ${compact ? 'px-3' : 'absolute inset-x-0 top-28 px-4'} duration-300 ease-out ${cityOpen ? 'opacity-0' : ''}`}
    >
      <div
        key={`${seat}-${snap.presented.round}`}
        className={`flex min-w-0 origin-top max-w-140 items-stretch overflow-hidden rounded-2xl bg-card text-card-ink shadow-card ${store.settings.reducedMotion ? 'animate-fade' : 'animate-banner'}`}
      >
        <span className="w-3 shrink-0" style={{ background: color }} />
        <span
          className={`flex min-w-0 items-center ${compact ? 'gap-2.5 py-1.5 pr-4 pl-3' : 'gap-3.5 py-2.5 pr-5.5 pl-4'}`}
        >
          <TokenAvatar color={color} piece={info.piece} size={compact ? 28 : 34} />
          <span className="flex min-w-0 flex-col">
            <span
              className={`font-card leading-[1.1] font-extrabold ${compact ? 'text-[17px]' : 'text-[22px]'}`}
            >
              {turn.title}
            </span>
            <span
              className={`max-w-full truncate font-card-body text-card-muted ${compact ? 'text-xs' : 'text-[13px]'}`}
            >
              {turn.subtitle || ' '}
            </span>
          </span>
        </span>
      </div>
    </div>
  )
}
