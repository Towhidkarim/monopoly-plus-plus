import type { Graphics } from 'pixi.js'
import { projectPoly, type Pos } from '../geometry/project.ts'

export interface Box {
  col0: number
  row0: number
  col1: number
  row1: number
  z0: number
  z1: number
}

export interface BoxColors {
  top: number
  left: number
  right: number
}

/**
 * Draws the three visible faces of a board-space box: top, the +row face (lower-left on
 * screen, lit) and the +col face (lower-right, shaded). Light comes from the top-left.
 */
export function isoBox(g: Graphics, b: Box, c: BoxColors, t: number): void {
  const { col0, row0, col1, row1, z0, z1 } = b
  if (z1 > z0) {
    g.poly(
      projectPoly(
        [
          { col: col0, row: row1, z: z1 },
          { col: col1, row: row1, z: z1 },
          { col: col1, row: row1, z: z0 },
          { col: col0, row: row1, z: z0 },
        ],
        t,
      ),
    ).fill(c.left)
    g.poly(
      projectPoly(
        [
          { col: col1, row: row0, z: z1 },
          { col: col1, row: row1, z: z1 },
          { col: col1, row: row1, z: z0 },
          { col: col1, row: row0, z: z0 },
        ],
        t,
      ),
    ).fill(c.right)
  }
  g.poly(rect(col0, row0, col1, row1, z1, t)).fill(c.top)
}

/** Projected rectangle on the plane `z`. */
export function rect(col0: number, row0: number, col1: number, row1: number, z: number, t: number): number[] {
  return projectPoly(
    [
      { col: col0, row: row0, z },
      { col: col1, row: row0, z },
      { col: col1, row: row1, z },
      { col: col0, row: row1, z },
    ],
    t,
  )
}

/** Projected circle (an ellipse in iso) on the plane `z`. */
export function disc(col: number, row: number, r: number, z: number, t: number, n = 20): number[] {
  const pts: Pos[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push({ col: col + Math.cos(a) * r, row: row + Math.sin(a) * r, z })
  }
  return projectPoly(pts, t)
}

/** Deterministic cosmetic RNG (mulberry32). Never used for game outcomes. */
export function cosmeticRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let x = a
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}
