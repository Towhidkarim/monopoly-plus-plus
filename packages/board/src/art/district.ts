import { projectPoly } from '../geometry/project.ts'
import { cosmeticRng } from '../view/draw.ts'
import { pick, type Lot } from './buildings.ts'
import { drawBlock, type BlockKind, type BlockOptions } from './block.ts'
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
  /** Place the landmark in the block nearest downtown (or at `landmarkAt`). */
  landmark?: boolean
  /** Block (grid position) that gets the landmark; it is drawn as downtown. */
  landmarkAt?: { i: number; j: number }
  /** Street width; the default is `STREET`. */
  street?: number
  /** Width of the middle street on each axis (needs an even block count), e.g. the board's cross roads. */
  cross?: number
  /** Width of the outer streets around the district (default: `street`; 0 for none). */
  edge?: number
  /** Extra block options per block (lots per side, towers, floor cap). */
  blockExtra?: (i: number, j: number) => Pick<BlockOptions, 'lots' | 'towers' | 'maxFloors'>
  /** Overrides the default zoning by distance from downtown. */
  zone?: (i: number, j: number) => BlockKind
  /**
   * Draw each block and parked car into its own layer, keyed by depth (col + row of its center),
   * so moving vehicles can be sorted between them. Streets always go into `p`.
   */
  layer?: (key: number) => Paint
}

export const STREET = 0.3

/** A street's extent along one axis. */
export interface Street {
  lo: number
  hi: number
}

export interface DistrictBlock {
  area: Lot
  /** Grid position: i along col, j along row. */
  i: number
  j: number
  kind: BlockKind
  landmark: boolean
}

export interface DistrictLayout {
  /** Streets that run along row (their extent is in col), one more than the block columns. */
  colStreets: Street[]
  /** Streets that run along col (extent in row). */
  rowStreets: Street[]
  blocks: DistrictBlock[]
}

/**
 * Street grid, block rectangles and zoning as plain data (no drawing, no randomness except the one
 * seeded park pick of the default zoning), so layouts can be planned and tested without Pixi.
 */
export function districtLayout(area: Lot, seed: number, o: DistrictOptions): DistrictLayout {
  const rng = cosmeticRng(seed)
  const { cols, rows } = o.blocks
  const street = o.street ?? STREET
  const width = (k: number, n: number) =>
    o.edge !== undefined && (k === 0 || k === n)
      ? o.edge
      : o.cross !== undefined && n % 2 === 0 && k === n / 2
        ? o.cross
        : street
  const streets = (lo: number, hi: number, n: number) => {
    const widths = Array.from({ length: n + 1 }, (_, k) => width(k, n))
    const block = (hi - lo - widths.reduce((a, b) => a + b, 0)) / n
    const out: Street[] = []
    let at = lo
    for (let k = 0; k <= n; k++) {
      out.push({ lo: at, hi: at + widths[k]! })
      at += widths[k]! + block
    }
    return out
  }
  const colStreets = streets(area.col0, area.col1, cols)
  const rowStreets = streets(area.row0, area.row1, rows)

  const cells: Omit<DistrictBlock, 'kind' | 'landmark'>[] = []
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++)
      cells.push({
        area: {
          col0: colStreets[i]!.hi,
          row0: rowStreets[j]!.hi,
          col1: colStreets[i + 1]!.lo,
          row1: rowStreets[j + 1]!.lo,
          z: area.z,
        },
        i,
        j,
      })

  // Default zoning: rank blocks by distance from downtown.
  const span = Math.hypot(area.col1 - area.col0, area.row1 - area.row0)
  const ranked = cells.toSorted((a, b) => d(a.area, o.downtown) - d(b.area, o.downtown))
  const kinds = new Map<(typeof cells)[number], BlockKind>()
  for (const [k, b] of ranked.entries()) {
    const near = d(b.area, o.downtown) / span
    kinds.set(b, o.zone ? o.zone(b.i, b.j) : k === 0 ? 'downtown' : near < 0.26 ? 'midtown' : 'residential')
  }
  // One quiet park block when there are enough blocks (never downtown).
  if (!o.zone && cells.length >= 4) {
    const far = ranked.slice(Math.ceil(ranked.length / 2))
    kinds.set(pick(rng, far.length ? far : ranked.slice(1)), 'park')
  }
  const lm = o.landmarkAt ?? (o.landmark ? ranked[0] : undefined)
  return {
    colStreets,
    rowStreets,
    blocks: cells.map((b) => {
      const isLm = !!lm && lm.i === b.i && lm.j === b.j
      return { ...b, kind: isLm ? 'downtown' : kinds.get(b)!, landmark: isLm }
    }),
  }
}

