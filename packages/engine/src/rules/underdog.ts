import { netWorth } from '../core.ts'
import type { GameState } from '../state.ts'

/**
 * Underdog salary, the first half of the Comeback twist (DECISIONS.md D63): passing Start pays
 * extra the further a player trails the leader in net worth. Help that grows with the gap,
 * shown to everyone, and never taken from the leader.
 */

/** The most the bonus adds, as a share of the salary, when config.underdogMax is absent. */
export const UNDERDOG_MAX = 2
/** The full bonus is reached at this gap (two thirds behind the leader); it grows linearly to it. */
const FULL_GAP = 2 / 3

/** Extra salary for `seat` passing Start now (0 when off or not behind), rounded to ₵10. */
export function underdogBonus(s: GameState, seat: number): number {
  if (!s.config.underdogSalary) return 0
  let leader = 0
  s.players.forEach((p, i) => {
    if (!p.bankrupt) leader = Math.max(leader, netWorth(s, i))
  })
  if (leader <= 0) return 0
  const gap = 1 - Math.max(0, netWorth(s, seat)) / leader
  const max = s.config.underdogMax ?? UNDERDOG_MAX
  const share = Math.min(max, (Math.max(0, gap) * max) / FULL_GAP)
  return Math.round((s.config.goSalary * share) / 10) * 10
}
