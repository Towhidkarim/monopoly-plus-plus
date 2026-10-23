/**
 * Skyline rules engine. Pure, deterministic, serializable.
 * See docs/ARCHITECTURE.md section 2 for the contract.
 */

export * from './board.ts'
export * from './cards.ts'
export * from './config.ts'
export * from './ring.ts'
export type * from './actions.ts'
export type * from './events.ts'
export type * from './state.ts'
export { activePlayers, seatOf } from './state.ts'
export { createGame, type PlayerSetup } from './setup.ts'
export { reduce, expectedActor, type ReduceResult } from './reduce.ts'
export { legalActions } from './legal.ts'
export { observe, type PlayerView } from './observe.ts'
export { netWorth, ownsGroup, rentFor } from './core.ts'
export { unmortgageCost } from './rules/mortgage.ts'
export { rngStep, seedState } from './rng.ts'
export { checkInvariants, checkCashEvents } from './invariants.ts'
export { playout, type PlayoutOptions, type PlayoutResult } from './playout.ts'
