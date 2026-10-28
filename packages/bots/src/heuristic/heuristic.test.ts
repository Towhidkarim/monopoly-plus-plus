import { describe, expect, it } from 'vitest'
import { GROUPS, PRESETS, createGame, observe, type Action, type GameState } from '@skyline/engine'
import { botRng } from '../bot.ts'
import { playMatch } from '../match.ts'
import { randomBot } from '../simple.ts'
import { createHeuristicBot } from './bot.ts'
import { danger, seatValue } from './model.ts'
import { BALANCED } from './params.ts'

const ids = ['a', 'b', 'c']

/** Classic game, seat 0 to act after rolling, with edits applied. */
function game(edit: (s: GameState) => void): GameState {
  const s = createGame(
    ids.map((id) => ({ id, name: id })),
    1,
    PRESETS.classic,
  )
  s.phase = 'postRoll'
  edit(s)
  return s
}

const own = (s: GameState, seat: number, spaces: readonly number[]) => {
  for (const i of spaces) s.owner[i] = seat
}

const decide = (s: GameState, id = 'a', bot = createHeuristicBot()): Action | null =>
  bot.decide(observe(s, id), id, botRng(1))

describe('heuristic bot decisions', () => {
  it('buys an affordable space early', () => {
    const s = game((x) => {
      x.players[0]!.position = 6
      x.pending = { kind: 'buy', space: 6 }
    })
    expect(decide(s)).toEqual({ type: 'BUY' })
  })

  it('keeps its cash when a hotel is one roll away', () => {
    const s = game((x) => {
      own(x, 1, GROUPS[7]!)
      x.houses[37] = 5
      x.houses[39] = 5
      x.players[0]!.position = 35
      x.players[0]!.cash = 400
      x.pending = { kind: 'buy', space: 35 }
    })
    expect(danger(s, 0)).toBe(2000)
    expect(decide(s)).toEqual({ type: 'DECLINE_BUY' })
  })

  it('builds on a complete set when it can afford to', () => {
    const s = game((x) => own(x, 0, GROUPS[3]!))
    expect(decide(s)).toMatchObject({ type: 'BUILD' })
  })

  it('mortgages a lone property to fund houses when short of cash', () => {
    const s = game((x) => {
      own(x, 0, GROUPS[3]!)
      own(x, 0, [39])
      x.players[0]!.cash = 150
    })
    expect(decide(s)).toEqual({ type: 'MORTGAGE', space: 39 })
  })

  it('accepts a deal that completes its set and rejects one that gives a set away cheaply', () => {
    const [m1, m2, m3] = GROUPS[3]!
    const fair = game((x) => {
      own(x, 0, [m1!, m2!])
      own(x, 1, [m3!])
      x.trades = [
        {
          id: 1,
          from: 1,
          to: 0,
          give: { spaces: [m3!], cash: 0, jailCards: 0 },
          get: { spaces: [], cash: 250, jailCards: 0 },
        },
      ]
    })
    expect(decide(fair)).toEqual({ type: 'ACCEPT_TRADE', tradeId: 1 })

    const lopsided = game((x) => {
      own(x, 0, [m1!])
      own(x, 1, [m2!, m3!])
      x.trades = [
        {
          id: 2,
          from: 1,
          to: 0,
          give: { spaces: [], cash: 60, jailCards: 0 },
          get: { spaces: [m1!], cash: 0, jailCards: 0 },
        },
      ]
    })
    expect(decide(lopsided)).toEqual({ type: 'REJECT_TRADE', tradeId: 2 })
  })

  it('answers offers even when it is not its turn', () => {
    const s = game((x) => {
      x.current = 1
      x.trades = [
        {
          id: 3,
          from: 1,
          to: 0,
          give: { spaces: [], cash: 0, jailCards: 0 },
          get: { spaces: [], cash: 500, jailCards: 0 },
        },
      ]
    })
    expect(decide(s)).toEqual({ type: 'REJECT_TRADE', tradeId: 3 })
  })

  it("proposes a deal for its set's missing piece, but not to excluded partners", () => {
    const [m1, m2, m3] = GROUPS[3]!
    const s = game((x) => {
      own(x, 0, [m1!, m2!])
      own(x, 1, [m3!])
      own(x, 0, [GROUPS[1]![0]!]) // something the partner might want
    })
    expect(decide(s)).toMatchObject({ type: 'PROPOSE_TRADE', to: 'b', get: { spaces: [m3] } })
    const shy = createHeuristicBot(BALANCED, { canTradeWith: (id) => id !== 'b' })
    expect(decide(s, 'a', shy)).toEqual({ type: 'END_TURN' })
  })

  it('leaves jail early but sits tight once the board is dangerous', () => {
    const early = game((x) => {
      x.phase = 'preRoll'
      x.players[0]!.inJail = true
      x.players[0]!.position = 10
    })
    expect(decide(early)).toEqual({ type: 'PAY_JAIL_FINE' })
    const late = game((x) => {
      x.phase = 'preRoll'
      x.players[0]!.inJail = true
      x.players[0]!.position = 10
      for (let i = 0; i < x.owner.length; i++) if (x.owner[i] === -1) x.owner[i] = 1
      own(x, 1, GROUPS[4]!)
      for (const i of GROUPS[4]!) x.houses[i] = 3
    })
    expect(decide(late)).toEqual({ type: 'ROLL' })
  })

  it('raises money when in debt instead of going bankrupt', () => {
    const s = game((x) => {
      own(x, 0, [39])
      x.players[0]!.cash = 10
      x.debts = [{ debtor: 0, creditor: 1, amount: 100, reason: 'rent' }]
    })
    expect(decide(s)).toEqual({ type: 'MORTGAGE', space: 39 })
  })

  it('bids for a space it values and passes once the price is too high', () => {
    const auction = (highBid: number) =>
      game((x) => {
        own(x, 0, GROUPS[3]!.slice(0, 2))
        x.pending = {
          kind: 'auction',
          space: GROUPS[3]![2]!,
          bidders: [0, 1, 2],
          current: 0,
          highBid,
          highBidder: highBid ? 1 : -1,
        }
      })
    expect(decide(auction(0))).toMatchObject({ type: 'BID' })
    expect(decide(auction(1400))).toEqual({ type: 'PASS_BID' })
  })

  it('values a complete set above its parts', () => {
    const partial = game((x) => own(x, 0, GROUPS[3]!.slice(0, 2)))
    const full = game((x) => own(x, 0, GROUPS[3]!))
    const price = 200
    expect(seatValue(full, 0, BALANCED) - seatValue(partial, 0, BALANCED)).toBeGreaterThan(price * 2)
  })
})

