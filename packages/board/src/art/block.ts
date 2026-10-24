import { cosmeticRng } from '../view/draw.ts'
import { glassTower, house, landmark, office, park, pick, plaza, walkup, type Lot } from './buildings.ts'
import { box, flat, lamp, mix, tree, type Paint } from './paint.ts'

/**
 * One city block, laid out like a real one: a sidewalk around the edge, buildings fronting the
 * streets, open space inside the block (courtyards, gardens) reached by passages and front paths.
 * The block's character follows its distance from downtown. Streets are drawn by the district.
 */
export type BlockKind = 'downtown' | 'midtown' | 'residential' | 'park'

export interface BlockOptions {
  kind: BlockKind
  /** Where downtown is (the landmark or a plaza goes on the lot nearest to it). */
  downtown: { col: number; row: number }
  /** Put the city landmark here. */
  landmark?: boolean
}

/** Sidewalk ring between curb and lots. */
export const CURB = 0.09

/** A lot, its grid position, and which of its sides face a street. */
interface Cell {
  lot: Lot
  i: number
  j: number
  out: { c0: boolean; c1: boolean; r0: boolean; r1: boolean }
}

export function drawBlock(p: Paint, area: Lot, seed: number, o: BlockOptions): void {
  const s = p.style
  const rng = cosmeticRng(seed)
  flat(p, area.col0, area.row0, area.col1, area.row1, area.z, s.sidewalk)
  const inner = shrink(area, CURB)

  if (o.kind === 'park') {
    park(p, inner, rng, { fountain: rng() < 0.5 })
    curbProps(p, area, rng, 'front')
    return
  }

  // Trees along the streets behind the block first; the block then hides their bases.
  curbProps(p, area, rng, 'back')

  // Four lots with wide walkways between them. At least one lot stays open (plaza, garden), so
  // the city breathes: open ground is part of every block, not leftover space.
  const cells = grid(inner, 2, o.kind === 'downtown' ? 0.08 : 0.16)
  const nearest = cells.reduce((a, b) => (dist(b.lot, o.downtown) < dist(a.lot, o.downtown) ? b : a))
  const farthest = cells.reduce((a, b) => (dist(b.lot, o.downtown) > dist(a.lot, o.downtown) ? b : a))
  const open = new Set<Cell>()
  if (o.kind === 'downtown')
    open.add(
      o.landmark
        ? farthest
        : pick(
            rng,
            cells.filter((c) => c !== nearest),
          ),
    )
  else if (o.kind === 'midtown') {
    const spare = cells.filter((c) => c !== nearest)
    open.add(pick(rng, spare))
    if (rng() < 0.4) open.add(pick(rng, spare))
  } else if (rng() < 0.6) open.add(pick(rng, cells))

  for (const cell of cells.toSorted((a, b) => a.i + a.j - (b.i + b.j))) {
    const sub = cosmeticRng(seed * 31 + cell.i * 7 + cell.j * 13)
    if (open.has(cell)) {
      if (o.kind === 'residential') park(p, cell.lot, sub)
      else if (sub() < 0.5) plaza(p, cell.lot, sub)
      else park(p, cell.lot, sub)
      continue
    }
    switch (o.kind) {
      case 'downtown':
        if (o.landmark && cell === nearest) landmark(p, fronted(cell, 0.06, 0.1), sub)
        else if (sub() < 0.65)
          glassTower(p, fronted(cell, 0.08, 0.14), sub, { floors: 9 + Math.floor(sub() * 7) })
        else office(p, fronted(cell, 0.08, 0.14), sub, { floors: 6 + Math.floor(sub() * 4) })
        break
      case 'midtown':
        if (sub() < 0.45) walkup(p, fronted(cell, 0.08, 0.2), sub, { floors: 2 + Math.floor(sub() * 3) })
        else office(p, fronted(cell, 0.08, 0.2), sub, { floors: 3 + Math.floor(sub() * 2) })
        break
      case 'residential':
        homeLot(p, cell, sub)
        break
    }
  }
  curbProps(p, area, rng, 'front')
}

// ---- layout helpers ----------------------------------------------------------------

const shrink = (l: Lot, m: number): Lot => ({
  col0: l.col0 + m,
  row0: l.row0 + m,
  col1: l.col1 - m,
  row1: l.row1 - m,
  z: l.z,
})

const dist = (l: Lot, q: { col: number; row: number }) =>
  Math.hypot((l.col0 + l.col1) / 2 - q.col, (l.row0 + l.row1) / 2 - q.row)

