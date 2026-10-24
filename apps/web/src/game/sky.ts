/** Sky preference: follow the round count, or hold day or night. */
export type SkyPref = 'auto' | 'day' | 'night'

/**
 * Auto sky by round, repeating (D28): four days, dusk, two nights, dawn. Entry i is round i + 1.
 * Levels are 0 (day) to 1 (night); retune the cycle here.
 */
export const SKY_CYCLE: readonly number[] = [0, 0, 0, 0, 0.6, 1, 1, 0.3]

/** Night level for the board: 0 (day) to 1 (night). `round` is 1-based. */
export function skyLevel(round: number, pref: SkyPref): number {
  if (pref === 'day') return 0
  if (pref === 'night') return 1
  const i = (Math.max(1, Math.floor(round)) - 1) % SKY_CYCLE.length
  return SKY_CYCLE[i]!
}
