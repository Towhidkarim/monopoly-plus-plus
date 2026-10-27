import { describe, expect, it } from 'vitest'
import { BarkMapper } from './barks.ts'

const styles: Record<string, string | null> = { bot: 'Shark', me: null }

describe('BarkMapper', () => {
  it('gives bots lines in their style and humans none', () => {
    let t = 0
    const m = new BarkMapper(
      (id) => styles[id] ?? null,
      () => 0,
      () => (t += 10_000),
    )
    expect(m.event({ type: 'MONOPOLY_COMPLETED', playerId: 'bot', group: 1 })).toEqual({
      playerId: 'bot',
      text: 'Now it gets expensive for you.',
    })
    expect(m.event({ type: 'MONOPOLY_COMPLETED', playerId: 'me', group: 1 })).toBeNull()
  })

  it('skips small rent and rate-limits minor moments, but never big ones', () => {
    let t = 0
    const m = new BarkMapper(
      (id) => styles[id] ?? null,
      () => 0,
      () => t,
    )
    const rent = (delta: number) =>
      m.event({ type: 'CASH_CHANGED', playerId: 'bot', delta, reason: 'rent', counterparty: 'me' })
    expect(rent(10)).toBeNull()
    expect(rent(40)).not.toBeNull()
    t += 500
    expect(rent(40)).toBeNull()
    expect(rent(-300)).not.toBeNull()
  })

  it('lets the bot on the receiving end of a trade answer', () => {
    const m = new BarkMapper(
      (id) => styles[id] ?? null,
      () => 0,
      () => 0,
    )
    m.event({ type: 'TRADE_PROPOSED', tradeId: 1, from: 'me', to: 'bot' })
    expect(m.event({ type: 'TRADE_ACCEPTED', tradeId: 1 })?.playerId).toBe('bot')
  })
})
