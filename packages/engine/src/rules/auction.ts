import type { Action } from '../actions.ts'
import type { Ctx } from '../core.ts'
import type { GameState } from '../state.ts'

/** Auctions. STUB: to be implemented. */

export function startAuction(_ctx: Ctx, _space: number, _decliner: number): void {}

export function checkBid(_s: GameState, _seat: number, _amount: number): string | null {
  return 'not implemented'
}

export function applyBid(_ctx: Ctx, _seat: number, _amount: number): void {}

export function checkPassBid(_s: GameState, _seat: number): string | null {
  return 'not implemented'
}

export function applyPassBid(_ctx: Ctx, _seat: number): void {}

export function legalAuction(_s: GameState, _seat: number): Action[] {
  return []
}
