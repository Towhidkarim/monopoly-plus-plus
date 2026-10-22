import { describe, expect, it } from 'vitest'
import {
  PRESETS,
  checkInvariants,
  createGame,
  expectedActor,
  observe,
  reduce,
  type GameState,
} from '@skyline/engine'
import { botRng } from './bot.ts'
import { randomBot, simpleBot } from './simple.ts'

/** Plays a whole game with one bot per seat; every bot action must be legal. */
function botGame(seed: number, players: number): { state: GameState; actions: number } {
  let s = createGame(
    Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` })),
    seed,
    PRESETS.standard,
  )
  const rng = botRng(seed)
  let actions = 0
  while (s.phase !== 'gameOver' && actions < 20_000) {
    const id = s.players[expectedActor(s)]!.id
    const action = simpleBot.decide(observe(s, id), id, rng)
    expect(action, `bot ${id} had no move`).not.toBeNull()
    const r = reduce(s, id, action!)
    if (!r.ok) throw new Error(`bot ${id} played illegal ${JSON.stringify(action)}: ${r.error}`)
    s = r.state
    actions++
  }
  return { state: s, actions }
}

describe('simpleBot', () => {
  it('plays complete, legal games', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { state } = botGame(seed, 2 + (seed % 3))
      expect(state.phase).toBe('gameOver')
      expect(checkInvariants(state)).toEqual([])
    }
  }, 60_000)

  it('buys when it can afford to and declines when it cannot', () => {
    let s = createGame(
      [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      1,
      PRESETS.classic,
    )
    s = { ...s, pending: { kind: 'buy', space: 39 }, phase: 'postRoll' }
    expect(simpleBot.decide(observe(s, 'a'), 'a', botRng(1))).toEqual({ type: 'BUY' })
    const poor = { ...s, players: s.players.map((p, i) => (i === 0 ? { ...p, cash: 450 } : p)) }
    expect(simpleBot.decide(observe(poor, 'a'), 'a', botRng(1))).toEqual({ type: 'DECLINE_BUY' })
  })

  it('does nothing when it is not its move', () => {
    const s = createGame(
      [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      1,
    )
    expect(simpleBot.decide(observe(s, 'b'), 'b', botRng(1))).toBeNull()
    expect(randomBot.decide(observe(s, 'b'), 'b', botRng(1))).toBeNull()
  })
})
