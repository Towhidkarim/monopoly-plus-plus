import { describe, expect, it } from 'vitest'
import { PRESETS, createGame } from '@skyline/engine'
import { landingOdds } from './odds.ts'

const players = [
  { id: 'a', name: 'Ada' },
  { id: 'b', name: 'Bo' },
]

describe('landingOdds', () => {
  it('covers totals 2 to 12 from the current space, 7 the likeliest, summing to 1', () => {
    const s = createGame(players, 1, PRESETS.classic)
    const odds = landingOdds(s, 0)
    expect(odds.map((o) => o.space)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(odds.find((o) => o.space === 7)!.p).toBeCloseTo(6 / 36)
    expect(odds.reduce((a, o) => a + o.p, 0)).toBeCloseTo(1)
  })

  it('wraps past the last space', () => {
    const s = createGame(players, 1, PRESETS.classic)
    s.players[0]!.position = 38
    expect(landingOdds(s, 0)[0]!.space).toBe(0)
  })

  it("shows rent owed on an opponent's space, not on one's own or a mortgaged one", () => {
    const s = createGame(players, 1, PRESETS.classic)
    s.owner[3] = 1
    s.owner[5] = 0
    s.owner[6] = 1
    s.mortgaged[6] = true
    const at = (space: number) => landingOdds(s, 0).find((o) => o.space === space)!
    expect(at(3)).toMatchObject({ owner: 1 })
    expect(at(3).rent).toBeGreaterThan(0)
    expect(at(5)).toMatchObject({ owner: null, rent: 0 })
    expect(at(6)).toMatchObject({ owner: null, rent: 0 })
  })

  it('is empty in jail', () => {
    const s = createGame(players, 1, PRESETS.classic)
    s.players[0]!.inJail = true
    expect(landingOdds(s, 0)).toEqual([])
  })
})
