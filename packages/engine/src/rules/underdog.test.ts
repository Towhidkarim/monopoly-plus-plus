import { describe, expect, it } from 'vitest'
import type { GameConfig } from '../config.ts'
import { act, edit, newGame, rigDice } from '../testkit.ts'
import { underdogBonus } from './underdog.ts'

/** Underdog salary (DECISIONS.md D63): passing Start pays more the further you trail the leader. */
const on = { underdogSalary: true }

/** `a` sits two spaces before Start with the given cash; `b` has `leader` cash. */
function atStart(a: number, leader: number, config: Partial<GameConfig> = on) {
  return edit(rigDice(newGame(2, config), [1, 2]), (d) => {
    d.players[0]!.position = 38
    d.players[0]!.cash = a
    d.players[1]!.cash = leader
  })
}

const cashEvents = (s: ReturnType<typeof atStart>) =>
  act(s, 'a', { type: 'ROLL' }).events.flatMap((e) =>
    e.type === 'CASH_CHANGED' ? [{ reason: e.reason, delta: e.delta }] : [],
  )

describe('underdog salary', () => {
  it('is off by default', () => {
    expect(cashEvents(atStart(1200, 2000, {}))).toEqual([{ reason: 'salary', delta: 200 }])
  })

  it('pays the trailing player a bonus after the salary', () => {
    // 1200 of the leader's 2000 is a 40% gap: the bonus grows to the full 2x at a 2/3 gap,
    // so it is 0.4 / (2/3) x 2 = 1.2 salaries.
    expect(cashEvents(atStart(1200, 2000))).toEqual([
      { reason: 'salary', delta: 200 },
      { reason: 'underdog', delta: 240 },
    ])
  })

  it('caps the bonus at twice the salary by default', () => {
    expect(underdogBonus(atStart(100, 5000), 0)).toBe(400)
  })

  it('takes its cap from the config', () => {
    expect(underdogBonus(atStart(1200, 2000, { ...on, underdogMax: 0.5 }), 0)).toBe(60)
    expect(underdogBonus(atStart(100, 5000, { ...on, underdogMax: 0.5 }), 0)).toBe(100)
    expect(underdogBonus(atStart(100, 5000, { ...on, underdogMax: 4 }), 0)).toBe(800)
  })

  it('pays the leader nothing extra', () => {
    expect(cashEvents(atStart(2000, 1200))).toEqual([{ reason: 'salary', delta: 200 }])
  })

  it('measures net worth, not cash', () => {
    const s = edit(atStart(1200, 2000), (d) => (d.owner[39] = 0)) // a's lot is worth 400
    expect(underdogBonus(s, 0)).toBe(120) // a 20% gap: 0.2 / (2/3) x 2 = 0.6 salaries
  })

  it('ignores bankrupt players when finding the leader', () => {
    const s = edit(rigDice(newGame(3, on), [1, 2]), (d) => {
      d.players[0]!.cash = 1000
      d.players[1]!.cash = 1000
      d.players[2]!.cash = 9000
      d.players[2]!.bankrupt = true
    })
    expect(underdogBonus(s, 0)).toBe(0)
  })
})
