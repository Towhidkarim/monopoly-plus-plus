import { describe, expect, it } from 'vitest'
import { confirmStep } from './confirmPress.ts'

describe('confirmStep', () => {
  it('arms on the first press without confirming', () => {
    expect(confirmStep(false, 'press')).toEqual({ armed: true, confirm: false })
  })
  it('confirms and disarms on the second press', () => {
    expect(confirmStep(true, 'press')).toEqual({ armed: false, confirm: true })
  })
  it('disarms on timeout, Esc, blur or leave', () => {
    expect(confirmStep(true, 'disarm')).toEqual({ armed: false, confirm: false })
    expect(confirmStep(false, 'disarm')).toEqual({ armed: false, confirm: false })
  })
  it('never arms or confirms when the action is not legal', () => {
    expect(confirmStep(false, 'press', false)).toEqual({ armed: false, confirm: false })
    expect(confirmStep(true, 'press', false)).toEqual({ armed: false, confirm: false })
  })
  it('needs a fresh arming after a confirm', () => {
    const first = confirmStep(false, 'press')
    const second = confirmStep(first.armed, 'press')
    expect(confirmStep(second.armed, 'press').confirm).toBe(false)
  })
})
