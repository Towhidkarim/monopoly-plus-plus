import type { Action, ActionType } from './actions.ts'
import { makeCtx, settleDebts, type Ctx } from './core.ts'
import type { GameEvent } from './events.ts'
import { applyBid, applyPassBid, checkBid, checkPassBid } from './rules/auction.ts'
import { applyBankruptcy, checkBankruptcy } from './rules/bankruptcy.ts'
import { applyBuild, applySellBuilding, checkBuild, checkSellBuilding } from './rules/building.ts'
import { applyBuy, applyDecline, checkBuy, checkDecline } from './rules/buy.ts'
import { applyMortgage, applyUnmortgage, checkMortgage, checkUnmortgage } from './rules/mortgage.ts'
import {
  applyAcceptTrade,
  applyCancelTrade,
  applyPropose,
  applyRejectTrade,
  checkAcceptTrade,
  checkCancelTrade,
  checkPropose,
  checkRejectTrade,
  pruneTrades,
} from './rules/trade.ts'
import {
  applyEndTurn,
  applyPayJailFine,
  applyRoll,
  applyUseJailCard,
  checkEndTurn,
  checkPayJailFine,
  checkRoll,
  checkUseJailCard,
} from './rules/turn.ts'
import { cloneState, seatOf, type GameState, type PlayerId } from './state.ts'

export type ReduceResult = { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: string }

const ANY_TIME: ReadonlySet<ActionType> = new Set([
  'BUILD',
  'SELL_BUILDING',
  'MORTGAGE',
  'UNMORTGAGE',
  'PROPOSE_TRADE',
  'CANCEL_TRADE',
  'ACCEPT_TRADE',
  'REJECT_TRADE',
])

/**
 * Who may do what right now, independent of the specific rule (DECISIONS.md D8):
 * auctions freeze everything but bidding; unpaid debts freeze turn actions until settled.
 */
export function gate(s: GameState, seat: number, type: ActionType): string | null {
  if (s.phase === 'gameOver') return 'the game is over'
  if (s.players[seat]!.bankrupt) return 'bankrupt players cannot act'
  if (s.pending?.kind === 'auction')
    return type === 'BID' || type === 'PASS_BID' ? null : 'auction in progress'
  if (type === 'BID' || type === 'PASS_BID') return 'no auction in progress'
  if (s.debts.length > 0) {
    const debtor = s.debts[0]!.debtor
    if (type === 'DECLARE_BANKRUPTCY') return null
    if (seat === debtor && (type === 'BUILD' || type === 'UNMORTGAGE')) return 'settle your debt first'
    return ANY_TIME.has(type) ? null : 'waiting for a debt to be settled'
  }
  return null
}

/** The player the game is waiting on (debtor, bidder, or active player). */
export function expectedActor(s: GameState): number {
  if (s.debts.length > 0) return s.debts[0]!.debtor
  if (s.pending?.kind === 'auction') return s.pending.bidders[s.pending.current]!
  return s.current
}

/** What a TIMEOUT means for the expected actor right now. */
function timeoutAction(s: GameState): Action {
  if (s.debts.length > 0) return { type: 'DECLARE_BANKRUPTCY' }
  if (s.pending?.kind === 'auction') return { type: 'PASS_BID' }
  if (s.pending?.kind === 'buy') return { type: 'DECLINE_BUY' }
  return s.phase === 'preRoll' ? { type: 'ROLL' } : { type: 'END_TURN' }
}

