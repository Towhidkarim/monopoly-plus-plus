import { dot, qaxis, qrot, type Quat, type V3 } from './math.ts'

/**
 * The die in its own body frame: a cube of half size 1, opposite faces sum to 7. Each face has
 * an outward normal and two tangents with `u x v = normal`, so its corners wind the same way.
 */
export interface Face {
  readonly value: number
  readonly n: V3
  readonly u: V3
  readonly v: V3
}

const X = { x: 1, y: 0, z: 0 }
const Y = { x: 0, y: 1, z: 0 }
const Z = { x: 0, y: 0, z: 1 }
const neg = (a: V3): V3 => ({ x: -a.x, y: -a.y, z: -a.z })

export const FACES: readonly Face[] = [
  { value: 1, n: Z, u: X, v: Y },
  { value: 6, n: neg(Z), u: Y, v: X },
  { value: 2, n: X, u: Y, v: Z },
  { value: 5, n: neg(X), u: Z, v: Y },
  { value: 3, n: Y, u: Z, v: X },
  { value: 4, n: neg(Y), u: X, v: Z },
]

/** Pip centers per value on a face, in face units (-1..1 along u and v). */
export const PIPS: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  1: [[0, 0]],
  2: [
    [-1, -1],
    [1, 1],
  ],
  3: [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  4: [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ],
  5: [
    [-1, -1],
    [-1, 1],
    [0, 0],
    [1, -1],
    [1, 1],
  ],
  6: [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ],
}

/** The eight body corners of the unit cube. */
export const CORNERS: readonly V3[] = [-1, 1].flatMap((x) =>
  [-1, 1].flatMap((y) => [-1, 1].map((z) => ({ x, y, z }))),
)

export function faceOf(value: number): Face {
  const f = FACES.find((face) => face.value === value)
  if (!f) throw new Error(`no die face ${value}`)
  return f
}

const scratch = { x: 0, y: 0, z: 0 }

/** The face pointing most nearly up for orientation `q`. */
export function topFace(q: Quat): Face {
  let best = FACES[0]!
  let bestZ = -Infinity
  for (const f of FACES) {
    const z = qrot(q, f.n, scratch).z
    if (z > bestZ) {
      bestZ = z
      best = f
    }
  }
  return best
}

/**
 * A rotation of the cube onto itself (body frame) that takes face `want` to where face `have`
 * is. Right-multiplying an orientation by it keeps every corner's world path (corners only swap
 * places) and makes `want` show wherever `have` showed (DECISIONS.md D38).
 */
export function faceSwap(want: number, have: number): Quat {
  const a = faceOf(want).n
  const b = faceOf(have).n
  const c = dot(a, b)
  if (c > 0.5) return { w: 1, x: 0, y: 0, z: 0 }
  if (c < -0.5) {
    // Half turn about any cube axis perpendicular to both.
    const axis = Math.abs(a.z) > 0.5 ? X : Z
    return qaxis(axis, Math.PI)
  }
  // Quarter turn about a x b takes a onto b.
  const axis = { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }
  return qaxis(axis, Math.PI / 2)
}

/** The Speed die's faces: 1, 2, 3, Bus, Scout, Scout (type `SpeedFace` in the engine). */
export type SpeedFace = 1 | 2 | 3 | 'bus' | 'scout'

/**
 * Which cube face prints a Speed die result. Numbers sit on the faces with the same value (pips
 * as on a white die), the bus on 4, and the scout on the two faces opposite 2 and 1 (5 and 6);
 * `pick` (the throw seed) chooses between them so the same result does not always show the same
 * face. Opposite faces sum to 7, so the two scouts are never next to each other.
 */
export function speedFaceValue(face: SpeedFace, pick = 0): number {
  if (face === 'bus') return 4
  if (face === 'scout') return pick & 1 ? 5 : 6
  return face
}

/** Inverse of `speedFaceValue`: what a Speed die showing cube face `value` means. */
export function speedFaceOf(value: number): SpeedFace {
  if (value >= 5) return 'scout'
  if (value === 4) return 'bus'
  return value === 1 ? 1 : value === 2 ? 2 : 3
}
