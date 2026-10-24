import { describe, expect, it } from 'vitest'
import { SKY_CYCLE, skyLevel } from './sky.ts'

describe('skyLevel', () => {
  it('follows the 8-round cycle in auto', () => {
    const levels = [1, 2, 3, 4, 5, 6, 7, 8].map((r) => skyLevel(r, 'auto'))
    expect(levels).toEqual([0, 0, 0, 0, 0.6, 1, 1, 0.3])
  })

  it('repeats past round 8', () => {
    for (let r = 1; r <= 8; r++) {
      expect(skyLevel(r + 8, 'auto')).toBe(skyLevel(r, 'auto'))
      expect(skyLevel(r + 24, 'auto')).toBe(skyLevel(r, 'auto'))
    }
    expect(SKY_CYCLE).toHaveLength(8)
  })

  it('holds day or night whatever the round', () => {
    for (const r of [1, 5, 6, 8, 30]) {
      expect(skyLevel(r, 'day')).toBe(0)
      expect(skyLevel(r, 'night')).toBe(1)
    }
  })

  it('treats a round below 1 as round 1', () => {
    expect(skyLevel(0, 'auto')).toBe(0)
  })
})
