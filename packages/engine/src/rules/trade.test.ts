import { describe, expect, it } from 'vitest'
import type { Action } from '../actions.ts'
import { legalActions } from '../legal.ts'
import type { Bundle, GameState } from '../state.ts'
import { act, edit, newGame, reject, rigDice, types } from '../testkit.ts'

const bundle = (b: Partial<Bundle> = {}): Bundle => ({ spaces: [], cash: 0, jailCards: 0, ...b })

const propose = (to: string, give: Partial<Bundle>, get: Partial<Bundle>): Action => ({
  type: 'PROPOSE_TRADE',
  to,
  give: bundle(give),
  get: bundle(get),
})

/** a owns Canal Street (6); a offers it to b for 150. Returns state with trade id 0 open. */
function deal(n = 2, setup?: (d: GameState) => void): GameState {
  const s = edit(newGame(n), (d) => {
    d.owner[6] = 0
    setup?.(d)
  })
  return act(s, 'a', propose('b', { spaces: [6] }, { cash: 150 })).s
}

/** Any successful action, to trigger pruning. */
const poke = (s: GameState) => act(s, 'b', propose('a', { cash: 1 }, {}))

describe('trade basics', () => {
  it('proposes and accepts a property-for-cash deal', () => {
    let s = deal()
    expect(s.trades).toHaveLength(1)
    expect(s.nextTradeId).toBe(2)
    const r = act(s, 'b', { type: 'ACCEPT_TRADE', tradeId: 1 })
    s = r.s
    expect(s.owner[6]).toBe(1)
    expect([s.players[0]!.cash, s.players[1]!.cash]).toEqual([1650, 1350])
    expect(s.trades).toEqual([])
    expect(types(r.events)).toEqual([
      'CASH_CHANGED',
      'CASH_CHANGED',
      'PROPERTY_TRANSFERRED',
      'TRADE_ACCEPTED',
    ])
    expect(r.events).toContainEqual({ type: 'PROPERTY_TRANSFERRED', space: 6, from: 'a', to: 'b' })
  })

  it('emits TRADE_PROPOSED', () => {
    const r = act(
      edit(newGame(), (d) => (d.owner[6] = 0)),
      'a',
      propose('b', { spaces: [6] }, {}),
    )
    expect(r.events).toEqual([{ type: 'TRADE_PROPOSED', tradeId: 1, from: 'a', to: 'b' }])
  })

  it('lets the recipient reject', () => {
    const s = deal()
    expect(reject(s, 'a', { type: 'REJECT_TRADE', tradeId: 1 })).toMatch(/not offered/)
    const r = act(s, 'b', { type: 'REJECT_TRADE', tradeId: 1 })
    expect(types(r.events)).toEqual(['TRADE_REJECTED'])
    expect(r.s.trades).toEqual([])
    expect(r.s.owner[6]).toBe(0)
  })

  it('lets the proposer cancel', () => {
    const s = deal()
    expect(reject(s, 'b', { type: 'CANCEL_TRADE', tradeId: 1 })).toMatch(/not your/)
    const r = act(s, 'a', { type: 'CANCEL_TRADE', tradeId: 1 })
    expect(types(r.events)).toEqual(['TRADE_CANCELLED'])
    expect(r.s.trades).toEqual([])
  })

  it('lets only the recipient accept, and only existing trades', () => {
    const s = deal()
    expect(reject(s, 'a', { type: 'ACCEPT_TRADE', tradeId: 1 })).toMatch(/not offered/)
    expect(reject(s, 'b', { type: 'ACCEPT_TRADE', tradeId: 7 })).toMatch(/no such/)
  })

  it('allows proposals by a non-active player during someone else turn', () => {
    const s = edit(newGame(3), (d) => (d.owner[6] = 2))
    expect(s.current).toBe(0)
    const r = act(s, 'c', propose('b', { spaces: [6] }, { cash: 10 }))
    expect(r.s.trades).toHaveLength(1)
  })

  it('rejects malformed or invalid proposals', () => {
    const s = edit(newGame(), (d) => (d.owner[6] = 0))
    expect(reject(s, 'a', propose('b', {}, {}))).toMatch(/empty/)
    expect(reject(s, 'a', propose('a', { cash: 5 }, {}))).toMatch(/yourself/)
    expect(reject(s, 'a', propose('zed', { cash: 5 }, {}))).toMatch(/unknown/)
    expect(reject(s, 'a', propose('b', { spaces: [8] }, {}))).toMatch(/own/)
    expect(reject(s, 'a', propose('b', { spaces: [6, 6] }, {}))).toMatch(/duplicate/)
    expect(reject(s, 'a', propose('b', { spaces: [0] }, {}))).toMatch(/property/)
    expect(reject(s, 'a', propose('b', { cash: -5 }, {}))).toMatch(/malformed/)
    expect(reject(s, 'a', propose('b', { cash: 2.5 }, {}))).toMatch(/malformed/)
    expect(reject(s, 'a', propose('b', { cash: 1501 }, {}))).toMatch(/cash/)
    expect(reject(s, 'a', propose('b', {}, { cash: 1501 }))).toMatch(/cash/)
    expect(reject(s, 'a', propose('b', { jailCards: 1 }, {}))).toMatch(/jail/)
    expect(reject(s, 'a', propose('b', {}, { spaces: [6] }))).toMatch(/own/)
  })

  it('rejects trades with bankrupt players', () => {
    const s = edit(newGame(3), (d) => (d.players[1]!.bankrupt = true))
    expect(reject(s, 'a', propose('b', { cash: 5 }, {}))).toMatch(/bankrupt/)
  })

  it('rejects trading a property in a group with buildings', () => {
    const s = edit(newGame(), (d) => {
      d.owner[1] = 0
      d.owner[3] = 0
      d.houses[1] = 1
      d.owner[6] = 1
    })
    expect(reject(s, 'a', propose('b', { spaces: [3] }, {}))).toMatch(/buildings/)
    const sb = edit(s, (d) => {
      d.owner[6] = 1
      d.owner[8] = 0
      d.houses[6] = 1
    })
    expect(reject(sb, 'a', propose('b', {}, { spaces: [6] }))).toMatch(/buildings/)
  })

  it('enforces maxOpenTrades', () => {
    let s = newGame(2, { maxOpenTrades: 2 })
    s = act(s, 'a', propose('b', { cash: 1 }, {})).s
    s = act(s, 'a', propose('b', { cash: 2 }, {})).s
    expect(reject(s, 'a', propose('b', { cash: 3 }, {}))).toMatch(/too many/)
    s = act(s, 'b', propose('a', { cash: 3 }, {})).s
    expect(s.trades).toHaveLength(3)
  })
})

