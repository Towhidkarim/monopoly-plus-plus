import { cosmeticRng } from '../view/draw.ts'
import { FLOOR, glassTower, house, inset, office, pick, townhouses, walkup, type Lot } from './buildings.ts'
import {
  beacon,
  blob,
  box,
  cylinder,
  flat,
  gable,
  light,
  mix,
  shadow,
  stripe,
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
): void {
  const rng = cosmeticRng(seed)
  if (level < 0) return forSale(p, lot, rng)
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

/** Empty lot: gravel, a shrub or two, and a little "for sale" sign. */
function forSale(p: Paint, lot: Lot, rng: () => number) {
  const s = p.style
  const l = inset(lot, 0.05)
  flat(p, l.col0, l.row0, l.col1, l.row1, lot.z + 0.003, mix(s.ground, s.park, 0.35))
  const sc = l.col0 + (l.col1 - l.col0) * 0.68
  const sr = l.row1 - 0.08
  box(
    p,
    { col0: sc - 0.008, row0: sr - 0.008, col1: sc + 0.008, row1: sr + 0.008, z0: lot.z, z1: lot.z + 0.13 },
    0xe2e8f0,
  )
  box(
    p,
    {
      col0: sc - 0.07,
      row0: sr + 0.008,
      col1: sc + 0.07,
      row1: sr + 0.02,
      z0: lot.z + 0.07,
      z1: lot.z + 0.15,
    },
    pick(rng, s.accents),
  )
  blob(p, l.col0 + 0.12, l.row0 + 0.14, lot.z + 0.05, 0.06, pick(rng, s.trees))
  blob(p, l.col0 + 0.25, l.row0 + 0.1, lot.z + 0.04, 0.045, pick(rng, s.trees))
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
