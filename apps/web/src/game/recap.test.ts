import { describe, expect, it } from 'vitest'
import type { GameEvent } from '@skyline/engine'
import { RecapTracker } from './recap.ts'

const turn = (playerId: string): GameEvent => ({ type: 'TURN_STARTED', playerId, round: 1 })
const rent = (payer: string, payee: string, amount: number): GameEvent[] => [
  { type: 'CASH_CHANGED', playerId: payer, delta: -amount, reason: 'rent', counterparty: payee },
  { type: 'CASH_CHANGED', playerId: payee, delta: amount, reason: 'rent', counterparty: payer },
]

describe('RecapTracker', () => {
  it("summarizes the others' turns when yours comes back", () => {
    const t = new RecapTracker((id) => id === 'me')
    const feed = (es: GameEvent[]) => es.map((e) => t.push(e)).findLast((r) => r !== null) ?? null
    expect(feed([turn('me'), { type: 'MOVED', playerId: 'me', path: [1, 2], passedGo: false }])).toBeNull()
    const recap = feed([
      turn('bot'),
      { type: 'MOVED', playerId: 'bot', path: [5, 6, 7], passedGo: false },
      { type: 'PROPERTY_BOUGHT', playerId: 'bot', space: 7, price: 100 },
      { type: 'CASH_CHANGED', playerId: 'bot', delta: -100, reason: 'purchase' },
      { type: 'MONOPOLY_COMPLETED', playerId: 'bot', group: 1 },
      turn('ann'),
      { type: 'MOVED', playerId: 'ann', path: [2], passedGo: false },
      ...rent('ann', 'me', 30),
      { type: 'TRADE_PROPOSED', tradeId: 4, from: 'ann', to: 'bot' },
      { type: 'TRADE_ACCEPTED', tradeId: 4 },
      turn('me'),
    ])
    expect(recap).toMatchObject({ earned: 30, paid: 0 })
    expect(recap!.players.map((p) => p.id)).toEqual(['bot', 'ann'])
    expect(recap!.players[0]).toMatchObject({ landed: 7, bought: [7], cash: -100, sets: [1], trades: 1 })
    expect(recap!.players[1]).toMatchObject({ landed: 2, cash: -30, trades: 1 })
  })

  it('leaves out your own turn and gives nothing for an empty stretch', () => {
    const t = new RecapTracker((id) => id === 'me')
    t.push(turn('me'))
    t.push({ type: 'MOVED', playerId: 'me', path: [3], passedGo: false })
    expect(t.push(turn('me'))).toBeNull()
  })

  it('gives each local human their own stretch', () => {
    const t = new RecapTracker((id) => id === 'a' || id === 'b')
    t.push(turn('a'))
    t.push({ type: 'MOVED', playerId: 'a', path: [4], passedGo: false })
    t.push(turn('b'))
    t.push({ type: 'MOVED', playerId: 'b', path: [9], passedGo: false })
    const forA = t.push(turn('a'))
    expect(forA!.players.map((p) => [p.id, p.landed])).toEqual([['b', 9]])
  })
})
