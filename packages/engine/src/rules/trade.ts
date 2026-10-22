import type { Action } from '../actions.ts'
import type { Ctx } from '../core.ts'
import type { Bundle, GameState } from '../state.ts'

/** Trades. STUB: to be implemented. */

export interface ProposeArgs {
  to: number
  give: Bundle
  get: Bundle
}

export function checkPropose(_s: GameState, _seat: number, _args: ProposeArgs): string | null {
  return 'not implemented'
}

export function applyPropose(_ctx: Ctx, _seat: number, _args: ProposeArgs): void {}

export function checkCancelTrade(_s: GameState, _seat: number, _tradeId: number): string | null {
  return 'not implemented'
}

export function applyCancelTrade(_ctx: Ctx, _seat: number, _tradeId: number): void {}

export function checkAcceptTrade(_s: GameState, _seat: number, _tradeId: number): string | null {
  return 'not implemented'
}

export function applyAcceptTrade(_ctx: Ctx, _seat: number, _tradeId: number): void {}

export function checkRejectTrade(_s: GameState, _seat: number, _tradeId: number): string | null {
  return 'not implemented'
}

export function applyRejectTrade(_ctx: Ctx, _seat: number, _tradeId: number): void {}

/** Voids open trades that are no longer valid (assets changed, cash short, party gone). */
export function pruneTrades(_ctx: Ctx): void {}

/** Accept / reject / cancel options. Proposals are open-ended and not enumerated. */
export function legalTrade(_s: GameState, _seat: number): Action[] {
  return []
}
