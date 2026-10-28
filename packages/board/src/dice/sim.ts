import { CORNERS, faceSwap, topFace } from './cube.ts'
import {
  cross,
  diceRng,
  dot,
  qaxis,
  qbetween,
  qmul,
  qnorm,
  qrot,
  slerp,
  v3,
  type Quat,
  type V3,
} from './math.ts'

/**
 * Visual dice throw, simulated ahead of time (DECISIONS.md D38). Pure: no Pixi, no clock.
 *
 * A small rigid-body model in board units (x = col, y = row, z = height): gravity, impulse
 * contacts at the cube's corners against the board plane (restitution, Coulomb friction),
 * contact damping, a sphere bump between the two dice, and soft walls around the throw area.
 * When a die nearly stops it tips onto its nearest face. The run is recorded at a fixed step
 * into a keyframe track, so playback speed never changes the result. The engine's values are
 * then forced by a body-frame face swap (`faceSwap`), which leaves every world path unchanged.
 */

export const STEP = 1 / 120

/** Throw area on the board, in board units. */
export interface ThrowArea {
  col0: number
  row0: number
  col1: number
  row1: number
}

/** Open front of the board, inside the ring near GO, where the dice read well. */
export const DEFAULT_THROW_AREA: ThrowArea = { col0: 8.3, row0: 8.3, col1: 10.9, row1: 10.9 }
/** Off the board, front-left on screen. */
export const DEFAULT_THROW_FROM = { col: 6.5, row: 14 } as const

/** Physics knobs (the `dice` section of JuiceConfig carries these plus the view's). */
export interface DicePhysics {
  /** Board units per second squared. */
  gravity: number
  /** Fraction of impact speed kept on a bounce. */
  restitution: number
  /** Coulomb friction coefficient against the board. */
  friction: number
  /** Initial spin, radians per second. */
  spin: number
  /** Horizontal throw speed, board units per second. */
  throwSpeed: number
  /** Edge length of a die, board units. */
  size: number
  /** Edge and corner radius as a fraction of the half edge (0 = sharp cube). */
  round: number
  /** Wanted time from release to rest (ms); candidate throws outside it are rejected. */
  minMs: number
  maxMs: number
}

export interface Pose {
  p: V3
  q: Quat
}

export interface DiceHit {
  /** Seconds after release. */
  t: number
  die: number
  /** 0..1, from the impact speed. */
  intensity: number
  /** Contact point in board units. */
  at: V3
  kind: 'floor' | 'dice' | 'wall'
}

export interface DiceTrack {
  /** Keyframes per die, one every STEP seconds; every die has the same count. */
  poses: Pose[][]
  hits: DiceHit[]
  /** Seconds from release until both dice are at rest. */
  duration: number
  /** Top face value of each die at rest (equals the requested values after the solve). */
  faces: number[]
  /** Half edge length, board units. */
  half: number
  /** Throw attempts the solver simulated before one fit the time window and the area. */
  tries: number
}

export interface ThrowRequest {
  /** Two or three die faces (the third is the Speed die: same cube, other print). */
  values: readonly number[]
  seed: number
  area: ThrowArea
  /** Where the dice leave the hand, board units (may be off the board). */
  from: { col: number; row: number }
  physics: DicePhysics
}

interface Body {
  p: V3
  v: V3
  q: Quat
  w: V3
  /** 0 flying or sliding, 1 tipping onto a face, 2 at rest. */
  mode: 0 | 1 | 2
  calm: number
  tipFrom: Quat
  tipTo: Quat
  tipT: number
  tipLen: number
  inside: boolean
  /** Where this die is herded once it has touched down (the board's gentle bowl). */
  goal: { x: number; y: number }
  landed: boolean
  lastHit: number
  restAt: number
}

/** Initial conditions for one throw (from the seed). */
interface Launch {
  p: V3[]
  v: V3[]
  q: Quat[]
  w: V3[]
  goal: { x: number; y: number }[]
}

const MAX_SECONDS = 3.2
const MAX_TRIES = 40
const ITERATIONS = 6
/** Impact speed (units/s) below which a contact does not bounce. */
const BOUNCE_MIN = 0.9
/** Impact speed that counts as a full-strength clack. */
const CLACK_FULL = 7
const HIT_COOLDOWN = 0.06
/** The bowl after touchdown: pull per unit off the goal (1/s^2) and drag (1/s). */
const STEER_K = 10
const STEER_C = 2.5

