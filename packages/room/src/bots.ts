import { PERSONALITIES, botRng, createHeuristicBot, type Bot, type BotRng } from '@skyline/bots'
import {
  expectedActor,
  observe,
  type Action,
  type GameEvent,
  type GameState,
  type PlayerId,
} from '@skyline/engine'

/** Bots offer trades to a human at most once every this many rounds (as in the local game). */
const OFFER_GAP_ROUNDS = 2

export interface BotMove {
  playerId: PlayerId
  action: Action
  /** Applied when the engine rejects `action`, so a bot can never stall the game. */
  fallback: Action
}

/**
 * The bot seats of one game, driven like `playMatch`: offers addressed to a bot are answered
 * first (out of turn), then the expected actor moves if it is a bot.
 */
export class BotSeats {
  private readonly bots: (Bot | null)[]
  private readonly rngs: BotRng[]
  private readonly canTradeWith = (id: PlayerId): boolean => this.isBot(id) || this.mayOfferTo(id)
  private readonly lastOfferTo = new Map<PlayerId, number>()
  private state: GameState | null = null

  /** `personalities[i]` is the personality of game seat i, or null for a human. */
  constructor(personalities: readonly (string | null)[], seed: number) {
    this.bots = personalities.map((p) => (p === null ? null : this.create(p)))
    this.rngs = personalities.map((_, i) => botRng((seed ^ 0x5bd1e995) + i * 7919))
  }

  /** A bot stands in for a human's seat (with this personality), or hands it back (null). */
  setStandIn(seat: number, personality: string | null): void {
    this.bots[seat] = personality === null ? null : this.create(personality)
  }

  private create(personality: string): Bot {
    return createHeuristicBot(PERSONALITIES[personality] ?? PERSONALITIES.balanced, {
      canTradeWith: this.canTradeWith,
    })
  }

  /** True when some bot has something to do in this state. */
  pending(s: GameState): boolean {
    if (s.phase === 'gameOver') return false
    return this.offerToBot(s) !== undefined || this.bots[expectedActor(s)] !== null
  }

  next(s: GameState): BotMove | null {
    if (s.phase === 'gameOver') return null
    const offer = this.offerToBot(s)
    if (offer) {
      const reject: Action = { type: 'REJECT_TRADE', tradeId: offer.id }
      return { playerId: s.players[offer.to]!.id, action: this.ask(s, offer.to) ?? reject, fallback: reject }
    }
    const seat = expectedActor(s)
    if (!this.bots[seat]) return null
    const timeout: Action = { type: 'TIMEOUT' }
    return { playerId: s.players[seat]!.id, action: this.ask(s, seat) ?? timeout, fallback: timeout }
  }

  /** Keeps track of offers made to humans, for the offer gap. */
  note(s: GameState, events: readonly GameEvent[]): void {
    this.state = s
    for (const e of events)
      if (e.type === 'TRADE_PROPOSED' && this.isBot(e.from)) this.lastOfferTo.set(e.to, s.round)
  }

  private ask(s: GameState, seat: number): Action | null {
    const id = s.players[seat]!.id
    this.state = s
    return this.bots[seat]!.decide(observe(s, id), id, this.rngs[seat]!)
  }

  private offerToBot(s: GameState) {
    return s.trades.find((t) => this.bots[t.to] !== null && !s.players[t.to]!.bankrupt)
  }

  private isBot(id: PlayerId): boolean {
    const seat = this.state?.players.findIndex((p) => p.id === id) ?? -1
    return seat >= 0 && this.bots[seat] !== null
  }

  private mayOfferTo(id: PlayerId): boolean {
    const s = this.state
    if (!s || s.trades.some((t) => s.players[t.to]!.id === id)) return false
    const last = this.lastOfferTo.get(id)
    return last === undefined || s.round - last >= OFFER_GAP_ROUNDS
  }
}
