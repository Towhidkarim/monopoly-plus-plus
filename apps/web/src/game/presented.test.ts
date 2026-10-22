import { describe, expect, it } from 'vitest'
import { PRESETS, createGame, playout, reduce } from '@skyline/engine'
import { applyEvent, desyncs, presentFrom } from './presented.ts'
import { GameStore } from './store.ts'

describe('presented state', () => {
  it('never drifts from the engine: events alone rebuild what the screen shows', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const players = 2 + (seed % 3)
      const { actions } = playout({
        players,
        config: PRESETS.standard,
        seed,
        maxActions: 3000,
        checkEveryStep: false,
      })
      let s = createGame(
        Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `p${i + 1}` })),
        seed,
        PRESETS.standard,
      )
      let shown = presentFrom(s)
      for (const { playerId, action } of actions) {
        const r = reduce(s, playerId, action)
        if (!r.ok) throw new Error(r.error)
        for (const e of r.events) shown = applyEvent(shown, e)
        s = r.state
        expect(desyncs(shown, presentFrom(s)), `seed ${seed} after ${action.type}`).toEqual([])
      }
    }
  }, 60_000)
})

describe('GameStore', () => {
  it('resumes a saved game exactly by replaying its action log', () => {
    const seats = [1, 2, 3, 4].map((i) => ({
      id: `p${i}`,
      name: `p${i}`,
      kind: 'bot' as const,
      piece: 'taxi' as const,
      color: 0xffffff,
    }))
    const { actions, state } = playout({
      players: 4,
      config: PRESETS.turbo,
      seed: 42,
      maxActions: 1500,
      checkEveryStep: false,
    })
    const store = new GameStore({ preset: 'turbo', seed: 42, seats }, actions)
    expect(store.getSnapshot().state).toEqual(state)
    expect(store.getSnapshot().presented).toEqual(presentFrom(state))
    store.dispose()
  })
})
