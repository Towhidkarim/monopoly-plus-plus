import { describe, expect, it } from 'vitest'
import { rentFor } from '../core.ts'
import { legalActions } from '../legal.ts'
import { reduce } from '../reduce.ts'
import type { GameState } from '../state.ts'
import { act, edit, newGame, reject, rigDice, types } from '../testkit.ts'
import { legalMortgage, unmortgageCost } from './mortgage.ts'

const mort = (space: number) => ({ type: 'MORTGAGE', space }) as const
const unmort = (space: number) => ({ type: 'UNMORTGAGE', space }) as const

/** a owns spaces 1 and 3 (a group) and the station at 5. */
const owned = (f: (d: GameState) => void = () => {}, cfg = {}) =>
  edit(newGame(2, cfg), (d) => {
    d.owner[1] = 0
    d.owner[3] = 0
    d.owner[5] = 0
    f(d)
  })

describe('mortgage', () => {
  it('pays the mortgage value and emits MORTGAGED', () => {
    const r = act(owned(), 'a', mort(5))
    expect(r.s.mortgaged[5]).toBe(true)
    expect(r.s.players[0]!.cash).toBe(1600)
    expect(r.events).toContainEqual({ type: 'MORTGAGED', playerId: 'a', space: 5 })
  })

  it('rejects mortgaged, foreign, unowned and non-ownable spaces', () => {
    const s = owned((d) => {
      d.mortgaged[5] = true
    })
    expect(reject(s, 'a', mort(5))).toMatch(/already/)
    expect(reject(s, 'b', mort(1))).toMatch(/own/)
    expect(reject(s, 'a', mort(6))).toMatch(/own/)
    expect(reject(s, 'a', mort(0))).toBeTruthy()
  })

  it('is blocked while the group has buildings', () => {
    const s = owned((d) => {
      d.houses[3] = 1
    })
    expect(reject(s, 'a', mort(1))).toMatch(/buildings/)
    expect(act(s, 'a', mort(5)).s.mortgaged[5]).toBe(true)
  })

  it('a mortgaged property charges no rent', () => {
    const s = act(owned(), 'a', mort(1)).s
    expect(rentFor(s, 1, 0)).toBe(0)
  })

  it('unmortgage costs value plus 10% interest rounded up', () => {
    const s = owned((d) => {
      d.mortgaged[1] = true
      d.mortgaged[5] = true
    })
    expect(unmortgageCost(s, 1)).toBe(33)
    expect(unmortgageCost(s, 5)).toBe(110)
    const r = act(s, 'a', unmort(1))
    expect(r.s.players[0]!.cash).toBe(1467)
    expect(r.s.mortgaged[1]).toBe(false)
    expect(r.events).toContainEqual({ type: 'UNMORTGAGED', playerId: 'a', space: 1 })
    // 30 * 0.15 = 4.5 rounds up to 5
    expect(
      unmortgageCost(
        owned(() => {}, { mortgageInterest: 0.15 }),
        1,
      ),
    ).toBe(35)
  })

  it('unmortgage needs cash and a mortgaged property', () => {
    const s = owned((d) => {
      d.mortgaged[1] = true
      d.players[0]!.cash = 32
    })
    expect(reject(s, 'a', unmort(1))).toMatch(/cash/)
    expect(reject(owned(), 'a', unmort(1))).toMatch(/not mortgaged/)
  })

  it('anyone may mortgage during another player turn', () => {
    const s = edit(newGame(2), (d) => {
      d.owner[5] = 1
    })
    expect(s.current).toBe(0)
    expect(act(s, 'b', mort(5)).s.mortgaged[5]).toBe(true)
  })

  describe('with a queued debt', () => {
    /** b has a hotel on Grand Terrace; a is about to land on it and owns a mortgageable space. */
    const trap = (cash: number) =>
      rigDice(
        edit(newGame(3), (d) => {
          d.owner[37] = 1
          d.owner[39] = 1
          d.owner[11] = 0
          d.owner[1] = 0
          d.mortgaged[1] = true
          d.houses[39] = 5
          d.players[0]!.position = 35
          d.players[0]!.cash = cash
        }),
        [1, 3],
      )

    it('the debtor cannot unmortgage but can mortgage', () => {
      const s = act(trap(1950), 'a', { type: 'ROLL' }).s
      expect(s.debts).toHaveLength(1)
      expect(reject(s, 'a', unmort(1))).toMatch(/debt/)
      expect(legalActions(s, 'a')).toContainEqual(mort(11))
      expect(legalActions(s, 'a')).not.toContainEqual(unmort(1))
    })

    it('settles the debt automatically once enough is raised', () => {
      const s = act(trap(1950), 'a', { type: 'ROLL' }).s
      const r = act(s, 'a', mort(11))
      expect(r.s.debts).toEqual([])
      expect(r.s.players[1]!.cash).toBe(1500 + 2000)
      expect(r.s.players[0]!.cash).toBe(1950 + 70 - 2000)
      expect(types(r.events)).toContain('DEBT_SETTLED')
    })
  })

  it('lists exactly the valid options and reduce accepts them', () => {
    const blocked = owned((d) => {
      d.mortgaged[5] = true
      d.houses[1] = 1
    })
    expect(legalMortgage(blocked, 0)).toEqual([unmort(5)])
    const s = owned((d) => {
      d.mortgaged[5] = true
    })
    expect(legalMortgage(s, 0)).toEqual([mort(1), mort(3), unmort(5)])
    for (const a of legalActions(s, 'a')) expect(reduce(s, 'a', a).ok).toBe(true)
    expect(legalMortgage(s, 1)).toEqual([])
  })
})