/** Simulates throws from the seed until one fits, then swaps faces so the dice show `values`. */
export function solveThrow(req: ThrowRequest): DiceTrack {
  const rng = diceRng(req.seed ^ 0x9e3779b9)
  let best: { track: DiceTrack; score: number } | null = null
  let tries = 0
  for (; tries < MAX_TRIES; tries++) {
    const launch = makeLaunch(rng, req)
    const track = simulate(launch, req.physics, req.area)
    const score = judge(track, req)
    if (!best || score < best.score) best = { track, score }
    if (score === 0) break
  }
  const track = best!.track
  track.tries = Math.min(tries + 1, MAX_TRIES)
  for (let i = 0; i < req.values.length; i++) {
    const swap = faceSwap(req.values[i]!, track.faces[i]!)
    for (const pose of track.poses[i]!) pose.q = qmul(pose.q, swap)
    track.faces[i] = topFace(track.poses[i]![track.poses[i]!.length - 1]!.q).value
  }
  return track
}

/** 0 when the throw fits the time window, rests inside the area, and the dice do not touch. */
function judge(track: DiceTrack, req: ThrowRequest): number {
  const { minMs, maxMs } = req.physics
  const ms = track.duration * 1000
  let score = ms < minMs ? (minMs - ms) / 100 : ms > maxMs ? (ms - maxMs) / 100 : 0
  const h = track.half
  const ends = track.poses.map((list) => list[list.length - 1]!)
  for (const end of ends) {
    const out =
      Math.max(0, req.area.col0 + h - end.p.x, end.p.x - (req.area.col1 - h)) +
      Math.max(0, req.area.row0 + h - end.p.y, end.p.y - (req.area.row1 - h))
    score += out * 20
  }
  for (let i = 0; i < ends.length; i++)
    for (let j = i + 1; j < ends.length; j++) if (restingOverlap(ends[i]!, ends[j]!, h)) score += 10
  // Prefer a few visible bounces, few hard knocks on the invisible rails, and no mid-air clash.
  if (track.hits.filter((x) => x.kind === 'floor').length < 3) score += 1
  score += track.hits.filter((x) => x.kind === 'wall' && x.intensity > 0.25).length * 0.4
  const firstFloor = track.hits.find((x) => x.kind === 'floor')?.t ?? 0
  if (track.hits.some((x) => x.kind === 'dice' && x.t < firstFloor)) score += 1
  return score
}

/** Separating-axis test of the two top squares (dice at rest are flat). */
export function restingOverlap(a: Pose, b: Pose, h: number): boolean {
  const margin = h * 0.3
  const axes: V3[] = []
  for (const pose of [a, b]) {
    axes.push(qrot(pose.q, v3(1, 0, 0)), qrot(pose.q, v3(0, 1, 0)), qrot(pose.q, v3(0, 0, 1)))
  }
  const d = v3(b.p.x - a.p.x, b.p.y - a.p.y, 0)
  for (const ax of axes) {
    const flat = v3(ax.x, ax.y, 0)
    const l = Math.hypot(flat.x, flat.y)
    if (l < 0.5) continue // the vertical axis
    flat.x /= l
    flat.y /= l
    const reach = (pose: Pose) => {
      let r = 0
      for (const k of [v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1)]) r += Math.abs(dot(qrot(pose.q, k), flat)) * h
      return r
    }
    if (Math.abs(dot(d, flat)) > reach(a) + reach(b) + margin) return false
  }
  return true
}

function randomQuat(rng: () => number): Quat {
  // Shoemake's uniform random rotation.
  const u1 = rng()
  const u2 = rng() * Math.PI * 2
  const u3 = rng() * Math.PI * 2
  const a = Math.sqrt(1 - u1)
  const b = Math.sqrt(u1)
  return { w: a * Math.sin(u2), x: a * Math.cos(u2), y: b * Math.sin(u3), z: b * Math.cos(u3) }
}

