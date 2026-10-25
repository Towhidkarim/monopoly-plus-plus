import { describe, expect, it } from 'vitest'
import { SPACES } from '@skyline/engine'
import { describe as describeEvent, lowerYou } from './log.ts'

const name = (id: string) => (id === 'p1' ? 'You' : 'Nova')

describe('lowerYou', () => {
  it('keeps You as the first word and lowercases it elsewhere', () => {
    expect(lowerYou('You bought Mill Avenue')).toBe('You bought Mill Avenue')
    expect(lowerYou('Nova got Mill Avenue from You')).toBe('Nova got Mill Avenue from you')
    expect(lowerYou('Nova paid ₵50 rent to You')).toBe('Nova paid ₵50 rent to you')
  })

  it('keeps a capital after a colon (a new clause)', () => {
    expect(lowerYou('Round 3: You to play')).toBe('Round 3: You to play')
  })

  it('leaves words that only start with You alone', () => {
    expect(lowerYou('Nova thanked Young')).toBe('Nova thanked Young')
  })
})

describe('event lines', () => {
  it('writes transfers with a lowercase you', () => {
    const line = describeEvent({ type: 'PROPERTY_TRANSFERRED', space: 1, from: 'p1', to: 'p2' }, name)
    expect(line?.text).toBe(`Nova got ${SPACES[1]!.name} from you`)
  })
})
