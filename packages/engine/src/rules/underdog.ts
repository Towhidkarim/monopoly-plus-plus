import { netWorth } from '../core.ts'
import type { GameState } from '../state.ts'

/**
 * Underdog salary, the first half of the Comeback twist (DECISIONS.md D63): passing Start pays
 * extra the further a player trails the leader in net worth. Help that grows with the gap,
 * shown to everyone, and never taken from the leader.
 */

/** Share of the salary added per unit of the gap (1 - mine / leader's). */
const SLOPE = 0.75
/** The most the bonus can add, as a share of the salary. */
const MAX_SHARE = 0.5

/** Extra salary for `seat` passing Start now (0 when off or not behind), rounded to ₵10. */
export function underdogBonus(s: GameState, seat: number): number {
  if (!s.config.underdogSalary) return 0
  let leader = 0
  s.players.forEach((p, i) => {
    if (!p.bankrupt) leader = Math.max(leader, netWorth(s, i))
  })
  if (leader <= 0) return 0
  const gap = 1 - Math.max(0, netWorth(s, seat)) / leader
  const share = Math.min(MAX_SHARE, Math.max(0, gap) * SLOPE)
  return Math.round((s.config.goSalary * share) / 10) * 10
}
