import type { Action } from '../actions.ts'
import { GROUPS, HOTEL, SPACES } from '../board.ts'
import { addCash, idOf, ownsGroup, type Ctx } from '../core.ts'
import { BOARD_SIZE } from '../ring.ts'
import type { GameState } from '../state.ts'

/** Building and selling houses/hotels (level 0-4 houses, 5 = hotel). */

type Check = string | null

const levels = (s: GameState, space: number): number[] =>
  GROUPS[SPACES[space]!.group]!.map((i) => s.houses[i]!)

export function checkBuild(s: GameState, seat: number, space: number): Check {
  const info = SPACES[space]
  if (!info || info.kind !== 'property') return 'not a buildable property'
  if (s.owner[space] !== seat) return 'you do not own that property'
  if (!ownsGroup(s, seat, info.group)) return 'you need the whole color group'
  if (GROUPS[info.group]!.some((i) => s.mortgaged[i])) return 'a property in the group is mortgaged'
  const level = s.houses[space]!
  if (level >= HOTEL) return 'already has a hotel'
  if (s.config.evenBuild && level > Math.min(...levels(s, space))) return 'build evenly across the group'
  if (level === HOTEL - 1) {
    if (s.bankHotels <= 0) return 'no hotels left in the bank'
  } else if (s.bankHouses <= 0) return 'no houses left in the bank'
  if (s.players[seat]!.cash < info.houseCost) return 'not enough cash'
  return null
}

export function applyBuild(ctx: Ctx, seat: number, space: number): void {
  const s = ctx.s
  addCash(ctx, seat, -SPACES[space]!.houseCost, 'build', -1)
  if (s.houses[space] === HOTEL - 1) {
    s.bankHotels--
    s.bankHouses += 4
  } else s.bankHouses--
  s.houses[space]!++
  ctx.events.push({ type: 'BUILT', playerId: idOf(s, seat), space, level: s.houses[space]! })
}

export function checkSellBuilding(s: GameState, seat: number, space: number): Check {
  const info = SPACES[space]
  if (!info || info.kind !== 'property') return 'not a buildable property'
  if (s.owner[space] !== seat) return 'you do not own that property'
  const level = s.houses[space]!
  if (level <= 0) return 'no buildings to sell'
  if (s.config.evenBuild && level < Math.max(...levels(s, space))) return 'sell evenly across the group'
  if (level === HOTEL && s.bankHouses < 4) return 'not enough houses in the bank to break up the hotel'
  return null
}

export function applySellBuilding(ctx: Ctx, seat: number, space: number): void {
  const s = ctx.s
  if (s.houses[space] === HOTEL) {
    s.bankHotels++
    s.bankHouses -= 4
  } else s.bankHouses++
  s.houses[space]!--
  addCash(ctx, seat, SPACES[space]!.houseCost / 2, 'sellBuilding', -1)
  ctx.events.push({ type: 'SOLD_BUILDING', playerId: idOf(s, seat), space, level: s.houses[space]! })
}

export function legalBuilding(s: GameState, seat: number): Action[] {
  const out: Action[] = []
  for (let space = 0; space < BOARD_SIZE; space++) {
    if (!checkBuild(s, seat, space)) out.push({ type: 'BUILD', space })
    if (!checkSellBuilding(s, seat, space)) out.push({ type: 'SELL_BUILDING', space })
  }
  return out
}
