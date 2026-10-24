import { projectPoly, type Pos } from '../geometry/project.ts'
import { faces, light, mix, type Paint } from './paint.ts'

/**
 * Rail loop and trains. A train is a few cars placed by distance along the track; each car is an
 * oriented box, so it turns smoothly through the curves (redrawn per frame while it moves).
 */

/** Rounded-rectangle loop through the given bounds (board units), as a closed polyline. */
export function trackLoop(
  col0: number,
  row0: number,
  col1: number,
  row1: number,
  radius: number,
  z: number,
): Pos[] {
  const pts: Pos[] = []
  const corners = [
    [col1 - radius, row1 - radius, 0],
    [col0 + radius, row1 - radius, 0.5],
    [col0 + radius, row0 + radius, 1],
    [col1 - radius, row0 + radius, 1.5],
  ] as const
  for (const [cc, cr, start] of corners) {
    for (let i = 0; i <= 24; i++) {
      const a = (start + (i / 24) * 0.5) * Math.PI
      pts.push({ col: cc + Math.cos(a) * radius, row: cr + Math.sin(a) * radius, z })
    }
  }
  return pts
}

/** Ballast bed, sleepers and two rails. */
export function drawTrack(p: Paint, pts: readonly Pos[]) {
  const s = p.style
  p.g
    .poly(projectPoly(pts, p.t), true)
    .stroke({ color: mix(s.road, s.ground, 0.4), width: 18, join: 'round' })
  // Sleepers: short ticks across the track.
  const path = measure(pts)
  for (let d = 0; d < path.total; d += 0.07) {
    const { pos, dir } = at(path, d)
    const n = { col: -dir.row * 0.07, row: dir.col * 0.07 }
    p.g
      .poly(
        projectPoly(
          [
            { ...pos, col: pos.col - n.col, row: pos.row - n.row },
            { ...pos, col: pos.col + n.col, row: pos.row + n.row },
          ],
          p.t,
        ),
        false,
      )
      .stroke({ color: mix(s.road, 0x000000, 0.2), width: 2 })
  }
  for (const off of [-0.045, 0.045]) {
    const rail = pts.map((q, i) => {
      const { dir } = at(path, path.cum[i]!)
      return { col: q.col - dir.row * off, row: q.row + dir.col * off, z: q.z }
    })
    p.g.poly(projectPoly(rail, p.t), true).stroke({ color: 0xcbd5e1, width: 1.6 })
  }
}

export interface Path {
  pts: readonly Pos[]
  cum: number[]
  total: number
}

export function measure(pts: readonly Pos[]): Path {
  const cum = [0]
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i % pts.length]!
    cum.push(cum[i - 1]! + Math.hypot(b.col - a.col, b.row - a.row))
  }
  return { pts, cum, total: cum[cum.length - 1]! }
}

/** Position and unit direction at distance `d` along a closed path. */
export function at(path: Path, d: number): { pos: Pos; dir: { col: number; row: number } } {
  const dd = ((d % path.total) + path.total) % path.total
  let i = 1
  while (i < path.cum.length - 1 && path.cum[i]! < dd) i++
  const a = path.pts[(i - 1) % path.pts.length]!
  const b = path.pts[i % path.pts.length]!
  const len = path.cum[i]! - path.cum[i - 1]! || 1
  const k = (dd - path.cum[i - 1]!) / len
  return {
    pos: { col: a.col + (b.col - a.col) * k, row: a.row + (b.row - a.row) * k, z: a.z },
    dir: { col: (b.col - a.col) / len, row: (b.row - a.row) / len },
  }
}

/**
 * Box rotated in the board plane: only the side faces turned toward the viewer (+col/+row) are
 * drawn, shaded by how they face the light, then the roof.
 */
