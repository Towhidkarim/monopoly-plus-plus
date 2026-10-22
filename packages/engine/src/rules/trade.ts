import type { Action } from '../actions.ts'
import { isOwnable, mortgageValue, SPACES } from '../board.ts'
import { addCash, checkMonopoly, groupHasBuildings, idOf, pay, type Ctx } from '../core.ts'
import type { Bundle, GameState, TradeOffer } from '../state.ts'

/** Trades: open offers between any two players, auto-voided when they stop being valid. */

type Check = string | null

export interface ProposeArgs {
  to: number
  give: Bundle
  get: Bundle
}

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0

function bundleProblem(b: Bundle): Check {
  if (!b || !Array.isArray(b.spaces) || !isCount(b.cash) || !isCount(b.jailCards)) return 'malformed bundle'
  const seen = new Set<number>()
  for (const sp of b.spaces) {
    if (!Number.isInteger(sp) || sp < 0 || sp >= SPACES.length || !isOwnable(sp)) return 'not a property'
    if (seen.has(sp)) return 'duplicate property'
    seen.add(sp)
  }
  return null
}

const isEmpty = (b: Bundle) => b.spaces.length === 0 && b.cash === 0 && b.jailCards === 0

/** Shared validity: used when proposing, accepting, and pruning. Ignores who is acting. */
function problem(s: GameState, t: { from: number; to: number; give: Bundle; get: Bundle }): Check {
  const a = s.players[t.from]
  const b = s.players[t.to]
  if (!a || !b) return 'unknown player'
  if (a.bankrupt || b.bankrupt) return 'bankrupt players cannot trade'
  if (t.from === t.to) return 'cannot trade with yourself'
  const bad = bundleProblem(t.give) ?? bundleProblem(t.get)
  if (bad) return bad
  if (isEmpty(t.give) && isEmpty(t.get)) return 'empty trade'
  for (const sp of t.give.spaces) if (s.owner[sp] !== t.from) return 'giver does not own a property'
  for (const sp of t.get.spaces) if (s.owner[sp] !== t.to) return 'recipient does not own a property'
  for (const sp of [...t.give.spaces, ...t.get.spaces]) {
    const g = SPACES[sp]!.group
    if (g >= 0 && groupHasBuildings(s, g)) return 'sell buildings in that color group first'
  }
  if (t.give.cash > a.cash) return 'giver lacks the cash'
  if (t.get.cash > b.cash) return 'recipient lacks the cash'
  if (t.give.jailCards > a.jailCards.length) return 'giver lacks the jail cards'
  if (t.get.jailCards > b.jailCards.length) return 'recipient lacks the jail cards'
  return null
}

const mortgageFee = (space: number, interest: number) => Math.ceil(mortgageValue(space) * interest)

/** Fee a receiver owes the bank for mortgaged spaces they receive. */
function feeFor(s: GameState, spaces: readonly number[]): number {
  return spaces.reduce(
    (sum, sp) => sum + (s.mortgaged[sp] ? mortgageFee(sp, s.config.mortgageInterest) : 0),
    0,
  )
}

export function checkPropose(s: GameState, seat: number, args: ProposeArgs): Check {
  const bad = problem(s, { from: seat, ...args })
  if (bad) return bad
  if (s.trades.filter((t) => t.from === seat).length >= s.config.maxOpenTrades) return 'too many open offers'
  return null
}

export function applyPropose(ctx: Ctx, seat: number, args: ProposeArgs): void {
  const s = ctx.s
  const give = { ...args.give, spaces: [...args.give.spaces] }
  const get = { ...args.get, spaces: [...args.get.spaces] }
  const id = s.nextTradeId++
  s.trades.push({ id, from: seat, to: args.to, give, get })
  ctx.events.push({ type: 'TRADE_PROPOSED', tradeId: id, from: idOf(s, seat), to: idOf(s, args.to) })
}

const find = (s: GameState, id: number): TradeOffer | undefined => s.trades.find((t) => t.id === id)

export function checkCancelTrade(s: GameState, seat: number, tradeId: number): Check {
  const t = find(s, tradeId)
  if (!t) return 'no such trade'
  return t.from === seat ? null : 'not your offer'
}

function remove(ctx: Ctx, id: number): void {
  ctx.s.trades = ctx.s.trades.filter((t) => t.id !== id)
}

