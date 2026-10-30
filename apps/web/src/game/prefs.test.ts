import { afterEach, describe, expect, it, vi } from 'vitest'
import { lowPowerDevice } from './prefs.ts'

function device(coarse: boolean, memory: number | undefined, cores: number) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)' && coarse }))
  vi.stubGlobal('navigator', { deviceMemory: memory, hardwareConcurrency: cores })
}

describe('battery saver default', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is on for a touch device with little memory or few cores', () => {
    device(true, 2, 8)
    expect(lowPowerDevice()).toBe(true)
    device(true, undefined, 4)
    expect(lowPowerDevice()).toBe(true)
  })

  it('is off for a strong phone and for any mouse-first device', () => {
    device(true, 8, 8)
    expect(lowPowerDevice()).toBe(false)
    device(false, 2, 2)
    expect(lowPowerDevice()).toBe(false)
  })
})
