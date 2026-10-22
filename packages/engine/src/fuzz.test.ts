import { describe, expect, it } from 'vitest'
import { PRESETS } from './config.ts'
import { checkInvariants } from './invariants.ts'
import { playout } from './playout.ts'
import { reduce } from './reduce.ts'
import { createGame } from './setup.ts'

describe('fuzz: random legal playouts', () => {
  it('keeps every invariant across many games and presets', () => {
    const presets = [PRESETS.standard, PRESETS.turbo, PRESETS.classic]
    for (let seed = 1; seed <= 120; seed++) {
      const r = playout({
        players: 2 + (seed % 5),
        config: presets[seed % presets.length]!,
        seed,
        maxActions: 4000,
        checkEveryStep: true,
      })
      expect(r.violations, `seed ${seed}`).toEqual([])
    }
  }, 120_000)

  it('finishes games that have a round limit', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = playout({
        players: 4,
        config: PRESETS.turbo,
        seed,
        maxActions: 20_000,
        checkEveryStep: false,
      })
      expect(r.finished, `seed ${seed}`).toBe(true)
      expect(r.violations).toEqual([])
    }
  }, 120_000)
})

describe('determinism', () => {
  it('replaying the action log from the seed reproduces the final state', () => {
    for (const seed of [3, 17, 99]) {
      const r = playout({
        players: 4,
        config: PRESETS.standard,
        seed,
        maxActions: 3000,
        checkEveryStep: false,
      })
      let s = createGame(
        [1, 2, 3, 4].map((i) => ({ id: `p${i}`, name: `p${i}` })),
        seed,
        PRESETS.standard,
      )
      for (const { playerId, action } of r.actions) {
        const step = reduce(s, playerId, action)
        if (!step.ok) throw new Error(step.error)
        s = step.state
      }
      expect(s).toEqual(r.state)
      expect(checkInvariants(s)).toEqual([])
    }
  }, 60_000)
})