export function applyCancelTrade(ctx: Ctx, _seat: number, tradeId: number): void {
  remove(ctx, tradeId)
  ctx.events.push({ type: 'TRADE_CANCELLED', tradeId })
}

export function checkRejectTrade(s: GameState, seat: number, tradeId: number): Check {
  const t = find(s, tradeId)
  if (!t) return 'no such trade'
  return t.to === seat ? null : 'not offered to you'
}

export function applyRejectTrade(ctx: Ctx, _seat: number, tradeId: number): void {
  remove(ctx, tradeId)
  ctx.events.push({ type: 'TRADE_REJECTED', tradeId })
}

export function checkAcceptTrade(s: GameState, seat: number, tradeId: number): Check {
  const t = find(s, tradeId)
  if (!t) return 'no such trade'
  if (t.to !== seat) return 'not offered to you'
  const bad = problem(s, t)
  if (bad) return bad
  const interest = s.config.mortgageInterest
  const toAfter = s.players[t.to]!.cash + t.give.cash - t.get.cash
  const fromAfter = s.players[t.from]!.cash - t.give.cash + t.get.cash
  if (toAfter < feeFor(s, t.give.spaces) || fromAfter < feeFor(s, t.get.spaces)) {
    return `not enough cash for the ${Math.round(interest * 100)}% mortgage fee`
  }
  return null
}

export function applyAcceptTrade(ctx: Ctx, _seat: number, tradeId: number): void {
  const s = ctx.s
  const t = find(s, tradeId)
  if (!t) return
  remove(ctx, tradeId)
  addCash(ctx, t.from, -t.give.cash, 'trade', t.to)
  addCash(ctx, t.to, t.give.cash, 'trade', t.from)
  addCash(ctx, t.to, -t.get.cash, 'trade', t.from)
  addCash(ctx, t.from, t.get.cash, 'trade', t.to)
  const moves: [Bundle, number, number][] = [
    [t.give, t.from, t.to],
    [t.get, t.to, t.from],
  ]
  for (const [bundle, giver, receiver] of moves) {
    for (const sp of bundle.spaces) {
      s.owner[sp] = receiver
      ctx.events.push({
        type: 'PROPERTY_TRANSFERRED',
        space: sp,
        from: idOf(s, giver),
        to: idOf(s, receiver),
      })
    }
    const cards = s.players[giver]!.jailCards.splice(0, bundle.jailCards)
    for (const deck of cards) {
      s.players[receiver]!.jailCards.push(deck)
      ctx.events.push({ type: 'JAIL_CARD_GAINED', playerId: idOf(s, receiver), deck, from: idOf(s, giver) })
    }
  }
  pay(ctx, t.to, -1, feeFor(s, t.give.spaces), 'trade')
  pay(ctx, t.from, -1, feeFor(s, t.get.spaces), 'trade')
  const done = new Set<string>()
  for (const [bundle, , receiver] of moves) {
    for (const sp of bundle.spaces) {
      const key = `${receiver}:${SPACES[sp]!.group}`
      if (SPACES[sp]!.group < 0 || done.has(key)) continue
      done.add(key)
      checkMonopoly(ctx, receiver, sp)
    }
  }
  ctx.events.push({ type: 'TRADE_ACCEPTED', tradeId })
}

/** Voids open trades that are no longer valid (assets changed, cash short, party gone). */
export function pruneTrades(ctx: Ctx): void {
  const s = ctx.s
  const kept: TradeOffer[] = []
  for (const t of s.trades) {
    if (problem(s, t)) ctx.events.push({ type: 'TRADE_VOIDED', tradeId: t.id })
    else kept.push(t)
  }
  s.trades = kept
}

/** Accept / reject / cancel options. Proposals are open-ended and not enumerated. */
export function legalTrade(s: GameState, seat: number): Action[] {
  const out: Action[] = []
  for (const t of s.trades) {
    if (t.to === seat) {
      if (!checkAcceptTrade(s, seat, t.id)) out.push({ type: 'ACCEPT_TRADE', tradeId: t.id })
      out.push({ type: 'REJECT_TRADE', tradeId: t.id })
    }
    if (t.from === seat) out.push({ type: 'CANCEL_TRADE', tradeId: t.id })
  }
  return out
}
