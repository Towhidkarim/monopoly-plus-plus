import { describe, expect, it } from 'vitest'
import { PRESETS, createGame, expectedActor, netWorth, observe, reduce, type Action } from '@skyline/engine'
import { botRng, createHeuristicBot, PERSONALITIES } from '@skyline/bots'
import { gameResults } from './results.ts'

/** Plays a whole turbo game with heuristic bots, keeping the action log. */
function playGame(seed: number) {
  const players = ['a', 'b', 'c'].map((id) => ({ id, name: id.toUpperCase() }))
  const start = createGame(players, seed, PRESETS.turbo)
  const bot = createHeuristicBot(PERSONALITIES.balanced!)
  const rng = botRng(seed)
  const actions: { playerId: string; action: Action }[] = []
  let s = start
  for (let i = 0; i < 20_000 && s.phase !== 'gameOver'; i++) {
    const id = s.players[expectedActor(s)]!.id
    const action = bot.decide(observe(s, id), id, rng) ?? { type: 'TIMEOUT' as const }
    const r = reduce(s, id, action)
    if (!r.ok) throw new Error(r.error)
    actions.push({ playerId: id, action })
    s = r.state
  }
  return { start, actions, end: s }
}

describe('gameResults', () => {
  it('replays to the same end, samples net worth each round, and counts rent both ways', () => {
    const { start, actions, end } = playGame(4)
    expect(end.phase).toBe('gameOver')
    const r = gameResults(start, actions)
    expect(r.worth.length).toBe(r.rounds.length)
    expect(r.rounds.at(-1)).toBe(end.round)
    expect(r.worth[0]).toEqual(start.players.map((_, i) => netWorth(start, i)))
    const collected = r.stats.reduce((a, x) => a + x.rentCollected, 0)
    const paid = r.stats.reduce((a, x) => a + x.rentPaid, 0)
    expect(collected).toBe(paid)
    const w = end.winner
    // The winner leads at the end, and from the turning point on.
    const last = r.worth.at(-1)!
    expect(last.every((v, seat) => seat === w || v < last[w]!)).toBe(true)
    if (r.turningPoint !== null) {
      const from = r.rounds.indexOf(r.turningPoint)
      for (const row of r.worth.slice(from))
        expect(row.every((v, seat) => seat === w || v < row[w]!)).toBe(true)
    }
  })
})
