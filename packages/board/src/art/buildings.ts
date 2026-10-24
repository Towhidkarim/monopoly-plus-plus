import { projectPoly } from '../geometry/project.ts'
import { rect, type Box } from '../view/draw.ts'
import {
  NIGHT,
  beacon,
  bench,
  box,
  cone,
  cylinder,
  door,
  gable,
  light,
  mix,
  mullions,
  shadow,
  stripe,
  tree,
  wash,
  windows,
  type Paint,
} from './paint.ts'

/**
 * Building generators. Each draws one building on a lot (board units, standing on `lot.z`) from a
 * seeded RNG and returns its height, so layouts can check their skyline. All shapes come from the
 * modelling kit in paint.ts.
 */

export interface Lot {
  col0: number
  row0: number
  col1: number
  row1: number
  z: number
}

/** Height of one floor in z units. */
export const FLOOR = 0.15

export const pick = <T>(rng: () => number, list: readonly T[]): T => list[Math.floor(rng() * list.length)]!

/** Shrinks a lot by `m` on every side (sidewalk margin, setbacks). */
export function inset(l: Lot, m: number): Lot {
  return { col0: l.col0 + m, row0: l.row0 + m, col1: l.col1 - m, row1: l.row1 - m, z: l.z }
}

const walls = (l: Lot, h: number): Box => ({ ...l, z0: l.z, z1: l.z + h })

/** Thin parapet rim around a flat roof. */
function parapet(p: Paint, b: Box, color: number) {
  const w = 0.025
  box(p, { col0: b.col0, row0: b.row0, col1: b.col1, row1: b.row0 + w, z0: b.z1, z1: b.z1 + 0.025 }, color)
  box(p, { col0: b.col0, row0: b.row0, col1: b.col0 + w, row1: b.row1, z0: b.z1, z1: b.z1 + 0.025 }, color)
  box(p, { col0: b.col1 - w, row0: b.row0, col1: b.col1, row1: b.row1, z0: b.z1, z1: b.z1 + 0.025 }, color)
  box(p, { col0: b.col0, row0: b.row1 - w, col1: b.col1, row1: b.row1, z0: b.z1, z1: b.z1 + 0.025 }, color)
}

/** Rooftop clutter: a few small boxes (air handlers, stair heads). */
function rooftop(p: Paint, b: Box, rng: () => number, n: number) {
  const items: Box[] = []
  for (let i = 0; i < n; i++) {
    const s = 0.05 + rng() * 0.05
    const c = b.col0 + 0.05 + rng() * Math.max(0, b.col1 - b.col0 - 0.1 - s)
    const r = b.row0 + 0.05 + rng() * Math.max(0, b.row1 - b.row0 - 0.1 - s)
    items.push({ col0: c, row0: r, col1: c + s, row1: r + s, z0: b.z1, z1: b.z1 + 0.03 + rng() * 0.04 })
  }
  for (const it of items.toSorted((x, y) => x.col0 + x.row0 - (y.col0 + y.row0))) box(p, it, 0x94a3b8)
}

/** Water tank on stilts, the classic walk-up silhouette. */
function waterTower(p: Paint, col: number, row: number, z: number) {
  const legs = 0.07
  for (const [dc, dr] of [
    [-0.03, -0.03],
    [0.03, -0.03],
    [-0.03, 0.03],
    [0.03, 0.03],
  ] as const) {
    box(
      p,
      {
        col0: col + dc - 0.006,
        row0: row + dr - 0.006,
        col1: col + dc + 0.006,
        row1: row + dr + 0.006,
        z0: z,
        z1: z + legs,
      },
      0x5b4636,
    )
  }
  cylinder(p, col, row, 0.055, z + legs, z + legs + 0.11, 0x9a7b5c)
  cone(p, col, row, 0.062, z + legs + 0.11, z + legs + 0.17, 0x6b5442)
}

// ---- houses -----------------------------------------------------------------

