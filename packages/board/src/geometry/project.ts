/**
 * The only place that knows the camera angle (docs/ARCHITECTURE.md section 3).
 * Board units -> world pixels. `t` morphs 0 = top-down, 1 = isometric. Both endpoints and
 * every blend are invertible linear maps (the determinant stays positive), so shapes never fold.
 */

export interface Pos {
  col: number
  row: number
  z: number
}

/** Iso tile size per board unit, and top-down size per board unit. */
export const TILE = { w: 128, h: 72, flat: 92 } as const
/** Screen px per unit of z. */
export const LEVEL = 80

function matrix(t: number) {
  const k = 1 - t
  return {
    a: k * TILE.flat + (t * TILE.w) / 2, // x per col
    b: (-t * TILE.w) / 2, // x per row
    c: (t * TILE.h) / 2, // y per col
    d: k * TILE.flat + (t * TILE.h) / 2, // y per row
  }
}

export function project(p: Pos, t: number): { x: number; y: number } {
  const m = matrix(t)
  return { x: m.a * p.col + m.b * p.row, y: m.c * p.col + m.d * p.row - p.z * zScale(t) }
}

/** Screen px per unit of z at morph `t`. Heights flatten out in the top-down view. */
export function zScale(t: number): number {
  return LEVEL * t
}

/** Inverse of `project` for a known height `z`. */
export function unproject(x: number, y: number, z: number, t: number): { col: number; row: number } {
  const m = matrix(t)
  const yy = y + z * zScale(t)
  const det = m.a * m.d - m.b * m.c
  return { col: (m.d * x - m.b * yy) / det, row: (m.a * yy - m.c * x) / det }
}

/** Flattens projected points to [x0, y0, x1, y1, ...] for Graphics.poly. */
export function projectPoly(points: readonly Pos[], t: number): number[] {
  const out: number[] = []
  for (const p of points) {
    const s = project(p, t)
    out.push(s.x, s.y)
  }
  return out
}