/** Validation only: null if `action` by `seat` is legal in `s`. Never mutates. */
export function check(s: GameState, seat: number, action: Action): string | null {
  if (action.type === 'TIMEOUT') {
    if (s.phase === 'gameOver') return 'the game is over'
    if (seat !== expectedActor(s)) return 'not waiting on you'
    return check(s, seat, timeoutAction(s))
  }
  const g = gate(s, seat, action.type)
  if (g) return g
  switch (action.type) {
    case 'ROLL':
      return checkRoll(s, seat)
    case 'BUY':
      return checkBuy(s, seat)
    case 'DECLINE_BUY':
      return checkDecline(s, seat)
    case 'BID':
      return checkBid(s, seat, action.amount)
    case 'PASS_BID':
      return checkPassBid(s, seat)
    case 'BUILD':
      return checkBuild(s, seat, action.space)
    case 'SELL_BUILDING':
      return checkSellBuilding(s, seat, action.space)
    case 'MORTGAGE':
      return checkMortgage(s, seat, action.space)
    case 'UNMORTGAGE':
      return checkUnmortgage(s, seat, action.space)
    case 'PROPOSE_TRADE': {
      const to = seatOf(s, action.to)
      if (to < 0) return 'unknown trade partner'
      return checkPropose(s, seat, { to, give: action.give, get: action.get })
    }
    case 'CANCEL_TRADE':
      return checkCancelTrade(s, seat, action.tradeId)
    case 'ACCEPT_TRADE':
      return checkAcceptTrade(s, seat, action.tradeId)
    case 'REJECT_TRADE':
      return checkRejectTrade(s, seat, action.tradeId)
    case 'PAY_JAIL_FINE':
      return checkPayJailFine(s, seat)
    case 'USE_JAIL_CARD':
      return checkUseJailCard(s, seat)
    case 'END_TURN':
      return checkEndTurn(s, seat)
    case 'DECLARE_BANKRUPTCY':
      return checkBankruptcy(s, seat)
  }
}

function apply(ctx: Ctx, seat: number, action: Action): void {
  const s = ctx.s
  switch (action.type) {
    case 'TIMEOUT':
      return apply(ctx, seat, timeoutAction(s))
    case 'ROLL':
      return applyRoll(ctx, seat)
    case 'BUY':
      return applyBuy(ctx, seat)
    case 'DECLINE_BUY':
      return applyDecline(ctx, seat)
    case 'BID':
      return applyBid(ctx, seat, action.amount)
    case 'PASS_BID':
      return applyPassBid(ctx, seat)
    case 'BUILD':
      return applyBuild(ctx, seat, action.space)
    case 'SELL_BUILDING':
      return applySellBuilding(ctx, seat, action.space)
    case 'MORTGAGE':
      return applyMortgage(ctx, seat, action.space)
    case 'UNMORTGAGE':
      return applyUnmortgage(ctx, seat, action.space)
    case 'PROPOSE_TRADE':
      return applyPropose(ctx, seat, { to: seatOf(s, action.to), give: action.give, get: action.get })
    case 'CANCEL_TRADE':
      return applyCancelTrade(ctx, seat, action.tradeId)
    case 'ACCEPT_TRADE':
      return applyAcceptTrade(ctx, seat, action.tradeId)
    case 'REJECT_TRADE':
      return applyRejectTrade(ctx, seat, action.tradeId)
    case 'PAY_JAIL_FINE':
      return applyPayJailFine(ctx, seat)
    case 'USE_JAIL_CARD':
      return applyUseJailCard(ctx, seat)
    case 'END_TURN':
      return applyEndTurn(ctx)
    case 'DECLARE_BANKRUPTCY':
      return applyBankruptcy(ctx, seat)
  }
}

/**
 * The engine's single entry point. Pure: returns a new state and the events describing what
 * happened, or an error (never throws for game actions).
 */
export function reduce(state: GameState, playerId: PlayerId, action: Action): ReduceResult {
  const seat = seatOf(state, playerId)
  if (seat < 0) return { ok: false, error: 'unknown player' }
  const error = check(state, seat, action)
  if (error) return { ok: false, error }
  const ctx = makeCtx(cloneState(state))
  apply(ctx, seat, action)
  if (ctx.s.phase !== 'gameOver') {
    settleDebts(ctx)
    pruneTrades(ctx)
  }
  return { ok: true, state: ctx.s, events: ctx.events }
}
