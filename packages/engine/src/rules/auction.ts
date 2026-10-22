import type { Action } from '../actions.ts'
import { checkMonopoly, idOf, pay, type Ctx } from '../core.ts'
import type { GameState } from '../state.ts'

/**
 * English auction, turn-based so it stays deterministic. Real-time clocks send TIMEOUT,
 * which `reduce` maps to PASS_BID. The active player's turn continues afterwards.
 */

type Check = string | null

type Auction = Extract<NonNullable<GameState['pending']>, { kind: 'auction' }>

const auctionOf = (s: GameState): Auction | null => (s.pending?.kind === 'auction' ? s.pending : null)

/** Bidders in seat order starting after the decliner and ending with the decliner. */
export function startAuction(ctx: Ctx, space: number, decliner: number): void {
  const s = ctx.s
  const n = s.players.length
  const bidders: number[] = []
  for (let i = 1; i <= n; i++) {
    const seat = (decliner + i) % n
    if (!s.players[seat]!.bankrupt) bidders.push(seat)
  }
  s.pending = { kind: 'auction', space, bidders, current: 0, highBid: 0, highBidder: -1 }
  ctx.events.push({ type: 'AUCTION_STARTED', space })
}

function checkTurn(s: GameState, seat: number): Check {
  const a = auctionOf(s)
  if (!a) return 'no auction in progress'
  if (a.bidders[a.current] !== seat) return 'not your turn to bid'
  return null
}

export function checkBid(s: GameState, seat: number, amount: number): Check {
  const turn = checkTurn(s, seat)
  if (turn) return turn
  const a = auctionOf(s)!
  if (!Number.isInteger(amount) || amount < 1) return 'bid must be a whole number of at least 1'
  if (amount <= a.highBid) return 'bid must exceed the high bid'
  if (amount > s.players[seat]!.cash) return 'not enough cash'
  return null
}

export function applyBid(ctx: Ctx, seat: number, amount: number): void {
  const a = auctionOf(ctx.s)
  if (!a) return
  a.highBid = amount
  a.highBidder = seat
  ctx.events.push({ type: 'BID_PLACED', playerId: idOf(ctx.s, seat), amount })
  a.current = (a.current + 1) % a.bidders.length
  settleAuction(ctx)
}

export function checkPassBid(s: GameState, seat: number): Check {
  return checkTurn(s, seat)
}

export function applyPassBid(ctx: Ctx, seat: number): void {
  const a = auctionOf(ctx.s)
  if (!a) return
  ctx.events.push({ type: 'BIDDER_PASSED', playerId: idOf(ctx.s, seat) })
  a.bidders.splice(a.current, 1)
  if (a.current >= a.bidders.length) a.current = 0
  settleAuction(ctx)
}

/** Ends the auction if it is decided: nobody left (no sale) or the last bidder holds the high bid. */
function settleAuction(ctx: Ctx): void {
  const s = ctx.s
  const a = auctionOf(s)
  if (!a) return
  if (a.bidders.length === 0) {
    s.pending = null
    ctx.events.push({ type: 'AUCTION_ENDED', space: a.space, winner: null, amount: 0 })
    return
  }
  if (a.bidders.length === 1 && a.highBidder === a.bidders[0]) {
    const winner = a.highBidder
    s.pending = null
    pay(ctx, winner, -1, a.highBid, 'auction')
    s.owner[a.space] = winner
    ctx.events.push({ type: 'AUCTION_ENDED', space: a.space, winner: idOf(s, winner), amount: a.highBid })
    checkMonopoly(ctx, winner, a.space)
  }
}

export function legalAuction(s: GameState, seat: number): Action[] {
  const a = auctionOf(s)
  if (!a || checkTurn(s, seat)) return []
  const out: Action[] = [{ type: 'PASS_BID' }]
  const amounts = new Set([a.highBid + 1, a.highBid + 10, a.highBid + 50, a.highBid + 100])
  for (const amount of amounts) if (!checkBid(s, seat, amount)) out.push({ type: 'BID', amount })
  return out
}