/** A small house with a pitched roof, door and windows; `floors` 1 or 2. */
export function house(
  p: Paint,
  lot: Lot,
  rng: () => number,
  o: { wall?: number; roof?: number; floors?: number; axis?: 'col' | 'row'; accent?: number } = {},
): number {
  const s = p.style
  const wall = o.wall ?? pick(rng, s.house)
  const roof = o.roof ?? pick(rng, s.roofs)
  const floors = o.floors ?? 1
  const axis = o.axis ?? (lot.col1 - lot.col0 >= lot.row1 - lot.row0 ? 'col' : 'row')
  const wh = floors * FLOOR * 0.95 + s.chunk * 0.03
  const rh = 0.1 + s.chunk * 0.05 + (Math.min(lot.col1 - lot.col0, lot.row1 - lot.row0) - 0.3) * 0.15
  const b = walls(lot, wh)
  shadow(p, lot.col0, lot.row0, lot.col1, lot.row1, lot.z, wh + rh)
  box(p, b, wall)
  windows(p, b, floors, rng, { spacing: 0.12, width: 0.05 + s.chunk * 0.015 })
  const cm = (lot.col0 + lot.col1) / 2
  const doorColor = o.accent ?? mix(roof, 0x1e293b, 0.35)
  door(p, cm, lot.row1, lot.z, 0.05 + s.chunk * 0.01, FLOOR * 0.75, doorColor)
  // Little porch canopy over the door.
  box(
    p,
    {
      col0: cm - 0.05,
      row0: lot.row1,
      col1: cm + 0.05,
      row1: lot.row1 + 0.035,
      z0: lot.z + FLOOR * 0.78,
      z1: lot.z + FLOOR * 0.78 + 0.015,
    },
    roof,
  )
  // A chimney on the back slope, drawn before the roof so the roof overlaps its base.
  if (rng() < 0.6) {
    const cc = lot.col0 + (lot.col1 - lot.col0) * 0.3
    const cr = lot.row0 + (lot.row1 - lot.row0) * 0.3
    box(
      p,
      { col0: cc, row0: cr, col1: cc + 0.045, row1: cr + 0.045, z0: b.z1, z1: b.z1 + rh * 0.95 },
      mix(wall, 0x7c2d12, 0.4),
    )
  }
  gable(p, b, rh, axis, roof, wall)
  return wh + rh
}

/** A row of narrow townhouses along the lot's longer side, each with its own gable. */
export function townhouses(
  p: Paint,
  lot: Lot,
  rng: () => number,
  n: number,
  o: { floors?: number } = {},
): number {
  const s = p.style
  const alongCol = lot.col1 - lot.col0 >= lot.row1 - lot.row0
  const len = alongCol ? lot.col1 - lot.col0 : lot.row1 - lot.row0
  const step = len / n
  const floors = o.floors ?? 2
  let h = 0
  for (let i = 0; i < n; i++) {
    const a = (alongCol ? lot.col0 : lot.row0) + i * step
    const unit: Lot = alongCol
      ? { ...lot, col0: a + 0.005, col1: a + step - 0.005 }
      : { ...lot, row0: a + 0.005, row1: a + step - 0.005 }
    const wall = s.house[(i + Math.floor(rng() * 3)) % s.house.length]!
    h = Math.max(h, house(p, unit, rng, { floors, wall, axis: alongCol ? 'row' : 'col' }))
  }
  return h
}

// ---- mid-rise -----------------------------------------------------------------

/** Brick walk-up: 3 to 5 floors, cornice, window grid, often a water tower. */
export function walkup(p: Paint, lot: Lot, rng: () => number, o: { floors?: number } = {}): number {
  const s = p.style
  const floors = o.floors ?? 3 + Math.floor(rng() * 3)
  const wall = pick(rng, s.brick)
  const h = floors * FLOOR + 0.04
  const b = walls(lot, h)
  shadow(p, lot.col0, lot.row0, lot.col1, lot.row1, lot.z, h)
  box(p, b, wall)
  windows(p, b, floors, rng, { spacing: 0.13, from: 0.04 })
  // Ground-floor shopfront band (sides only, so it never paints over the walls) and cornice.
  stripe(p, b, lot.z, lot.z + 0.05, mix(wall, 0x1e293b, 0.35))
  box(
    p,
    {
      col0: lot.col0 - 0.012,
      row0: lot.row0 - 0.012,
      col1: lot.col1 + 0.012,
      row1: lot.row1 + 0.012,
      z0: b.z1,
      z1: b.z1 + 0.025,
    },
    light(wall, 0.2),
  )
  const top = { ...b, z1: b.z1 + 0.025 }
  if (rng() < 0.2)
    waterTower(p, lot.col0 + (lot.col1 - lot.col0) * 0.35, lot.row0 + (lot.row1 - lot.row0) * 0.35, top.z1)
  else rooftop(p, top, rng, 2)
  return h + 0.2
}

