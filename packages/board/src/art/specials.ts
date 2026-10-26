import { LOT_Z, lotV, uvRect, type Footprint } from '../geometry/ring.ts'
import { palette, shade } from '../palette.ts'
import { projectPoly } from '../geometry/project.ts'
import { disc } from '../view/draw.ts'
import {
  NIGHT,
  beacon,
  bench,
  blob,
  box,
  cone,
  cylinder,
  flat,
  lamp,
  light,
  mix,
  shadow,
  soft,
  tree,
  type Paint,
} from './paint.ts'

/**
 * Small 3D scenes on the lots of the non-property side tiles: a station for each railroad, a
 * pylon and a water tower for the utilities, coin stacks for tax, a card deck for chance and a
 * chest for the community chest. They stand where a property's building would (the lot behind
 * the pieces' strip), so pieces never stand inside them.
 */
export type Special =
  | 'railroad'
  | 'electric'
  | 'water'
  | 'tax'
  | 'chance'
  | 'chest'
  | 'lockup'
  | 'goToLockup'
  | 'park'

/** A prop in lot-local coordinates: `u` along the edge (0..1), `k` from the pieces (0) to the far edge (1). */
interface Lotted {
  rect(
    u0: number,
    k0: number,
    u1: number,
    k1: number,
  ): { col0: number; row0: number; col1: number; row1: number }
  at(u: number, k: number): { col: number; row: number }
}

/** Lot `u` (0..1) to tile `u` (the lot spans 0.06..0.94 of the edge, ring.ts lotRect). */
const U = (u: number) => 0.06 + 0.88 * u

function lotted(fp: Footprint): Lotted {
  const [near, far] = lotV(fp)
  const v = (k: number) => near + (far - near) * k
  return {
    rect: (u0, k0, u1, k1) => uvRect(fp, U(u0), v(k0), U(u1), v(k1)),
    at: (u, k) => {
      const r = uvRect(fp, U(u), v(k), U(u), v(k))
      return { col: r.col0, row: r.row0 }
    },
  }
}

/** Draw calls sorted back to front (the camera looks from +col, +row). */
class Scene {
  private readonly items: { key: number; draw: () => void }[] = []
  add(where: { col: number; row: number }, draw: () => void): void {
    this.items.push({ key: where.col + where.row, draw })
  }
  addRect(r: { col0: number; row0: number; col1: number; row1: number }, draw: () => void): void {
    this.add({ col: (r.col0 + r.col1) / 2, row: (r.row0 + r.row1) / 2 }, draw)
  }
  flush(): void {
    for (const it of this.items.toSorted((a, b) => a.key - b.key)) it.draw()
  }
}

export function drawSpecial(p: Paint, fp: Footprint, kind: Special, index: number): void {
  if (kind === 'lockup') return lockup(p, fp)
  if (kind === 'goToLockup') return goToLockup(p, fp)
  if (kind === 'park') return park(p, fp)
  const L = lotted(fp)
  switch (kind) {
    case 'railroad':
      return station(p, L)
    case 'electric':
      return substation(p, L)
    case 'water':
      return waterTower(p, L)
    case 'tax':
      return coins(p, L, index)
    case 'chance':
      return deck(p, L)
    case 'chest':
      return chest(p, L)
  }
}

/** Props stand on the lot's paving. */
const Z = LOT_Z

