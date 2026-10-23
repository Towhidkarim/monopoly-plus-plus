import {
  GROUPS,
  HOTEL,
  JAIL_INDEX,
  SPACES,
  activePlayers,
  mortgageValue,
  rentFor,
  type Bundle,
  type GameState,
} from '@skyline/engine'
import { LANDING } from './landing.ts'
import type { BotParams } from './params.ts'

/**
 * The heuristic bot's view of value: what a seat's position is worth in ₵, combining net worth
 * (what wins at the round limit) with expected future rent (what wins long games). Every decision
 * compares this number before and after a move.
 */

/** Rounds of rent still worth counting. Shrinks toward a round limit, so late games protect worth. */
export function horizon(s: GameState): number {
  const limit = s.config.roundLimit
  const cap = 25
  return limit > 0 ? Math.max(1, Math.min(cap, limit - s.round + 1)) : cap
}

const opponents = (s: GameState, seat: number) => activePlayers(s).filter((i) => i !== seat).length

/** Expected rent per round from a space as it stands. */
export function rentRate(s: GameState, space: number, opps?: number): number {
  const owner = s.owner[space]!
  if (owner < 0 || s.mortgaged[space]) return 0
  return LANDING[space]! * (opps ?? opponents(s, owner)) * rentFor(s, space, 7)
}

/** A color set's upside from developing to three houses: future rent gained minus build cost. */
function developUpside(s: GameState, group: number, opps: number, rounds: number, weight: number): number {
  let gain = 0
  let cost = 0
  for (const i of GROUPS[group]!) {
    const level = s.houses[i]!
    if (level >= 3) continue
    const sp = SPACES[i]!
    const now = level === 0 ? sp.rent[0]! * 2 : sp.rent[level]!
    gain += LANDING[i]! * opps * (sp.rent[3]! - now)
    cost += (3 - level) * sp.houseCost
  }
  return Math.max(0, gain * rounds * weight - cost)
}

/** Position value of a seat in ₵. Bankrupt seats are worth nothing. */
export function seatValue(s: GameState, seat: number, p: BotParams): number {
  const me = s.players[seat]!
  if (me.bankrupt) return 0
  const rounds = horizon(s)
  const opps = opponents(s, seat)
  let value = me.cash
  let income = 0
  for (let i = 0; i < SPACES.length; i++) {
    if (s.owner[i] !== seat) continue
    const sp = SPACES[i]!
    const level = s.houses[i]!
    value += s.mortgaged[i] ? mortgageValue(i) : sp.price + (level === HOTEL ? 5 : level) * sp.houseCost
    income += rentRate(s, i, opps)
  }
  value += income * rounds * p.incomeWeight
  for (let g = 0; g < GROUPS.length; g++) {
    const spaces = GROUPS[g]!
    const mine = spaces.filter((i) => s.owner[i] === seat).length
    if (mine === 0) continue
    const blocked = spaces.some((i) => s.owner[i]! >= 0 && s.owner[i] !== seat)
    const upside = developUpside(s, g, opps, rounds, p.incomeWeight)
    if (mine === spaces.length) {
      if (!spaces.some((i) => s.mortgaged[i])) value += upside * 0.6
    } else if (!blocked) {
      value += upside * 0.12 * (mine / spaces.length) ** 2
    } else if (mine === spaces.length - 1) {
      value += upside * 0.04 // one trade away
    }
  }
  return value
}

/** Worst rent owed to someone else within one roll of where the seat stands. */
export function danger(s: GameState, seat: number): number {
  const me = s.players[seat]!
  const from = me.inJail ? JAIL_INDEX : me.position
  let worst = 0
  for (let d = 2; d <= 12; d++) {
    const i = (from + d) % SPACES.length
    const owner = s.owner[i]!
    if (owner >= 0 && owner !== seat && !s.mortgaged[i]) worst = Math.max(worst, rentFor(s, i, d))
  }
  return worst
}

/** Cash the bot wants to keep in hand right now. */
export function reserveFor(s: GameState, seat: number, p: BotParams): number {
  return p.reserve + p.danger * danger(s, seat)
}

/** A light copy of the state with a trade applied (ownership and cash only; enough for valuing). */
export function afterTrade(s: GameState, from: number, to: number, give: Bundle, get: Bundle): GameState {
  const owner = [...s.owner]
  for (const i of give.spaces) owner[i] = to
  for (const i of get.spaces) owner[i] = from
  const players = s.players.map((pl, seat) =>
    seat === from
      ? { ...pl, cash: pl.cash - give.cash + get.cash }
      : seat === to
        ? { ...pl, cash: pl.cash + give.cash - get.cash }
        : pl,
  )
  return { ...s, owner, players }
}

/** A light copy where `seat` owns `space` and paid `price` for it. */
export function afterPurchase(s: GameState, seat: number, space: number, price: number): GameState {
  const owner = [...s.owner]
  owner[space] = seat
  const players = s.players.map((pl, i) => (i === seat ? { ...pl, cash: pl.cash - price } : pl))
  return { ...s, owner, players }
}
