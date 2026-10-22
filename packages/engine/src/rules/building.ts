import type { Action } from '../actions.ts'
import type { Ctx } from '../core.ts'
import type { GameState } from '../state.ts'

/** Building and selling houses/hotels. STUB: to be implemented. */

export function checkBuild(_s: GameState, _seat: number, _space: number): string | null {
  return 'not implemented'
}

export function applyBuild(_ctx: Ctx, _seat: number, _space: number): void {}

export function checkSellBuilding(_s: GameState, _seat: number, _space: number): string | null {
  return 'not implemented'
}

export function applySellBuilding(_ctx: Ctx, _seat: number, _space: number): void {}

export function legalBuilding(_s: GameState, _seat: number): Action[] {
  return []
}