function makeLaunch(rng: () => number, req: ThrowRequest): Launch {
  const { area, from, physics: ph } = req
  const n = req.values.length
  const h = ph.size / 2
  const cx = (area.col0 + area.col1) / 2
  const cy = (area.row0 + area.row1) / 2
  const reach = Math.min(area.col1 - area.col0, area.row1 - area.row0) / 2
  let dx = cx - from.col
  let dy = cy - from.row
  const dl = Math.hypot(dx, dy) || 1
  dx /= dl
  dy /= dl
  // Across the throw, and the forward-roll axis (up x dir).
  const px = -dy
  const py = dx
  const launch: Launch = {
    p: Array.from({ length: n }, () => v3()),
    v: Array.from({ length: n }, () => v3()),
    q: Array.from({ length: n }, () => randomQuat(rng)),
    w: Array.from({ length: n }, () => v3()),
    goal: Array.from({ length: n }, () => ({ x: 0, y: 0 })),
  }
  const jitter = () => rng() * 2 - 1
  const speed = ph.throwSpeed * (0.85 + 0.3 * rng())
  for (let i = 0; i < n; i++) {
    // The Speed die (third) comes down the middle, behind the pair, and is herded ahead of them.
    const side = i === 0 ? -1 : i === 1 ? 1 : 0
    const mid = i === 2 ? 1 : 0
    const sx = from.col + px * side * 0.45 + jitter() * 0.15
    const sy = from.row + py * side * 0.45 + jitter() * 0.15
    const sz = 1.5 + rng() * 0.7
    // First touchdown in the near half of the area; the dice tumble on into it.
    const lead = reach * (0.8 + 0.2 * rng() + mid * 0.1)
    const tx = cx - dx * lead + px * side * reach * 0.3 + jitter() * reach * 0.15
    const ty = cy - dy * lead + py * side * reach * 0.3 + jitter() * reach * 0.15
    const dist = Math.hypot(tx - sx, ty - sy)
    const t = dist / (speed * (0.95 + 0.1 * rng()))
    launch.p[i] = v3(sx, sy, sz)
    launch.v[i] = v3((tx - sx) / t, (ty - sy) / t, (h * 1.4 + (ph.gravity * t * t) / 2 - sz) / t)
    const s = ph.spin
    launch.goal[i] = {
      x: cx + dx * reach * (0.1 + mid * 0.3) + px * side * reach * 0.38 + jitter() * reach * 0.2,
      y: cy + dy * reach * (0.1 + mid * 0.3) + py * side * reach * 0.38 + jitter() * reach * 0.2,
    }
    launch.w[i] = v3(px * s * 0.7 + jitter() * s * 0.5, py * s * 0.7 + jitter() * s * 0.5, jitter() * s * 0.4)
  }
  return launch
}

function makeBody(p: V3, v: V3, q: Quat, w: V3, goal: { x: number; y: number }): Body {
  return {
    p: { ...p },
    v: { ...v },
    q: qnorm(q),
    w: { ...w },
    mode: 0,
    calm: 0,
    tipFrom: q,
    tipTo: q,
    tipT: 0,
    tipLen: 0,
    inside: false,
    goal,
    landed: false,
    lastHit: -1,
    restAt: Infinity,
  }
}

/** Runs one throw to rest (no face swap). Exported for tests. */
export function simulate(launch: Launch, ph: DicePhysics, area: ThrowArea): DiceTrack {
  const h = ph.size / 2
  const bodies = launch.p.map((_, i) =>
    makeBody(launch.p[i]!, launch.v[i]!, launch.q[i]!, launch.w[i]!, launch.goal[i]!),
  )
  const poses: Pose[][] = bodies.map(() => [])
  const hits: DiceHit[] = []
  const record = () => {
    for (const [i, b] of bodies.entries()) poses[i]!.push({ p: { ...b.p }, q: { ...b.q } })
  }
  record()
  const maxSteps = Math.ceil(MAX_SECONDS / STEP)
  let step = 0
  for (; step < maxSteps; step++) {
    const t = (step + 1) * STEP
    for (const [i, b] of bodies.entries()) stepBody(b, i, t, ph, h, area, hits)
    for (let i = 0; i < bodies.length; i++)
      for (let j = i + 1; j < bodies.length; j++) collideDice(bodies[i]!, bodies[j]!, t, ph, h, hits)
    record()
    if (bodies.every((b) => b.mode === 2)) break
  }
  // Out of time: whoever still moves tips straight onto a face.
  for (const b of bodies) if (b.mode !== 2) forceRest(b, h, step * STEP)
  if (bodies.some((b) => b.restAt === step * STEP)) record()
  const last = (i: number) => poses[i]![poses[i]!.length - 1]!.q
  return {
    poses,
    hits,
    duration: (poses[0]!.length - 1) * STEP,
    faces: bodies.map((_, i) => topFace(last(i)).value),
    half: h,
    tries: 1,
  }
}

