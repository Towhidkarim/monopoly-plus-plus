import { projectPoly } from '../geometry/project.ts'
import { cosmeticRng } from '../view/draw.ts'
import { pick, type Lot } from './buildings.ts'
import { drawBlock, type BlockKind } from './block.ts'
import { flat, type Paint } from './paint.ts'
import type { ArtStyle } from './style.ts'
import { orientedBox } from './train.ts'

/**
 * A district: a grid of city blocks with streets around and between them, crosswalks at the
 * intersections and parked cars along the curbs. Blocks are zoned by distance from downtown
 * (towers in the middle, midtown around them, houses and parks at the edges). The board's city
 * (Milestone 6 step 3) is made of districts like this, cut by the two cross roads.
 */
export interface DistrictOptions {
  /** Blocks along each axis. */
  blocks: { cols: number; rows: number }
  /** Downtown point in board units. */
  downtown: { col: number; row: number }
  /** Place the landmark in the block nearest downtown. */
  landmark?: boolean
  /**
   * Draw each block and parked car into its own layer, keyed by depth (col + row of its center),
   * so moving vehicles can be sorted between them. Streets always go into `p`.
   */
  layer?: (key: number) => Paint
}

export const STREET = 0.3

export function drawDistrict(p: Paint, area: Lot, seed: number, o: DistrictOptions): void {
  const s = p.style
  const rng = cosmeticRng(seed)
  const { cols, rows } = o.blocks
  flat(p, area.col0, area.row0, area.col1, area.row1, area.z - 0.003, s.road)

  // Block rectangles inside the street grid (streets around every block).
  const bw = (area.col1 - area.col0 - STREET * (cols + 1)) / cols
  const bd = (area.row1 - area.row0 - STREET * (rows + 1)) / rows
  const blocks: { area: Lot; i: number; j: number }[] = []
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const col0 = area.col0 + STREET + i * (bw + STREET)
      const row0 = area.row0 + STREET + j * (bd + STREET)
      blocks.push({ area: { col0, row0, col1: col0 + bw, row1: row0 + bd, z: area.z }, i, j })
    }

  laneMarks(
    p,
    area,
    blocks.map((b) => b.area),
  )
  for (const b of blocks) crosswalks(p, b.area)

  // Zoning: rank blocks by distance from downtown.
  const span = Math.hypot(area.col1 - area.col0, area.row1 - area.row0)
  const kinds = new Map<(typeof blocks)[number], BlockKind>()
  const ranked = blocks.toSorted((a, b) => d(a.area, o.downtown) - d(b.area, o.downtown))
  for (const [k, b] of ranked.entries()) {
    const near = d(b.area, o.downtown) / span
    kinds.set(b, k === 0 ? 'downtown' : near < 0.26 ? 'midtown' : 'residential')
  }
  // One quiet park block when there are enough blocks (never downtown).
  if (blocks.length >= 4) {
    const far = ranked.slice(Math.ceil(ranked.length / 2))
    kinds.set(pick(rng, far.length ? far : ranked.slice(1)), 'park')
  }

  // Back to front: each block first draws the cars parked on the street just behind it.
  const layer = o.layer ?? (() => p)
  for (const b of blocks.toSorted((x, y) => x.i + x.j - (y.i + y.j))) {
    parkedCars(layer, s, b.area, rng, 'back')
    const a = b.area
    drawBlock(layer((a.col0 + a.col1 + a.row0 + a.row1) / 2), a, seed * 97 + b.i * 17 + b.j * 29, {
      kind: kinds.get(b)!,
      downtown: o.downtown,
      landmark: !!o.landmark && kinds.get(b) === 'downtown',
    })
  }
  // Cars on the outermost front streets go last.
  for (const b of blocks) {
    if (b.j === rows - 1 || b.i === cols - 1)
      parkedCars(layer, s, b.area, rng, 'front', b.j === rows - 1, b.i === cols - 1)
  }
}

