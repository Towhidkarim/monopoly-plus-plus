import {
  GROUPS,
  SPACES,
  mortgageValue,
  ownsGroup,
  activePlayers,
  expectedActor,
  isOwnable,
  legalActions,
  rentFor,
  seatOf,
  unmortgageCost,
  type Action,
  type GameState,
  type PlayerView,
} from '@skyline/engine'
import type { Bot, BotRng } from '../bot.ts'
import { raisePlan } from '../plans.ts'
import { LANDING } from './landing.ts'
import { afterPurchase, horizon, rentRate, reserveFor, seatValue } from './model.ts'
import { BALANCED, type BotParams } from './params.ts'
import { PROPOSAL_COOLDOWN, accepts, offerKey, proposal, type Offer } from './trades.ts'

export interface HeuristicOptions {
  /** Partners the bot may propose trades to (default: everyone). */
  canTradeWith?: (playerId: string) => boolean
}

type Of<T extends Action['type']> = Extract<Action, { type: T }>

/**
 * Heuristic bot (Milestone 3): every decision compares position value (model.ts) before and
 * after, under a cash reserve that grows with nearby danger. Behaviour comes from `BotParams`,
 * so personalities are presets. See DECISIONS.md D22.
 */
export function createHeuristicBot(params: BotParams = BALANCED, options: HeuristicOptions = {}): Bot {
  /** Turn on which each seat last proposed a trade (one proposal per turn). */
  const proposedOn = new Map<string, number>()
  /** Offer identity (partner + properties) -> turn it was proposed; repeats wait out a cooldown. */
  const proposedKeys = new Map<string, number>()
  const canTradeWith = options.canTradeWith ?? (() => true)

  return {
    name: params.name,
    decide(view: PlayerView, playerId: string, rng: BotRng): Action | null {
      const seat = seatOf(view, playerId)
      if (seat < 0 || view.players[seat]!.bankrupt) return null
      const legal = legalActions(view, playerId)
      if (legal.length === 0) return null
      const find = <T extends Action['type']>(t: T) => legal.find((a): a is Of<T> => a.type === t)

      // Offers can arrive at any time; answer them first.
      const offer = view.trades.find((t) => t.to === seat)
      if (offer) {
        const accept = legal.find((a) => a.type === 'ACCEPT_TRADE' && a.tradeId === offer.id)
        return accept && accepts(view, seat, offer, params)
          ? accept
          : { type: 'REJECT_TRADE', tradeId: offer.id }
      }
      if (expectedActor(view) !== seat) return null

      const p = params
      const me = view.players[seat]!
      const reserve = reserveFor(view, seat, p)
      const jitter = () => 1 + p.noise * (rng() * 2 - 1)

      if (view.debts[0]?.debtor === seat) {
        const owed = view.debts.filter((d) => d.debtor === seat).reduce((t, d) => t + d.amount, 0)
        return raisePlan(view, playerId, owed - me.cash).actions[0] ?? { type: 'DECLARE_BANKRUPTCY' }
      }

      if (view.pending?.kind === 'auction') {
        const a = view.pending
        const worth =
          (gainOf(view, seat, a.space, 0, p) + 0.4 * p.envy * rivalGain(view, seat, a.space, p)) * jitter()
        const cap = Math.min(worth * p.bidCap, me.cash - reserve * 0.3)
        // Open around half the list price, then raise by roughly 10% (keeps auctions short).
        const step = Math.max(10, Math.round(a.highBid / 100) * 10)
        const next =
          a.highBid === 0 ? Math.max(10, Math.round(SPACES[a.space]!.price / 20) * 10) : a.highBid + step
        const amount = Math.min(next, Math.floor(cap))
        return amount > a.highBid && amount <= me.cash ? { type: 'BID', amount } : (find('PASS_BID') ?? null)
      }

      if (view.pending?.kind === 'buy') {
        const space = view.pending.space
        const price = SPACES[space]!.price
        const gain = gainOf(view, seat, space, price, p) * jitter()
        const comfortable = me.cash - price >= reserve * p.buyCaution
        const important = gain > price * 0.3 || rivalGain(view, seat, space, p) > price * 0.5
        const buy = find('BUY')
        return buy && gain > 0 && (comfortable || important) ? buy : find('DECLINE_BUY')!
      }

      if (view.phase === 'preRoll' && me.inJail) {
        // Early on, get out and keep buying; once the board is built up, jail is the safest seat.
        const unowned = SPACES.filter((_, i) => isOwnable(i) && view.owner[i]! < 0).length
        const leave = unowned >= 6 || maxRivalRent(view, seat) < 200
        if (leave) {
          const card = find('USE_JAIL_CARD')
          if (card) return card
          const fine = find('PAY_JAIL_FINE')
          if (fine && me.cash - view.config.jailFine >= reserve) return fine
        }
        return find('ROLL')!
      }

      if (!view.pending) {
        const build = bestBuild(view, seat, legal, reserve, p)
        if (build) return build
        const fund = fundingMortgage(view, seat, legal, reserve, p)
        if (fund) return fund
        const lift = wantsHouses(view, seat) ? null : bestUnmortgage(view, seat, legal, reserve)
        if (lift) return lift
        if (
          p.proposes &&
          proposedOn.get(playerId) !== view.turnCount &&
          !view.trades.some((t) => t.from === seat)
        ) {
          proposedOn.set(playerId, view.turnCount)
          const keyOf = (o: Offer) => `${playerId}:${offerKey(o)}`
          const deal = proposal(
            view,
            seat,
            p,
            (x) => canTradeWith(view.players[x]!.id),
            (o) => view.turnCount - (proposedKeys.get(keyOf(o)) ?? -Infinity) < PROPOSAL_COOLDOWN,
          )
          if (deal) {
            const to = view.players.findIndex((q) => q.id === deal.to)
            proposedKeys.set(keyOf({ from: seat, to, give: deal.give, get: deal.get }), view.turnCount)
            return deal
          }
        }
      }
      return find('ROLL') ?? find('END_TURN') ?? null
    },
  }
}

