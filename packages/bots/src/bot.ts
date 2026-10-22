import type { Action, PlayerView } from '@skyline/engine'

/** A bot's own randomness source (never the game's RNG). Returns a float in [0, 1). */
export type BotRng = () => number

/**
 * Bots decide from the masked player view (no deck order, no RNG state).
 * Return a legal action, or null when there is nothing this bot wants to do right now.
 * See ARCHITECTURE.md section 9 and DECISIONS.md D7.
 */
export interface Bot {
  readonly name: string
  decide(view: PlayerView, playerId: string, rng: BotRng): Action | null
}

/** Small seeded RNG for bots (mulberry32), so bot games are reproducible too. */
export function botRng(seed: number): BotRng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
