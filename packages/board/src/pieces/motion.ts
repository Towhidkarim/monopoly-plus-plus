import { ease, type Animator } from '../anim/animator.ts'
import { project } from '../geometry/project.ts'
import { ringFootprint, tokenAnchor } from '../geometry/ring.ts'
import type { TokenView } from '../view/token.ts'
import { HEADING_DX, headingOf, SIDE_HEADING } from './shapes.ts'

/**
 * Movement styles per piece kind. Each style animates a token along a path of spaces the
 * engine already decided; none of this affects outcomes.
 */

export interface MotionTuning {
  hopHeight: number
  stepMs: number
  squash: number
}

export interface MotionContext {
  animator: Animator
  tuning: MotionTuning
  /** Tile reacts to something landing or rolling over it (0..1+ strength). */
  bump(space: number, strength: number): void
  /** Path preview flash on a tile. */
  flash(space: number): void
  /** Where `token` should stand on `space`, given the others already there. */
  slotFor(token: TokenView, space: number): { col: number; row: number }
  /** Slide every token on `space` into its slot. */
  layoutTile(space: number): void
}

type Point = { col: number; row: number }

/** Walks `token` along `path` (spaces entered, ending on the landing space). */
export async function travel(ctx: MotionContext, token: TokenView, path: readonly number[]): Promise<void> {
  if (path.length === 0) return
  const origin = token.space
  const landing = path[path.length - 1]!
  ctx.flash(landing)
  token.traveling = true
  token.space = landing
  ctx.layoutTile(origin) // the others on the origin tile spread back out
  switch (token.kind) {
    case 'taxi':
      await drive(ctx, token, path, { pace: 0.62, lean: 0.16, bounce: 0.6 })
      break
    case 'bus':
      await drive(ctx, token, path, { pace: 0.85, lean: 0.24, bounce: 1.1 })
      break
    case 'drone':
      await fly(ctx, token, landing)
      break
    case 'balloon':
      await float(ctx, token, landing)
      break
    default:
      await hopAlong(ctx, token, path)
  }
  token.traveling = false
  ctx.layoutTile(landing)
}

/** Direct relocation (cards, go to jail). Vehicles get a dramatic arc; fliers just fly. */
export async function jump(ctx: MotionContext, token: TokenView, to: number): Promise<void> {
  const origin = token.space
  token.traveling = true
  token.space = to
  ctx.layoutTile(origin)
  ctx.flash(to)
  if (token.kind === 'drone') await fly(ctx, token, to)
  else if (token.kind === 'balloon') await float(ctx, token, to)
  else {
    token.squash.kick(6 * ctx.tuning.squash)
    await ctx.animator.wait(110)
    await arc(ctx, token, ctx.slotFor(token, to), ctx.tuning.hopHeight * 3 + 0.8, 760)
    land(ctx, token, to, 1.4)
    token.heading = SIDE_HEADING[ringFootprint(to).side]!
  }
  token.traveling = false
  ctx.layoutTile(to)
}

// ---- hop (classic pawn) ---------------------------------------------------

async function hopAlong(ctx: MotionContext, token: TokenView, path: readonly number[]): Promise<void> {
  const tune = ctx.tuning
  token.squash.kick(4 * tune.squash) // crouch before the first hop
  await ctx.animator.wait(90)
  for (let i = 0; i < path.length; i++) {
    const space = path[i]!
    const last = i === path.length - 1
    const to = last ? ctx.slotFor(token, space) : tokenAnchor(space, 0, 1)
    await arc(ctx, token, to, tune.hopHeight, tune.stepMs)
    land(ctx, token, space, last ? 1 : 0.55)
  }
  await ctx.animator.wait(120)
}

function arc(ctx: MotionContext, token: TokenView, to: Point, height: number, ms: number): Promise<void> {
  const from = { col: token.pos.col, row: token.pos.row }
  const z0 = token.pos.z
  token.squash.target = -0.12 * ctx.tuning.squash // stretch in the air
  return ctx.animator.tween(ms, (p) => {
    const h = ease.inOutSine(p)
    token.pos.col = from.col + (to.col - from.col) * h
    token.pos.row = from.row + (to.row - from.row) * h
    token.pos.z = z0 * (1 - p) + 4 * p * (1 - p) * height
  })
}

function land(ctx: MotionContext, token: TokenView, space: number, strength: number): void {
  token.pos.z = token.restZ
  token.squash.target = 0
  token.squash.kick(7 * strength * ctx.tuning.squash)
  ctx.bump(space, strength)
}

// ---- drive (taxi, bus) ----------------------------------------------------

interface DriveStyle {
  /** Seconds-ish per tile relative to stepMs (higher = slower). */
  pace: number
  /** Lean strength for acceleration, braking, and turns. */
  lean: number
  /** Suspension bounce on arrival. */
  bounce: number
}

/**
 * Rolls along the lane through every tile with a trapezoid speed profile:
 * accelerate (lean back), cruise, brake (nose dips forward), settle.
 */
