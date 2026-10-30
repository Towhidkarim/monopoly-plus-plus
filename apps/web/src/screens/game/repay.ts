import { validate } from '@skyline/engine'
import type { GameStore, Snapshot } from '../../game/store.ts'

/** Pays off a seat's whole loan, or null when that is not allowed now. */
export function repayOf(snap: Snapshot, store: GameStore, seat: number): (() => void) | null {
  const pl = snap.presented.players[seat]!
  // Only a full payoff: a partial one would empty the wallet in one click.
  return store.canAct(pl.id) &&
    !snap.busy &&
    pl.cash >= pl.loan &&
    validate(snap.state, pl.id, { type: 'REPAY_LOAN' }) === null
    ? () => store.run(pl.id, [{ type: 'REPAY_LOAN' }])
    : null
}
