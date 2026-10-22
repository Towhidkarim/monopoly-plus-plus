import { Graphics } from 'pixi.js'
import { projectPoly, type Pos } from '../geometry/project.ts'
import { BOARD, DEPTH } from '../geometry/ring.ts'
import { palette, shade } from '../palette.ts'
import { cosmeticRng, disc, isoBox, rect, type Box } from './draw.ts'

/**
 * Board slab and placeholder inner city (plaza, cross roads, rail loop, code-drawn buildings).
 * Placeholder for Milestone 6's real city generator; already depth-sorted with tokens.
 */

const SLAB_Z = -0.1
const PLAZA = { lo: DEPTH + 0.75, hi: BOARD - DEPTH - 0.75, z: 0.12 }
const CENTER = BOARD / 2
const ROAD_HALF = 0.26
const RAIL_INSET = 0.36

export class GroundView {
  readonly graphics = new Graphics()

  draw(t: number): void {
    const g = this.graphics.clear()
    // Soft table shadow under the board.
    g.poly(rect(0.25, 0.45, BOARD + 0.35, BOARD + 0.55, -0.55, t)).fill({ color: 0x000000, alpha: 0.35 })
    isoBox(
      g,
      { col0: 0, row0: 0, col1: BOARD, row1: BOARD, z0: -0.5, z1: SLAB_Z },
      { top: palette.slabTop, left: palette.slabLeft, right: palette.slabRight },
      t,
    )
    // City ground inside the ring.
    g.poly(rect(DEPTH + 0.05, DEPTH + 0.05, BOARD - DEPTH - 0.05, BOARD - DEPTH - 0.05, SLAB_Z, t)).fill(
      0x243246,
    )
    drawRails(g, t)
    // Raised plaza with cross roads.
    isoBox(
      g,
      { col0: PLAZA.lo, row0: PLAZA.lo, col1: PLAZA.hi, row1: PLAZA.hi, z0: SLAB_Z, z1: PLAZA.z },
      { top: palette.plazaTop, left: 0x64748b, right: 0x475569 },
      t,
    )
    const z = PLAZA.z
    g.poly(rect(CENTER - ROAD_HALF, PLAZA.lo, CENTER + ROAD_HALF, PLAZA.hi, z, t)).fill(palette.road)
    g.poly(rect(PLAZA.lo, CENTER - ROAD_HALF, PLAZA.hi, CENTER + ROAD_HALF, z, t)).fill(palette.road)
    for (let s = PLAZA.lo + 0.2; s < PLAZA.hi - 0.3; s += 0.5) {
      if (Math.abs(s + 0.12 - CENTER) < ROAD_HALF + 0.1) continue
      g.poly(rect(CENTER - 0.025, s, CENTER + 0.025, s + 0.24, z, t)).fill(palette.roadLine)
      g.poly(rect(s, CENTER - 0.025, s + 0.24, CENTER + 0.025, z, t)).fill(palette.roadLine)
    }
  }
}

function railLoop(inset: number): Pos[] {
  const lo = DEPTH + inset
  const hi = BOARD - DEPTH - inset
  const r = 0.7
  const pts: Pos[] = []
  const corners = [
    [hi - r, hi - r, 0],
    [lo + r, hi - r, 0.5],
    [lo + r, lo + r, 1],
    [hi - r, lo + r, 1.5],
  ] as const
  for (const [cc, cr, start] of corners) {
    for (let i = 0; i <= 8; i++) {
      const a = (start + (i / 8) * 0.5) * Math.PI
      pts.push({ col: cc + Math.cos(a) * r, row: cr + Math.sin(a) * r, z: SLAB_Z })
    }
  }
  return pts
}

function drawRails(g: Graphics, t: number): void {
  const center = railLoop(RAIL_INSET)
  g.poly(projectPoly(center, t), true).stroke({ color: 0x1e293b, width: 16, join: 'round' })
  for (const off of [-0.07, 0.07]) {
    g.poly(projectPoly(railLoop(RAIL_INSET + off), t), true).stroke({ color: 0x94a3b8, width: 2 })
  }
}

interface Building {
  box: Box
  colors: { top: number; left: number; right: number }
  roof: number
  floors: number
}

interface Tree {
  col: number
  row: number
  r: number
}

/** Generates placeholder buildings/trees as individually depth-sorted Graphics. */
export class CityView {
  readonly items: { g: Graphics; draw: (t: number) => void }[] = []

