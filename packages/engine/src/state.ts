import type { Deck } from './cards.ts'
import type { GameConfig } from './config.ts'

/**
 * Game state: plain, flat, JSON-safe data (DECISIONS.md D9). Players are referred to by seat
 * index internally; the public API and events use string player ids.
 */

export type PlayerId = string

export interface PlayerState {
  readonly id: PlayerId
  readonly name: string
  cash: number
  position: number
  inJail: boolean
  /** Failed attempts to roll doubles while in jail. */
  jailTurns: number
  /** Held get-out-of-jail cards, by the deck they came from. */
  jailCards: Deck[]
  bankrupt: boolean
  /** Second Wind: what is still owed on the open bank loan, interest included (D63). */
  loan?: number
  /** Second Wind: loans taken so far (sets the next loan's interest). */
  loans?: number
}

/** What a trade side hands over. */
export interface Bundle {
  spaces: number[]
  cash: number
  jailCards: number
}

export interface TradeOffer {
  id: number
  /** Proposer seat. */
  from: number
  /** Recipient seat. */
  to: number
  /** What the proposer gives. */
  give: Bundle
  /** What the proposer gets. */
  get: Bundle
}

export type CashReason =
  | 'salary'
  /** Underdog salary: the extra paid with the salary to a player behind (D63). */
  | 'underdog'
  | 'rent'
  | 'tax'
  | 'card'
  | 'purchase'
  | 'auction'
  | 'build'
  | 'sellBuilding'
  | 'mortgage'
  | 'unmortgage'
  | 'jailFine'
  | 'trade'
  | 'bankruptcy'
  | 'pot'
  /** Second Wind: a bank loan paid out, and repayments of it (D63). */
  | 'loan'
  | 'loanRepay'

export interface Debt {
  debtor: number
  /** Creditor seat, or -1 for the bank. */
  creditor: number
  amount: number
  reason: CashReason
}

export type Pending =
  /** The active player landed on an unowned space and must buy or decline. */
  | { kind: 'buy'; space: number }
  /**
   * Speed die: the active player picks a destination. Bus: one white die or both (the sum first);
   * triples: any other space (the normal move first). `options[0]` is the timeout default.
   */
  | { kind: 'move'; reason: 'bus' | 'triples'; options: number[]; diceTotal: number }
  | {
      kind: 'auction'
      space: number
      /** Seats still bidding, in bidding order. */
      bidders: number[]
      /** Index into `bidders` of who acts next. */
      current: number
      highBid: number
      /** Seat of the high bidder, -1 if no bid yet. */
      highBidder: number
    }

/** A Speed die face: a number added to the move, the Bus, or the Scout. */
export type SpeedFace = 1 | 2 | 3 | 'bus' | 'scout'

export type Phase = 'preRoll' | 'postRoll' | 'gameOver'

export interface GameState {
  readonly config: GameConfig
  /** Seeded RNG state (see rng.ts). */
  rng: number
  players: PlayerState[]
  /** Seat of the active player. */
  current: number
  phase: Phase
  /** Consecutive doubles rolled this turn. */
  doubles: number
  /** 1-based round number; increments when play wraps past the last seat. */
  round: number
  /** Number of END_TURNs so far (for caps and stats). */
  turnCount: number
  /** Owner seat per space, -1 if unowned (or not ownable). */
  owner: number[]
  /** Buildings per space: 0..4 houses, 5 = hotel. */
  houses: number[]
  mortgaged: boolean[]
  bankHouses: number
  bankHotels: number
  /** Remaining draw order (card indices); index 0 is the top. */
  decks: { chance: number[]; chest: number[] }
  pending: Pending | null
  /** Unpaid debts, settled front to back. Non-empty blocks the turn until resolved. */
  debts: Debt[]
  trades: TradeOffer[]
  nextTradeId: number
  lastDice: [number, number] | null
  /** The Speed die face of the last roll (only with config.speedDie). */
  lastSpeed?: SpeedFace | null
  /** A Scout roll still owes its jump, made once the first landing is fully resolved. */
  scoutDue?: boolean
  /** Free-parking pot (only used when config.freeParkingPot). */
  pot: number
  /** Winner seat once the game is over, else -1. */
  winner: number
}

/** Deep copy. State is flat, so a hand-written copy is fast and allocation-light. */
export function cloneState(s: GameState): GameState {
  return {
    ...s,
    players: s.players.map((p) => ({ ...p, jailCards: [...p.jailCards] })),
    owner: [...s.owner],
    houses: [...s.houses],
    mortgaged: [...s.mortgaged],
    decks: { chance: [...s.decks.chance], chest: [...s.decks.chest] },
    pending: s.pending ? clonePending(s.pending) : null,
    debts: s.debts.map((d) => ({ ...d })),
    trades: s.trades.map((t) => ({ ...t, give: cloneBundle(t.give), get: cloneBundle(t.get) })),
    lastDice: s.lastDice ? [s.lastDice[0], s.lastDice[1]] : null,
  }
}

function clonePending(p: Pending): Pending {
  if (p.kind === 'auction') return { ...p, bidders: [...p.bidders] }
  if (p.kind === 'move') return { ...p, options: [...p.options] }
  return { ...p }
}

function cloneBundle(b: Bundle): Bundle {
  return { spaces: [...b.spaces], cash: b.cash, jailCards: b.jailCards }
}

export function seatOf(s: GameState, id: PlayerId): number {
  return s.players.findIndex((p) => p.id === id)
}

export function activePlayers(s: GameState): number[] {
  return s.players.flatMap((p, i) => (p.bankrupt ? [] : [i]))
}
