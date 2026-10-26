import { describe, expect, it } from 'vitest'
import { legalActions, observe, reduce, validate, type Action } from './index.ts'
import { createGame } from './setup.ts'

describe('validate', () => {
  const s = createGame(
    [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
    5,
  )
  const view = observe(s, 'a')

  it('agrees with reduce on the full state and on a masked view', () => {
    const actions: Action[] = [
      { type: 'ROLL' },
      { type: 'END_TURN' },
      { type: 'BUY' },
      { type: 'BID', amount: 10 },
    ]
    for (const id of ['a', 'b'])
      for (const action of actions) {
        const r = reduce(s, id, action)
        const expected = r.ok ? null : r.error
        expect(validate(s, id, action)).toBe(expected)
        expect(validate(view, id, action)).toBe(expected)
      }
  })

  it('accepts every legal action and rejects unknown players', () => {
    for (const action of legalActions(view, 'a')) expect(validate(view, 'a', action)).toBeNull()
    expect(validate(view, 'nobody', { type: 'ROLL' })).toBe('unknown player')
  })
})
