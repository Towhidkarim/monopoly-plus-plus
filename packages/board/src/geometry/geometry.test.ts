import { describe, expect, it } from 'vitest'
import { project, unproject } from './project.ts'
import {
  BOARD,
  DEPTH,
  lotRect,
  nearerNeighbor,
  ringFootprint,
  tileAt,
  tileCenter,
  tokenAnchor,
  type Footprint,
} from './ring.ts'

const inside = (fp: Footprint, col: number, row: number) =>
  col >= fp.col0 && col < fp.col1 && row >= fp.row0 && row < fp.row1

describe('ringFootprint', () => {
  it('places the corners at GO (bottom), Jail (left), Parking (top), Go-to-Jail (right)', () => {
    expect(ringFootprint(0)).toMatchObject({ col1: BOARD, row1: BOARD, corner: true })
    expect(ringFootprint(10)).toMatchObject({ col0: 0, row1: BOARD, corner: true })
    expect(ringFootprint(20)).toMatchObject({ col0: 0, row0: 0, corner: true })
    expect(ringFootprint(30)).toMatchObject({ col1: BOARD, row0: 0, corner: true })
  })

  it('makes consecutive tiles share an edge', () => {
    for (let i = 0; i < 40; i++) {
      const a = ringFootprint(i)
      const b = ringFootprint((i + 1) % 40)
      const touch =
        Math.abs(a.col0 - b.col1) < 1e-9 ||
        Math.abs(a.col1 - b.col0) < 1e-9 ||
        Math.abs(a.row0 - b.row1) < 1e-9 ||
        Math.abs(a.row1 - b.row0) < 1e-9
      expect(touch, `tiles ${i} and ${i + 1}`).toBe(true)
    }
  })

  it('covers the ring exactly once and leaves the city empty (sampled grid)', () => {
    const steps = 122
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < steps; j++) {
        const col = ((i + 0.5) / steps) * BOARD
        const row = ((j + 0.5) / steps) * BOARD
        const owners = []
        for (let k = 0; k < 40; k++) if (inside(ringFootprint(k), col, row)) owners.push(k)
        const inCity = col >= DEPTH && col < BOARD - DEPTH && row >= DEPTH && row < BOARD - DEPTH
        expect(owners.length).toBe(inCity ? 0 : 1)
        expect(tileAt(col, row)).toBe(inCity ? null : owners[0])
      }
    }
  })
})

describe('tileAt', () => {
  it('returns each tile for its own center', () => {
    for (let i = 0; i < 40; i++) {
      const c = tileCenter(i)
      expect(tileAt(c.col, c.row)).toBe(i)
    }
  })

  it('returns null off the board', () => {
    expect(tileAt(-0.1, 5)).toBeNull()
    expect(tileAt(5, BOARD + 0.1)).toBeNull()
  })
})

describe('tokenAnchor', () => {
  it('keeps every slot inside its tile and distinct', () => {
    for (let i = 0; i < 40; i++) {
      for (let count = 1; count <= 6; count++) {
        const pts = Array.from({ length: count }, (_, s) => tokenAnchor(i, s, count))
        for (const p of pts) expect(tileAt(p.col, p.row)).toBe(i)
        const keys = new Set(pts.map((p) => `${p.col.toFixed(3)},${p.row.toFixed(3)}`))
        expect(keys.size).toBe(count)
      }
    }
  })

  it('stands pieces outside the building lot, on the side nearer the camera', () => {
    const bad: string[] = []
    for (let i = 0; i < 40; i++) {
      const fp = ringFootprint(i)
      if (fp.corner) continue
      const lot = lotRect(fp)
      const lotDepth = (lot.col0 + lot.col1 + lot.row0 + lot.row1) / 2
      for (let count = 1; count <= 6; count++)
        for (let s = 0; s < count; s++) {
          const p = tokenAnchor(i, s, count)
          const inLot = p.col > lot.col0 && p.col < lot.col1 && p.row > lot.row0 && p.row < lot.row1
          // Larger col + row is nearer the camera, so the piece must be in front of the lot.
          if (inLot || p.col + p.row < lotDepth) bad.push(`${i}: ${count}/${s}`)
        }
    }
    expect(bad).toEqual([])
  })
})

describe('nearerNeighbor', () => {
  it('picks the neighbor along the edge that is nearer the camera, never a corner', () => {
    for (let i = 0; i < 40; i++) {
      const n = nearerNeighbor(i)
      if (n === null) continue
      const a = tileCenter(i)
      const b = tileCenter(n)
      expect(Math.abs(n - i), `tile ${i}`).toBe(1)
      expect(b.col + b.row, `tile ${i}`).toBeGreaterThan(a.col + a.row)
      expect(ringFootprint(n).corner).toBe(false)
    }
  })
})

describe('project / unproject', () => {
  it('round-trips for any morph value and height', () => {
    for (const t of [0, 0.25, 0.5, 0.9, 1]) {
      for (const z of [0, 0.3, 1.5]) {
        const p = { col: 3.7, row: 9.1, z }
        const s = project(p, t)
        const back = unproject(s.x, s.y, z, t)
        expect(back.col).toBeCloseTo(p.col, 9)
        expect(back.row).toBeCloseTo(p.row, 9)
      }
    }
  })

  it('puts GO at the bottom of the iso diamond', () => {
    const corners = [
      [0, 0],
      [BOARD, 0],
      [0, BOARD],
      [BOARD, BOARD],
    ].map(([col, row]) => project({ col: col!, row: row!, z: 0 }, 1))
    const go = corners[3]!
    for (const c of corners) expect(go.y).toBeGreaterThanOrEqual(c.y)
  })
})
