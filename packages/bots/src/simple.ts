import {
  SPACES,
  expectedActor,
  legalActions,
  rentFor,
  seatOf,
  type Action,
  type PlayerView,
} from '@skyline/engine'
import type { Bot, BotRng } from './bot.ts'

/**
 * Stand-in bot for the playable game (Milestone 4). Plays sensibly but simply:
 * keeps a cash reserve, buys what it can afford, builds when rich, bids up to a fair value,
 * raises money by selling then mortgaging, and rejects all trades. The heuristic bot replaces it.
 */
export const simpleBot: Bot = {
  name: 'Simple',
  decide(view: PlayerView, playerId: string, rng: BotRng): Action | null {
    const seat = seatOf(view, playerId)
    if (seat < 0) return null
    const legal = legalActions(view, playerId)
    if (legal.length === 0) return null
    const me = view.players[seat]!
    const has = (type: Action['type']) => legal.find((a) => a.type === type)
    const reserve = 150 + 30 * view.round

    // Trades offered to us: politely decline (the heuristic bot will evaluate them).
    const offer = has('REJECT_TRADE')
    if (offer) return offer

    if (expectedActor(view) !== seat) return null

    // In debt: borrow (Second Wind), else sell buildings, then mortgage, else give up.
    if (view.debts[0]?.debtor === seat) {
      return has('TAKE_LOAN') ?? has('SELL_BUILDING') ?? has('MORTGAGE') ?? has('DECLARE_BANKRUPTCY') ?? null
    }

    if (view.pending?.kind === 'auction') {
      const space = view.pending.space
      const value = SPACES[space]!.price * (0.75 + rng() * 0.4)
      const bids = legal.filter((a): a is Extract<Action, { type: 'BID' }> => a.type === 'BID')
      const bid = bids.find((b) => b.amount <= value && me.cash - b.amount >= reserve / 2)
      return bid ?? has('PASS_BID') ?? null
    }

    if (view.pending?.kind === 'buy') {
      const price = SPACES[view.pending.space]!.price
      return me.cash - price >= reserve ? (has('BUY') ?? has('DECLINE_BUY')!) : has('DECLINE_BUY')!
    }

    if (view.pending?.kind === 'move') {
      // Speed die: avoid rent and taxes, prefer something to buy.
      const m = view.pending
      const score = (space: number) => {
        const owner = view.owner[space]!
        const info = SPACES[space]!
        if (owner >= 0 && owner !== seat) return -rentFor(view, space, m.diceTotal)
        if (owner < 0 && info.price > 0 && me.cash - info.price >= reserve) return 50
        return info.kind === 'tax' ? -info.tax : info.kind === 'goToJail' ? -100 : 0
      }
      const best = m.options.reduce((a, b) => (score(b) > score(a) ? b : a))
      return { type: 'CHOOSE_MOVE', space: best }
    }

    if (view.phase === 'preRoll' && me.inJail) {
      const early = view.round < 12
      if (early)
        return has('USE_JAIL_CARD') ?? (me.cash > 500 ? has('PAY_JAIL_FINE') : undefined) ?? has('ROLL')!
      return has('ROLL')!
    }

    // Before ending the turn: lift mortgages and build while comfortably rich.
    if (view.phase === 'postRoll') {
      const unmortgage = legal.find((a) => a.type === 'UNMORTGAGE')
      if (unmortgage && me.cash > reserve * 3) return unmortgage
      const builds = legal.filter((a): a is Extract<Action, { type: 'BUILD' }> => a.type === 'BUILD')
      const build = builds.find((b) => me.cash - SPACES[b.space]!.houseCost >= reserve)
      if (build) return build
    }

    return has('ROLL') ?? has('END_TURN') ?? null
  },
}

/** Picks any legal action. Baseline for measuring other bots. */
export const randomBot: Bot = {
  name: 'Random',
  decide(view, playerId, rng) {
    const seat = seatOf(view, playerId)
    if (seat < 0 || expectedActor(view) !== seat) return null
    const legal = legalActions(view, playerId)
    return legal.length > 0 ? legal[Math.floor(rng() * legal.length)]! : null
  },
}
