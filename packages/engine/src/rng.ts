/**
 * Seeded RNG (mulberry32). The whole generator state is one uint32 stored in GameState,
 * so a game is fully reproducible from its seed plus its action log.
 */

export function rngStep(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) >>> 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next }
}

/** Normalizes any number into a valid initial RNG state. */
export function seedState(seed: number): number {
  return (Math.floor(seed) ^ 0x9e3779b9) >>> 0
}

/** A stateful view over an RNG value, for code that needs many draws. */
export interface Rand {
  /** Uniform float in [0, 1). */
  next(): number
  /** Uniform integer in [0, n). */
  int(n: number): number
}

/** Fisher-Yates shuffle in place, using `rand`. */
export function shuffleInPlace<T>(items: T[], rand: Rand): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rand.int(i + 1)
    const tmp = items[i]!
    items[i] = items[j]!
    items[j] = tmp
  }
  return items
}

/** Creates a Rand backed by a getter/setter pair (e.g. a field on a draft state). */
export function randFrom(get: () => number, set: (s: number) => void): Rand {
  const next = () => {
    const r = rngStep(get())
    set(r.state)
    return r.value
  }
  return { next, int: (n) => Math.floor(next() * n) }
}
