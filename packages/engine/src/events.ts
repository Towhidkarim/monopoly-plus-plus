/**
 * Game events: what happened, for the view to animate. Grows with the rules engine.
 * See docs/ARCHITECTURE.md section 2 for the full planned list.
 */

export type PlayerId = string

export type GameEvent =
  | { type: 'DICE_ROLLED'; playerId: PlayerId; dice: readonly [number, number] }
  /** Step-by-step walk; `path` lists every space entered, ending on the landing space. */
  | { type: 'MOVED'; playerId: PlayerId; path: readonly number[]; passedGo: boolean }
  /** Direct relocation (cards, go-to-jail): no walking. */
  | { type: 'JUMPED'; playerId: PlayerId; to: number }
