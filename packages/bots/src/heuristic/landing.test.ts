import { describe, expect, it } from 'vitest'
import { GO_TO_JAIL_INDEX, GROUPS, RAILROADS } from '@skyline/engine'
import { DICE, LANDING, LANDING_SHARE } from './landing.ts'

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

describe('landing odds', () => {
  it('is a probability distribution, and nobody ever rests on Go to Lockup', () => {
    expect(DICE.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
    expect(LANDING_SHARE.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9)
    expect(LANDING_SHARE[GO_TO_JAIL_INDEX]).toBe(0)
  })

  it('matches the known shape of the classic board', () => {
    // Jail is the most visited state; the cheapest property is among the least landed on.
    expect(LANDING_SHARE[40]).toBe(Math.max(...LANDING_SHARE))
    expect(LANDING[1]).toBeLessThan(mean(LANDING))
    // Orange (group 3, a short hop from jail) beats the dark blue pair and the first group.
    expect(mean(GROUPS[3]!.map((i) => LANDING[i]!))).toBeGreaterThan(mean(GROUPS[7]!.map((i) => LANDING[i]!)))
    expect(mean(GROUPS[3]!.map((i) => LANDING[i]!))).toBeGreaterThan(mean(GROUPS[0]!.map((i) => LANDING[i]!)))
    // Stations get extra traffic from the "nearest station" cards.
    expect(mean(RAILROADS.map((i) => LANDING[i]!))).toBeGreaterThan(mean(LANDING))
  })
})
