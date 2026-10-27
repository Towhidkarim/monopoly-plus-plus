import { netWorth, reduce, type Action, type GameState } from '@skyline/engine'

export interface SeatStats {
  rentCollected: number
  rentPaid: number
  bought: number
  /** Houses and hotels put up over the game. */
  built: number
  trades: number
  /** The space that earned this seat the most rent, and how much. */
  bestSpace: { space: number; rent: number } | null
}

export interface GameResults {
  /** Net worth per seat at the start of each round, ending with the final state. */
  worth: number[][]
  /** Round number for each `worth` row. */
  rounds: number[]
  stats: SeatStats[]
  /** The round from which the winner led to the end, or null when they led from round 1. */
  turningPoint: number | null
}

/**
 * Replays a finished game (its first state and the actions taken) through the engine and
 * collects the story the results screen tells: net worth by round and per-seat stats. The
 * engine is deterministic, so this matches what was played exactly.
 */
export function gameResults(
  start: GameState,
  actions: readonly { playerId: string; action: Action }[],
): GameResults {
  const n = start.players.length
  const seatOf = new Map(start.players.map((p, i) => [p.id, i]))
  const stats: SeatStats[] = start.players.map(() => ({
    rentCollected: 0,
    rentPaid: 0,
    bought: 0,
    built: 0,
    trades: 0,
    bestSpace: null,
  }))
  const earnedBy: Map<number, number>[] = start.players.map(() => new Map())
  const parties = new Map<number, [number, number]>()
  const sample = (s: GameState) => s.players.map((p, i) => (p.bankrupt ? 0 : netWorth(s, i)))

  const worth: number[][] = [sample(start)]
  const rounds: number[] = [start.round]
  let s = start
  for (const step of actions) {
    const r = reduce(s, step.playerId, step.action)
    if (!r.ok) break
    for (const e of r.events) {
      switch (e.type) {
        case 'CASH_CHANGED': {
          if (e.reason !== 'rent') break
          const seat = seatOf.get(e.playerId)
          if (seat === undefined) break
          if (e.delta > 0) {
            stats[seat]!.rentCollected += e.delta
            // The rent came from where the payer stands now.
            const payer = e.counterparty === undefined ? undefined : seatOf.get(e.counterparty)
            if (payer !== undefined) {
              const at = r.state.players[payer]!.position
              const m = earnedBy[seat]!
              m.set(at, (m.get(at) ?? 0) + e.delta)
            }
          } else stats[seat]!.rentPaid -= e.delta
          break
        }
        case 'PROPERTY_BOUGHT':
          stats[seatOf.get(e.playerId)!]!.bought++
          break
        case 'AUCTION_ENDED':
          if (e.winner) stats[seatOf.get(e.winner)!]!.bought++
          break
        case 'BUILT':
          stats[seatOf.get(e.playerId)!]!.built++
          break
        case 'TRADE_PROPOSED':
          parties.set(e.tradeId, [seatOf.get(e.from)!, seatOf.get(e.to)!])
          break
        case 'TRADE_ACCEPTED':
          for (const seat of parties.get(e.tradeId) ?? []) stats[seat]!.trades++
          break
        case 'TURN_STARTED':
          if (e.round !== rounds.at(-1)) {
            worth.push(sample(r.state))
            rounds.push(e.round)
          }
          break
        default:
          break
      }
    }
    s = r.state
  }
  worth.push(sample(s))
  rounds.push(s.round)

  for (let seat = 0; seat < n; seat++) {
    let best: SeatStats['bestSpace'] = null
    for (const [space, rent] of earnedBy[seat]!) if (!best || rent > best.rent) best = { space, rent }
    stats[seat]!.bestSpace = best
  }

  // The turning point: the first round of the winner's final, unbroken lead.
  let turningPoint: number | null = null
  if (s.phase === 'gameOver') {
    const w = s.winner
    for (let i = worth.length - 1; i >= 0; i--) {
      const row = worth[i]!
      const leads = row.every((v, seat) => seat === w || v < row[w]!)
      if (!leads) break
      turningPoint = i === 0 ? null : rounds[i]!
    }
  }
  return { worth, rounds, stats, turningPoint }
}