describe('mortgaged property and jail cards', () => {
  it('charges the receiver a 10% fee and keeps the mortgage', () => {
    let s = deal(2, (d) => (d.mortgaged[6] = true))
    const r = act(s, 'b', { type: 'ACCEPT_TRADE', tradeId: 1 })
    s = r.s
    expect(s.owner[6]).toBe(1)
    expect(s.mortgaged[6]).toBe(true)
    // mortgage value 50, fee 5
    expect(s.players[1]!.cash).toBe(1500 - 150 - 5)
    expect(s.players[0]!.cash).toBe(1650)
    expect(r.events).toContainEqual({
      type: 'CASH_CHANGED',
      playerId: 'b',
      delta: -5,
      reason: 'trade',
      counterparty: 'bank',
    })
  })

  it('blocks accepting when the fee is unaffordable', () => {
    let s = deal(2, (d) => (d.mortgaged[6] = true))
    s = edit(s, (d) => (d.players[1]!.cash = 152))
    expect(reject(s, 'b', { type: 'ACCEPT_TRADE', tradeId: 1 })).toMatch(/fee/)
    expect(legalActions(s, 'b')).not.toContainEqual({ type: 'ACCEPT_TRADE', tradeId: 1 })
  })

  it('trades jail cards', () => {
    let s = edit(newGame(), (d) => (d.players[0]!.jailCards = ['chance', 'chest']))
    s = act(s, 'a', propose('b', { jailCards: 1 }, { cash: 50 })).s
    const r = act(s, 'b', { type: 'ACCEPT_TRADE', tradeId: 1 })
    expect(r.s.players[0]!.jailCards).toEqual(['chest'])
    expect(r.s.players[1]!.jailCards).toEqual(['chance'])
    expect(r.events).toContainEqual({ type: 'JAIL_CARD_GAINED', playerId: 'b', deck: 'chance', from: 'a' })
  })

  it('emits MONOPOLY_COMPLETED once per group', () => {
    let s = edit(newGame(), (d) => {
      d.owner[1] = 1
      d.owner[3] = 0
    })
    s = act(s, 'b', propose('a', { spaces: [1] }, { spaces: [3] })).s
    // swap: a gets 1 (owns only 1), b gets 3 -> nobody completes
    let r = act(s, 'a', { type: 'ACCEPT_TRADE', tradeId: 1 })
    expect(types(r.events)).not.toContain('MONOPOLY_COMPLETED')
    s = edit(newGame(), (d) => {
      d.owner[8] = 0
      d.owner[9] = 0
      d.owner[6] = 1
    })
    s = act(s, 'b', propose('a', { spaces: [6] }, {})).s
    r = act(s, 'a', { type: 'ACCEPT_TRADE', tradeId: 1 })
    expect(types(r.events).filter((t) => t === 'MONOPOLY_COMPLETED')).toHaveLength(1)
  })
})