const corner = v3()
const r = v3()

/**
 * Lowest point of a rounded cube: each corner is a sphere of radius `rad` whose center sits
 * `rad` inside the sharp corner, so a die resting on a face still stands `h` tall.
 */
function lowestZ(b: Body, h: number, rad: number): number {
  let low = Infinity
  for (const c of CORNERS) {
    corner.x = c.x * (h - rad)
    corner.y = c.y * (h - rad)
    corner.z = c.z * (h - rad)
    low = Math.min(low, qrot(b.q, corner, r).z)
  }
  return low - rad
}

/** The orientation with the current top face exactly up, same heading. */
function flatten(q: Quat): Quat {
  const up = qrot(q, topFace(q).n)
  return qnorm(qmul(qbetween(up, v3(0, 0, 1)), q))
}

function beginTip(b: Body): void {
  b.mode = 1
  b.tipFrom = { ...b.q }
  b.tipTo = flatten(b.q)
  const c = Math.min(1, Math.abs(dot(qrot(b.q, topFace(b.q).n), v3(0, 0, 1))))
  const angle = Math.acos(c)
  b.tipLen = 0.05 + (0.22 * angle) / (Math.PI / 4)
  b.tipT = 0
  b.v = v3()
  b.w = v3()
}

function forceRest(b: Body, h: number, t: number): void {
  b.q = flatten(b.q)
  b.p.z = h
  b.mode = 2
  b.restAt = t
}

interface Contact {
  r: V3
  bias: number
  jn: number
  jtx: number
  jty: number
}

const contacts: Contact[] = Array.from({ length: 8 }, () => ({ r: v3(), bias: 0, jn: 0, jtx: 0, jty: 0 }))

