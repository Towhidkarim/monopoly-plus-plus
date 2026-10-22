import type { Action } from '../actions.ts'
import { SPACES } from '../board.ts'
import { checkMonopoly, idOf, pay, type Ctx } from '../core.ts'
import type { GameState } from '../state.ts'
import { startAuction } from './auction.ts'

/** Buying the space you landed on, or declining (which starts an auction). */

type Check = string | null

export function checkBuy(s: GameState, seat: number): Check {
  if (seat !== s.current) return 'not your turn'
  if (s.pending?.kind !== 'buy') return 'nothing to buy'
  if (s.players[seat]!.cash < SPACES[s.pending.space]!.price) return 'not enough cash'
  return null
}

export function applyBuy(ctx: Ctx, seat: number): void {
  const s = ctx.s
  if (s.pending?.kind !== 'buy') return
  const space = s.pending.space
  const price = SPACES[space]!.price
  s.pending = null
  pay(ctx, seat, -1, price, 'purchase')
  s.owner[space] = seat
  ctx.events.push({ type: 'PROPERTY_BOUGHT', playerId: idOf(s, seat), space, price })
  checkMonopoly(ctx, seat, space)
}

export function checkDecline(s: GameState, seat: number): Check {
  if (seat !== s.current) return 'not your turn'
  if (s.pending?.kind !== 'buy') return 'nothing to decline'
  return null
}

export function applyDecline(ctx: Ctx, seat: number): void {
  const s = ctx.s
  if (s.pending?.kind !== 'buy') return
  const space = s.pending.space
  s.pending = null
  if (s.config.auctionOnDecline) startAuction(ctx, space, seat)
}

export function legalBuy(s: GameState, seat: number): Action[] {
  const out: Action[] = []
  if (!checkBuy(s, seat)) out.push({ type: 'BUY' })
  if (!checkDecline(s, seat)) out.push({ type: 'DECLINE_BUY' })
  return out
}
