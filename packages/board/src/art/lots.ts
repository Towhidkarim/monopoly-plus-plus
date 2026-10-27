import { cosmeticRng } from '../view/draw.ts'
import { FLOOR, glassTower, house, inset, office, pick, townhouses, walkup, type Lot } from './buildings.ts'
import {
  beacon,
  bench,
  blob,
  box,
  cylinder,
  flat,
  gable,
  lamp,
  light,
  mix,
  shadow,
  stripe,
  tree,
  wash,
  windows,
  type Paint,
} from './paint.ts'

/**
 * What stands on a property lot at each development level. Each color group gets one
 * architecture family per game, so a street stays consistent as it grows.
 */
export type Family = 'cottage' | 'brick' | 'modern' | 'glass'
export const FAMILIES: readonly Family[] = ['cottage', 'brick', 'modern', 'glass']

/** -1 for sale, 0 owned, 1 to 4 houses, 5 hotel. */
export const LEVEL_LABELS = [
  'For sale',
  'Owned',
  '1 house',
  '2 houses',
  '3 houses',
  '4 houses',
  'Hotel',
] as const

/**
 * Draws the lot at `level`. `owner` tints doors and awnings; `seed` keeps the same lot looking
 * the same every time it is redrawn.
 */
export function drawLot(
  p: Paint,
  lot: Lot,
  level: number,
  family: Family,
  owner: number | null,
  seed: number,
  /** Group color, lightly mixed into an empty lot's ground. */
  tint: number | null = null,
): void {
  const rng = cosmeticRng(seed)
  if (level < 0) return forSale(p, lot, rng, family, tint)
  const accent = owner ?? pick(rng, p.style.accents)
  const w = lot.col1 - lot.col0
  const d = lot.row1 - lot.row0
  const m = Math.min(w, d)
  // Footprint grows with development: a small house sits toward the front of the lot.
  const grow = [0.3, 0.24, 0.16, 0.13, 0.11, 0.16][level] ?? 0.12
  const fp = inset(lot, m * grow)
  if (level === 5) return hotel(p, inset(lot, m * 0.16), rng, family, accent)
  switch (family) {
    case 'cottage':
      if (level <= 1) house(p, fp, rng, { floors: level + 1, accent })
      else if (level <= 3) townhouses(p, fp, rng, level, { floors: level === 2 ? 2 : 3 })
      else pitchedBlock(p, fp, rng, 4, accent)
      return
    case 'brick':
      walkup(p, fp, rng, { floors: [2, 3, 3, 4, 5][level]! })
      awning(p, fp, accent)
      return
    case 'modern':
      office(p, fp, rng, { floors: [1, 2, 3, 4, 6][level]! })
      awning(p, fp, accent)
      return
    case 'glass':
      if (level <= 1) pavilion(p, fp, rng, level + 1, accent)
      else glassTower(p, fp, rng, { floors: [0, 0, 3, 5, 7][level]! })
      return
  }
}

/**
 * Empty lot for sale: a low raised plot (lawn, gravel or paving by architecture family, lightly
 * tinted with the group color) with a few seeded props and a "for sale" board near the front.
 * Raised, never edged by walls on the back sides: a back hedge read as the walls of a pit.
 */
function forSale(p: Paint, lot: Lot, rng: () => number, family: Family, tint: number | null) {
  const s = p.style
  const l = inset(lot, 0.05)
  const w = l.col1 - l.col0
  const d = l.row1 - l.row0
  // Lot-relative position: u along col, v along row; 1 is the front (toward the camera).
  const at = (u: number, v: number) => ({ col: l.col0 + w * u, row: l.row0 + d * v })
  const tinted = (c: number, k: number) => (tint === null ? c : mix(c, tint, k))
  const lawn = tinted(mix(s.park, s.ground, 0.18), 0.12)
  const ground =
    family === 'brick'
      ? tinted(0xc9c2b4, 0.1)
      : family === 'modern'
        ? tinted(mix(s.sidewalk, s.ground, 0.7), 0.04)
        : lawn
  const top = l.z + 0.025
  // The plot: a thin slab whose front faces show, so it reads as raised land.
  box(p, { ...l, z0: l.z, z1: top }, ground)
  plotSurface(p, l, top, family, ground, rng)

  // The sign stands near the front, left or right. Props take two of three slots, one left empty
  // per lot so neighbors differ; a left sign keeps the front-left slot clear.
  const right = rng() < 0.6
  const slots = [
    [0.22, 0.24],
    [0.72, 0.22],
    [0.24, 0.62],
  ] as const
  const skip = right ? Math.floor(rng() * slots.length) : 2
  for (const [k, [u, v]] of slots.entries()) {
    if (k === skip) continue
    const pos = at(u + (rng() - 0.5) * 0.08, v + (rng() - 0.5) * 0.08)
    prop(p, pos.col, pos.row, top, family, rng)
  }
  const sp = at(right ? 0.74 : 0.3, 0.86 - rng() * 0.06)
  forSaleSign(p, sp.col, sp.row, top, pick(rng, s.accents))
}

