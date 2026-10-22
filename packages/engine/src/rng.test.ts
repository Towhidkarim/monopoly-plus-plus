import { describe, expect, it } from 'vitest'
import { randFrom, rngStep, seedState, shuffleInPlace } from './rng.ts'

function seq(seed: number, n: number): number[] {
  let s = seedState(seed)
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const r = rngStep(s)
    s = r.state
    out.push(r.value)
  }
  return out
}

describe('rng', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    expect(seq(42, 20)).toEqual(seq(42, 20))
    expect(seq(42, 20)).not.toEqual(seq(43, 20))
  })

  it('stays in [0, 1) and looks uniform', () => {
    const values = seq(7, 60_000)
    const buckets = Array.from({ length: 6 }, () => 0)
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
      buckets[Math.floor(v * 6)]!++
    }
    for (const b of buckets) expect(Math.abs(b - 10_000)).toBeLessThan(400)
  })

  it('shuffles deterministically and keeps every element', () => {
    const make = () => {
      let s = seedState(99)
      return randFrom(
        () => s,
        (n) => (s = n),
      )
    }
    const a = shuffleInPlace([...Array(16).keys()], make())
    const b = shuffleInPlace([...Array(16).keys()], make())
    expect(a).toEqual(b)
    expect(a.toSorted((x, y) => x - y)).toEqual([...Array(16).keys()])
    expect(a).not.toEqual([...Array(16).keys()])
  })
})
