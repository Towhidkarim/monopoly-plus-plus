import { describe, expect, it } from 'vitest'
import type { Lot } from '../art/buildings.ts'
import { BOARD } from '../geometry/ring.ts'
import { BALLAST, CENTER, planCity, type CityPlan } from './cityPlan.ts'

const SEEDS = [1, 2, 3, 7, 42, 1234, 99999, 123456]

const overlap = (a: Lot, b: Lot, gap = 0) =>
  a.col0 < b.col1 + gap && b.col0 < a.col1 + gap && a.row0 < b.row1 + gap && b.row0 < a.row1 + gap

/** Shortest distance from a rectangle to the loop's center line (sampled, plus loop vertices inside). */
function loopDistance(plan: CityPlan, r: Lot): number {
  let best = Infinity
  const pts = plan.loop
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % pts.length]!
    for (let k = 0; k <= 10; k++) {
      const col = a.col + ((b.col - a.col) * k) / 10
      const row = a.row + ((b.row - a.row) * k) / 10
      const dc = Math.max(r.col0 - col, 0, col - r.col1)
      const dr = Math.max(r.row0 - row, 0, row - r.row1)
      best = Math.min(best, Math.hypot(dc, dr))
    }
  }
  return best
}

describe('planCity', () => {
  it('is deterministic: the same seed gives the same plan', () => {
    // JSON drops the zoning callbacks, which differ by reference between calls.
    for (const seed of SEEDS) expect(JSON.stringify(planCity(seed))).toBe(JSON.stringify(planCity(seed)))
  })

  it('different seeds give different cities', () => {
    const keys = SEEDS.map((s) => {
      const p = planCity(s)
      return JSON.stringify([p.district.layout.blocks.map((b) => [b.kind, b.landmark]), p.belt, p.train])
    })
    expect(new Set(keys).size).toBe(SEEDS.length)
  })

  it('lays out a 2 x 2 grid of big blocks that never overlap each other or a street', () => {
    for (const seed of SEEDS) {
      const { layout } = planCity(seed).district
      expect(layout.blocks).toHaveLength(4)
      for (const [i, a] of layout.blocks.entries()) {
        for (const b of layout.blocks.slice(i + 1))
          expect(overlap(a.area, b.area), `seed ${seed}`).toBe(false)
        for (const s of layout.colStreets)
          expect(a.area.col0 >= s.hi - 1e-9 || a.area.col1 <= s.lo + 1e-9).toBe(true)
        for (const s of layout.rowStreets)
          expect(a.area.row0 >= s.hi - 1e-9 || a.area.row1 <= s.lo + 1e-9).toBe(true)
      }
    }
  })

  it('has the two cross roads through the centre as the only streets', () => {
    for (const seed of SEEDS) {
      const { layout } = planCity(seed).district
      for (const streets of [layout.colStreets, layout.rowStreets]) {
        const widths = streets.map((st) => st.hi - st.lo)
        expect((streets[1]!.lo + streets[1]!.hi) / 2).toBeCloseTo(CENTER, 6)
        expect(widths[1]!).toBeGreaterThanOrEqual(0.4)
        expect(widths[0]).toBe(0)
        expect(widths[2]).toBe(0)
      }
      for (const b of layout.blocks) expect(b.area.col1 - b.area.col0).toBeGreaterThan(2.5)
    }
  })

  it('keeps the rail loop clear of the plinth, belt items and stations', () => {
    for (const seed of SEEDS) {
      const plan = planCity(seed)
      expect(loopDistance(plan, plan.plinth), `seed ${seed} plinth`).toBeGreaterThan(BALLAST)
      for (const item of plan.belt)
        expect(loopDistance(plan, item.lot), `seed ${seed} belt`).toBeGreaterThan(BALLAST)
      for (const s of plan.stations) {
        expect(loopDistance(plan, s.platform), `seed ${seed} platform`).toBeGreaterThanOrEqual(BALLAST - 1e-9)
        expect(loopDistance(plan, s.hall)).toBeGreaterThan(BALLAST)
      }
    }
  })

  it('keeps belt items inside the ring and apart from each other and the stations', () => {
    for (const seed of SEEDS) {
      const plan = planCity(seed)
      const lots = [...plan.belt.map((b) => b.lot), ...plan.stations.flatMap((s) => [s.platform, s.hall])]
      for (const [i, a] of lots.entries()) {
        expect(a.col0 > 1.6 && a.row0 > 1.6 && a.col1 < BOARD - 1.6 && a.row1 < BOARD - 1.6).toBe(true)
        for (const b of lots.slice(i + 1)) expect(overlap(a, b), `seed ${seed}`).toBe(false)
      }
    }
  })

  it('has four stations, one per side, serving the railroad tiles', () => {
    const { stations, train } = planCity(3)
    expect(stations.map((s) => s.tile)).toEqual([5, 15, 25, 35])
    expect(new Set(stations.map((s) => s.side)).size).toBe(4)
    expect(train.station).toBeGreaterThanOrEqual(0)
    expect(train.station).toBeLessThan(4)
  })

  it('puts the landmark in the downtown front quadrant and keeps the back quadrant low', () => {
    for (const seed of SEEDS) {
      const plan = planCity(seed)
      const { blocks } = plan.district.layout
      const lm = blocks.filter((b) => b.landmark)
      expect(lm).toHaveLength(1)
      expect(lm[0]).toMatchObject({ i: 1, j: 1, kind: 'downtown' })
      const a = lm[0]!.area
      expect(Math.hypot(a.col0 - CENTER, a.row0 - CENTER)).toBeLessThan(0.5)
      expect(blocks.find((b) => b.i === 0 && b.j === 0)!.kind).toBe('midtown')
      const extra = (i: number, j: number) => plan.district.options.blockExtra!(i, j)
      expect(extra(0, 0).maxFloors).toBeLessThanOrEqual(3)
      for (const [i, j] of [
        [1, 1],
        [1, 0],
        [0, 1],
      ] as const) {
        expect(extra(i, j).maxFloors).toBeUndefined()
        expect(extra(i, j).lots).toBe(3)
        expect(extra(i, j).towers).toBeLessThanOrEqual(3)
      }
    }
  })
})