/** Platform with a canopy next to the pieces, a short track with buffer stops behind it. */
function station(p: Paint, L: Lotted): void {
  const s = p.style
  const sc = new Scene()
  // Track bed: ballast, sleepers, two rails, red buffer stops at both ends.
  const bed = L.rect(0, 0.5, 1, 0.98)
  flat(p, bed.col0, bed.row0, bed.col1, bed.row1, Z + 0.004, mix(s.ground, 0x64748b, 0.45))
  for (let i = 0; i < 9; i++) {
    const u = 0.06 + i * 0.11
    const r = L.rect(u - 0.018, 0.55, u + 0.018, 0.93)
    flat(p, r.col0, r.row0, r.col1, r.row1, Z + 0.008, 0x8b6b4a)
  }
  for (const k of [0.63, 0.85]) {
    const r = L.rect(0.02, k - 0.012, 0.98, k + 0.012)
    sc.addRect(r, () => box(p, { ...r, z0: Z, z1: Z + 0.022 }, palette.rail))
  }
  for (const u of [0.02, 0.98]) {
    const r = L.rect(u - 0.025, 0.55, u + 0.025, 0.93)
    sc.addRect(r, () => box(p, { ...r, z0: Z, z1: Z + 0.07 }, 0xe5484d))
  }
  // Platform with a yellow safety line along the track side.
  const pf = L.rect(0.04, 0.02, 0.96, 0.46)
  sc.addRect(pf, () => {
    box(p, { ...pf, z0: Z, z1: Z + 0.05 }, light(s.sidewalk, 0.15))
    const edge = L.rect(0.04, 0.4, 0.96, 0.44)
    flat(p, edge.col0, edge.row0, edge.col1, edge.row1, Z + 0.051, 0xfacc15)
  })
  // Canopy on three posts, with a sign on top.
  const top = Z + 0.24
  for (const u of [0.3, 0.7]) {
    const c = L.at(u, 0.24)
    const r = { col0: c.col - 0.012, row0: c.row - 0.012, col1: c.col + 0.012, row1: c.row + 0.012 }
    sc.addRect(r, () => box(p, { ...r, z0: Z + 0.05, z1: top }, s.plaster[2]!))
  }
  const roof = L.rect(0.2, 0.04, 0.8, 0.42)
  sc.add({ col: roof.col1, row: roof.row1 }, () => {
    shadow(p, roof.col0, roof.row0, roof.col1, roof.row1, Z + 0.05, 0.12, false)
    box(p, { ...roof, z0: top, z1: top + 0.024 }, s.plaster[1]!)
    box(p, { ...roof, z0: top + 0.024, z1: top + 0.03 }, s.accents[1]!)
    const sign = L.rect(0.38, 0.2, 0.62, 0.26)
    box(p, { ...sign, z0: top + 0.03, z1: top + 0.09 }, s.accents[2]!)
    // Warm light under the canopy at night.
    if (p.lights) {
      const c = L.at(0.5, 0.24)
      soft(p.lights, disc(c.col, c.row, 0.3, Z + 0.052, p.t, 24), NIGHT.lamp, 0.5)
    }
  })
  sc.flush()
}

/** A transformer on a gravel pad and a lattice pylon. */
function substation(p: Paint, L: Lotted): void {
  const sc = new Scene()
  const pad = L.rect(0.04, 0.06, 0.96, 0.94)
  flat(p, pad.col0, pad.row0, pad.col1, pad.row1, Z + 0.004, mix(p.style.ground, 0x64748b, 0.3))
  const tr = L.rect(0.12, 0.2, 0.44, 0.7)
  sc.addRect(tr, () => {
    shadow(p, tr.col0, tr.row0, tr.col1, tr.row1, Z, 0.14, false)
    box(p, { ...tr, z0: Z, z1: Z + 0.13 }, 0x8a9bb3)
    box(p, { ...tr, z0: Z + 0.08, z1: Z + 0.1 }, palette.amber)
    // Insulators on the roof.
    for (const u of [0.2, 0.36]) {
      const c = L.at(u, 0.45)
      cylinder(p, c.col, c.row, 0.014, Z + 0.13, Z + 0.19, 0xe2e8f0)
    }
  })
  // Pylon: a tapered column of two boxes, with two cross arms.
  const c = L.at(0.72, 0.55)
  const leg = (r: number, z0: number, z1: number) => ({
    col0: c.col - r,
    row0: c.row - r,
    col1: c.col + r,
    row1: c.row + r,
    z0,
    z1,
  })
  sc.add(c, () => {
    shadow(p, c.col - 0.05, c.row - 0.05, c.col + 0.05, c.row + 0.05, Z, 0.45, false)
    box(p, leg(0.06, Z, Z + 0.22), 0xa3b1c6)
    box(p, leg(0.038, Z + 0.22, Z + 0.48), 0xa3b1c6)
    for (const z of [Z + 0.34, Z + 0.44]) {
      const arm = L.rect(0.52, 0.51, 0.92, 0.59)
      box(p, { ...arm, z0: z, z1: z + 0.026 }, 0x8a9bb3)
    }
    cone(p, c.col, c.row, 0.04, Z + 0.48, Z + 0.55, palette.amber)
    // A warning light that blinks at night, like the city's tower tips.
    beacon(p, c.col, c.row, Z + 0.56, 0xff6b5b)
  })
  sc.flush()
}

