import { describe, expect, it } from 'vitest'
import { GROUPS, PRESETS, SPACES, createGame, reduce, type Action, type GameState } from '@skyline/engine'
import { hintFor } from './hints.ts'
import { buildEvenlyPlan, liquidationValue, raisePlan, sellEvenlyPlan } from './plans.ts'

const players = [
  { id: 'a', name: 'Ada' },
  { id: 'b', name: 'Bo' },
]

/** A fresh classic game where seat 0 is mid-turn (rolled, nothing pending). */
function game(edit: (s: GameState) => void): GameState {
  const s = createGame(players, 1, PRESETS.classic)
  s.phase = 'postRoll'
  edit(s)
  return s
}

const give = (s: GameState, seat: number, spaces: readonly number[]) => {
  for (const i of spaces) s.owner[i] = seat
}

/** Applies a plan through the real engine; every step must be accepted. */
function run(s: GameState, id: string, actions: Action[]): GameState {
  return actions.reduce((cur, a) => {
    const r = reduce(cur, id, a)
    if (!r.ok) throw new Error(`${a.type} rejected: ${r.error}`)
    return r.state
  }, s)
}

describe('buildEvenlyPlan', () => {
  it('puts one house on every property of the set in one go', () => {
    const s = game((x) => give(x, 0, GROUPS[1]!))
    const plan = buildEvenlyPlan(s, 'a', 1)
    expect(plan.actions).toHaveLength(3)
    expect(plan.amount).toBe(150)
    const after = run(s, 'a', plan.actions)
    expect(GROUPS[1]!.map((i) => after.houses[i])).toEqual([1, 1, 1])
  })

  it('tops up only the lower properties when the set is uneven', () => {
    const s = game((x) => {
      give(x, 0, GROUPS[1]!)
      x.houses[GROUPS[1]![0]!] = 1
    })
    const plan = buildEvenlyPlan(s, 'a', 1)
    expect(plan.actions).toHaveLength(2)
    expect(GROUPS[1]!.map((i) => run(s, 'a', plan.actions).houses[i])).toEqual([1, 1, 1])
  })

  it('builds as many as the cash allows', () => {
    const s = game((x) => {
      give(x, 0, GROUPS[1]!)
      x.players[0]!.cash = 120
    })
    expect(buildEvenlyPlan(s, 'a', 1).actions).toHaveLength(2)
  })

  it('is empty without the full set, and sellEvenlyPlan reverses a level', () => {
    const partial = game((x) => give(x, 0, GROUPS[1]!.slice(1)))
    expect(buildEvenlyPlan(partial, 'a', 1).actions).toEqual([])
    const built = game((x) => {
      give(x, 0, GROUPS[1]!)
      for (const i of GROUPS[1]!) x.houses[i] = 2
    })
    const sell = sellEvenlyPlan(built, 'a', 1)
    expect(sell.amount).toBe(75)
    expect(GROUPS[1]!.map((i) => run(built, 'a', sell.actions).houses[i])).toEqual([1, 1, 1])
  })
})

describe('raisePlan', () => {
  it('mortgages lone properties before touching a built set', () => {
    const lone = 39 // Grand Terrace, mortgage 200
    const s = game((x) => {
      give(x, 0, GROUPS[1]!)
      give(x, 0, [lone])
      for (const i of GROUPS[1]!) x.houses[i] = 1
    })
    const plan = raisePlan(s, 'a', 150)
    expect(plan.actions).toEqual([{ type: 'MORTGAGE', space: lone }])
    expect(plan.amount).toBe(200)
  })

  it('raises everything with Infinity, matching liquidationValue', () => {
    const s = game((x) => {
      give(x, 0, GROUPS[1]!)
      give(x, 0, [5, 39])
      for (const i of GROUPS[1]!) x.houses[i] = 2
    })
    const plan = raisePlan(s, 'a', Infinity)
    expect(plan.amount).toBe(liquidationValue(s, 'a'))
    const after = run(s, 'a', plan.actions)
    for (const i of [...GROUPS[1]!, 5, 39]) {
      expect(after.houses[i]).toBe(0)
      expect(after.mortgaged[i]).toBe(true)
    }
  })
})

describe('hintFor', () => {
  it('warns about a big rent within one roll when cash is short', () => {
    const s = game((x) => {
      give(x, 1, GROUPS[7]!)
      x.houses[39] = 3
      x.players[0]!.position = 33
      x.players[0]!.cash = 300
    })
    const h = hintFor(s, 0)
    expect(h?.tone).toBe('warn')
    expect(h?.text).toContain(SPACES[39]!.name)
  })

  it('points at a buildable set, then at the last missing piece', () => {
    const set = game((x) => give(x, 0, GROUPS[1]!))
    expect(hintFor(set, 0)?.text).toMatch(/set is complete/)
    const near = game((x) => {
      give(x, 0, GROUPS[1]!.slice(1))
      x.owner[GROUPS[1]![0]!] = 1
    })
    expect(hintFor(near, 0)?.text).toMatch(/^Bo holds/)
  })
})