/** Surface detail on the plot: mowing stripes, gravel specks, or paving joints. */
function plotSurface(p: Paint, l: Lot, z: number, family: Family, ground: number, rng: () => number) {
  const w = l.col1 - l.col0
  const d = l.row1 - l.row0
  if (family === 'brick') {
    // Gravel: a scatter of small darker and lighter specks.
    for (let i = 0; i < 14; i++) {
      const c = l.col0 + 0.04 + rng() * (w - 0.08)
      const r = l.row0 + 0.04 + rng() * (d - 0.08)
      const e = 0.012 + rng() * 0.01
      flat(
        p,
        c - e,
        r - e,
        c + e,
        r + e,
        z + 0.001,
        i % 2 ? mix(ground, 0x000000, 0.12) : light(ground, 0.25),
      )
    }
    return
  }
  if (family === 'modern') {
    // Paving: a grid of joints.
    const line = mix(ground, 0x000000, 0.08)
    const n = Math.max(2, Math.round(w / 0.16))
    const m = Math.max(2, Math.round(d / 0.16))
    for (let i = 1; i < n; i++) {
      const c = l.col0 + (w * i) / n
      flat(p, c - 0.003, l.row0, c + 0.003, l.row1, z + 0.001, line)
    }
    for (let i = 1; i < m; i++) {
      const r = l.row0 + (d * i) / m
      flat(p, l.col0, r - 0.003, l.col1, r + 0.003, z + 0.001, line)
    }
    return
  }
  // Lawn: soft mowing stripes along the longer side.
  const along = w >= d
  const n = 5
  for (let i = 0; i < n; i += 2) {
    const a = i / n
    const b = (i + 1) / n
    if (along) flat(p, l.col0 + w * a, l.row0, l.col0 + w * b, l.row1, z + 0.001, light(ground, 0.07))
    else flat(p, l.col0, l.row0 + d * a, l.col1, l.row0 + d * b, z + 0.001, light(ground, 0.07))
  }
}

/** One small prop that says which district this is. */
function prop(p: Paint, col: number, row: number, z: number, family: Family, rng: () => number) {
  const s = p.style
  switch (family) {
    case 'cottage': {
      // A flower bed or a small round tree.
      if (rng() < 0.5) return tree(p, col, row, z, 0.11 + rng() * 0.04, pick(rng, s.trees))
      box(
        p,
        { col0: col - 0.1, row0: row - 0.06, col1: col + 0.1, row1: row + 0.06, z0: z, z1: z + 0.025 },
        0x8a6a52,
      )
      for (const [dc, dr] of [
        [-0.06, -0.025],
        [0, -0.025],
        [0.06, -0.025],
        [-0.03, 0.025],
        [0.03, 0.025],
      ] as const)
        blob(p, col + dc, row + dr, z + 0.045, 0.03, pick(rng, [0xf9a8d4, 0xfde68a, 0xfca5a5, 0xc4b5fd]))
      return
    }
    case 'brick': {
      // A stack of crates or an old street lamp.
      if (rng() < 0.45) return lamp(p, col, row, z)
      const crate = 0xb08355
      box(
        p,
        { col0: col - 0.05, row0: row - 0.04, col1: col + 0.03, row1: row + 0.04, z0: z, z1: z + 0.07 },
        crate,
      )
      box(
        p,
        { col0: col + 0.035, row0: row - 0.02, col1: col + 0.085, row1: row + 0.03, z0: z, z1: z + 0.05 },
        light(crate, 0.12),
      )
      box(
        p,
        {
          col0: col - 0.035,
          row0: row - 0.025,
          col1: col + 0.02,
          row1: row + 0.03,
          z0: z + 0.07,
          z1: z + 0.12,
        },
        mix(crate, 0x000000, 0.1),
      )
      return
    }
    case 'modern': {
      // A square planter with a round shrub, a lamp, or a bench.
      const r = rng()
      if (r < 0.25) return bench(p, col, row, z, 0x64748b)
      if (r < 0.45) return lamp(p, col, row, z)
      box(
        p,
        { col0: col - 0.09, row0: row - 0.09, col1: col + 0.09, row1: row + 0.09, z0: z, z1: z + 0.07 },
        0x94a3b8,
      )
      blob(p, col, row, z + 0.15, 0.11, pick(rng, s.trees))
      return
    }
    case 'glass': {
      // A slim young tree or a pair of shrubs.
      if (rng() < 0.6) return tree(p, col, row, z, 0.09 + rng() * 0.05, pick(rng, s.trees), rng() < 0.4)
      blob(p, col - 0.03, row, z + 0.035, 0.035, pick(rng, s.trees))
      blob(p, col + 0.035, row + 0.01, z + 0.03, 0.03, pick(rng, s.trees))
      return
    }
  }
}

