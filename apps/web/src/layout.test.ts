import { describe, expect, it } from 'vitest'
import { insetsFrom } from './layout.ts'

describe('board insets from the shell chrome', () => {
  const canvas = { top: 0, bottom: 800 }

  it('take the lowest top bar and the highest bottom bar', () => {
    const tops = [
      { top: 0, bottom: 64 },
      { top: 70, bottom: 110 },
    ]
    const bottoms = [
      { top: 700, bottom: 780 },
      { top: 720, bottom: 800 },
    ]
    expect(insetsFrom(canvas, tops, bottoms)).toEqual({ top: 110, right: 0, bottom: 100, left: 0 })
  })

  it('measure relative to the canvas', () => {
    expect(
      insetsFrom({ top: 100, bottom: 900 }, [{ top: 100, bottom: 160 }], [{ top: 850, bottom: 900 }]),
    ).toEqual({ top: 60, right: 0, bottom: 50, left: 0 })
  })

  it('ignore empty or off-screen bars and clamp to the canvas', () => {
    const tops = [
      { top: 0, bottom: 0 },
      { top: -200, bottom: -100 },
    ]
    expect(insetsFrom(canvas, tops, [{ top: -50, bottom: 900 }])).toEqual({
      top: 0,
      right: 0,
      bottom: 800,
      left: 0,
    })
  })
})
