/**
 * Tiny 3D math for the dice (pure, no Pixi). Board units: x = col, y = row, z = height.
 * Quaternions are body-to-world rotations, `{ w, x, y, z }`.
 */

export interface V3 {
  x: number
  y: number
  z: number
}

export interface Quat {
  w: number
  x: number
  y: number
  z: number
}

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z })
export const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a: V3, b: V3): V3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
export const len = (a: V3): number => Math.sqrt(dot(a, a))

export const QI: Readonly<Quat> = { w: 1, x: 0, y: 0, z: 0 }

/** a * b: apply b first, then a. */
export function qmul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  }
}

export function qnorm(q: Quat): Quat {
  const n = Math.hypot(q.w, q.x, q.y, q.z) || 1
  return { w: q.w / n, x: q.x / n, y: q.y / n, z: q.z / n }
}

/** Rotation of `angle` radians about unit `axis`. */
export function qaxis(axis: V3, angle: number): Quat {
  const s = Math.sin(angle / 2)
  return { w: Math.cos(angle / 2), x: axis.x * s, y: axis.y * s, z: axis.z * s }
}

/** Rotates `v` by `q` into `out` (no allocation when `out` is given). */
export function qrot(q: Quat, v: V3, out: V3 = v3()): V3 {
  // t = 2 * (q.xyz x v); v' = v + w t + q.xyz x t
  const tx = 2 * (q.y * v.z - q.z * v.y)
  const ty = 2 * (q.z * v.x - q.x * v.z)
  const tz = 2 * (q.x * v.y - q.y * v.x)
  const x = v.x + q.w * tx + (q.y * tz - q.z * ty)
  const y = v.y + q.w * ty + (q.z * tx - q.x * tz)
  const z = v.z + q.w * tz + (q.x * ty - q.y * tx)
  out.x = x
  out.y = y
  out.z = z
  return out
}

/** Spherical interpolation along the short arc. */
export function slerp(a: Quat, b: Quat, k: number, out: Quat = { ...QI }): Quat {
  let bw = b.w
  let bx = b.x
  let by = b.y
  let bz = b.z
  let c = a.w * bw + a.x * bx + a.y * by + a.z * bz
  if (c < 0) {
    c = -c
    bw = -bw
    bx = -bx
    by = -by
    bz = -bz
  }
  let ka = 1 - k
  let kb = k
  if (c < 0.9995) {
    const th = Math.acos(c)
    const s = Math.sin(th)
    ka = Math.sin((1 - k) * th) / s
    kb = Math.sin(k * th) / s
  }
  out.w = a.w * ka + bw * kb
  out.x = a.x * ka + bx * kb
  out.y = a.y * ka + by * kb
  out.z = a.z * ka + bz * kb
  const n = Math.hypot(out.w, out.x, out.y, out.z) || 1
  out.w /= n
  out.x /= n
  out.y /= n
  out.z /= n
  return out
}

/** The shortest rotation taking unit vector `from` onto unit vector `to`. */
export function qbetween(from: V3, to: V3): Quat {
  const c = dot(from, to)
  if (c > 1 - 1e-9) return { ...QI }
  if (c < -1 + 1e-9) {
    const side = Math.abs(from.x) < 0.9 ? v3(1, 0, 0) : v3(0, 1, 0)
    const a = cross(from, side)
    const l = len(a)
    return qaxis(v3(a.x / l, a.y / l, a.z / l), Math.PI)
  }
  const a = cross(from, to)
  return qnorm({ w: 1 + c, x: a.x, y: a.y, z: a.z })
}

/** Seeded RNG (mulberry32). Cosmetic only: the dice values come from the engine. */
export function diceRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let x = a
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}
