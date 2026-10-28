import type { Action } from './actions.ts'
import { gate } from './reduce.ts'
import { legalAuction } from './rules/auction.ts'
import { legalBankruptcy } from './rules/bankruptcy.ts'
import { legalBuilding } from './rules/building.ts'
import { legalBuy } from './rules/buy.ts'
import { legalLoan } from './rules/loan.ts'
import { legalMortgage } from './rules/mortgage.ts'
import { legalTrade } from './rules/trade.ts'
import { legalTurn } from './rules/turn.ts'
import { seatOf, type GameState, type PlayerId } from './state.ts'

/**
 * Every enumerable legal action for a player right now. Trade proposals are open-ended and
 * not listed (bots construct them); BID lists a few representative amounts.
 * Invariant (fuzz-tested): every listed action is accepted by `reduce`.
 */
export function legalActions(state: GameState, playerId: PlayerId): Action[] {
  const seat = seatOf(state, playerId)
  if (seat < 0) return []
  const candidates = [
    ...legalAuction(state, seat),
    ...legalBankruptcy(state, seat),
    ...legalBuy(state, seat),
    ...legalLoan(state, seat),
    ...legalTurn(state, seat),
    ...legalBuilding(state, seat),
    ...legalMortgage(state, seat),
    ...legalTrade(state, seat),
  ]
  return candidates.filter((a) => !gate(state, seat, a.type))
}
