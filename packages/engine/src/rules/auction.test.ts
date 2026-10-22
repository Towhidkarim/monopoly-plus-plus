import { describe, expect, it } from 'vitest'
import { legalActions } from '../legal.ts'
import type { GameState } from '../state.ts'
import { act, edit, newGame, reject, rigDice, types } from '../testkit.ts'

/** a lands on Canal Street (6) and declines; bidding order is b, c, a in a 3-player game. */
function auction(n = 3, setup?: (d: GameState) => void): GameState {
  let s = setup ? edit(newGame(n), setup) : newGame(n)
  s = act(rigDice(s, [2, 4]), 'a', { type: 'ROLL' }).s
  return act(s, 'a', { type: 'DECLINE_BUY' }).s
}

describe('auction', () => {
  it('starts after the decliner and bids in order ending with the decliner', () => {
    let s = rigDice(newGame(3), [2, 4])
    s = act(s, 'a', { type: 'ROLL' }).s
    const r = act(s, 'a', { type: 'DECLINE_BUY' })
    expect(types(r.events)).toEqual(['AUCTION_STARTED'])
    expect(r.s.pending).toEqual({
      kind: 'auction',
      space: 6,
      bidders: [1, 2, 0],
      current: 0,
      highBid: 0,
      highBidder: -1,
    })
  })

  it('skips bankrupt seats', () => {
    const s = auction(3, (d) => (d.players[1]!.bankrupt = true))
    expect(s.pending).toMatchObject({ bidders: [2, 0] })
  })

  it('requires bids above the high bid and within cash', () => {
    let s = auction()
    expect(reject(s, 'b', { type: 'BID', amount: 0 })).toMatch(/at least 1/)
    expect(reject(s, 'b', { type: 'BID', amount: 1.5 })).toMatch(/whole/)
    expect(reject(s, 'b', { type: 'BID', amount: 1501 })).toMatch(/cash/)
    const r = act(s, 'b', { type: 'BID', amount: 50 })
    expect(types(r.events)).toEqual(['BID_PLACED'])
    s = r.s
    expect(s.pending).toMatchObject({ highBid: 50, highBidder: 1, current: 1 })
    expect(reject(s, 'c', { type: 'BID', amount: 50 })).toMatch(/exceed/)
    expect(reject(s, 'c', { type: 'BID', amount: 40 })).toMatch(/exceed/)
  })

  it('rejects bids and passes from non-current bidders', () => {
    const s = auction()
    expect(reject(s, 'c', { type: 'BID', amount: 10 })).toMatch(/your turn/)
    expect(reject(s, 'a', { type: 'PASS_BID' })).toMatch(/your turn/)
    expect(reject(s, 'a', { type: 'TIMEOUT' })).toMatch(/not waiting/)
  })

  it('ends with no sale when everyone passes', () => {
    let s = auction()
    s = act(s, 'b', { type: 'PASS_BID' }).s
    s = act(s, 'c', { type: 'PASS_BID' }).s
    const r = act(s, 'a', { type: 'PASS_BID' })
    expect(types(r.events)).toEqual(['BIDDER_PASSED', 'AUCTION_ENDED'])
    expect(r.events[1]).toEqual({ type: 'AUCTION_ENDED', space: 6, winner: null, amount: 0 })
    expect(r.s.owner[6]).toBe(-1)
    expect(r.s.pending).toBeNull()
  })

  it('lets a lone bidder with no bids still bid or pass', () => {
    let s = auction()
    s = act(s, 'b', { type: 'PASS_BID' }).s
    s = act(s, 'c', { type: 'PASS_BID' }).s
    expect(s.pending).toMatchObject({ bidders: [0], highBidder: -1 })
    const r = act(s, 'a', { type: 'BID', amount: 5 })
    expect(r.events.at(-1)).toEqual({ type: 'AUCTION_ENDED', space: 6, winner: 'a', amount: 5 })
  })

  it('awards the last bidder standing, who pays the bank', () => {
    let s = auction()
    s = act(s, 'b', { type: 'BID', amount: 30 }).s
    s = act(s, 'c', { type: 'BID', amount: 60 }).s
    s = act(s, 'a', { type: 'PASS_BID' }).s
    const r = act(s, 'b', { type: 'PASS_BID' })
    expect(types(r.events)).toEqual(['BIDDER_PASSED', 'CASH_CHANGED', 'AUCTION_ENDED'])
    expect(r.s.owner[6]).toBe(2)
    expect(r.s.players[2]!.cash).toBe(1440)
    expect(r.s.pending).toBeNull()
  })

  it('wins when the last rival passes after the high bidder bids', () => {
    let s = auction(2)
    s = act(s, 'b', { type: 'BID', amount: 20 }).s
    const r = act(s, 'a', { type: 'PASS_BID' })
    expect(r.s.owner[6]).toBe(1)
    expect(r.s.players[1]!.cash).toBe(1480)
  })

  it('treats TIMEOUT from the current bidder as a pass', () => {
    const s = auction()
    const r = act(s, 'b', { type: 'TIMEOUT' })
    expect(types(r.events)).toEqual(['BIDDER_PASSED'])
    expect(r.s.pending).toMatchObject({ bidders: [2, 0], current: 0 })
  })

  it('freezes other actions during an auction', () => {
    const s = auction(3, (d) => {
      d.owner[1] = 1
      d.owner[3] = 1
    })
    for (const seat of ['a', 'b'] as const) {
      expect(reject(s, seat, { type: 'ROLL' })).toMatch(/auction/)
      expect(reject(s, seat, { type: 'BUILD', space: 1 })).toMatch(/auction/)
      expect(reject(s, seat, { type: 'MORTGAGE', space: 1 })).toMatch(/auction/)
      expect(reject(s, seat, { type: 'END_TURN' })).toMatch(/auction/)
    }
    const give = { spaces: [], cash: 10, jailCards: 0 }
    const get = { spaces: [], cash: 0, jailCards: 0 }
    expect(reject(s, 'c', { type: 'PROPOSE_TRADE', to: 'a', give, get })).toMatch(/auction/)
  })

  it('rejects bidding when no auction is running', () => {
    expect(reject(newGame(), 'a', { type: 'BID', amount: 5 })).toMatch(/no auction/)
    expect(reject(newGame(), 'a', { type: 'PASS_BID' })).toMatch(/no auction/)
  })

  it('emits MONOPOLY_COMPLETED when the win completes a group', () => {
    let s = auction(2, (d) => {
      d.owner[8] = 1
      d.owner[9] = 1
    })
    s = act(s, 'b', { type: 'BID', amount: 10 }).s
    const r = act(s, 'a', { type: 'PASS_BID' })
    expect(types(r.events)).toEqual(['BIDDER_PASSED', 'CASH_CHANGED', 'AUCTION_ENDED', 'MONOPOLY_COMPLETED'])
  })

  it('lets the active player end the turn afterwards', () => {
    let s = auction(2)
    s = act(s, 'b', { type: 'PASS_BID' }).s
    s = act(s, 'a', { type: 'PASS_BID' }).s
    expect(s.phase).toBe('postRoll')
    expect(legalActions(s, 'a')).toContainEqual({ type: 'END_TURN' })
    expect(act(s, 'a', { type: 'END_TURN' }).s.current).toBe(1)
  })

  it('lists legal actions for the current bidder only, all accepted by reduce', () => {
    let s = auction(3, (d) => (d.players[1]!.cash = 30))
    expect(legalActions(s, 'a')).toEqual([])
    expect(legalActions(s, 'c')).toEqual([])
    const acts = legalActions(s, 'b')
    expect(acts).toEqual([{ type: 'PASS_BID' }, { type: 'BID', amount: 1 }, { type: 'BID', amount: 10 }])
    for (const a of acts) act(s, 'b', a)
    s = act(s, 'b', { type: 'PASS_BID' }).s
    const next = legalActions(s, 'c')
    expect(next).toContainEqual({ type: 'BID', amount: 100 })
    for (const a of next) act(s, 'c', a)
  })
})
