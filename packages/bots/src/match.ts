import {
  checkInvariants,
  createGame,
  expectedActor,
  netWorth,
  observe,
  reduce,
  type Action,
  type GameConfig,
  type GameEvent,
  type GameState,
} from '@skyline/engine'
import { botRng, type Bot, type BotRng } from './bot.ts'

/**
 * Plays one headless game between bots: the harness behind `pnpm sim` and the bot tests.
 * Like a real table, offers are answered out of turn: before the expected actor moves, every
 * bot with an open offer addressed to it gets to respond.
 */

export interface MatchOptions {
  config: GameConfig
  seed: number
  /** One bot per seat. */
  bots: readonly Bot[]
  /** Safety cap on actions. */
  maxActions?: number
}

export interface MatchResult {
  state: GameState
  finished: boolean
  /** Winning seat, or -1 if the cap was hit. */
  winner: number
  actions: number
  /** Actions a bot chose that the engine rejected (should stay 0). */
  rejected: number
  trades: number
  /** Trade offers made. */
  proposed: number
  sets: number
  bankruptcies: number
  /** Seat with the highest net worth when round 10 began, or -1 if the game ended earlier. */
  leaderAt10: number
  violations: string[]
}

export function playMatch(opts: MatchOptions): MatchResult {
  const ids = opts.bots.map((_, i) => `p${i + 1}`)
  let s = createGame(
    ids.map((id) => ({ id, name: id })),
    opts.seed,
    opts.config,
  )
  const rngs: BotRng[] = opts.bots.map((_, i) => botRng(opts.seed * 97 + i * 7919))
  const out: MatchResult = {
    state: s,
    finished: false,
    winner: -1,
    actions: 0,
    rejected: 0,
    trades: 0,
    proposed: 0,
    sets: 0,
    bankruptcies: 0,
    leaderAt10: -1,
    violations: [],
  }
  const tally = (events: GameEvent[]) => {
    for (const e of events) {
      if (e.type === 'TRADE_ACCEPTED') out.trades++
      else if (e.type === 'TRADE_PROPOSED') out.proposed++
      else if (e.type === 'MONOPOLY_COMPLETED') out.sets++
      else if (e.type === 'BANKRUPT') out.bankruptcies++
    }
  }
  const apply = (seat: number, action: Action): boolean => {
    const r = reduce(s, ids[seat]!, action)
    if (!r.ok) return false
    s = r.state
    out.actions++
    tally(r.events)
    if (out.leaderAt10 < 0 && s.round >= 10 && s.phase !== 'gameOver') out.leaderAt10 = richestSeat(s)
    return true
  }
  const ask = (seat: number) => opts.bots[seat]!.decide(observe(s, ids[seat]!), ids[seat]!, rngs[seat]!)

  const cap = opts.maxActions ?? 40_000
  while (s.phase !== 'gameOver' && out.actions < cap) {
    const offer = s.trades.find((t) => !s.players[t.to]!.bankrupt)
    if (offer) {
      const reply = ask(offer.to)
      if (reply && apply(offer.to, reply)) continue
      // A bot that ignores offers (the random bot) gets them rejected for it, so play goes on.
      if (!apply(offer.to, { type: 'REJECT_TRADE', tradeId: offer.id })) out.rejected++
      continue
    }
    const seat = expectedActor(s)
    const action = ask(seat) ?? { type: 'TIMEOUT' }
    if (!apply(seat, action)) {
      out.rejected++
      if (!apply(seat, { type: 'TIMEOUT' })) break
    }
  }
  out.state = s
  out.finished = s.phase === 'gameOver'
  out.winner = out.finished ? s.winner : -1
  out.violations = checkInvariants(s)
  return out
}

function richestSeat(s: GameState): number {
  let best = -1
  s.players.forEach((p, i) => {
    if (!p.bankrupt && (best < 0 || netWorth(s, i) > netWorth(s, best))) best = i
  })
  return best
}
