import { GROUPS, SPACES, type Action, type Bundle, type GameState } from '@skyline/engine'
import { afterTrade, reserveFor, seatValue } from './model.ts'
import type { BotParams } from './params.ts'

/**
 * Trades, valued with the same model as everything else: a deal is good when it raises my
 * position value by a margin, and the partner does not gain much more than I do ("envy").
 * Proposals target the one missing piece of a set, paid with cash or a property the owner wants.
 */

export interface Offer {
  from: number
  to: number
  give: Bundle
  get: Bundle
}

const bundle = (spaces: number[], cash = 0): Bundle => ({ spaces, cash, jailCards: 0 })
const round10 = (v: number) => Math.round(v / 10) * 10

/** Value change of a deal for both sides: [mine, partner's]. */
function gains(s: GameState, seat: number, o: Offer, p: BotParams): [number, number] {
  const after = afterTrade(s, o.from, o.to, o.give, o.get)
  const other = o.from === seat ? o.to : o.from
  return [
    seatValue(after, seat, p) - seatValue(s, seat, p),
    seatValue(after, other, p) - seatValue(s, other, p),
  ]
}

const score = (mine: number, theirs: number, p: BotParams) => mine - p.envy * Math.max(0, theirs - mine)

/** Would `seat` accept this offer? Also refuses deals that would leave it nearly broke. */
export function accepts(s: GameState, seat: number, o: Offer, p: BotParams): boolean {
  const cashOut = o.to === seat ? o.get.cash - o.give.cash : o.give.cash - o.get.cash
  if (cashOut > 0 && s.players[seat]!.cash - cashOut < reserveFor(s, seat, p) * 0.5) return false
  const [mine, theirs] = gains(s, seat, o, p)
  return score(mine, theirs, p) > p.tradeMargin
}

/** Spaces the seat could hand over without hurting its own sets. */
function tradeable(s: GameState, seat: number, exceptGroup: number): number[] {
  const out: number[] = []
  for (let i = 0; i < SPACES.length; i++) {
    if (s.owner[i] !== seat || s.mortgaged[i]) continue
    const g = SPACES[i]!.group
    if (g === exceptGroup) continue
    if (g >= 0) {
      const spaces = GROUPS[g]!
      const mine = spaces.filter((j) => s.owner[j] === seat).length
      if (mine >= spaces.length - 1 || spaces.some((j) => s.houses[j]! > 0)) continue
    }
    out.push(i)
  }
  return out
}

/**
 * The best deal for a set's missing piece that the owner would likely accept (judged with our
 * own model), or null. `canTradeWith` filters partners (humans have no trade screen yet).
 */
export function proposal(
  s: GameState,
  seat: number,
  p: BotParams,
  canTradeWith: (seat: number) => boolean,
): Extract<Action, { type: 'PROPOSE_TRADE' }> | null {
  const me = s.players[seat]!
  const spare = me.cash - reserveFor(s, seat, p) * 0.6
  let best: { offer: Offer; score: number } | null = null
  for (let g = 0; g < GROUPS.length; g++) {
    const missing = GROUPS[g]!.filter((i) => s.owner[i] !== seat)
    if (missing.length !== 1) continue
    const m = missing[0]!
    const x = s.owner[m]!
    if (x < 0 || s.players[x]!.bankrupt || !canTradeWith(x)) continue
    const price = SPACES[m]!.price
    const offers: Offer[] = []
    for (const mult of [1.1, 1.4, 1.8, 2.3, 3]) {
      const cash = round10(price * mult)
      if (cash <= spare) offers.push({ from: seat, to: x, give: bundle([], cash), get: bundle([m]) })
    }
    for (const q of tradeable(s, seat, g)) {
      for (const cash of [0, 50, 100, 200]) {
        if (cash <= Math.max(0, spare))
          offers.push({ from: seat, to: x, give: bundle([q], cash), get: bundle([m]) })
      }
    }
    // Values before the deal are the same for every offer: compute them once.
    const baseMine = seatValue(s, seat, p)
    const baseTheirs = seatValue(s, x, p)
    const partnerReserve = reserveFor(s, x, p) * 0.5
    for (const offer of offers) {
      if (offer.get.cash > 0 && s.players[x]!.cash - offer.get.cash < partnerReserve) continue
      const after = afterTrade(s, offer.from, offer.to, offer.give, offer.get)
      const mine = seatValue(after, seat, p) - baseMine
      const theirs = seatValue(after, x, p) - baseTheirs
      // Would the partner accept (judged with our model)? Then is it worth it for us?
      if (score(theirs, mine, p) <= p.tradeMargin) continue
      const value = score(mine, theirs, p)
      if (value > p.tradeMargin && (!best || value > best.score)) best = { offer, score: value }
    }
  }
  if (!best) return null
  const { offer } = best
  return { type: 'PROPOSE_TRADE', to: s.players[offer.to]!.id, give: offer.give, get: offer.get }
}