describe('heuristic bot with the speed die', () => {
  it('takes the bus to a lot it wants instead of paying rent', () => {
    const s = game((d) => {
      d.phase = 'preRoll'
      own(d, 1, [GROUPS[0]![1]!]) // space 3 charges rent
      d.pending = { kind: 'move', reason: 'bus', options: [3, 1], diceTotal: 3 }
    })
    expect(decide(s)).toEqual({ type: 'CHOOSE_MOVE', space: 1 })
  })

  it('plays whole games with it', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const r = playMatch({
        bots: [createHeuristicBot(), createHeuristicBot(), randomBot],
        config: { ...PRESETS.turbo, speedDie: true },
        seed,
      })
      expect(r.finished, `seed ${seed}`).toBe(true)
      expect(r.rejected).toBe(0)
      expect(r.violations).toEqual([])
    }
  }, 60_000)
})

describe('heuristic bot in full games', () => {
  it('beats random bots decisively and never makes an illegal move', () => {
    let wins = 0
    for (let g = 0; g < 40; g++) {
      const hero = g % 4
      const bots = [0, 1, 2, 3].map((i) => (i === hero ? createHeuristicBot() : randomBot))
      const r = playMatch({ config: PRESETS.standard, seed: g + 1, bots })
      expect(r.rejected).toBe(0)
      expect(r.violations).toEqual([])
      if (r.winner === hero) wins++
    }
    expect(wins).toBeGreaterThanOrEqual(36)
  })

  it('heuristic tables trade, build sets, and finish (classic has no round limit)', () => {
    let trades = 0
    let sets = 0
    for (let g = 0; g < 10; g++) {
      const r = playMatch({
        config: PRESETS.classic,
        seed: 100 + g,
        bots: [0, 1, 2, 3].map(() => createHeuristicBot()),
      })
      expect(r.finished).toBe(true)
      expect(r.rejected).toBe(0)
      expect(r.violations).toEqual([])
      trades += r.trades
      sets += r.sets
    }
    expect(trades).toBeGreaterThan(0)
    expect(sets).toBeGreaterThan(10)
  })
})