/** A water tower on legs with a small pump house. */
function waterTower(p: Paint, L: Lotted): void {
  const sc = new Scene()
  const pump = L.rect(0.08, 0.12, 0.34, 0.5)
  sc.addRect(pump, () => {
    shadow(p, pump.col0, pump.row0, pump.col1, pump.row1, Z, 0.12)
    box(p, { ...pump, z0: Z, z1: Z + 0.12 }, p.style.plaster[1]!)
    box(p, { ...pump, z0: Z + 0.12, z1: Z + 0.145 }, shade(palette.sky, 0.75))
  })
  const c = L.at(0.64, 0.5)
  const r = 0.13
  sc.add(c, () => {
    shadow(p, c.col - r, c.row - r, c.col + r, c.row + r, Z, 0.4, false)
    for (const [dc, dr] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const lc = c.col + dc * r * 0.7
      const lr = c.row + dr * r * 0.7
      box(
        p,
        { col0: lc - 0.01, row0: lr - 0.01, col1: lc + 0.01, row1: lr + 0.01, z0: Z, z1: Z + 0.24 },
        0x64748b,
      )
    }
    cylinder(p, c.col, c.row, r, Z + 0.24, Z + 0.4, palette.sky)
    cylinder(p, c.col, c.row, r * 1.02, Z + 0.3, Z + 0.32, shade(palette.sky, 0.8))
    cone(p, c.col, c.row, r * 1.08, Z + 0.4, Z + 0.48, light(palette.sky, 0.35))
  })
  sc.flush()
}

/** Stacks of gold coins (taller ones for the luxury tax). */
function coins(p: Paint, L: Lotted, index: number): void {
  const sc = new Scene()
  const luxury = index > 20
  const stacks: [number, number, number][] = luxury
    ? [
        [0.3, 0.6, 7],
        [0.52, 0.42, 9],
        [0.74, 0.62, 5],
        [0.5, 0.78, 3],
      ]
    : [
        [0.34, 0.55, 5],
        [0.56, 0.4, 3],
        [0.68, 0.66, 6],
      ]
  const coin = 0.024
  for (const [u, k, n] of stacks) {
    const c = L.at(u, k)
    sc.add(c, () => {
      shadow(p, c.col - 0.08, c.row - 0.08, c.col + 0.08, c.row + 0.08, Z, n * coin, false)
      for (let i = 0; i < n; i++) {
        const z = Z + i * coin
        // Alternate shades so the stack reads as separate coins.
        cylinder(
          p,
          c.col,
          c.row,
          0.075,
          z,
          z + coin * 0.92,
          i % 2 ? palette.amber : light(palette.amber, 0.15),
        )
      }
    })
  }
  sc.flush()
}