function stepBody(
  b: Body,
  index: number,
  t: number,
  ph: DicePhysics,
  h: number,
  area: ThrowArea,
  hits: DiceHit[],
): void {
  if (b.mode === 2) return
  if (b.mode === 1) {
    b.tipT += STEP
    const k = Math.min(1, b.tipT / b.tipLen)
    const e = k * k * (3 - 2 * k)
    b.q = slerp(b.tipFrom, b.tipTo, e)
    b.p.z = -lowestZ(b, h, h * ph.round)
    if (k >= 1) {
      b.q = { ...b.tipTo }
      b.p.z = h
      b.mode = 2
      b.restAt = t
    }
    return
  }
  const invM = 1
  const invI = 1.5 / (h * h) // solid cube: I = m (2h)^2 / 6, the same about every axis
  b.v.z -= ph.gravity * STEP
  if (b.landed) {
    // A shallow bowl after touchdown: a soft pull toward the goal plus drag, so the dice end
    // in the throw area without visibly hitting the rails.
    b.v.x += (-STEER_K * (b.p.x - b.goal.x) - STEER_C * b.v.x) * STEP
    b.v.y += (-STEER_K * (b.p.y - b.goal.y) - STEER_C * b.v.y) * STEP
  }
  b.p.x += b.v.x * STEP
  b.p.y += b.v.y * STEP
  b.p.z += b.v.z * STEP
  const wl = Math.hypot(b.w.x, b.w.y, b.w.z)
  if (wl > 1e-9) b.q = qnorm(qmul(qaxis(v3(b.w.x / wl, b.w.y / wl, b.w.z / wl), wl * STEP), b.q))

  // Rounded corners below the board become contacts, at the bottom of each corner sphere.
  const rad = h * ph.round
  let n = 0
  let deepest = 0
  let impact = 0
  let impactAt: V3 | null = null
  for (const c of CORNERS) {
    corner.x = c.x * (h - rad)
    corner.y = c.y * (h - rad)
    corner.z = c.z * (h - rad)
    const rr = qrot(b.q, corner, contacts[n]!.r)
    rr.z -= rad
    const z = b.p.z + rr.z
    if (z >= 0) continue
    deepest = Math.min(deepest, z)
    const vn = b.v.z + (b.w.x * rr.y - b.w.y * rr.x)
    const ct = contacts[n]!
    ct.bias = vn < -BOUNCE_MIN ? -ph.restitution * vn : 0
    ct.jn = 0
    ct.jtx = 0
    ct.jty = 0
    if (-vn > impact) {
      impact = -vn
      impactAt = v3(b.p.x + rr.x, b.p.y + rr.y, 0)
    }
    n++
  }
  if (n > 0) {
    for (let it = 0; it < ITERATIONS; it++) {
      for (let k = 0; k < n; k++) {
        const ct = contacts[k]!
        const rr = ct.r
        // Velocity of the corner: v + w x r.
        let vx = b.v.x + (b.w.y * rr.z - b.w.z * rr.y)
        let vy = b.v.y + (b.w.z * rr.x - b.w.x * rr.z)
        const vz = b.v.z + (b.w.x * rr.y - b.w.y * rr.x)
        // Normal (z): |r x z|^2 = rx^2 + ry^2.
        const kn = invM + invI * (rr.x * rr.x + rr.y * rr.y)
        const old = ct.jn
        ct.jn = Math.max(0, old + (ct.bias - vz) / kn)
        applyImpulse(b, rr, 0, 0, ct.jn - old, invM, invI)
        // Friction in the board plane, clamped to the friction cone.
        vx = b.v.x + (b.w.y * rr.z - b.w.z * rr.y)
        vy = b.v.y + (b.w.z * rr.x - b.w.x * rr.z)
        const kx = invM + invI * (rr.y * rr.y + rr.z * rr.z)
        const ky = invM + invI * (rr.x * rr.x + rr.z * rr.z)
        let jx = ct.jtx - vx / kx
        let jy = ct.jty - vy / ky
        const cap = ph.friction * ct.jn
        const jl = Math.hypot(jx, jy)
        if (jl > cap) {
          jx *= cap / jl
          jy *= cap / jl
        }
        applyImpulse(b, rr, jx - ct.jtx, jy - ct.jty, 0, invM, invI)
        ct.jtx = jx
        ct.jty = jy
      }
    }
    b.p.z -= deepest
    // Rolling resistance and scrubbing while touching.
    const keepW = Math.exp(-3.2 * STEP)
    const keepV = Math.exp(-1.2 * STEP)
    b.w.x *= keepW
    b.w.y *= keepW
    b.w.z *= Math.exp(-6 * STEP)
    b.v.x *= keepV
    b.v.y *= keepV
    b.landed = true
    if (impact > BOUNCE_MIN && t - b.lastHit > HIT_COOLDOWN && impactAt) {
      b.lastHit = t
      hits.push({ t, die: index, intensity: Math.min(1, impact / CLACK_FULL), at: impactAt, kind: 'floor' })
    }
  }

  walls(b, index, t, h, area, hits)

  // Nearly still on the board: tip onto the nearest face.
  const speed = Math.hypot(b.v.x, b.v.y, b.v.z)
  const spin = Math.hypot(b.w.x, b.w.y, b.w.z)
  b.calm = n > 0 && speed < 0.35 && spin < 2.2 ? b.calm + 1 : 0
  if (b.calm >= 4) beginTip(b)
}

function applyImpulse(b: Body, rr: V3, jx: number, jy: number, jz: number, invM: number, invI: number): void {
  b.v.x += jx * invM
  b.v.y += jy * invM
  b.v.z += jz * invM
  // w += invI * (r x j)
  b.w.x += invI * (rr.y * jz - rr.z * jy)
  b.w.y += invI * (rr.z * jx - rr.x * jz)
  b.w.z += invI * (rr.x * jy - rr.y * jx)
}