/** Office block: plaster or glass, ribbon or grid windows, optional setback crown. */
export function office(p: Paint, lot: Lot, rng: () => number, o: { floors?: number } = {}): number {
  const s = p.style
  const floors = o.floors ?? 4 + Math.floor(rng() * 5)
  const glassy = rng() < 0.4
  const wall = glassy ? pick(rng, s.glass) : pick(rng, s.plaster)
  const h = floors * FLOOR
  shadow(p, lot.col0, lot.row0, lot.col1, lot.row1, lot.z, h)
  const setback = floors >= 6 && rng() < 0.6
  const lowF = setback ? Math.ceil(floors * 0.65) : floors
  // Sometimes an L: a lower wing along the back edge breaks up the box silhouette.
  const w = lot.col1 - lot.col0
  const d = lot.row1 - lot.row0
  let main = lot
  if (rng() < 0.35 && w > 0.35 && d > 0.35) {
    const wingF = Math.max(2, Math.floor(lowF * 0.6))
    const wing: Lot = { ...lot, row1: lot.row0 + d * 0.45 }
    main = { ...lot, col1: lot.col0 + w * 0.6 }
    const wb = walls({ ...wing, col0: lot.col0 + w * 0.55 }, wingF * FLOOR)
    box(p, wb, light(wall, 0.05))
    windows(p, wb, wingF, rng, { ribbon: glassy })
  }
  const low = walls(main, lowF * FLOOR)
  box(p, low, wall)
  windows(p, low, lowF, rng, { ribbon: glassy || rng() < 0.4, from: FLOOR * 0.4 })
  stripe(p, low, main.z, main.z + FLOOR * 0.4, mix(s.window, s.shadow, 0.25))
  if (glassy) mullions(p, low, 0.1, light(wall, 0.6))
  let top = low
  if (setback) {
    const up = inset(main, Math.min(main.col1 - main.col0, main.row1 - main.row0) * 0.15)
    top = { ...up, z0: low.z1, z1: low.z1 + (floors - lowF) * FLOOR }
    box(p, top, light(wall, 0.06))
    windows(p, top, floors - lowF, rng, { ribbon: true })
  }
  parapet(p, top, light(wall, 0.15))
  rooftop(p, top, rng, 1 + Math.floor(rng() * 3))
  return h + 0.08
}

// ---- towers ---------------------------------------------------------------------

/** Glass tower: tall, ribbon windows, a crown in an accent color and sometimes an antenna. */
export function glassTower(p: Paint, lot: Lot, rng: () => number, o: { floors?: number } = {}): number {
  const s = p.style
  const floors = o.floors ?? 10 + Math.floor(rng() * 8)
  const wall = pick(rng, s.glass)
  const h = floors * FLOOR
  shadow(p, lot.col0, lot.row0, lot.col1, lot.row1, lot.z, h)
  const b = walls(inset(lot, 0.02), h)
  // Podium.
  box(p, { ...lot, z0: lot.z, z1: lot.z + 0.08 }, pick(rng, s.plaster))
  box(p, { ...b, z0: lot.z + 0.08 }, wall)
  windows(p, { ...b, z0: lot.z + 0.08 }, floors - 1, rng, { ribbon: true })
  mullions(p, { ...b, z0: lot.z + 0.08 }, 0.07, light(wall, 0.65))
  const crown = inset({ ...lot, col0: b.col0, row0: b.row0, col1: b.col1, row1: b.row1 }, 0.035)
  const accent = pick(rng, s.accents)
  box(p, { ...crown, z0: b.z1, z1: b.z1 + 0.06 }, accent)
  if (rng() < 0.55) {
    const cc = (crown.col0 + crown.col1) / 2
    const cr = (crown.row0 + crown.row1) / 2
    box(
      p,
      {
        col0: cc - 0.008,
        row0: cr - 0.008,
        col1: cc + 0.008,
        row1: cr + 0.008,
        z0: b.z1 + 0.06,
        z1: b.z1 + 0.3,
      },
      0xcbd5e1,
    )
    box(
      p,
      {
        col0: cc - 0.016,
        row0: cr - 0.016,
        col1: cc + 0.016,
        row1: cr + 0.016,
        z0: b.z1 + 0.3,
        z1: b.z1 + 0.33,
      },
      0xfb7185,
    )
    beacon(p, cc, cr, b.z1 + 0.33, 0xff4d5e)
  }
  return h + 0.35
}