/** A deck of chance cards with one card standing up. */
function deck(p: Paint, L: Lotted): void {
  const sc = new Scene()
  const color = palette.indigo
  const pile = L.rect(0.18, 0.2, 0.58, 0.72)
  sc.addRect(pile, () => {
    shadow(p, pile.col0, pile.row0, pile.col1, pile.row1, Z, 0.08, false)
    for (let i = 0; i < 4; i++) {
      const z = Z + i * 0.018
      const off = (i % 2) * 0.012
      box(
        p,
        {
          col0: pile.col0 + off,
          row0: pile.row0 + off,
          col1: pile.col1 + off,
          row1: pile.row1 + off,
          z0: z,
          z1: z + 0.016,
        },
        i === 3 ? color : 0xf1f5f9,
      )
    }
    // A white diamond on the top card.
    const cc = (pile.col0 + pile.col1) / 2 + 0.012
    const cr = (pile.row0 + pile.row1) / 2 + 0.012
    const rr = Math.min(pile.col1 - pile.col0, pile.row1 - pile.row0) * 0.28
    const top = Z + 0.072
    p.g.poly(disc(cc, cr, rr, top, p.t, 4)).fill(0xf8fafc)
  })
  // One card on its edge behind the pile.
  const up = L.rect(0.62, 0.62, 0.9, 0.68)
  sc.addRect(up, () => {
    shadow(p, up.col0, up.row0, up.col1, up.row1, Z, 0.3, false)
    box(p, { ...up, z0: Z, z1: Z + 0.34 }, color)
    const face = L.rect(0.66, 0.6, 0.86, 0.62)
    box(p, { ...face, z0: Z + 0.05, z1: Z + 0.29 }, light(color, 0.3))
  })
  sc.flush()
}

/** A treasure chest with gold bands, a few coins spilled in front. */
function chest(p: Paint, L: Lotted): void {
  const sc = new Scene()
  const wood = palette.teal
  const body = L.rect(0.28, 0.3, 0.72, 0.74)
  sc.addRect(body, () => {
    shadow(p, body.col0, body.row0, body.col1, body.row1, Z, 0.2)
    box(p, { ...body, z0: Z, z1: Z + 0.13 }, wood)
    const lid = {
      col0: body.col0 - 0.01,
      row0: body.row0 - 0.01,
      col1: body.col1 + 0.01,
      row1: body.row1 + 0.01,
    }
    box(p, { ...lid, z0: Z + 0.13, z1: Z + 0.2 }, light(wood, 0.18))
    for (const u of [0.36, 0.64]) {
      const band = L.rect(u - 0.014, 0.29, u + 0.014, 0.75)
      box(p, { ...band, z0: Z, z1: Z + 0.205 }, palette.amber)
    }
    const latch = L.rect(0.46, 0.27, 0.54, 0.31)
    box(p, { ...latch, z0: Z + 0.09, z1: Z + 0.15 }, light(palette.amber, 0.2))
  })
  for (const [u, k] of [
    [0.2, 0.14],
    [0.32, 0.08],
    [0.8, 0.16],
  ] as const) {
    const c = L.at(u, k)
    sc.add(c, () => cylinder(p, c.col, c.row, 0.04, Z, Z + 0.016, palette.amber))
  }
  sc.flush()
}

// ---- corners ---------------------------------------------------------------
// Pieces stand in a grid centered on a corner, so corner props keep to its two back edges (the
// ones away from the camera, at col0 and row0) and never cover a piece.

/** A corner-local rectangle, in fractions of the corner's size from its back corner. */
function cornerRect(fp: Footprint, a0: number, b0: number, a1: number, b1: number) {
  const w = fp.col1 - fp.col0
  return { col0: fp.col0 + a0 * w, row0: fp.row0 + b0 * w, col1: fp.col0 + a1 * w, row1: fp.row0 + b1 * w }
}

/** A flat rectangle on a box's front face at `row` (spanning cols) or at `col` (spanning rows). */
function onFace(
  p: Paint,
  face: 'row' | 'col',
  at: number,
  a0: number,
  a1: number,
  z0: number,
  z1: number,
  color: number,
): void {
  const pts =
    face === 'row'
      ? [
          { col: a0, row: at, z: z1 },
          { col: a1, row: at, z: z1 },
          { col: a1, row: at, z: z0 },
          { col: a0, row: at, z: z0 },
        ]
      : [
          { col: at, row: a0, z: z1 },
          { col: at, row: a1, z: z1 },
          { col: at, row: a1, z: z0 },
          { col: at, row: a0, z: z0 },
        ]
  p.g.poly(projectPoly(pts, p.t)).fill(color)
}

