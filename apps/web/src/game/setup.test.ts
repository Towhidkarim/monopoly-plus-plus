import { describe, expect, it } from 'vitest'
import { configOf, type GameSetup } from './setup.ts'

const setup = (twists: NonNullable<GameSetup['twists']>): GameSetup => ({
  preset: 'standard',
  seed: 1,
  seats: [],
  twists,
})

describe('configOf', () => {
  it('keeps the bonus cap a setup chose', () => {
    expect(configOf(setup({ underdogSalary: true, underdogMax: 3 })).underdogMax).toBe(3)
  })

  it('gives saves from before the cap existed the +50% they were played with', () => {
    expect(configOf(setup({ underdogSalary: true })).underdogMax).toBe(0.5)
  })

  it('adds no cap when Comeback is off', () => {
    expect(configOf(setup({ secondWind: true }))).not.toHaveProperty('underdogMax')
  })
})