async function drive(
  ctx: MotionContext,
  token: TokenView,
  path: readonly number[],
  style: DriveStyle,
): Promise<void> {
  const tune = ctx.tuning
  const points: Point[] = [{ col: token.pos.col, row: token.pos.row }]
  for (let i = 0; i < path.length - 1; i++) points.push(tokenAnchor(path[i]!, 0, 1))
  points.push(ctx.slotFor(token, path[path.length - 1]!))

  const seg: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    seg.push(seg[i - 1]! + Math.hypot(b.col - a.col, b.row - a.row))
  }
  const total = seg[seg.length - 1]!
  const ms = 260 + tune.stepMs * style.pace * path.length * 1.4
  const dir = () => HEADING_DX[token.heading]!

  // Pull away: squat and lean back.
  token.heading = headingOf(points[1]!.col - points[0]!.col, points[1]!.row - points[0]!.row, token.heading)
  token.lean.kick(dir() * style.lean * 14 * tune.squash)
  token.squash.kick(2 * tune.squash)

  let passed = 0
  let braking = false
  await ctx.animator.tween(ms, (p) => {
    const d = trapezoid(p, 0.22, 0.3) * total
    let i = 1
    while (i < seg.length - 1 && seg[i]! < d) i++
    const a = points[i - 1]!
    const b = points[i]!
    const len = seg[i]! - seg[i - 1]! || 1
    const k = Math.min(1, Math.max(0, (d - seg[i - 1]!) / len))
    token.pos.col = a.col + (b.col - a.col) * k
    token.pos.row = a.row + (b.row - a.row) * k
    const next = headingOf(b.col - a.col, b.row - a.row, token.heading)
    if (next !== token.heading) {
      // Turning a corner: a little sideways lurch.
      token.heading = next
      token.lean.kick(-dir() * style.lean * 10 * tune.squash)
    }
    // Tiles rumble as the vehicle rolls over them.
    while (passed < i - 1 && passed < path.length - 1) {
      ctx.bump(path[passed]!, 0.3)
      passed++
    }
    if (!braking && p > 0.7) {
      braking = true
      token.lean.kick(-dir() * style.lean * 14 * tune.squash) // nose dips as it brakes
    }
  })
  token.squash.kick(4 * style.bounce * tune.squash)
  ctx.bump(path[path.length - 1]!, 0.7)
  await ctx.animator.wait(160)
}

/** Distance fraction for a trapezoid velocity profile (accel fraction a, decel fraction d). */
function trapezoid(p: number, a: number, d: number): number {
  const v = 1 / (1 - a / 2 - d / 2)
  if (p < a) return (v * p * p) / (2 * a)
  if (p < 1 - d) return v * (a / 2 + (p - a))
  const q = 1 - p
  return 1 - (v * q * q) / (2 * d)
}

// ---- fly (drone) ----------------------------------------------------------

const CRUISE_Z = 1.25

/** Lift off, fly straight to the target (cutting over the city), descend to a hover. */
async function fly(ctx: MotionContext, token: TokenView, to: number): Promise<void> {
  const target = ctx.slotFor(token, to)
  const from = { col: token.pos.col, row: token.pos.row }
  const z0 = token.pos.z
  const anim = ctx.animator
  await anim.tween(280, (p) => (token.pos.z = z0 + (CRUISE_Z - z0) * p), ease.outCubic)

  const dist = Math.hypot(target.col - from.col, target.row - from.row)
  const screenDx = Math.sign(project({ ...target, z: 0 }, 1).x - project({ ...from, z: 0 }, 1).x)
  token.lean.target = -screenDx * 0.22 // tilt into the direction of flight
  await anim.tween(
    Math.min(1900, 320 + dist * 95),
    (p) => {
      token.pos.col = from.col + (target.col - from.col) * p
      token.pos.row = from.row + (target.row - from.row) * p
      token.pos.z = CRUISE_Z + Math.sin(p * Math.PI * 3) * 0.04
    },
    ease.inOutSine,
  )
  token.lean.target = 0
  token.lean.kick(screenDx * 1.5) // level out with a little overshoot
  await anim.tween(320, (p) => (token.pos.z = CRUISE_Z + (token.restZ - CRUISE_Z) * p), ease.outCubic)
  token.squash.kick(2.5 * ctx.tuning.squash)
  ctx.bump(to, 0.45)
}

// ---- float (balloon) ------------------------------------------------------

const BALLOON_Z = 1.7

/** Slow rise, a lazy drifting arc with sway, and a feather-soft landing. */
async function float(ctx: MotionContext, token: TokenView, to: number): Promise<void> {
  const target = ctx.slotFor(token, to)
  const from = { col: token.pos.col, row: token.pos.row }
  const z0 = token.pos.z
  const anim = ctx.animator
  await anim.tween(520, (p) => (token.pos.z = z0 + (BALLOON_Z - z0) * p), ease.inOutSine)

  const dc = target.col - from.col
  const dr = target.row - from.row
  const dist = Math.hypot(dc, dr) || 1
  // Perpendicular drift so the path is a gentle curve, not a line.
  const nc = -dr / dist
  const nr = dc / dist
  const drift = Math.min(0.9, dist * 0.12)
  await anim.tween(
    Math.min(3200, 700 + dist * 150),
    (p) => {
      const bend = Math.sin(p * Math.PI) * drift
      token.pos.col = from.col + dc * p + nc * bend
      token.pos.row = from.row + dr * p + nr * bend
      token.pos.z = BALLOON_Z + Math.sin(p * Math.PI * 2) * 0.12
      token.lean.target = Math.sin(p * Math.PI * 4) * 0.06 // gentle sway
    },
    ease.inOutSine,
  )
  token.lean.target = 0
  await anim.tween(700, (p) => (token.pos.z = BALLOON_Z + (token.restZ - BALLOON_Z) * p), ease.outCubic)
  token.squash.kick(1.5 * ctx.tuning.squash)
  ctx.bump(to, 0.3)
}