/** Two barred windows on each front face of a block. */
function barredWindows(
  p: Paint,
  b: { col0: number; row0: number; col1: number; row1: number },
  z: number,
  h: number,
) {
  for (const face of ['row', 'col'] as const) {
    const at = face === 'row' ? b.row1 + 0.001 : b.col1 + 0.001
    const [lo, hi] = face === 'row' ? [b.col0, b.col1] : [b.row0, b.row1]
    for (const k of [0.3, 0.7]) {
      const c = lo + (hi - lo) * k
      const w = (hi - lo) * 0.13
      onFace(p, face, at, c - w, c + w, z, z + h, 0x1e293b)
      for (const f of [-0.5, 0, 0.5]) {
        const x = c + f * w
        onFace(p, face, at + 0.001, x - 0.005, x + 0.005, z, z + h, 0xcbd5e1)
      }
    }
  }
}

/** Lockup: a slate cell block with barred windows and a blue light, and a fenced yard. */
function lockup(p: Paint, fp: Footprint): void {
  const s = p.style
  const wall = s.plaster[3]!
  const b = cornerRect(fp, 0.06, 0.06, 0.44, 0.44)
  const h = 0.32
  // The yard fence first (it runs along the back edges, behind the block's front).
  const post = 0x94a3b8
  for (let i = 0; i <= 6; i++) {
    const a = 0.48 + i * 0.07
    for (const [c, r] of [
      [fp.col0 + a * (fp.col1 - fp.col0), fp.row0 + 0.05],
      [fp.col0 + 0.05, fp.row0 + a * (fp.row1 - fp.row0)],
    ] as const)
      box(p, { col0: c - 0.008, row0: r - 0.008, col1: c + 0.008, row1: r + 0.008, z0: 0, z1: 0.16 }, post)
  }
  for (const r of [cornerRect(fp, 0.46, 0.025, 0.92, 0.04), cornerRect(fp, 0.025, 0.46, 0.04, 0.92)])
    box(p, { ...r, z0: 0.14, z1: 0.16 }, post)
  shadow(p, b.col0, b.row0, b.col1, b.row1, 0, h)
  box(p, { ...b, z0: 0, z1: h }, wall)
  box(p, { ...b, z0: 0, z1: 0.05 }, shade(wall, 0.8))
  barredWindows(p, b, 0.12, 0.12)
  const roof = { col0: b.col0 - 0.015, row0: b.row0 - 0.015, col1: b.col1 + 0.015, row1: b.row1 + 0.015 }
  box(p, { ...roof, z0: h, z1: h + 0.035 }, shade(wall, 0.7))
  const cc = (b.col0 + b.col1) / 2
  const cr = (b.row0 + b.row1) / 2
  cylinder(p, cc, cr, 0.03, h + 0.035, h + 0.08, 0x93c5fd)
  beacon(p, cc, cr, h + 0.08, 0x60a5fa)
}

