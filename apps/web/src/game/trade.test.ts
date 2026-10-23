import { describe, expect, it } from 'vitest'
import { GROUPS, PRESETS, createGame, reduce, type GameState } from '@skyline/engine'
import {
  describeBundle,
  isEmptyBundle,
  missingPieces,
  moodOf,
  reaction,
  mortgageFee,
  setsBroken,
  setsCompleted,
  tradeProblem,
  tradeSpaces,
} from './trade.ts'

const players = [
  { id: 'a', name: 'Ada' },
  { id: 'b', name: 'Bo' },
]

function game(edit: (s: GameState) => void): GameState {
  const s = structuredClone(createGame(players, 1, PRESETS.classic))
  edit(s)
  return s
}

const g0a = GROUPS[0]![0]!
const g0b = GROUPS[0]![1]!

describe('trade helpers', () => {
  it('lists owned spaces and blocks those in a set with buildings', () => {
    const s = game((d) => {
      d.owner[g0a] = 0
      d.owner[g0b] = 0
      d.owner[5] = 0
      d.houses[g0a] = 1
    })
    expect(tradeSpaces(s, 0)).toEqual(
      [
        { space: g0a, blocked: expect.stringMatching(/buildings/) },
        { space: 5, blocked: null },
        { space: g0b, blocked: expect.stringMatching(/buildings/) },
      ].toSorted((x, y) => x.space - y.space),
    )
  })

  it('spots sets a deal completes or breaks', () => {
    const s = game((d) => {
      d.owner[g0a] = 0
      d.owner[g0b] = 1
    })
    expect(setsCompleted(s, 0, [g0b], [])).toEqual([0])
    expect(setsCompleted(s, 0, [], [])).toEqual([])
    const full = game((d) => {
      d.owner[g0a] = 0
      d.owner[g0b] = 0
    })
    expect(setsBroken(full, 0, [g0a])).toEqual([0])
    expect(setsCompleted(full, 0, [], [])).toEqual([])
  })

  it('charges the same mortgage fee the engine does', () => {
    const s = game((d) => {
      d.owner[g0a] = 0
      d.mortgaged[g0a] = true
    })
    const fee = mortgageFee(s, [g0a])
    expect(fee).toBeGreaterThan(0)
    let r = reduce(s, 'a', {
      type: 'PROPOSE_TRADE',
      to: 'b',
      give: { spaces: [g0a], cash: 0, jailCards: 0 },
      get: { spaces: [], cash: 0, jailCards: 0 },
    })
    if (!r.ok) throw new Error(r.error)
    r = reduce(r.state, 'b', { type: 'ACCEPT_TRADE', tradeId: r.state.trades[0]!.id })
    if (!r.ok) throw new Error(r.error)
    expect(r.state.players[1]!.cash).toBe(s.players[1]!.cash - fee)
  })

  it('describes bundles and explains engine refusals', () => {
    expect(describeBundle({ spaces: [], cash: 0, jailCards: 0 })).toBe('nothing')
    expect(describeBundle({ spaces: [], cash: 1500, jailCards: 1 })).toBe('₵1,500 + a free card')
    expect(isEmptyBundle({ spaces: [], cash: 0, jailCards: 0 })).toBe(true)
    expect(tradeProblem('empty trade')).toMatch(/Add something/)
    expect(tradeProblem('weird thing')).toBe('Weird thing.')
  })
})

describe('trade suggestions and reactions', () => {
  it('suggests asking for the one piece missing from a set', () => {
    const s = game((d) => {
      d.owner[g0a] = 0
      d.owner[g0b] = 1
    })
    expect(missingPieces(s, 0)).toEqual([{ group: 0, space: g0b, owner: 1 }])
    expect(missingPieces(s, 1)).toEqual([{ group: 0, space: g0a, owner: 0 }])
    const built = game((d) => {
      d.owner[g0a] = 0
      d.owner[g0b] = 1
      d.houses[g0b] = 1
    })
    expect(missingPieces(built, 0)).toEqual([])
  })

  it('maps moods to words, and every personality has lines for every moment', () => {
    expect([moodOf(null), moodOf(0.1), moodOf(0.4), moodOf(0.7)]).toEqual(['empty', 'no', 'close', 'yes'])
    for (const who of ['Balanced', 'Banker', 'Tycoon', 'Shark', 'Unknown', null])
      for (const m of ['empty', 'no', 'close', 'yes', 'offer', 'accepted', 'declined'] as const)
        expect(reaction(who, m, 3).length).toBeGreaterThan(0)
  })
})
