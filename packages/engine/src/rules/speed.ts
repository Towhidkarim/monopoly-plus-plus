import { isOwnable } from '../board.ts'
import { advanceTo, idOf, land, moveBy, rollDie, sendToJail, type Ctx } from '../core.ts'
import { BOARD_SIZE, wrapSpace } from '../ring.ts'
import type { GameState, SpeedFace } from '../state.ts'

/**
 * The Speed die twist (DECISIONS.md D62). Faces 1, 2, 3 add to the move; the Bus lets the
 * player move by one white die or both; the Scout moves normally, then jumps to the nearest
 * unowned property (or, with none left, the nearest rival property that charges rent).
 * Triples (all three dice the same number) let the player move to any space.
 * Doubles count the white dice only.
 */

const FACES: readonly SpeedFace[] = [1, 2, 3, 'bus', 'scout', 'scout']

type Check = string | null

export function rollSpeed(ctx: Ctx, seat: number, d1: number, d2: number): void {
  const s = ctx.s
  const p = s.players[seat]!
  const face = FACES[rollDie(ctx) - 1]!
  const total = d1 + d2
  s.lastSpeed = face
  ctx.events.push({ type: 'DICE_ROLLED', playerId: idOf(s, seat), dice: [d1, d2], speed: face })

  if (face === d1 && face === d2) {
    // Triples: go anywhere, and the rolling ends (they are not counted as doubles).
    s.doubles = 0
    s.phase = 'postRoll'
    const normal = wrapSpace(p.position + total + face)
    const rest = Array.from({ length: BOARD_SIZE }, (_, i) => i).filter(
      (i) => i !== normal && i !== p.position,
    )
    s.pending = { kind: 'move', reason: 'triples', options: [normal, ...rest], diceTotal: total }
    return
  }

  if (d1 === d2) {
    s.doubles++
    if (s.doubles >= 3) {
      sendToJail(ctx, seat) // third double: straight to jail, the Speed die is ignored
      return
    }
  }
  s.phase = d1 === d2 ? 'preRoll' : 'postRoll'

  if (face === 'bus') {
    const options = [...new Set([total, d1, d2].map((n) => wrapSpace(p.position + n)))]
    s.pending = { kind: 'move', reason: 'bus', options, diceTotal: total }
    return
  }
  if (face === 'scout') {
    s.scoutDue = true
    moveBy(ctx, seat, total)
    land(ctx, seat, total) // a jail landing cancels the Scout (sendToJail clears scoutDue)
    return
  }
  moveBy(ctx, seat, total + face)
  land(ctx, seat, total)
}

export function checkChooseMove(s: GameState, seat: number, space: number): Check {
  if (seat !== s.current) return 'not your turn'
  if (s.pending?.kind !== 'move') return 'no move to choose'
  if (!s.pending.options.includes(space)) return 'not one of the offered spaces'
  return null
}

export function applyChooseMove(ctx: Ctx, seat: number, space: number): void {
  const s = ctx.s
  if (s.pending?.kind !== 'move') return
  const { diceTotal } = s.pending
  s.pending = null
  moveBy(ctx, seat, wrapSpace(space - s.players[seat]!.position))
  land(ctx, seat, diceTotal)
}

/** Where a Scout jump goes from `seat`'s position, or -1 to stay. */
export function scoutTarget(s: GameState, seat: number): number {
  const from = s.players[seat]!.position
  const ahead = Array.from({ length: BOARD_SIZE - 1 }, (_, i) => wrapSpace(from + 1 + i))
  const unowned = ahead.find((i) => isOwnable(i) && s.owner[i] === -1)
  if (unowned !== undefined) return unowned
  return ahead.find((i) => s.owner[i]! >= 0 && s.owner[i] !== seat && !s.mortgaged[i]) ?? -1
}

/**
 * Makes a pending Scout jump once nothing about the first landing is left open (a buy
 * decision, an auction, or a debt). Called by `reduce` after every action.
 */
export function resolveScout(ctx: Ctx): void {
  const s = ctx.s
  if (!s.scoutDue || s.pending || s.debts.length > 0 || s.phase === 'gameOver') return
  s.scoutDue = false
  const seat = s.current
  const p = s.players[seat]!
  if (p.bankrupt || p.inJail) return
  const target = scoutTarget(s, seat)
  if (target < 0) return
  ctx.events.push({ type: 'SCOUTED', playerId: idOf(s, seat), to: target })
  advanceTo(ctx, seat, target)
  const dice = s.lastDice ?? [0, 0]
  land(ctx, seat, dice[0] + dice[1])
}