export function drawDistrict(p: Paint, area: Lot, seed: number, o: DistrictOptions): void {
  const s = p.style
  const rng = cosmeticRng(seed)
  const { cols, rows } = o.blocks
  flat(p, area.col0, area.row0, area.col1, area.row1, area.z - 0.003, s.road)

  const layout = districtLayout(area, seed, o)
  const { blocks } = layout
  laneMarks(p, area, layout)
  for (const b of blocks) crosswalks(p, b.area, layout.rowStreets[b.j + 1]!, layout.colStreets[b.i + 1]!)

  // Back to front: each block first draws the cars parked on the street just behind it.
  const layer = o.layer ?? (() => p)
  for (const b of blocks.toSorted((x, y) => x.i + x.j - (y.i + y.j))) {
    parkedCars(layer, s, b.area, rng, 'back', wide(layout.rowStreets[b.j]!), wide(layout.colStreets[b.i]!))
    const a = b.area
    drawBlock(layer((a.col0 + a.col1 + a.row0 + a.row1) / 2), a, seed * 97 + b.i * 17 + b.j * 29, {
      kind: b.kind,
      downtown: o.downtown,
      landmark: b.landmark,
      ...o.blockExtra?.(b.i, b.j),
    })
  }
  // Cars on the outermost front streets go last.
  for (const b of blocks) {
    if (b.j === rows - 1 || b.i === cols - 1)
      parkedCars(
        layer,
        s,
        b.area,
        rng,
        'front',
        b.j === rows - 1 && wide(layout.rowStreets[rows]!),
        b.i === cols - 1 && wide(layout.colStreets[cols]!),
      )
  }
}

const d = (l: Lot, q: { col: number; row: number }) =>
  Math.hypot((l.col0 + l.col1) / 2 - q.col, (l.row0 + l.row1) / 2 - q.row)

/** Streets worth marking and parking on (an outer street of width 0 is just the district edge). */
const wide = (s: Street) => s.hi - s.lo >= 0.2

/** Dashed center lines along every street. */
function laneMarks(p: Paint, area: Lot, layout: DistrictLayout) {
  const s = p.style
  const z = area.z - 0.002
  const dash = (c0: number, r0: number, c1: number, r1: number) => flat(p, c0, r0, c1, r1, z, s.roadLine)
  for (const { lo, hi } of layout.colStreets.filter(wide)) {
    const c = (lo + hi) / 2
    for (let r = area.row0 + 0.05; r < area.row1 - 0.12; r += 0.2) dash(c - 0.008, r, c + 0.008, r + 0.1)
  }
  for (const { lo, hi } of layout.rowStreets.filter(wide)) {
    const r = (lo + hi) / 2
    for (let c = area.col0 + 0.05; c < area.col1 - 0.12; c += 0.2) dash(c, r - 0.008, c + 0.1, r + 0.008)
  }
}

/** Zebra crossings in front of each block's front corner. */
function crosswalks(p: Paint, b: Lot, rowStreet: Street, colStreet: Street) {
  const rowW = rowStreet.hi - rowStreet.lo
  const colW = colStreet.hi - colStreet.lo
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
  if (wide(rowStreet))
    zebra((k) => {
      const c = b.col1 - 0.22 + k * 0.04
      return [
        { col: c, row: b.row1 + 0.025 },
        { col: c + 0.022, row: b.row1 + 0.025 },
        { col: c + 0.022, row: b.row1 + rowW - 0.025 },
        { col: c, row: b.row1 + rowW - 0.025 },
      ]
    })
  // Across the +col street, just inside the block's +row corner.
  if (wide(colStreet))
    zebra((k) => {
      const r = b.row1 - 0.22 + k * 0.04
      return [
        { col: b.col1 + 0.025, row: r },
        { col: b.col1 + colW - 0.025, row: r },
        { col: b.col1 + colW - 0.025, row: r + 0.022 },
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
  if (rowEdge)
    for (let v = b.col0 + 0.25; v < b.col1 - 0.45; v += 0.36)
      if (rng() < 0.2) cars.push({ col: v, row: r, dir: { col: 1, row: 0 } })
  if (colEdge)
    for (let v = b.row0 + 0.25; v < b.row1 - 0.45; v += 0.36)
      if (rng() < 0.2) cars.push({ col: c, row: v, dir: { col: 0, row: 1 } })
  for (const car of cars.toSorted((x, y) => x.col + x.row - (y.col + y.row))) {
    const p = layer(car.col + car.row)
    orientedBox(p, car, car.dir, 0.17, 0.08, b.z, b.z + 0.045, pick(rng, colors))
    orientedBox(p, car, car.dir, 0.09, 0.07, b.z + 0.045, b.z + 0.075, 0xcfe3f5)
  }
}