export function orientedBox(
  p: Paint,
  c: { col: number; row: number },
  dir: { col: number; row: number },
  len: number,
  wid: number,
  z0: number,
  z1: number,
  color: number,
  windowColor?: number,
) {
  const f = faces(color, p.style)
  const u = { col: dir.col * (len / 2), row: dir.row * (len / 2) }
  const v = { col: -dir.row * (wid / 2), row: dir.col * (wid / 2) }
  const corners = [
    { col: c.col - u.col - v.col, row: c.row - u.row - v.row },
    { col: c.col + u.col - v.col, row: c.row + u.row - v.row },
    { col: c.col + u.col + v.col, row: c.row + u.row + v.row },
    { col: c.col - u.col + v.col, row: c.row - u.row + v.row },
  ]
  for (let i = 0; i < 4; i++) {
    const a = corners[i]!
    const b = corners[(i + 1) % 4]!
    // Outward normal of edge a->b.
    const ex = b.col - a.col
    const ey = b.row - a.row
    const nl = Math.hypot(ex, ey) || 1
    const n = { col: ey / nl, row: -ex / nl }
    const mid = { col: (a.col + b.col) / 2 - c.col, row: (a.row + b.row) / 2 - c.row }
    if (n.col * mid.col + n.row * mid.row < 0) {
      n.col = -n.col
      n.row = -n.row
    }
    if (n.col + n.row <= 0) continue
    const k = Math.max(0, Math.min(1, 0.5 + (n.row - n.col) * 0.5))
    const shade = mix(f.right, f.left, k)
    p.g
      .poly(
        projectPoly(
          [
            { ...a, z: z1 },
            { ...b, z: z1 },
            { ...b, z: z0 },
            { ...a, z: z0 },
          ],
          p.t,
        ),
      )
      .fill(shade)
    if (windowColor !== undefined && Math.hypot(ex, ey) > wid * 1.2) {
      const za = z0 + (z1 - z0) * 0.45
      const zb = z0 + (z1 - z0) * 0.8
      const w0 = 0.08
      const w1 = 0.92
      p.g
        .poly(
          projectPoly(
            [
              { col: a.col + ex * w0, row: a.row + ey * w0, z: zb },
              { col: a.col + ex * w1, row: a.row + ey * w1, z: zb },
              { col: a.col + ex * w1, row: a.row + ey * w1, z: za },
              { col: a.col + ex * w0, row: a.row + ey * w0, z: za },
            ],
            p.t,
          ),
        )
        .fill(mix(windowColor, shade, 0.25))
    }
  }
  p.g
    .poly(
      projectPoly(
        corners.map((q) => ({ ...q, z: z1 })),
        p.t,
      ),
    )
    .fill(light(f.top, 0.05))
}

/**
 * Smooth heading at distance `d`: the chord between points a little behind and ahead, so a car
 * turns continuously through a curve instead of snapping at every polyline joint.
 */
export function heading(path: Path, d: number, reach = 0.09): { col: number; row: number } {
  const a = at(path, d - reach).pos
  const b = at(path, d + reach).pos
  const len = Math.hypot(b.col - a.col, b.row - a.row) || 1
  return { col: (b.col - a.col) / len, row: (b.row - a.row) / len }
}

export const CAR_LEN = 0.44
export const CAR_GAP = 0.05

/** One train car around the origin of its own graphics, facing `dir` (redrawn only when it turns). */
export function drawTrainCar(p: Paint, dir: { col: number; row: number }, livery: number) {
  const c = { col: 0, row: 0 }
  p.g.clear()
  orientedBox(p, c, dir, CAR_LEN, 0.17, 0.02, 0.17, livery, p.style.window)
  orientedBox(p, c, dir, CAR_LEN * 0.82, 0.1, 0.17, 0.2, light(livery, 0.25))
}

/** A train of `cars` cars whose head is at distance `head` along the track. */
export function drawTrain(p: Paint, path: Path, head: number, cars: number, livery: number) {
  const carLen = CAR_LEN
  const gap = CAR_GAP
  const parts: { c: Pos; dir: { col: number; row: number } }[] = []
  for (let i = 0; i < cars; i++) {
    const d = head - i * (carLen + gap) - carLen / 2
    parts.push({ c: at(path, d).pos, dir: heading(path, d, carLen * 0.4) })
  }
  // Back to front so nearer cars overlap farther ones.
  for (const { c, dir } of parts.toSorted((a, b) => a.c.col + a.c.row - (b.c.col + b.c.row))) {
    orientedBox(p, c, dir, carLen, 0.17, c.z + 0.02, c.z + 0.17, livery, p.style.window)
    orientedBox(p, c, dir, carLen * 0.82, 0.1, c.z + 0.17, c.z + 0.2, light(livery, 0.25))
  }
}
