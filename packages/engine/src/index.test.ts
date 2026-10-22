import { describe, expect, it } from 'vitest'
import { BOARD_SIZE, wrapSpace } from './index.ts'

describe('wrapSpace', () => {
  it('keeps indices on the ring', () => {
    expect(wrapSpace(0)).toBe(0)
    expect(wrapSpace(BOARD_SIZE)).toBe(0)
    expect(wrapSpace(43)).toBe(3)
    expect(wrapSpace(-1)).toBe(39)
  })
})