/** The landmark: a stepped spire tower with a beacon (one per city). */
export function landmark(p: Paint, lot: Lot, rng: () => number): number {
  const s = p.style
  const wall = pick(rng, s.glass)
  const accent = pick(rng, s.accents)
  shadow(p, lot.col0, lot.row0, lot.col1, lot.row1, lot.z, 2.2)
  let l = inset(lot, 0.02)
  let z = lot.z
  box(p, { ...lot, z0: z, z1: z + 0.1 }, pick(rng, s.plaster))
  z += 0.1
  const tiers = [5, 5, 3]
  for (const [i, floors] of tiers.entries()) {
    const b = { ...l, z0: z, z1: z + floors * FLOOR }
    box(p, b, i === 1 ? light(wall, 0.08) : wall)
    // Punched windows, not ribbons: on the widest, tallest walls a ribbon reads as flat glass.
    windows(p, b, floors, rng)
    // Floodlit base at night.
    if (i === 0) wash(p, b, (b.z1 - b.z0) * 0.8, NIGHT.soft)
    box(p, { ...inset(l, -0.01), z0: b.z1, z1: b.z1 + 0.03 }, accent)
    z = b.z1 + 0.03
    l = inset(l, Math.min(l.col1 - l.col0, l.row1 - l.row0) * 0.16)
  }
  const cc = (l.col0 + l.col1) / 2
  const cr = (l.row0 + l.row1) / 2
  cone(p, cc, cr, (l.col1 - l.col0) * 0.55, z, z + 0.4, light(wall, 0.15))
  cylinder(p, cc, cr, 0.018, z + 0.35, z + 0.47, 0xe2e8f0)
  box(
    p,
    { col0: cc - 0.02, row0: cr - 0.02, col1: cc + 0.02, row1: cr + 0.02, z0: z + 0.47, z1: z + 0.51 },
    0xfb7185,
  )
  beacon(p, cc, cr, z + 0.51, 0xff4d5e)
  return z + 0.51 - lot.z
}

// ---- open ground ----------------------------------------------------------------

/** A paved plaza: paving, a sculpture or fountain in the middle, trees in planters, benches. */
export function plaza(p: Paint, lot: Lot, rng: () => number): number {
  const s = p.style
  const z = lot.z + 0.003
  p.g.poly(rectOf(p, lot, z)).fill(light(s.sidewalk, 0.15))
  // Paving grid.
  const step = 0.12
  for (let c = lot.col0 + step; c < lot.col1 - 0.02; c += step)
    p.g
      .poly(rectOf(p, { ...lot, col0: c - 0.003, col1: c + 0.003 }, z + 0.001))
      .fill(mix(s.sidewalk, s.shadow, 0.12))
  const cm = (lot.col0 + lot.col1) / 2
  const rm = (lot.row0 + lot.row1) / 2
  if (rng() < 0.5) {
    cylinder(p, cm, rm, 0.09, z, z + 0.03, light(s.sidewalk, 0.05))
    cylinder(p, cm, rm, 0.07, z + 0.03, z + 0.034, s.water)
  } else {
    box(
      p,
      { col0: cm - 0.04, row0: rm - 0.04, col1: cm + 0.04, row1: rm + 0.04, z0: z, z1: z + 0.04 },
      light(s.sidewalk, 0.05),
    )
    cone(p, cm, rm, 0.03, z + 0.04, z + 0.16, pick(rng, s.accents))
  }
  const w = lot.col1 - lot.col0
  const d = lot.row1 - lot.row0
  const corners: [number, number][] = [
    [lot.col0 + w * 0.2, lot.row0 + d * 0.2],
    [lot.col1 - w * 0.2, lot.row0 + d * 0.2],
    [lot.col0 + w * 0.2, lot.row1 - d * 0.2],
    [lot.col1 - w * 0.2, lot.row1 - d * 0.2],
  ]
  for (const [c, r] of corners) {
    box(
      p,
      { col0: c - 0.04, row0: r - 0.04, col1: c + 0.04, row1: r + 0.04, z0: z, z1: z + 0.03 },
      mix(s.sidewalk, s.shadow, 0.2),
    )
    tree(p, c, r, z + 0.03, 0.09 + rng() * 0.03, pick(rng, s.trees))
  }
  bench(p, cm, lot.row1 - d * 0.12, z, 0x8b6b4a)
  return 0.25
}