  constructor(seed = 7) {
    const rng = cosmeticRng(seed)
    const qLo = [PLAZA.lo + 0.12, CENTER + ROAD_HALF + 0.12]
    const qHi = [CENTER - ROAD_HALF - 0.12, PLAZA.hi - 0.12]
    const lots = 3
    for (let qc = 0; qc < 2; qc++) {
      for (let qr = 0; qr < 2; qr++) {
        const c0 = qLo[qc]!
        const r0 = qLo[qr]!
        const size = (qHi[qc]! - c0) / lots
        const park = qc === 0 && qr === 1
        for (let i = 0; i < lots; i++) {
          for (let j = 0; j < lots; j++) {
            const col = c0 + (i + 0.5) * size
            const row = r0 + (j + 0.5) * size
            const dist = Math.hypot(col - CENTER, row - CENTER) / (BOARD / 2)
            if (park && (i + j) % 3 !== 0) {
              this.addTrees(col, row, size, rng)
              continue
            }
            // The back quadrant sits in front of the far tiles on screen: keep it low.
            const back = qc === 0 && qr === 0
            if (rng() < 0.12 && dist > 0.3) continue // a few open plazas break up the grid
            this.addBuilding(col, row, size, dist, back ? 0.45 : 1, rng)
          }
        }
      }
    }
  }

  private addBuilding(
    col: number,
    row: number,
    size: number,
    dist: number,
    scale: number,
    rng: () => number,
  ): void {
    const w = size * (0.55 + rng() * 0.3)
    const d = size * (0.55 + rng() * 0.3)
    // A tall core near the crossroads, falling off quickly toward the rail loop.
    const tall = Math.max(0.3, (0.3 + Math.max(0, 0.5 - dist) * 5 + rng() * 0.45) * scale)
    const tones = [
      { top: 0xcbd5e1, left: 0x5b7aa6, right: 0x3b5378 },
      { top: 0xe2e8f0, left: 0x6b8fb8, right: 0x45628a },
      { top: 0xb8c4d6, left: 0x4b6a94, right: 0x324766 },
      { top: 0xdbe4ee, left: 0x7c9cc4, right: 0x52709a },
    ]
    const b: Building = {
      box: {
        col0: col - w / 2,
        row0: row - d / 2,
        col1: col + w / 2,
        row1: row + d / 2,
        z0: PLAZA.z,
        z1: PLAZA.z + tall,
      },
      colors: tones[Math.floor(rng() * tones.length)]!,
      roof: [palette.alert, palette.accent, palette.amber, 0xcbd5e1][Math.floor(rng() * 4)]!,
      floors: Math.max(1, Math.round(tall / 0.22)),
    }
    const g = new Graphics()
    g.zIndex = col + row
    this.items.push({ g, draw: (t) => drawBuilding(g.clear(), b, t) })
  }

  private addTrees(col: number, row: number, size: number, rng: () => number): void {
    const trees: Tree[] = []
    for (let k = 0; k < 3; k++) {
      trees.push({
        col: col + (rng() - 0.5) * size * 0.6,
        row: row + (rng() - 0.5) * size * 0.6,
        r: 0.12 + rng() * 0.1,
      })
    }
    const g = new Graphics()
    g.zIndex = col + row
    this.items.push({
      g,
      draw: (t) => {
        g.clear()
        g.poly(
          rect(
            col - size / 2 + 0.04,
            row - size / 2 + 0.04,
            col + size / 2 - 0.04,
            row + size / 2 - 0.04,
            PLAZA.z + 0.001,
            t,
          ),
        ).fill(0x2f8f83)
        for (const tr of trees.toSorted((a, b) => a.col + a.row - (b.col + b.row))) {
          g.poly(disc(tr.col, tr.row, tr.r, PLAZA.z + 0.18, t)).fill(0x34d399)
          g.poly(disc(tr.col - 0.03, tr.row - 0.03, tr.r * 0.6, PLAZA.z + 0.22, t)).fill(0x6ee7b7)
        }
      },
    })
  }
}

function drawBuilding(g: Graphics, b: Building, t: number): void {
  isoBox(g, b.box, b.colors, t)
  const { col0, row0, col1, row1, z0, z1 } = b.box
  // Ribbon windows: one strip per floor on each visible face.
  const fh = (z1 - z0) / b.floors
  const winL = shade(b.colors.left, 1.35)
  const winR = shade(b.colors.right, 1.4)
  for (let f = 0; f < b.floors; f++) {
    const za = z0 + f * fh + fh * 0.35
    const zb = z0 + f * fh + fh * 0.75
    const inset = 0.06
    g.poly(
      projectPoly(
        [
          { col: col0 + inset, row: row1, z: zb },
          { col: col1 - inset, row: row1, z: zb },
          { col: col1 - inset, row: row1, z: za },
          { col: col0 + inset, row: row1, z: za },
        ],
        t,
      ),
    ).fill(winL)
    g.poly(
      projectPoly(
        [
          { col: col1, row: row0 + inset, z: zb },
          { col: col1, row: row1 - inset, z: zb },
          { col: col1, row: row1 - inset, z: za },
          { col: col1, row: row0 + inset, z: za },
        ],
        t,
      ),
    ).fill(winR)
  }
  // Roof cap.
  const m = Math.min(col1 - col0, row1 - row0) * 0.25
  isoBox(
    g,
    { col0: col0 + m, row0: row0 + m, col1: col1 - m, row1: row1 - m, z0: z1, z1: z1 + 0.06 },
    { top: b.roof, left: shade(b.roof, 0.8), right: shade(b.roof, 0.6) },
    t,
  )
}
