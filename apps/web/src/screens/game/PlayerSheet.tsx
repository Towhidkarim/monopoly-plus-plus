import { SPACES, isOwnable } from '@skyline/engine'
import { sound } from '../../audio/engine.ts'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { cssHex, spaceInfo } from '../../spaceInfo.ts'
import { fmtMoney } from './format.ts'
import { repayOf } from './repay.ts'
import { Sheet } from './Sheet.tsx'
import { Btn, Eyebrow, Money, TokenAvatar } from './ui.tsx'

const OWNABLE = SPACES.flatMap((_, i) => (isOwnable(i) ? [i] : []))

/**
 * Phones (D64): a tapped player chip opens this sheet, what the desktop card shows plus more room:
 * cash, the loan (with Pay off on your own sheet), Lockup cards, and every property they hold.
 * A property row opens that tile's deed.
 */
export function PlayerSheet({
  snap,
  store,
  seat,
  onTile,
  onClose,
}: {
  snap: Snapshot
  store: GameStore
  seat: number
  onTile: (space: number) => void
  onClose: () => void
}) {
  const p = snap.presented
  const pl = p.players[seat]!
  const info = store.setup.seats[seat]!
  const held = OWNABLE.filter((i) => p.owner[i] === seat)
  const repay = pl.loan > 0 && !pl.bankrupt ? repayOf(snap, store, seat) : null
  const bot = info.kind === 'bot' ? `${store.botName(seat) ?? ''} bot`.trim() : null
  return (
    <Sheet kind="browse" onClose={onClose} aria-label={pl.name}>
      <div className="flex flex-col gap-4 px-5 pb-4">
        <div className="flex items-center gap-3">
          <TokenAvatar color={cssHex(info.color)} piece={info.piece} size={44} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-display text-xl font-bold">{pl.name}</span>
            <span className="text-xs text-ink-muted">
              {[bot, pl.bankrupt ? 'bankrupt' : pl.inJail ? 'in the Lockup' : null]
                .filter(Boolean)
                .join(' · ') || 'Player'}
            </span>
          </div>
          <Money value={pl.cash} className="font-display text-2xl font-bold text-gold" />
        </div>

        {pl.loan > 0 && !pl.bankrupt && (
          <div className="flex items-center gap-3 rounded-2xl border border-gold/30 bg-gold/5 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <Eyebrow className="text-gold">Second Wind loan</Eyebrow>
              <span className="text-sm text-ink-muted">
                {fmtMoney(pl.loan)} left · half of every income repays it
              </span>
            </div>
            {repay && (
              <Btn
                onClick={() => {
                  sound.play('ui.click')
                  repay()
                }}
                className="h-11 rounded-xl px-4 text-sm"
              >
                Pay off
              </Btn>
            )}
          </div>
        )}

        {pl.jailCards > 0 && (
          <span className="text-sm text-gold">
            {pl.jailCards} Get out of the Lockup {pl.jailCards === 1 ? 'card' : 'cards'}
          </span>
        )}

        <div className="flex flex-col gap-1">
          <Eyebrow className="text-ink-muted">
            {held.length === 0 ? 'No properties yet' : `Properties · ${held.length}`}
          </Eyebrow>
          {held.map((i) => {
            const s = spaceInfo(i)
            const houses = p.houses[i]!
            return (
              <button
                key={i}
                type="button"
                onClick={() => onTile(i)}
                className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-left text-sm active:bg-white/5"
              >
                <span
                  className="h-6 w-1.5 shrink-0 rounded-full"
                  style={{ background: s.color ?? '#94a3b8' }}
                />
                <span
                  className={`min-w-0 flex-1 truncate font-semibold ${p.mortgaged[i] ? 'text-ink-muted' : ''}`}
                >
                  {s.name}
                </span>
                <span className="shrink-0 text-xs text-ink-muted">
                  {p.mortgaged[i]
                    ? 'mortgaged'
                    : houses === 5
                      ? 'hotel'
                      : houses > 0
                        ? `${houses} ${houses === 1 ? 'house' : 'houses'}`
                        : ''}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </Sheet>
  )
}
