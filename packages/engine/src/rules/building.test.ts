import { describe, expect, it } from 'vitest'
import { rentFor } from '../core.ts'
import { legalActions } from '../legal.ts'
import { reduce } from '../reduce.ts'
import type { GameState } from '../state.ts'
import { act, edit, newGame, reject, types } from '../testkit.ts'
import { legalBuilding } from './building.ts'

/** a owns the cheapest group (spaces 1 and 3, houses cost 50). */
const base = (f: (d: GameState) => void = () => {}, cfg = {}) =>
  edit(newGame(2, cfg), (d) => {
    d.owner[1] = 0
    d.owner[3] = 0
    f(d)
  })

const build = (space: number) => ({ type: 'BUILD', space }) as const
const sell = (space: number) => ({ type: 'SELL_BUILDING', space }) as const

describe('building', () => {
  it('needs the full group', () => {
    const s = edit(newGame(2), (d) => {
      d.owner[1] = 0
    })
    expect(reject(s, 'a', build(1))).toMatch(/whole/)
  })

  it('rejects non-properties and properties you do not own', () => {
    const s = base()
    expect(reject(s, 'a', build(5))).toBeTruthy()
    expect(reject(s, 'b', build(1))).toMatch(/own/)
  })

  it('charges the cost, takes a house and emits BUILT', () => {
    const r = act(base(), 'a', build(1))
    expect(r.s.houses[1]).toBe(1)
    expect(r.s.players[0]!.cash).toBe(1450)
    expect(r.s.bankHouses).toBe(31)
    expect(r.events).toContainEqual({ type: 'BUILT', playerId: 'a', space: 1, level: 1 })
  })

  it('enforces even building, which can be disabled', () => {
    const s = act(base(), 'a', build(1)).s
    expect(reject(s, 'a', build(1))).toMatch(/evenly/)
    expect(act(s, 'a', build(3)).s.houses[3]).toBe(1)
    const loose = act(
      base(() => {}, { evenBuild: false }),
      'a',
      build(1),
    ).s
    expect(act(loose, 'a', build(1)).s.houses[1]).toBe(2)
  })

  it('fails when the bank has no houses', () => {
    const s = base((d) => {
      d.bankHouses = 0
    })
    expect(reject(s, 'a', build(1))).toMatch(/houses/)
  })

  it('fails without cash', () => {
    const s = base((d) => {
      d.players[0]!.cash = 49
    })
    expect(reject(s, 'a', build(1))).toMatch(/cash/)
  })

  it('fails when a property in the group is mortgaged', () => {
    const s = base((d) => {
      d.mortgaged[3] = true
    })
    expect(reject(s, 'a', build(1))).toMatch(/mortgaged/)
  })

  it('a hotel needs a free hotel and returns four houses', () => {
    const ready = base((d) => {
      d.houses[1] = 4
      d.houses[3] = 4
      d.bankHouses = 10
    })
    const none = edit(ready, (d) => {
      d.bankHotels = 0
    })
    expect(reject(none, 'a', build(1))).toMatch(/hotel/)
    const r = act(ready, 'a', build(1))
    expect(r.s.houses[1]).toBe(5)
    expect(r.s.bankHouses).toBe(14)
    expect(r.s.bankHotels).toBe(11)
    expect(reject(r.s, 'a', build(1))).toMatch(/hotel/)
  })

  it('sells at half price and returns the house', () => {
    const s = base((d) => {
      d.houses[1] = 1
      d.houses[3] = 1
      d.bankHouses = 30
    })
    const r = act(s, 'a', sell(1))
    expect(r.s.houses[1]).toBe(0)
    expect(r.s.players[0]!.cash).toBe(1525)
    expect(r.s.bankHouses).toBe(31)
    expect(r.events).toContainEqual({ type: 'SOLD_BUILDING', playerId: 'a', space: 1, level: 0 })
    expect(reject(r.s, 'a', sell(1))).toMatch(/no buildings/)
  })

  it('sells evenly unless disabled', () => {
    const mk = (cfg: object) =>
      base((d) => {
        d.houses[1] = 2
        d.houses[3] = 1
      }, cfg)
    expect(reject(mk({}), 'a', sell(3))).toMatch(/evenly/)
    expect(act(mk({ evenBuild: false }), 'a', sell(3)).s.houses[3]).toBe(0)
  })

  it('breaking a hotel needs four houses in the bank', () => {
    const mk = (houses: number) =>
      base((d) => {
        d.houses[1] = 5
        d.houses[3] = 5
        d.bankHouses = houses
        d.bankHotels = 10
      })
    expect(reject(mk(3), 'a', sell(1))).toMatch(/houses/)
    const r = act(mk(4), 'a', sell(1))
    expect(r.s.houses[1]).toBe(4)
    expect(r.s.bankHouses).toBe(0)
    expect(r.s.bankHotels).toBe(11)
  })

  it('anyone may build during another player turn', () => {
    const s = edit(newGame(2), (d) => {
      d.owner[37] = 1
      d.owner[39] = 1
    })
    expect(s.current).toBe(0)
    expect(act(s, 'b', build(37)).s.houses[37]).toBe(1)
  })

  it('rent reflects houses', () => {
    const s = act(base(), 'a', build(1)).s
    expect(rentFor(s, 1, 0)).toBe(10)
    expect(rentFor(s, 3, 0)).toBe(8)
  })

  it('a debtor cannot build, but a creditor can', () => {
    const s = edit(base(), (d) => {
      d.owner[37] = 1
      d.owner[39] = 1
      d.debts.push({ debtor: 0, creditor: 1, amount: 5000, reason: 'rent' })
    })
    expect(reject(s, 'a', build(1))).toMatch(/debt/)
    expect(act(s, 'b', build(37)).s.houses[37]).toBe(1)
  })

  it('lists exactly the valid options and reduce accepts them', () => {
    const s = base((d) => {
      d.houses[1] = 1
    })
    expect(legalBuilding(s, 0)).toEqual([sell(1), build(3)])
    expect(legalBuilding(s, 1)).toEqual([])
    for (const a of legalActions(s, 'a')) {
      expect(reduce(s, 'a', a).ok).toBe(true)
    }
    expect(types(act(s, 'a', build(3)).events)).toContain('BUILT')
  })
})
