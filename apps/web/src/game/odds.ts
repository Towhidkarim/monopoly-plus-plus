import { BOARD_SIZE, rentFor, type GameState } from '@skyline/engine'

/** One space a roll could end on. */
export interface LandingOdds {
  space: number
  /** Chance this roll ends here (0..1, before cards and doubles). */
  p: number
  /** Rent owed to another player on arrival with this total, or 0. */
  rent: number
  /** That owner's seat, or null when nothing is owed. */
  owner: number | null
}

/** Chance of each two-dice total (index 2..12). */
const TOTAL = (t: number) => (6 - Math.abs(t - 7)) / 36

/**
 * Where `seat` can land with its next roll: one entry per space reached by a total of 2 to 12,
 * with the rent it would owe there. Empty in jail (the roll there is about doubles, not moving).
 */
export function landingOdds(s: GameState, seat: number): LandingOdds[] {
  const me = s.players[seat]
  if (!me || me.inJail || me.bankrupt) return []
  const out: LandingOdds[] = []
  for (let t = 2; t <= 12; t++) {
    const space = (me.position + t) % BOARD_SIZE
    const owner = s.owner[space]!
    const owed = owner >= 0 && owner !== seat ? rentFor(s, space, t) : 0
    out.push({ space, p: TOTAL(t), rent: owed, owner: owed > 0 ? owner : null })
  }
  return out
}
