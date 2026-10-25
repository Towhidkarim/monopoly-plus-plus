import { SPACES, isOwnable, rentFor } from '@skyline/engine'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { cssHex, groupName, spaceInfo } from '../../spaceInfo.ts'
import { inkOn } from './deed.ts'
import { Money } from './ui.tsx'

const HOUSE = 'M1.5 6 L6.5 1.5 L11.5 6 V11 H1.5 Z'

/**
 * Hover card above a tile: card stock with the group's striped band (Moments spec). The board
 * positions the wrapper; the card is centered with flex (no translate) so text stays sharp.
 */
export function GameTooltip({ index, snap, store }: { index: number; snap: Snapshot; store: GameStore }) {
  const info = spaceInfo(index)
  const space = SPACES[index]!
  const owner = snap.presented.owner[index]!
  const level = snap.presented.houses[index]!
  const rent = isOwnable(index) && owner >= 0 ? rentFor(snap.state, index, 7) : 0
  const band = info.color ?? '#3a4660'
  const ink = info.color ? inkOn(info.color) : '#f4ede2'
  return (
    <div className="absolute bottom-[18px] left-0 flex w-0 justify-center">
      <div className="w-[220px] shrink-0 overflow-hidden rounded-[14px] bg-card font-card-body text-card-ink shadow-[0_16px_34px_rgba(2,6,16,0.6),0_2px_0_var(--color-card-edge)]">
        <div
          className="px-3 py-2"
          style={{
            background: band,
            color: ink,
            backgroundImage:
              'repeating-linear-gradient(135deg, rgba(255,255,255,0.16) 0 7px, rgba(255,255,255,0) 7px 14px)',
          }}
        >
          <span className="block text-[9px] font-bold tracking-[0.16em] uppercase opacity-80">
            {info.group >= 0 ? groupName(info.group) : info.kind}
          </span>
          <span className="block font-card text-[17px] leading-tight font-extrabold">{info.name}</span>
        </div>
        <div className="flex flex-col gap-1.5 px-3 py-2.5 text-[13px]">
          {isOwnable(index) ? (
            <>
              {owner >= 0 ? (
                <span className="flex items-center gap-1.5">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: cssHex(store.setup.seats[owner]!.color) }}
                  />
                  {snap.presented.players[owner]!.name} ·{' '}
                  {snap.presented.mortgaged[index] ? (
                    'mortgaged'
                  ) : space.kind === 'utility' ? (
                    'dice × 4/10'
                  ) : (
                    <>
                      rent <Money value={rent} className="font-bold text-card-money" />
                    </>
                  )}
                </span>
              ) : (
                <span>
                  For sale · <Money value={space.price} className="font-bold text-card-money" />
                </span>
              )}
              {space.kind === 'property' && owner >= 0 && (
                <span className="flex gap-0.5" aria-label={level === 5 ? 'hotel' : `${level} of 4 houses`}>
                  {[1, 2, 3, 4].map((n) => (
                    <svg key={n} width="12" height="11" viewBox="0 0 13 12" aria-hidden="true">
                      <path
                        d={HOUSE}
                        fill={
                          level === 5 ? '#e8463a' : n <= level ? (info.color ?? '#1d7354') : 'transparent'
                        }
                        stroke={level === 5 || n <= level ? '#1f2a3d' : '#c9c1ae'}
                        strokeWidth="1.2"
                      />
                    </svg>
                  ))}
                  {level === 5 && <span className="ml-1 text-[11px] font-bold">Hotel</span>}
                </span>
              )}
              <span className="text-[11px] text-[#6b7385]">Click for the full card</span>
            </>
          ) : (
            <span className="text-card-muted">{info.kind}</span>
          )}
        </div>
      </div>
    </div>
  )
}
