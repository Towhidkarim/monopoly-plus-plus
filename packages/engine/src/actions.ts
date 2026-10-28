import type { Bundle, PlayerId } from './state.ts'

/** Everything a player can ask the engine to do. Validated by `reduce`. */
export type Action =
  | { type: 'ROLL' }
  | { type: 'BUY' }
  /** Starts an auction when config.auctionOnDecline. */
  | { type: 'DECLINE_BUY' }
  | { type: 'BID'; amount: number }
  | { type: 'PASS_BID' }
  | { type: 'BUILD'; space: number }
  | { type: 'SELL_BUILDING'; space: number }
  | { type: 'MORTGAGE'; space: number }
  | { type: 'UNMORTGAGE'; space: number }
  /** Any player, any time except during an auction (DECISIONS.md D8). */
  | { type: 'PROPOSE_TRADE'; to: PlayerId; give: Bundle; get: Bundle }
  | { type: 'CANCEL_TRADE'; tradeId: number }
  | { type: 'ACCEPT_TRADE'; tradeId: number }
  | { type: 'REJECT_TRADE'; tradeId: number }
  /** Speed die: pick one of the offered destinations (`pending.kind === 'move'`). */
  | { type: 'CHOOSE_MOVE'; space: number }
  | { type: 'PAY_JAIL_FINE' }
  | { type: 'USE_JAIL_CARD' }
  | { type: 'END_TURN' }
  | { type: 'DECLARE_BANKRUPTCY' }
  /** Time is an input: sent by a timer for the player expected to act; maps to a default choice. */
  | { type: 'TIMEOUT' }

export type ActionType = Action['type']
