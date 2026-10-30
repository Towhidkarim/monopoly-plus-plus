/** Sky preference: follow the round count, or hold day or night. */
export type SkyPref = 'auto' | 'day' | 'night'

/**
 * Auto sky by round, repeating (D28, shortened in D67): two days, dusk, two nights, dawn, so the
 * first night falls in round 4. Entry i is round i + 1. Levels are 0 (day) to 1 (night); dusk and
 * dawn sit either side of the music's day/night switch at 0.5. Retune the cycle here.
 */
export const SKY_CYCLE: readonly number[] = [0, 0, 0.6, 1, 1, 0.3]

/** Night level for the board: 0 (day) to 1 (night). `round` is 1-based. */
export function skyLevel(round: number, pref: SkyPref): number {
  if (pref === 'day') return 0
  if (pref === 'night') return 1
  const i = (Math.max(1, Math.floor(round)) - 1) % SKY_CYCLE.length
  return SKY_CYCLE[i]!
}
