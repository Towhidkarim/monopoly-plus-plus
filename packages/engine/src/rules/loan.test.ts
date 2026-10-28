import { describe, expect, it } from 'vitest'
import type { GameConfig } from '../config.ts'
import { netWorth } from '../core.ts'
import type { GameState } from '../state.ts'
import { act, edit, newGame, reject, rigDice, types } from '../testkit.ts'
import { loanCap } from './loan.ts'

/** Second Wind (DECISIONS.md D63): a bank loan instead of mortgaging, repaid from income. */
const on = { secondWind: true }

/**
 * `a` (₵300, three reds with three houses each: ₵2030 of collateral) lands on b's Grand
 * Terrace hotel and owes ₵2000 rent, ₵1700 more than they hold.
 */
function hotelHit(config: Partial<GameConfig> = on): GameState {
  const s = edit(rigDice(newGame(2, config), [1, 2]), (d) => {
    d.players[0]!.position = 36
    d.players[0]!.cash = 300
    for (const i of [37, 39]) {
      d.owner[i] = 1
      d.houses[i] = 5
    }
    for (const i of [21, 23, 24]) {
      d.owner[i] = 0
      d.houses[i] = 3
    }
    d.bankHouses -= 9
    d.bankHotels -= 2
  })
  return act(s, 'a', { type: 'ROLL' }).s
}

/** `a` two spaces before Start with an open loan, about to pass it. */
function owing(loan: number, cash = 0): GameState {
  return edit(rigDice(newGame(2, on), [1, 2]), (d) => {
    d.players[0]!.position = 38
    d.players[0]!.cash = cash
    d.players[0]!.loan = loan
    d.players[0]!.loans = 1
  })
}

describe('Second Wind loans', () => {
  it('is off by default', () => {
    expect(reject(hotelHit({}), 'a', { type: 'TAKE_LOAN' })).toMatch(/off/)
  })

  it('pays the creditor in full and keeps the city standing', () => {
    const s = hotelHit()
    expect(s.debts).toHaveLength(1)
    const { s: after, events } = act(s, 'a', { type: 'TAKE_LOAN' })
    expect(types(events)).toEqual([
      'CASH_CHANGED',
      'LOAN_TAKEN',
      'CASH_CHANGED',
      'CASH_CHANGED',
      'DEBT_SETTLED',
    ])
    expect(events[1]).toEqual({ type: 'LOAN_TAKEN', playerId: 'a', amount: 1700, owed: 1870, rate: 0.1 })
    expect(after.debts).toEqual([])
    expect(after.players[0]!.cash).toBe(0)
    expect(after.players[1]!.cash).toBe(1500 + 2000)
    expect(after.players[0]!.loan).toBe(1870)
    expect([21, 23, 24].map((i) => after.houses[i])).toEqual([3, 3, 3])
  })

  it('is offered only to the player in debt, and only once at a time', () => {
    const s = hotelHit()
    expect(reject(s, 'b', { type: 'TAKE_LOAN' })).toMatch(/cannot pay/)
    expect(reject(newGame(2, on), 'a', { type: 'TAKE_LOAN' })).toMatch(/cannot pay/)
    expect(
      reject(
        edit(s, (d) => (d.players[0]!.loan = 50)),
        'a',
        { type: 'TAKE_LOAN' },
      ),
    ).toMatch(/repay/)
  })

  it('lends no more than the city is worth', () => {
    const s = hotelHit()
    expect(loanCap(s, 0)).toBe(2030)
    const poor = edit(s, (d) => {
      d.houses[21] = 0
      d.bankHouses += 3
    })
    expect(loanCap(poor, 0)).toBe(1580)
    expect(reject(poor, 'a', { type: 'TAKE_LOAN' })).toMatch(/will not lend/)
  })

  it('takes half of each income until the loan is repaid', () => {
    const { s, events } = act(owing(150), 'a', { type: 'ROLL' })
    const cash = events.flatMap((e) => (e.type === 'CASH_CHANGED' ? [[e.reason, e.delta]] : []))
    expect(cash).toEqual([
      ['salary', 200],
      ['loanRepay', -100],
    ])
    expect(s.players[0]!.loan).toBe(50)
    expect(s.players[0]!.cash).toBe(100)
  })

  it('takes only what is left and celebrates the last payment', () => {
    const { s, events } = act(owing(30), 'a', { type: 'ROLL' })
    expect(events.filter((e) => e.type === 'CASH_CHANGED').map((e) => e.delta)).toEqual([200, -30])
    expect(types(events)).toContain('LOAN_REPAID')
    expect(s.players[0]!.loan).toBe(0)
  })

  it('does not take from raised cash such as mortgages', () => {
    const s = edit(owing(500), (d) => (d.owner[1] = 0))
    const { s: after } = act(s, 'a', { type: 'MORTGAGE', space: 1 })
    expect(after.players[0]!.cash).toBe(30)
    expect(after.players[0]!.loan).toBe(500)
  })

  it('can be paid off early with cash', () => {
    const { s, events } = act(owing(500, 320), 'a', { type: 'REPAY_LOAN' })
    expect(s.players[0]!.cash).toBe(0)
    expect(s.players[0]!.loan).toBe(180)
    expect(types(events)).not.toContain('LOAN_REPAID')
    expect(reject(owing(0, 320), 'a', { type: 'REPAY_LOAN' })).toMatch(/no loan/)
  })

  it('charges more interest on each later loan', () => {
    const second = edit(hotelHit(), (d) => (d.players[0]!.loans = 1))
    expect(act(second, 'a', { type: 'TAKE_LOAN' }).s.players[0]!.loan).toBe(2130) // 1700 + 25%
    const later = edit(hotelHit(), (d) => (d.players[0]!.loans = 5))
    expect(act(later, 'a', { type: 'TAKE_LOAN' }).s.players[0]!.loan).toBe(2550) // 1700 + 50%
  })

  it('leaves building allowed while a loan is open', () => {
    const s = act(hotelHit(), 'a', { type: 'TAKE_LOAN' }).s
    const rich = edit(s, (d) => (d.players[0]!.cash = 500))
    expect(act(rich, 'a', { type: 'BUILD', space: 21 }).s.houses[21]).toBe(4)
  })

  it('counts against net worth and is written off on bankruptcy', () => {
    const s = act(hotelHit(), 'a', { type: 'TAKE_LOAN' }).s
    expect(netWorth(s, 0)).toBe(2030 - 1870)
    const broke = edit(s, (d) => {
      d.debts = [{ debtor: 0, creditor: -1, amount: 5000, reason: 'tax' }]
    })
    expect(act(broke, 'a', { type: 'DECLARE_BANKRUPTCY' }).s.players[0]!.loan).toBe(0)
  })
})
