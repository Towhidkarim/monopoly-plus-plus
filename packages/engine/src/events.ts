/**
 * Game events: what happened, for the view to animate and the log to describe.
 * Every visible state change produces an event (ARCHITECTURE.md section 2).
 */

import type { Deck } from './cards.ts'
import type { CashReason, PlayerId, SpeedFace } from './state.ts'

/** A player id, or `'bank'` (reserved: createGame rejects it as a player id). */
export type Counterparty = string

export type GameEvent =
  | { type: 'TURN_STARTED'; playerId: PlayerId; round: number }
  /** `speed` is the Speed die face, present only when that twist is on and it was rolled. */
  | { type: 'DICE_ROLLED'; playerId: PlayerId; dice: readonly [number, number]; speed?: SpeedFace }
  /** Speed die Scout: the player is about to walk to `to` (then a MOVED follows). */
  | { type: 'SCOUTED'; playerId: PlayerId; to: number }
  /** Step-by-step walk; `path` lists every space entered, ending on the landing space. */
  | { type: 'MOVED'; playerId: PlayerId; path: readonly number[]; passedGo: boolean }
  /** Direct relocation (go to jail): no walking. */
  | { type: 'JUMPED'; playerId: PlayerId; to: number }
  | { type: 'CARD_DRAWN'; playerId: PlayerId; deck: Deck; cardId: number }
  | {
      type: 'CASH_CHANGED'
      playerId: PlayerId
      delta: number
      reason: CashReason
      counterparty?: Counterparty
    }
  | { type: 'POT_CHANGED'; amount: number }
  | { type: 'PROPERTY_BOUGHT'; playerId: PlayerId; space: number; price: number }
  | { type: 'PROPERTY_TRANSFERRED'; space: number; from: Counterparty; to: Counterparty }
  | { type: 'BUILT'; playerId: PlayerId; space: number; level: number }
  | { type: 'SOLD_BUILDING'; playerId: PlayerId; space: number; level: number }
  | { type: 'MORTGAGED'; playerId: PlayerId; space: number }
  | { type: 'UNMORTGAGED'; playerId: PlayerId; space: number }
  | { type: 'MONOPOLY_COMPLETED'; playerId: PlayerId; group: number }
  | { type: 'AUCTION_STARTED'; space: number }
  | { type: 'BID_PLACED'; playerId: PlayerId; amount: number }
  | { type: 'BIDDER_PASSED'; playerId: PlayerId }
  /** `winner` is null when everyone passed and the space stays unowned. */
  | { type: 'AUCTION_ENDED'; space: number; winner: PlayerId | null; amount: number }
  | { type: 'TRADE_PROPOSED'; tradeId: number; from: PlayerId; to: PlayerId }
  | { type: 'TRADE_ACCEPTED'; tradeId: number }
  | { type: 'TRADE_REJECTED'; tradeId: number }
  | { type: 'TRADE_CANCELLED'; tradeId: number }
  /** Auto-voided because an involved asset changed or a party left. */
  | { type: 'TRADE_VOIDED'; tradeId: number }
  /** `from` is set when the card came from another player (trade, bankruptcy). */
  | { type: 'JAIL_CARD_GAINED'; playerId: PlayerId; deck: Deck; from?: PlayerId }
  | { type: 'JAILED'; playerId: PlayerId }
  | { type: 'RELEASED'; playerId: PlayerId; how: 'doubles' | 'fine' | 'card' }
  | { type: 'DEBT_INCURRED'; playerId: PlayerId; amount: number; creditor: Counterparty }
  | { type: 'DEBT_SETTLED'; playerId: PlayerId }
  | { type: 'BANKRUPT'; playerId: PlayerId; to: Counterparty }
  | { type: 'FINAL_ROUND'; round: number }
  | { type: 'GAME_OVER'; winner: PlayerId; reason: 'lastStanding' | 'roundLimit' }