describe('voiding', () => {
  it('voids when the proposer loses the property', () => {
    let s = deal()
    s = edit(s, (d) => (d.owner[6] = 1))
    const r = poke(s)
    expect(types(r.events)).toContain('TRADE_VOIDED')
    expect(r.events).toContainEqual({ type: 'TRADE_VOIDED', tradeId: 1 })
    expect(r.s.trades.map((t) => t.id)).toEqual([2])
  })

  it('voids when the proposer can no longer afford the cash', () => {
    let s = act(newGame(), 'a', propose('b', { cash: 500 }, {})).s
    s = edit(s, (d) => (d.players[0]!.cash = 100))
    const r = poke(s)
    expect(r.events).toContainEqual({ type: 'TRADE_VOIDED', tradeId: 1 })
  })

  it('voids when buildings appear in a traded group', () => {
    let s = deal()
    s = edit(s, (d) => (d.houses[6] = 1))
    expect(poke(s).events).toContainEqual({ type: 'TRADE_VOIDED', tradeId: 1 })
  })

  it('voids when a party goes bankrupt', () => {
    let s = act(newGame(3), 'a', propose('b', { cash: 5 }, {})).s
    s = edit(s, (d) => (d.players[1]!.bankrupt = true))
    expect(act(s, 'c', propose('a', { cash: 1 }, {})).events).toContainEqual({
      type: 'TRADE_VOIDED',
      tradeId: 1,
    })
  })

  it('keeps valid offers', () => {
    const r = poke(deal())
    expect(types(r.events)).not.toContain('TRADE_VOIDED')
    expect(r.s.trades).toHaveLength(2)
  })
})

describe('debtors', () => {
  /** b owns Grand Terrace with a hotel; a is nearly broke and about to land on it. */
  const trap = (cash: number) =>
    rigDice(
      edit(newGame(3), (d) => {
        d.owner[37] = 1
        d.owner[39] = 1
        d.owner[11] = 0
        d.houses[39] = 5
        d.players[0]!.position = 35
        d.players[0]!.cash = cash
      }),
      [1, 3],
    )

  it('settles the queued debt when a trade gives the debtor enough cash', () => {
    let s = act(trap(300), 'a', { type: 'ROLL' }).s
    expect(s.debts).toHaveLength(1)
    s = edit(s, (d) => (d.players[2]!.cash = 3000))
    s = act(s, 'c', propose('a', { cash: 1800 }, { spaces: [11] })).s
    expect(legalActions(s, 'a')).toContainEqual({ type: 'ACCEPT_TRADE', tradeId: 1 })
    const r = act(s, 'a', { type: 'ACCEPT_TRADE', tradeId: 1 })
    expect(r.s.debts).toEqual([])
    expect(r.s.owner[11]).toBe(2)
    expect(r.s.players[0]!.cash).toBe(100)
    expect(r.s.players[1]!.cash).toBe(3500)
    expect(types(r.events)).toContain('DEBT_SETTLED')
  })
})

describe('legal actions', () => {
  it('lists accept/reject for the recipient and cancel for the proposer, all accepted', () => {
    const s = deal()
    const forB = legalActions(s, 'b')
    expect(forB).toContainEqual({ type: 'ACCEPT_TRADE', tradeId: 1 })
    expect(forB).toContainEqual({ type: 'REJECT_TRADE', tradeId: 1 })
    expect(legalActions(s, 'a')).toContainEqual({ type: 'CANCEL_TRADE', tradeId: 1 })
    for (const a of forB) act(s, 'b', a)
    for (const a of legalActions(s, 'a')) act(s, 'a', a)
  })
})
