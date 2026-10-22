import { describe, expect, it } from 'vitest'
import { BOARD_SIZE, GROUP_COUNT, SPACES, walkPath, wrapSpace } from './index.ts'

describe('wrapSpace', () => {
  it('keeps indices on the ring', () => {
    expect(wrapSpace(0)).toBe(0)
    expect(wrapSpace(BOARD_SIZE)).toBe(0)
    expect(wrapSpace(43)).toBe(3)
    expect(wrapSpace(-1)).toBe(39)
  })
})

describe('walkPath', () => {
  it('lists every entered space and wraps past GO', () => {
    expect(walkPath(37, 5)).toEqual([38, 39, 0, 1, 2])
    expect(walkPath(0, 0)).toEqual([])
  })
})

describe('SPACES', () => {
  it('has 40 spaces with corners in place', () => {
    expect(SPACES).toHaveLength(BOARD_SIZE)
    expect(SPACES.map((sp) => sp.kind).filter((_, i) => i % 10 === 0)).toEqual([
      'go',
      'jail',
      'parking',
      'goToJail',
    ])
  })

  it('has 8 groups of 2 or 3 properties and 4 railroads', () => {
    const sizes = Array.from({ length: GROUP_COUNT }, (_, g) => SPACES.filter((sp) => sp.group === g).length)
    expect(sizes).toEqual([2, 3, 3, 3, 3, 3, 3, 2])
    expect(SPACES.filter((sp) => sp.kind === 'railroad')).toHaveLength(4)
    for (const sp of SPACES) expect(sp.kind === 'property').toBe(sp.group >= 0)
  })
})
