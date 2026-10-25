import { describe, expect, it } from 'vitest'
import { nextTabIndex } from './useDialogFocus.ts'

describe('nextTabIndex', () => {
  it('wraps forward and back', () => {
    expect(nextTabIndex(0, 3, false)).toBe(1)
    expect(nextTabIndex(2, 3, false)).toBe(0)
    expect(nextTabIndex(0, 3, true)).toBe(2)
    expect(nextTabIndex(2, 3, true)).toBe(1)
  })
  it('enters from outside at the matching end', () => {
    expect(nextTabIndex(-1, 4, false)).toBe(0)
    expect(nextTabIndex(-1, 4, true)).toBe(3)
  })
  it('has nowhere to go with no stops', () => {
    expect(nextTabIndex(-1, 0, false)).toBe(-1)
  })
})
