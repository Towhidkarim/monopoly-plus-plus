import type { GameEvent } from '@skyline/engine'

/** What one opponent did between two of your turns. */
export interface PlayerRecap {
  id: string
  /** Where their last move ended (null if they did not move). */
  landed: number | null
  /** Cash change over the stretch (rent, buys, salary, everything). */
  cash: number
  bought: number[]
  /** Houses and hotels put up. */
  built: number
  /** Color groups completed. */
  sets: number[]
  /** Trades they were part of that went through. */
  trades: number
  jailed: boolean
  bankrupt: boolean
}

export interface Recap {
  /** Rent paid to you, in total, while you waited. */
  earned: number
  /** Rent you paid out of turn (rare: card effects). */
  paid: number
  /** One entry per opponent who did anything, in turn order of their first action. */
  players: PlayerRecap[]
}

/**
 * Collects events between a player's turns and summarizes them when that player's turn comes
 * back. Feed every event in order (`push`); it returns a recap when a turn starts for someone
 * `wants` one for (the local humans), or null. Only what happened since that player's own last
 * turn ended counts; an empty stretch gives null.
 */
export class RecapTracker {
  private readonly wants: (playerId: string) => boolean
  private events: GameEvent[] = []
  /** Per player: index into `events` where the stretch since their last turn begins. */
  private readonly since = new Map<string, number>()
  private current: string | null = null
  /** Trade parties, kept from the proposal until it is accepted. */
  private readonly parties = new Map<number, [string, string]>()

  constructor(wants: (playerId: string) => boolean) {
    this.wants = wants
  }

  push(e: GameEvent): Recap | null {
    if (e.type === 'TRADE_PROPOSED') this.parties.set(e.tradeId, [e.from, e.to])
    if (e.type !== 'TURN_STARTED') {
      this.events.push(e)
      return null
    }
    const next = e.playerId
    // The previous player's turn just ended: their stretch of waiting starts here.
    if (this.current !== null && this.current !== next) this.since.set(this.current, this.events.length)
    this.current = next
    let recap: Recap | null = null
    const from = this.since.get(next)
    if (from !== undefined && this.wants(next)) recap = summarize(this.events.slice(from), next, this.parties)
    this.since.delete(next)
    this.trim()
    return recap
  }

  /** Drops events no one is waiting on any more. */
  private trim(): void {
    const keep = Math.min(this.events.length, ...this.since.values())
    if (keep <= 0) return
    this.events = this.events.slice(keep)
    for (const [id, i] of this.since) this.since.set(id, i - keep)
  }
}

export function summarize(
  events: readonly GameEvent[],
  me: string,
  parties: ReadonlyMap<number, readonly [string, string]> = new Map(),
): Recap | null {
  const players = new Map<string, PlayerRecap>()
  const of = (id: string): PlayerRecap | null => {
    if (id === me) return null
    let r = players.get(id)
    if (!r) {
      r = {
        id,
        landed: null,
        cash: 0,
        bought: [],
        built: 0,
        sets: [],
        trades: 0,
        jailed: false,
        bankrupt: false,
      }
      players.set(id, r)
    }
    return r
  }
  let earned = 0
  let paid = 0
  for (const e of events) {
    switch (e.type) {
      case 'MOVED': {
        const r = of(e.playerId)
        if (r && e.path.length > 0) r.landed = e.path.at(-1)!
        break
      }
      case 'JUMPED': {
        const r = of(e.playerId)
        if (r) r.landed = e.to
        break
      }
      case 'CASH_CHANGED': {
        const r = of(e.playerId)
        if (r) r.cash += e.delta
        if (e.playerId === me && e.reason === 'rent') {
          if (e.delta > 0) earned += e.delta
          else paid -= e.delta
        }
        break
      }
      case 'PROPERTY_BOUGHT':
        of(e.playerId)?.bought.push(e.space)
        break
      case 'AUCTION_ENDED':
        if (e.winner) of(e.winner)?.bought.push(e.space)
        break
      case 'BUILT': {
        const r = of(e.playerId)
        if (r) r.built++
        break
      }
      case 'MONOPOLY_COMPLETED':
        of(e.playerId)?.sets.push(e.group)
        break
      case 'TRADE_ACCEPTED':
        for (const id of parties.get(e.tradeId) ?? []) {
          const r = of(id)
          if (r) r.trades++
        }
        break
      case 'JAILED': {
        const r = of(e.playerId)
        if (r) r.jailed = true
        break
      }
      case 'BANKRUPT': {
        const r = of(e.playerId)
        if (r) r.bankrupt = true
        break
      }
      default:
        break
    }
  }
  const list = [...players.values()]
  if (list.length === 0 && earned === 0 && paid === 0) return null
  return { earned, paid, players: list }
}
