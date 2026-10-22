import type { Action } from '../actions.ts'
import type { Ctx } from '../core.ts'
import type { GameState } from '../state.ts'

/** Mortgaging and unmortgaging. STUB: to be implemented. */

export function checkMortgage(_s: GameState, _seat: number, _space: number): string | null {
  return 'not implemented'
}

export function applyMortgage(_ctx: Ctx, _seat: number, _space: number): void {}

export function checkUnmortgage(_s: GameState, _seat: number, _space: number): string | null {
  return 'not implemented'
}

export function applyUnmortgage(_ctx: Ctx, _seat: number, _space: number): void {}

export function legalMortgage(_s: GameState, _seat: number): Action[] {
  return []
}
