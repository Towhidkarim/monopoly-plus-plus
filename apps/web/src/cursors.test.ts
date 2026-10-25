import { describe, expect, it } from 'vitest'
import { SYSTEM_CURSORS, cursorSet, cursorValue } from './cursors.ts'

describe('cursor values', () => {
  it('end with the system keyword and carry a hotspot', () => {
    for (const [name, keyword] of Object.entries(SYSTEM_CURSORS)) {
      const v = cursorValue(name as keyof typeof SYSTEM_CURSORS)
      expect(v.endsWith(`, ${keyword}`)).toBe(true)
      expect(v).toMatch(/ \d+ \d+, /)
      expect(v).toContain('image-set(')
    }
  })
  it('falls back to a plain url when image-set is unsupported', () => {
    expect(cursorValue('pointer', false)).not.toContain('image-set(')
  })
  it('is plain keywords for the system choice', () => {
    expect(cursorSet('system')).toEqual(SYSTEM_CURSORS)
  })
})