/** Soft rails around the throw area, active once a die has come inside. */
function walls(b: Body, index: number, t: number, h: number, area: ThrowArea, hits: DiceHit[]): void {
  const x0 = area.col0 + h
  const x1 = area.col1 - h
  const y0 = area.row0 + h
  const y1 = area.row1 - h
  if (!b.inside) {
    b.inside = b.p.x > x0 && b.p.x < x1 && b.p.y > y0 && b.p.y < y1
    if (!b.inside) return
  }
  const bounce = (vel: number) => {
    const s = Math.abs(vel)
    if (s > BOUNCE_MIN && t - b.lastHit > HIT_COOLDOWN) {
      b.lastHit = t
      hits.push({
        t,
        die: index,
        intensity: Math.min(1, (s / CLACK_FULL) * 0.6),
        at: { ...b.p },
        kind: 'wall',
      })
    }
    // Scuff the spin a little so it does not slide along the rail.
    b.w.z += vel * 0.8
  }
  const e = 0.45
  if ((b.p.x < x0 && b.v.x < 0) || (b.p.x > x1 && b.v.x > 0)) {
    bounce(b.v.x)
    b.v.x = -b.v.x * e
  }
  if ((b.p.y < y0 && b.v.y < 0) || (b.p.y > y1 && b.v.y > 0)) {
    bounce(b.v.y)
    b.v.y = -b.v.y * e
  }
  b.p.x = Math.min(x1, Math.max(x0, b.p.x))
  b.p.y = Math.min(y1, Math.max(y0, b.p.y))
}

/** The dice bump as spheres slightly larger than their faces. */
function collideDice(a: Body, b: Body, t: number, ph: DicePhysics, h: number, hits: DiceHit[]): void {
  const rad = h * 1.2
  const d = v3(b.p.x - a.p.x, b.p.y - a.p.y, b.p.z - a.p.z)
  const dist = Math.hypot(d.x, d.y, d.z)
  if (dist >= rad * 2 || dist < 1e-9) return
  const nrm = v3(d.x / dist, d.y / dist, d.z / dist)
  // A die at rest is pushed only as a last resort; wake it so it can settle again.
  for (const body of [a, b]) {
    if (body.mode !== 0) {
      body.mode = 0
      body.calm = 0
    }
  }
  const push = (rad * 2 - dist) / 2
  a.p.x -= nrm.x * push
  a.p.y -= nrm.y * push
  b.p.x += nrm.x * push
  b.p.y += nrm.y * push
  const rel = dot(v3(b.v.x - a.v.x, b.v.y - a.v.y, b.v.z - a.v.z), nrm)
  if (rel >= 0) return
  const j = (-(1 + ph.restitution) * rel) / 2
  a.v.x -= nrm.x * j
  a.v.y -= nrm.y * j
  a.v.z -= nrm.z * j
  b.v.x += nrm.x * j
  b.v.y += nrm.y * j
  b.v.z += nrm.z * j
  // Glancing knocks add a little spin.
  const tw = cross(nrm, v3(0, 0, 1))
  a.w.x += tw.x * j * 2
  a.w.y += tw.y * j * 2
  b.w.x -= tw.x * j * 2
  b.w.y -= tw.y * j * 2
  if (-rel > BOUNCE_MIN) {
    const at = v3((a.p.x + b.p.x) / 2, (a.p.y + b.p.y) / 2, (a.p.z + b.p.z) / 2)
    const intensity = Math.min(1, -rel / CLACK_FULL)
    hits.push({ t, die: 0, intensity, at, kind: 'dice' })
    a.lastHit = t
    b.lastHit = t
  }
}

/** Interpolated pose of die `die` at `seconds` after release (clamped to the track). */
export function poseAt(track: DiceTrack, die: number, seconds: number, out: Pose): Pose {
  const list = track.poses[die]!
  const f = Math.min(Math.max(seconds / STEP, 0), list.length - 1)
  const i = Math.floor(f)
  const a = list[i]!
  const b = list[Math.min(i + 1, list.length - 1)]!
  const k = f - i
  out.p.x = a.p.x + (b.p.x - a.p.x) * k
  out.p.y = a.p.y + (b.p.y - a.p.y) * k
  out.p.z = a.p.z + (b.p.z - a.p.z) * k
  slerp(a.q, b.q, k, out.q)
  return out
}