/** Go to Lockup: a police booth with a blue light and a red and white boom gate. */
function goToLockup(p: Paint, fp: Footprint): void {
  const s = p.style
  const w = fp.col1 - fp.col0
  // Boom gate along the back edge (behind the booth's front): a post and a striped arm.
  const pc = fp.col0 + 0.36 * w
  const pr = fp.row0 + 0.1
  box(
    p,
    { col0: pc - 0.025, row0: pr - 0.025, col1: pc + 0.025, row1: pr + 0.025, z0: 0, z1: 0.17 },
    0x475569,
  )
  const n = 8
  const span = 0.54 * w
  for (let i = 0; i < n; i++) {
    const c0 = pc + 0.03 + (i * span) / n
    const c1 = pc + 0.03 + ((i + 1) * span) / n
    box(
      p,
      { col0: c0, row0: pr - 0.012, col1: c1, row1: pr + 0.012, z0: 0.13, z1: 0.155 },
      i % 2 ? 0xf8fafc : 0xe5484d,
    )
  }
  const b = cornerRect(fp, 0.06, 0.06, 0.3, 0.3)
  const h = 0.27
  shadow(p, b.col0, b.row0, b.col1, b.row1, 0, h)
  box(p, { ...b, z0: 0, z1: h }, s.plaster[0]!)
  box(p, { ...b, z0: 0.15, z1: 0.2 }, 0x334155)
  box(p, { ...b, z0: h - 0.05, z1: h - 0.02 }, 0x3b82f6)
  const roof = { col0: b.col0 - 0.02, row0: b.row0 - 0.02, col1: b.col1 + 0.02, row1: b.row1 + 0.02 }
  box(p, { ...roof, z0: h, z1: h + 0.03 }, 0x1e3a8a)
  const cc = (b.col0 + b.col1) / 2
  const cr = (b.row0 + b.row1) / 2
  cylinder(p, cc, cr, 0.025, h + 0.03, h + 0.07, 0x93c5fd)
  beacon(p, cc, cr, h + 0.07, 0x60a5fa)
}

/** Central Park: trees along the back edges, a fountain in the back corner, a bench and flowers. */
function park(p: Paint, fp: Footprint): void {
  const s = p.style
  const w = fp.col1 - fp.col0
  const at = (a: number, b: number) => ({ col: fp.col0 + a * w, row: fp.row0 + b * w })
  // Trees along both back edges, back to front.
  const spots: [number, number, number, boolean][] = [
    [0.55, 0.08, 0.15, false],
    [0.08, 0.55, 0.15, false],
    [0.72, 0.1, 0.12, true],
    [0.1, 0.72, 0.12, true],
    [0.9, 0.08, 0.14, false],
    [0.08, 0.9, 0.14, false],
  ]
  const trees = spots.toSorted((x, y) => x[0] + x[1] - (y[0] + y[1]))
  // Fountain in the back corner.
  const f = at(0.22, 0.22)
  shadow(p, f.col - 0.2, f.row - 0.2, f.col + 0.2, f.row + 0.2, 0, 0.06, false)
  cylinder(p, f.col, f.row, 0.2, 0, 0.06, light(s.parkPath, 0.2))
  p.g.poly(disc(f.col, f.row, 0.17, 0.061, p.t, 24)).fill(mix(palette.sky, 0xffffff, 0.15))
  cylinder(p, f.col, f.row, 0.035, 0.06, 0.16, light(s.parkPath, 0.1))
  cylinder(p, f.col, f.row, 0.07, 0.16, 0.18, light(s.parkPath, 0.2))
  blob(p, f.col, f.row, 0.22, 0.035, light(palette.sky, 0.5))
  const bc = at(0.42, 0.06)
  bench(p, bc.col, bc.row + 0.04, 0, 0x8b6b4a)
  for (const [a, b, size, pine] of trees) {
    const c = at(a, b)
    tree(p, c.col, c.row, 0, size, s.trees[Math.round((a + b) * 10) % s.trees.length]!, pine)
  }
  // Flower beds by the fountain, lamps at the path.
  for (const [a, b, color] of [
    [0.44, 0.2, 0xf472b6],
    [0.2, 0.44, 0xfacc15],
    [0.4, 0.4, 0xf87171],
  ] as const) {
    const c = at(a, b)
    blob(p, c.col, c.row, 0.03, 0.05, color)
  }
  for (const [a, b] of [
    [0.62, 0.26],
    [0.26, 0.62],
  ] as const) {
    const c = at(a, b)
    lamp(p, c.col, c.row, 0)
  }
}