/** A little park: lawn, a path, trees, and sometimes a fountain. */
export function park(p: Paint, lot: Lot, rng: () => number, o: { fountain?: boolean } = {}): number {
  const s = p.style
  const z = lot.z + 0.004
  p.g.poly(rectOf(p, lot, z)).fill(s.park)
  const cm = (lot.col0 + lot.col1) / 2
  const rm = (lot.row0 + lot.row1) / 2
  const w = lot.col1 - lot.col0
  const d = lot.row1 - lot.row0
  const path = (pts: { col: number; row: number }[]) =>
    p.g
      .poly(
        projectPoly(
          pts.map((q) => ({ ...q, z: z + 0.001 })),
          p.t,
        ),
      )
      .fill(s.parkPath)
  // Four layouts so neighboring parks never look alike.
  const layout = o.fountain ? 0 : Math.floor(rng() * 4)
  const spots: [number, number][] = []
  if (layout === 0) {
    // Cross paths with a fountain.
    path([
      { col: cm - 0.035, row: lot.row0 },
      { col: cm + 0.035, row: lot.row0 },
      { col: cm + 0.035, row: lot.row1 },
      { col: cm - 0.035, row: lot.row1 },
    ])
    path([
      { col: lot.col0, row: rm - 0.035 },
      { col: lot.col1, row: rm - 0.035 },
      { col: lot.col1, row: rm + 0.035 },
      { col: lot.col0, row: rm + 0.035 },
    ])
    cylinder(p, cm, rm, 0.11, z, z + 0.035, light(s.sidewalk, 0.1))
    cylinder(p, cm, rm, 0.085, z + 0.035, z + 0.04, s.water)
    cylinder(p, cm, rm, 0.02, z + 0.04, z + 0.1, light(s.sidewalk, 0.1))
    for (const qc of [0.22, 0.78])
      for (const qr of [0.22, 0.78]) spots.push([lot.col0 + w * qc, lot.row0 + d * qr])
  } else if (layout === 1) {
    // One diagonal path, trees on both sides, a bench.
    const k = 0.05
    path([
      { col: lot.col0 + k, row: lot.row0 },
      { col: lot.col1, row: lot.row1 - k },
      { col: lot.col1 - k, row: lot.row1 },
      { col: lot.col0, row: lot.row0 + k },
    ])
    spots.push(
      [lot.col0 + w * 0.25, lot.row0 + d * 0.7],
      [lot.col0 + w * 0.42, lot.row0 + d * 0.85],
      [lot.col0 + w * 0.72, lot.row0 + d * 0.25],
      [lot.col0 + w * 0.85, lot.row0 + d * 0.48],
    )
    bench(p, cm - 0.06, rm + 0.1, z, 0x8b6b4a)
  } else if (layout === 2) {
    // A pond with a curved shore and trees around it.
    const pond: { col: number; row: number }[] = []
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2
      const r = 0.82 + Math.sin(a * 3 + rng()) * 0.1
      pond.push({ col: cm + Math.cos(a) * w * 0.28 * r, row: rm + Math.sin(a) * d * 0.22 * r })
    }
    p.g
      .poly(
        projectPoly(
          pond.map((q) => ({ ...q, z: z + 0.001 })),
          p.t,
        ),
      )
      .fill(s.water)
    p.g
      .poly(
        projectPoly(
          pond.map((q) => ({ col: cm + (q.col - cm) * 0.7, row: rm + (q.row - rm) * 0.7, z: z + 0.002 })),
          p.t,
        ),
      )
      .fill(light(s.water, 0.18))
    spots.push(
      [lot.col0 + w * 0.15, lot.row0 + d * 0.15],
      [lot.col1 - w * 0.15, lot.row0 + d * 0.2],
      [lot.col0 + w * 0.2, lot.row1 - d * 0.12],
    )
  } else {
    // A grove: a loose cluster of trees and a little path around it.
    path([
      { col: lot.col0, row: lot.row1 - 0.08 },
      { col: lot.col1, row: lot.row1 - 0.08 },
      { col: lot.col1, row: lot.row1 - 0.02 },
      { col: lot.col0, row: lot.row1 - 0.02 },
    ])
    for (let i = 0; i < 6; i++)
      spots.push([lot.col0 + w * (0.15 + rng() * 0.7), lot.row0 + d * (0.12 + rng() * 0.6)])
  }
  for (const [c, r] of spots.toSorted((a, b) => a[0] + a[1] - (b[0] + b[1]))) {
    const size = 0.09 + rng() * 0.06
    treeAt(p, c + (rng() - 0.5) * 0.04, r + (rng() - 0.5) * 0.04, z, size, rng)
  }
  return 0.3
}

function treeAt(p: Paint, col: number, row: number, z: number, size: number, rng: () => number) {
  tree(p, col, row, z, size, pick(rng, p.style.trees), rng() < 0.25)
}

function rectOf(p: Paint, l: { col0: number; row0: number; col1: number; row1: number }, z: number) {
  return rect(l.col0, l.row0, l.col1, l.row1, z, p.t)
}