const d = (l: Lot, q: { col: number; row: number }) =>
  Math.hypot((l.col0 + l.col1) / 2 - q.col, (l.row0 + l.row1) / 2 - q.row)

/** Dashed center lines along every street. */
function laneMarks(p: Paint, area: Lot, blocks: readonly Lot[]) {
  const s = p.style
  const z = area.z - 0.002
  const dash = (c0: number, r0: number, c1: number, r1: number) => flat(p, c0, r0, c1, r1, z, s.roadLine)
  const colLines = new Set<number>()
  const rowLines = new Set<number>()
  for (const b of blocks) {
    colLines.add(b.col0 - STREET / 2)
    colLines.add(b.col1 + STREET / 2)
    rowLines.add(b.row0 - STREET / 2)
    rowLines.add(b.row1 + STREET / 2)
  }
  for (const c of colLines)
    for (let r = area.row0 + 0.05; r < area.row1 - 0.12; r += 0.2) dash(c - 0.008, r, c + 0.008, r + 0.1)
  for (const r of rowLines)
    for (let c = area.col0 + 0.05; c < area.col1 - 0.12; c += 0.2) dash(c, r - 0.008, c + 0.1, r + 0.008)
}

/** Zebra crossings in front of each block's front corner. */
function crosswalks(p: Paint, b: Lot) {
  const s = p.style
  const z = b.z - 0.0015
  const zebra = (pts: (k: number) => { col: number; row: number }[]) => {
    for (let k = 0; k < 5; k++)
      p.g
        .poly(
          projectPoly(
            pts(k).map((q) => ({ ...q, z })),
            p.t,
          ),
        )
        .fill(s.roadLine)
  }
  // Across the +row street, just inside the block's +col corner.
  zebra((k) => {
    const c = b.col1 - 0.22 + k * 0.04
    return [
      { col: c, row: b.row1 + 0.025 },
      { col: c + 0.022, row: b.row1 + 0.025 },
      { col: c + 0.022, row: b.row1 + STREET - 0.025 },
      { col: c, row: b.row1 + STREET - 0.025 },
    ]
  })
  // Across the +col street, just inside the block's +row corner.
  zebra((k) => {
    const r = b.row1 - 0.22 + k * 0.04
    return [
      { col: b.col1 + 0.025, row: r },
      { col: b.col1 + STREET - 0.025, row: r },
      { col: b.col1 + STREET - 0.025, row: r + 0.022 },
      { col: b.col1 + 0.025, row: r + 0.022 },
    ]
  })
}

/** Cars parked along a block's back curbs (behind it) or front curbs. */
function parkedCars(
  layer: (key: number) => Paint,
  s: ArtStyle,
  b: Lot,
  rng: () => number,
  side: 'back' | 'front',
  rowEdge = true,
  colEdge = true,
) {
  const colors = [...s.accents, 0xf8fafc, 0x334155, 0x94a3b8]
  const off = 0.055
  const cars: { col: number; row: number; dir: { col: number; row: number } }[] = []
  const r = side === 'back' ? b.row0 - off : b.row1 + off
  const c = side === 'back' ? b.col0 - off : b.col1 + off
  if (side === 'back' || rowEdge)
    for (let v = b.col0 + 0.25; v < b.col1 - 0.45; v += 0.36)
      if (rng() < 0.2) cars.push({ col: v, row: r, dir: { col: 1, row: 0 } })
  if (side === 'back' || colEdge)
    for (let v = b.row0 + 0.25; v < b.row1 - 0.45; v += 0.36)
      if (rng() < 0.2) cars.push({ col: c, row: v, dir: { col: 0, row: 1 } })
  for (const car of cars.toSorted((x, y) => x.col + x.row - (y.col + y.row))) {
    const p = layer(car.col + car.row)
    orientedBox(p, car, car.dir, 0.17, 0.08, b.z, b.z + 0.045, pick(rng, colors))
    orientedBox(p, car, car.dir, 0.09, 0.07, b.z + 0.045, b.z + 0.075, 0xcfe3f5)
  }
}
