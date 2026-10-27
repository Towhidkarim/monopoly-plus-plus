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

/**
 * How much `seat` likes an offer, in money terms above its acceptance bar: positive means yes.
 * A deal that would leave it nearly broke is -Infinity. Drives the trade screen's meter.
 */
export function tradeScore(s: GameState, seat: number, o: Offer, p: BotParams): number {
  const cashOut = o.to === seat ? o.get.cash - o.give.cash : o.give.cash - o.get.cash
  if (cashOut > 0 && s.players[seat]!.cash - cashOut < reserveFor(s, seat, p) * 0.5) return -Infinity
  const [mine, theirs] = gains(s, seat, o, p)
  return score(mine, theirs, p) - p.tradeMargin
}

/** Would `seat` accept this offer? */
export function accepts(s: GameState, seat: number, o: Offer, p: BotParams): boolean {
  return tradeScore(s, seat, o, p) > 0
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

/** Groups where `holder` owns all but one space, and `owner` owns that one: [group, missing space]. */
function oneShort(s: GameState, holder: number, owner: number): [number, number][] {
  const out: [number, number][] = []
  for (let g = 0; g < GROUPS.length; g++) {
    const missing = GROUPS[g]!.filter((i) => s.owner[i] !== holder)
    if (missing.length === 1 && s.owner[missing[0]!] === owner) out.push([g, missing[0]!])
  }
  return out
}

/** Spaces of group `g` that `seat` owns, if no house stands anywhere in the group. */
function ownedBare(s: GameState, seat: number, g: number): number[] {
  const spaces = GROUPS[g]!
  if (spaces.some((j) => s.houses[j]! > 0)) return []
  return spaces.filter((j) => s.owner[j] === seat && !s.mortgaged[j])
}

const sortedIds = (v: number[]) => v.toSorted((a, b) => a - b).join(',')

/** Identity of an offer without its cash, for cooldowns: same partner, same properties. */
export function offerKey(o: Offer): string {
  return `${o.to}|${sortedIds(o.give.spaces)}|${sortedIds(o.get.spaces)}`
}

/** How long (in turns) a proposed deal stays off the table, accepted or not. */
export const PROPOSAL_COOLDOWN = 12

/**
 * Candidate offers to partner `x`: the missing piece for cash or a property (plus sweetener),
 * two-for-one deals, and set swaps where each side holds the other's missing piece, with cash
 * flowing either way to balance.
 */
export function candidates(
  s: GameState,
  seat: number,
  x: number,
  spare: number,
  partnerSpare: number,
  p: BotParams,
): Offer[] {
  const out: Offer[] = []
  /** cash > 0: I pay; cash < 0: they pay me. */
  const add = (give: number[], get: number[], cash: number) => {
    if (cash > Math.max(0, spare) || -cash > Math.max(0, partnerSpare)) return
    out.push({
      from: seat,
      to: x,
      give: bundle(give, Math.max(0, cash)),
      get: bundle(get, Math.max(0, -cash)),
    })
  }
  /** Cash amounts around the point where both sides gain about the same (value moves ~1:1 with cash). */
  const balancing = (give: number[], get: number[]): number[] => {
    const [a, b] = gains(s, seat, { from: seat, to: x, give: bundle(give), get: bundle(get) }, p)
    const mid = round10((a - b) / 2)
    return [...new Set([0, mid, mid - 40, mid + 40, mid - 100])]
  }
  const mine = oneShort(s, seat, x)
  for (const [g, m] of mine) {
    const price = SPACES[m]!.price
    for (const mult of [1.1, 1.4, 1.8, 2.3, 3]) add([], [m], round10(price * mult))
    const spares = tradeable(s, seat, g)
    for (const q of spares) for (const c of [0, 50, 100, 200]) add([q], [m], c)
    for (let a = 0; a < spares.length; a++)
      for (let b = a + 1; b < spares.length; b++) add([spares[a]!, spares[b]!], [m], 0)
  }
  // Set swaps: they miss one piece (q) of a set that I hold, and I miss one (m) that they hold.
  for (const [h, q] of oneShort(s, x, seat)) {
    if (ownedBare(s, seat, h).length === 0) continue
    for (const [g, m] of mine) {
      if (g === h) continue
      for (const c of balancing([q], [m])) add([q], [m], c)
    }
  }
  // Both sides advance: they hold two pieces I miss from a set; I give a spare piece plus cash.
  for (let g = 0; g < GROUPS.length; g++) {
    const missing = GROUPS[g]!.filter((i) => s.owner[i] !== seat)
    if (missing.length !== 2 || missing.some((i) => s.owner[i] !== x)) continue
    for (const q of tradeable(s, seat, g)) for (const c of balancing([q], missing)) add([q], missing, c)
  }
  return out
}

/**
 * The best deal the partner would likely accept (judged with our own model, with a margin so
 * offers look tempting), or null. `canTradeWith` filters partners; `blocked` lets the bot veto
 * offers it made recently (cooldown), so a rejected deal is not repeated.
 */
export function proposal(
  s: GameState,
  seat: number,
  p: BotParams,
  canTradeWith: (seat: number) => boolean,
  blocked: (o: Offer) => boolean = () => false,
): Extract<Action, { type: 'PROPOSE_TRADE' }> | null {
  const spare = s.players[seat]!.cash - reserveFor(s, seat, p) * 0.6
  const baseMine = seatValue(s, seat, p)
  let best: { offer: Offer; score: number } | null = null
  const partners = new Set<number>()
  for (const group of GROUPS) {
    const missing = group.filter((i) => s.owner[i] !== seat)
    if (missing.length <= 2) for (const i of missing) partners.add(s.owner[i]!)
  }
  for (const x of [...partners].toSorted((a, b) => a - b)) {
    if (x < 0 || s.players[x]!.bankrupt || !canTradeWith(x)) continue
    const partnerSpare = s.players[x]!.cash - reserveFor(s, x, p) * 0.5
    const baseTheirs = seatValue(s, x, p)
    for (const offer of candidates(s, seat, x, spare, partnerSpare, p)) {
      if (blocked(offer)) continue
      const after = afterTrade(s, offer.from, offer.to, offer.give, offer.get)
      const mine = seatValue(after, seat, p) - baseMine
      const theirs = seatValue(after, x, p) - baseTheirs
      // Would the partner accept with room to spare (so it looks tempting)? Then is it worth it?
      if (score(theirs, mine, p) <= p.tradeMargin * 1.25) continue
      const value = score(mine, theirs, p)
      if (value > p.tradeMargin && (!best || value > best.score)) best = { offer, score: value }
    }
  }
  if (!best) return null
  const { offer } = best
  return { type: 'PROPOSE_TRADE', to: s.players[offer.to]!.id, give: offer.give, get: offer.get }
}