/** Value to `seat` of owning `space` for `price`. */
function gainOf(s: GameState, seat: number, space: number, price: number, p: BotParams): number {
  return seatValue(afterPurchase(s, seat, space, price), seat, p) - seatValue(s, seat, p)
}

/** The most any rival would gain from getting `space` for free (what denying it is worth). */
function rivalGain(s: GameState, seat: number, space: number, p: BotParams): number {
  let best = 0
  for (const other of activePlayers(s)) {
    if (other !== seat) best = Math.max(best, gainOf(s, other, space, 0, p) - SPACES[space]!.price)
  }
  return best
}

/** Highest rent anyone else currently charges. */
function maxRivalRent(s: GameState, seat: number): number {
  let worst = 0
  for (let i = 0; i < SPACES.length; i++) {
    const owner = s.owner[i]!
    if (owner >= 0 && owner !== seat && !s.mortgaged[i]) worst = Math.max(worst, rentFor(s, i, 7))
  }
  return worst
}

/** The house with the best rent gain per ₵, if it pays back in time and cash stays safe. */
function bestBuild(
  s: GameState,
  seat: number,
  legal: Action[],
  reserve: number,
  p: BotParams,
): Of<'BUILD'> | null {
  const cash = s.players[seat]!.cash
  const opps = activePlayers(s).length - 1
  const rounds = horizon(s)
  let best: { a: Of<'BUILD'>; roi: number } | null = null
  for (const a of legal) {
    if (a.type !== 'BUILD') continue
    const sp = SPACES[a.space]!
    if (cash - sp.houseCost < reserve * p.buildCaution) continue
    const level = s.houses[a.space]!
    const now = level === 0 ? sp.rent[0]! * 2 : sp.rent[level]!
    const roi = (LANDING[a.space]! * opps * (sp.rent[level + 1]! - now)) / sp.houseCost
    if (roi * rounds < 0.6) continue
    if (!best || roi > best.roi) best = { a, roi }
  }
  return best?.a ?? null
}

/** Complete, unmortgaged sets of the seat that still sit below three houses: [space at lowest level]. */
function houseTargets(s: GameState, seat: number): number[] {
  const out: number[] = []
  for (let g = 0; g < GROUPS.length; g++) {
    const spaces = GROUPS[g]!
    if (!ownsGroup(s, seat, g) || spaces.some((i) => s.mortgaged[i])) continue
    const low = spaces.reduce((a, b) => (s.houses[b]! < s.houses[a]! ? b : a))
    if (s.houses[low]! < 3) out.push(low)
  }
  return out
}

const wantsHouses = (s: GameState, seat: number) => houseTargets(s, seat).length > 0

/**
 * Classic strong play: mortgage a lone property to fund houses on a complete set, when the
 * house earns more rent than the mortgage loses and the money would actually get it built.
 */
function fundingMortgage(
  s: GameState,
  seat: number,
  legal: Action[],
  reserve: number,
  p: BotParams,
): Of<'MORTGAGE'> | null {
  const cash = s.players[seat]!.cash
  const opps = activePlayers(s).length - 1
  let best: { space: number; gain: number; cost: number } | null = null
  for (const i of houseTargets(s, seat)) {
    const sp = SPACES[i]!
    const level = s.houses[i]!
    const now = level === 0 ? sp.rent[0]! * 2 : sp.rent[level]!
    const gain = LANDING[i]! * opps * (sp.rent[level + 1]! - now)
    if (!best || gain / sp.houseCost > best.gain / best.cost) best = { space: i, gain, cost: sp.houseCost }
  }
  if (!best) return null
  const need = best.cost + reserve * p.buildCaution - cash
  if (need <= 0) return null
  const options = legal
    .filter((a): a is Of<'MORTGAGE'> => a.type === 'MORTGAGE')
    .filter((a) => {
      const g = SPACES[a.space]!.group
      return g < 0 || !ownsGroup(s, seat, g)
    })
    .map((a) => ({ a, lost: rentRate(s, a.space, opps) }))
    .toSorted((x, y) => x.lost - y.lost)
  const raisable = options.reduce((t, o) => t + mortgageValue(o.a.space), 0)
  const first = options[0]
  // Compare the rent lost with the rent from every house the mortgage money pays for.
  const funded = (mortgageValue(first?.a.space ?? 0) / best.cost) * best.gain
  if (!first || raisable < need || first.lost >= funded) return null
  return first.a
}

/** Lift the mortgage that restores the most rent, when cash is well above the reserve. */
function bestUnmortgage(
  s: GameState,
  seat: number,
  legal: Action[],
  reserve: number,
): Of<'UNMORTGAGE'> | null {
  const cash = s.players[seat]!.cash
  let best: { a: Of<'UNMORTGAGE'>; rent: number } | null = null
  for (const a of legal) {
    if (a.type !== 'UNMORTGAGE' || cash - unmortgageCost(s, a.space) < reserve * 1.5) continue
    const rent =
      LANDING[a.space]! *
      rentFor({ ...s, mortgaged: s.mortgaged.map((m, i) => (i === a.space ? false : m)) }, a.space, 7)
    if (!best || rent > best.rent) best = { a, rent }
  }
  return best?.a ?? null
}
