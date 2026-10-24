import { Container } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { Ambient } from './ambient.ts'
import { planCity } from './cityPlan.ts'

const VIEW = { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 }

function run(seed: number) {
  const plan = planCity(seed)
  const life = new Ambient(new Container({ sortableChildren: true }))
  life.build(plan)
  return { plan, life, step: (s: number) => life.update(s * 1000, VIEW) }
}

describe('Ambient', () => {
  it('builds 10 to 14 vehicles and two trains, deterministically per city', () => {
    for (const seed of [1, 2, 3, 42]) {
      const a = run(seed).life
      const b = run(seed).life
      expect(a.vehicles.length).toBeGreaterThanOrEqual(10)
      expect(a.vehicles.length).toBeLessThanOrEqual(14)
      expect(a.running).toHaveLength(2)
      expect(a.vehicles.map((v) => [v.kind, v.d])).toEqual(b.vehicles.map((v) => [v.kind, v.d]))
    }
  })

  it('stops each train at stations for 1.5 to 2.5 s and keeps a gap between trains', () => {
    const { life, step } = run(3)
    const [a, b] = life.running
    if (!a || !b) throw new Error('two trains expected')
    const total = a.path.total
    let longest = 0
    let dwell = 0
    let minGap = Infinity
    for (let i = 0; i < 120 * 60; i++) {
      step(1 / 60)
      if (a.dwell > 0 || a.v === 0) dwell += 1 / 60
      else {
        longest = Math.max(longest, dwell)
        dwell = 0
      }
      const free = (((b.head - 1.42 - a.head) % total) + total) % total
      const free2 = (((a.head - 1.42 - b.head) % total) + total) % total
      minGap = Math.min(minGap, Math.min(free, free2))
    }
    expect(longest).toBeGreaterThan(1.4)
    expect(longest).toBeLessThan(2.7)
    expect(minGap).toBeGreaterThan(0.3)
  })

  it('does nothing while off and keeps pieces hidden', () => {
    const { life, step } = run(5)
    const before = life.vehicles.map((v) => v.d)
    life.setOn(false)
    step(1)
    expect(life.vehicles.map((v) => v.d)).toEqual(before)
    expect(life.vehicles.every((v) => !v.g.visible)).toBe(true)
    life.setOn(true)
    expect(life.vehicles.every((v) => v.g.visible)).toBe(true)
  })
})