/** n x n lots with paved walkways between them. */
function grid(inner: Lot, n: number, alley: number): Cell[] {
  const w = (inner.col1 - inner.col0 - alley * (n - 1)) / n
  const d = (inner.row1 - inner.row0 - alley * (n - 1)) / n
  const out: Cell[] = []
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const col0 = inner.col0 + i * (w + alley)
      const row0 = inner.row0 + j * (d + alley)
      out.push({
        lot: { col0, row0, col1: col0 + w, row1: row0 + d, z: inner.z },
        i,
        j,
        out: { c0: i === 0, c1: i === n - 1, r0: j === 0, r1: j === n - 1 },
      })
    }
  return out
}

/**
 * Footprint pushed to the street: a small margin on street-facing sides, a deeper one toward
 * the block interior (that space becomes yards and courtyards).
 */
function fronted(c: Cell, street: number, interior: number): Lot {
  const l = c.lot
  return {
    col0: l.col0 + (c.out.c0 ? street : interior),
    col1: l.col1 - (c.out.c1 ? street : interior),
    row0: l.row0 + (c.out.r0 ? street : interior),
    row1: l.row1 - (c.out.r1 ? street : interior),
    z: l.z,
  }
}

/** Trees and lamps along the curb: back edges (-col, -row) or front edges (+col, +row). */
function curbProps(p: Paint, a: Lot, rng: () => number, side: 'back' | 'front') {
  const e = CURB * 0.5
  const props: { col: number; row: number; lamp: boolean }[] = []
  const along = (from: number, to: number, put: (v: number) => { col: number; row: number }) => {
    let k = 0
    for (let v = from + 0.3; v < to - 0.2; v += 0.75) props.push({ ...put(v), lamp: k++ % 2 === 1 })
  }
  if (side === 'back') {
    along(a.col0, a.col1, (v) => ({ col: v, row: a.row0 + e }))
    along(a.row0, a.row1, (v) => ({ col: a.col0 + e, row: v }))
  } else {
    along(a.col0, a.col1, (v) => ({ col: v, row: a.row1 - e }))
    along(a.row0, a.row1, (v) => ({ col: a.col1 - e, row: v }))
  }
  for (const pr of props.toSorted((x, y) => x.col + x.row - (y.col + y.row))) {
    if (pr.lamp) lamp(p, pr.col, pr.row, a.z)
    else tree(p, pr.col, pr.row, a.z, 0.075 + rng() * 0.03, pick(rng, p.style.trees))
  }
}

/**
 * A house lot: the house sits back from the street behind a front yard, with a path from its
 * door to the sidewalk and a low hedge with a gap for the path.
 */
function homeLot(p: Paint, c: Cell, rng: () => number) {
  const s = p.style
  const l = c.lot
  const z = l.z + 0.003
  flat(p, l.col0, l.row0, l.col1, l.row1, z, s.park)
  const fp = fronted(c, 0.22, 0.12)
  const cm = (fp.col0 + fp.col1) / 2
  const rm = (fp.row0 + fp.row1) / 2
  // Front path toward the street the house faces.
  if (c.out.r1) flat(p, cm - 0.025, fp.row1, cm + 0.025, l.row1, z + 0.001, s.parkPath)
  else if (c.out.c1) flat(p, fp.col1, rm - 0.025, l.col1, rm + 0.025, z + 0.001, s.parkPath)
  else if (c.out.r0) flat(p, cm - 0.025, l.row0, cm + 0.025, fp.row0, z + 0.001, s.parkPath)
  else flat(p, l.col0, rm - 0.025, fp.col0, rm + 0.025, z + 0.001, s.parkPath)
  // Hedges behind the house go before it, hedges in front after it.
  const hedge = mix(pick(rng, s.trees), s.shadow, 0.15)
  const h = 0.035
  if (c.out.r0)
    box(p, { col0: l.col0, row0: l.row0, col1: l.col1, row1: l.row0 + 0.025, z0: z, z1: z + h }, hedge)
  if (c.out.c0)
    box(p, { col0: l.col0, row0: l.row0, col1: l.col0 + 0.025, row1: l.row1, z0: z, z1: z + h }, hedge)
  house(p, fp, rng, { floors: 1 + Math.floor(rng() * 2) })
  if (c.out.r1) {
    box(p, { col0: l.col0, row0: l.row1 - 0.025, col1: cm - 0.04, row1: l.row1, z0: z, z1: z + h }, hedge)
    box(p, { col0: cm + 0.04, row0: l.row1 - 0.025, col1: l.col1, row1: l.row1, z0: z, z1: z + h }, hedge)
  }
  if (c.out.c1)
    box(p, { col0: l.col1 - 0.025, row0: l.row0, col1: l.col1, row1: rm - 0.04, z0: z, z1: z + h }, hedge)
}
