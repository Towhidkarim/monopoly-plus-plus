import type { Action } from '../actions.ts'
import { isOwnable, mortgageValue, SPACES } from '../board.ts'
import { addCash, groupHasBuildings, idOf, type Ctx } from '../core.ts'
import { BOARD_SIZE } from '../ring.ts'
import type { GameState } from '../state.ts'

/** Mortgaging and unmortgaging. */

type Check = string | null

/** Bank payment to lift a mortgage: the mortgage value plus interest, rounded up. */
export function unmortgageCost(s: GameState, space: number): number {
  const v = mortgageValue(space)
  return v + Math.ceil(v * s.config.mortgageInterest)
}

export function checkMortgage(s: GameState, seat: number, space: number): Check {
  if (!(space >= 0 && space < BOARD_SIZE) || !isOwnable(space)) return 'cannot mortgage that space'
  if (s.owner[space] !== seat) return 'you do not own that property'
  if (s.mortgaged[space]) return 'already mortgaged'
  const info = SPACES[space]!
  if (info.kind === 'property' && groupHasBuildings(s, info.group)) {
    return 'sell all buildings in the group first'
  }
  return null
}

export function applyMortgage(ctx: Ctx, seat: number, space: number): void {
  const s = ctx.s
  s.mortgaged[space] = true
  addCash(ctx, seat, mortgageValue(space), 'mortgage', -1)
  ctx.events.push({ type: 'MORTGAGED', playerId: idOf(s, seat), space })
}

export function checkUnmortgage(s: GameState, seat: number, space: number): Check {
  if (!(space >= 0 && space < BOARD_SIZE) || !isOwnable(space)) return 'cannot unmortgage that space'
  if (s.owner[space] !== seat) return 'you do not own that property'
  if (!s.mortgaged[space]) return 'not mortgaged'
  if (s.players[seat]!.cash < unmortgageCost(s, space)) return 'not enough cash'
  return null
}

export function applyUnmortgage(ctx: Ctx, seat: number, space: number): void {
  const s = ctx.s
  addCash(ctx, seat, -unmortgageCost(s, space), 'unmortgage', -1)
  s.mortgaged[space] = false
  ctx.events.push({ type: 'UNMORTGAGED', playerId: idOf(s, seat), space })
}

export function legalMortgage(s: GameState, seat: number): Action[] {
  const out: Action[] = []
  for (let space = 0; space < BOARD_SIZE; space++) {
    if (!checkMortgage(s, seat, space)) out.push({ type: 'MORTGAGE', space })
    if (!checkUnmortgage(s, seat, space)) out.push({ type: 'UNMORTGAGE', space })
  }
  return out
}