/** The "for sale" board: two posts and a white board with a colored header, facing the camera. */
function forSaleSign(p: Paint, sc: number, sr: number, z: number, header: number) {
  for (const dc of [-0.07, 0.07])
    box(
      p,
      {
        col0: sc + dc - 0.009,
        row0: sr - 0.009,
        col1: sc + dc + 0.009,
        row1: sr + 0.009,
        z0: z,
        z1: z + 0.2,
      },
      0x94a3b8,
    )
  const board = { col0: sc - 0.1, row0: sr + 0.009, col1: sc + 0.1, row1: sr + 0.022 }
  box(p, { ...board, z0: z + 0.09, z1: z + 0.21 }, 0xf8fafc)
  box(p, { ...board, row0: board.row1, row1: board.row1 + 0.002, z0: z + 0.175, z1: z + 0.21 }, header)
  box(p, { ...board, row0: board.row1, row1: board.row1 + 0.002, z0: z + 0.115, z1: z + 0.13 }, 0x94a3b8)
}

/** Street-level awning in the owner's color on the lit facade. */
function awning(p: Paint, fp: Lot, color: number) {
  const z = fp.z + FLOOR * 0.9
  box(
    p,
    { col0: fp.col0 + 0.04, row0: fp.row1, col1: fp.col1 - 0.04, row1: fp.row1 + 0.04, z0: z, z1: z + 0.02 },
    color,
  )
}

/** Small glass pavilion (glass family at low levels). */
function pavilion(p: Paint, fp: Lot, rng: () => number, floors: number, accent: number) {
  p.mark?.()
  const h = floors * FLOOR + 0.02
  shadow(p, fp.col0, fp.row0, fp.col1, fp.row1, fp.z, h)
  const b = { ...fp, z0: fp.z, z1: fp.z + h }
  box(p, b, pick(rng, p.style.glass))
  windows(p, b, floors, rng, { ribbon: true })
  box(p, { ...inset(fp, -0.015), z0: b.z1, z1: b.z1 + 0.03 }, light(accent, 0.1))
}

/** Apartment block with a pitched roof (cottage family at 4 houses). */
function pitchedBlock(p: Paint, fp: Lot, rng: () => number, floors: number, accent: number) {
  p.mark?.()
  const wall = pick(rng, p.style.house)
  const h = floors * FLOOR + 0.04
  const b = { ...fp, z0: fp.z, z1: fp.z + h }
  shadow(p, fp.col0, fp.row0, fp.col1, fp.row1, fp.z, h + 0.15)
  box(p, b, wall)
  windows(p, b, floors, rng, { from: 0.04 })
  stripe(p, b, fp.z, fp.z + 0.05, accent)
  gable(
    p,
    b,
    0.14 + p.style.chunk * 0.05,
    fp.col1 - fp.col0 >= fp.row1 - fp.row0 ? 'col' : 'row',
    pick(rng, p.style.roofs),
    wall,
  )
}

/** The hotel: a slim tower with a sign band and a rooftop beacon in the owner's color. */
function hotel(p: Paint, fp: Lot, rng: () => number, family: Family, accent: number) {
  p.mark?.()
  const s = p.style
  const floors = 8
  const h = floors * FLOOR
  shadow(p, fp.col0, fp.row0, fp.col1, fp.row1, fp.z, h)
  const podium = family === 'brick' ? pick(rng, s.brick) : pick(rng, s.plaster)
  box(p, { ...inset(fp, -0.04), z0: fp.z, z1: fp.z + 0.1 }, podium)
  const wall = family === 'cottage' || family === 'brick' ? pick(rng, s.plaster) : pick(rng, s.glass)
  const b = { ...fp, z0: fp.z + 0.1, z1: fp.z + 0.1 + h }
  box(p, b, wall)
  windows(p, b, floors, rng, { ribbon: family === 'glass' || family === 'modern' })
  box(p, { ...inset(fp, -0.01), z0: b.z1 - 0.07, z1: b.z1 }, accent)
  box(p, { ...inset(fp, 0.03), z0: b.z1, z1: b.z1 + 0.05 }, light(wall, 0.1))
  const cc = (fp.col0 + fp.col1) / 2
  const cr = (fp.row0 + fp.row1) / 2
  cylinder(p, cc, cr, 0.03, b.z1 + 0.05, b.z1 + 0.12, light(accent, 0.3))
  // The owner's beacon blinks on the roof at night; the sign band glows.
  beacon(p, cc, cr, b.z1 + 0.12, light(accent, 0.2))
  wash(p, { ...fp, z0: b.z1 - 0.07, z1: b.z1 }, 0.07, light(accent, 0.35))
}
