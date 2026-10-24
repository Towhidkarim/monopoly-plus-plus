import { Graphics, type Container } from 'pixi.js'
import { project, projectPoly, type Pos } from '../geometry/project.ts'
import { NIGHT, lightsAt, nightTint } from '../art/paint.ts'
import { SIZE, moveVehicle, paintVehicle, planTraffic, stepTraffic, type Vehicle } from '../art/traffic.ts'
import { CAR_GAP, CAR_LEN, at, drawTrainCar, heading, measure, type Path } from '../art/train.ts'
import { BOARD_STYLE } from '../art/style.ts'
import { cosmeticRng, disc } from './draw.ts'
import type { CityPlan } from './cityPlan.ts'

/**
 * City life (Milestone 7, DECISIONS.md D29): cars on the plinth's streets and trains on the rail
 * loop. Purely cosmetic: it reads the city plan, owns its own Graphics in the actor layer (so
 * everything depth-sorts with buildings and tokens) and never touches game state or the event
 * queue. Time is the board's world delta, so it slows with hit-stop.
 *
 * Cost control: bodies are drawn around their own origin and moved, and redrawn only when their
 * heading turns noticeably (corners). Pieces outside the camera view are hidden and not redrawn.
 */

const TRAIN_CARS = 3
const TRAIN_LEN = TRAIN_CARS * CAR_LEN + (TRAIN_CARS - 1) * CAR_GAP
/** Cruise speeds (board units per second), one per train; the faster one catches up and queues. */
const TRAIN_SPEEDS = [1.05, 1.3]
/** Comfortable braking used to plan stops and gaps; the hard limits are a bit stronger. */
const PLAN_DECEL = 0.55
const MAX_ACCEL = 0.8
const MAX_DECEL = 1.6
/** The follower aims to stay this far behind the leader's tail, and never closer than the hard gap. */
const SAFE_GAP = 0.7
const HARD_GAP = 0.35
const DWELL_MS = [1500, 2500] as const
/** Redraw a train car after its heading turned this much (cosine of about 2 degrees). */
const REDRAW_COS = 0.9994
/** Extra pixels around the camera view before a piece is hidden. */
const CULL_MARGIN = 120

/** Camera view in world pixels. */
export interface ViewRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

interface TrainCar {
  g: Graphics
  /** Night lights (window band, head and tail lights), never tinted; redrawn with the body. */
  glow: Graphics
  drawnDir?: { col: number; row: number }
}

export interface Train {
  path: Path
  /** Head position along the loop, speed and cruise speed. */
  head: number
  v: number
  cruise: number
  livery: number
  /** Index into the plan's stops of the station it is heading for (or standing at). */
  next: number
  /** Seconds left standing at a station. */
  dwell: number
  cars: TrainCar[]
}

export class Ambient {
  private cars: Vehicle[] = []
  /** Headlights and tail lights per vehicle, in the same order as `cars`. */
  private glows: Graphics[] = []
  private trains: Train[] = []
  private stops: number[] = []
  private on = true
  private night = 0
  private t = 1
  private rng = cosmeticRng(1)
  /** Update cost in ms: frames counted, total and worst (dev measurement, see `resetCost`). */
  readonly cost = { frames: 0, total: 0, worst: 0 }

  private readonly actors: Container

  constructor(actors: Container) {
    this.actors = actors
  }

  /** Vehicles currently driving (for tests and profiling). */
  get vehicles(): readonly Vehicle[] {
    return this.cars
  }

  get running(): readonly Train[] {
    return this.trains
  }

  /** Graphics objects in use. */
  get graphicsCount(): number {
    return (this.cars.length + this.trains.length * TRAIN_CARS) * 2
  }

  /** 0 = day, 1 = night: bodies take the city's night grade, lights fade in. No redraw. */
  setNight(n: number): void {
    this.night = n
    const tint = nightTint(NIGHT.city, n)
    for (const g of this.bodies()) g.tint = tint
    if (this.on) this.apply(null, false)
  }

  /** Replaces the vehicles and trains for a new city plan. */
  build(plan: CityPlan): void {
    this.clear()
    const style = BOARD_STYLE
    this.rng = cosmeticRng(plan.seed * 31 + 7)
    const rng = this.rng
    const n = 10 + Math.floor(rng() * 5)
    const plans = planTraffic({ cols: plan.roads.cols, rows: plan.roads.rows }, rng, n, plan.roads.z, [
      ...style.accents,
      0xf8fafc,
      0x475569,
    ])
    for (const v of plans) {
      const g = new Graphics()
      const glow = new Graphics()
      this.actors.addChild(g, glow)
      this.cars.push({ ...v, g, paint: { g, t: this.t, style } })
      this.glows.push(glow)
    }

    const path = measure(plan.loop)
    this.stops = plan.stops
    for (const [k, speed] of TRAIN_SPEEDS.entries()) {
      // Spread the trains around the loop, each starting somewhere between stations.
      const head = ((k + 0.25 + rng() * 0.25) / TRAIN_SPEEDS.length) * path.total
      const cars = Array.from({ length: TRAIN_CARS }, () => {
        const g = new Graphics()
        const glow = new Graphics()
        this.actors.addChild(g, glow)
        return { g, glow }
      })
      this.trains.push({
        path,
        head,
        v: speed,
        cruise: speed,
        livery: style.accents[plan.liveries[k]! % style.accents.length]!,
        next: this.nextStop(head, path.total),
        dwell: 0,
        cars,
      })
    }
    this.setNight(this.night)
    this.apply(null, true)
  }

  /** Show or hide all city life. Hidden pieces are not updated at all and resume where they were. */
  setOn(on: boolean): void {
    if (on === this.on) return
    this.on = on
    if (!on) for (const g of this.graphics()) g.visible = false
    else this.apply(null, false)
  }

  /** The view morph changed: bodies are redrawn for the new projection. */
  setView(t: number): void {
    if (t === this.t) return
    this.t = t
    for (const c of this.cars) c.paint.t = t
    this.apply(null, true)
  }

  resetCost(): void {
    this.cost.frames = 0
    this.cost.total = 0
    this.cost.worst = 0
  }

  /** Advances the simulation by `dtMs` of world time and positions everything. */
  update(dtMs: number, view: ViewRect): void {
    if (!this.on) return
    const t0 = performance.now()
    const dt = Math.min(0.05, dtMs / 1000)
    stepTraffic(this.cars, dt)
    for (const tr of this.trains) this.stepTrain(tr, dt)
    this.apply(view, false)
    const ms = performance.now() - t0
    this.cost.frames++
    this.cost.total += ms
    this.cost.worst = Math.max(this.cost.worst, ms)
  }

  destroy(): void {
    this.clear()
  }

  // ---- internals ---------------------------------------------------------

  private *bodies(): Generator<Graphics> {
    for (const c of this.cars) yield c.g
    for (const tr of this.trains) for (const car of tr.cars) yield car.g
  }

  private *graphics(): Generator<Graphics> {
    yield* this.bodies()
    yield* this.glows
    for (const tr of this.trains) for (const car of tr.cars) yield car.glow
  }

  private clear(): void {
    for (const g of this.graphics()) g.destroy()
    this.cars = []
    this.glows = []
    this.trains = []
  }

  private nextStop(head: number, total: number): number {
    let best = 0
    let dist = Infinity
    for (const [i, s] of this.stops.entries()) {
      const d = (((s - head) % total) + total) % total
      if (d < dist) {
        dist = d
        best = i
      }
    }
    return best
  }

  /** Eased stop at stations (with a dwell) and braking behind the train ahead. */
  private stepTrain(tr: Train, dt: number): void {
    const total = tr.path.total
    if (tr.dwell > 0) {
      tr.dwell -= dt
      if (tr.dwell <= 0) tr.next = (tr.next + 1) % this.stops.length
      return
    }
    const stop = this.stops[tr.next]!
    const rem = (((stop - tr.head) % total) + total) % total
    let target = Math.min(tr.cruise, Math.sqrt(2 * PLAN_DECEL * rem))
    let room = rem
    for (const o of this.trains) {
      if (o === tr) continue
      // Free distance from this head to the other train's tail.
      const free = (((o.head - TRAIN_LEN - tr.head) % total) + total) % total
      if (free > total / 2) continue
      target = Math.min(target, Math.sqrt(2 * PLAN_DECEL * Math.max(0, free - SAFE_GAP)))
      room = Math.min(room, Math.max(0, free - HARD_GAP))
    }
    const want = (target - tr.v) * 3
    tr.v = Math.max(0, tr.v + Math.max(-MAX_DECEL, Math.min(MAX_ACCEL, want)) * dt)
    const step = Math.min(tr.v * dt, room)
    tr.head = (tr.head + step) % total
    if (rem - step < 0.004 && rem <= room) {
      // Arrived: sit exactly on the stop for a couple of seconds.
      tr.head = stop
      tr.v = 0
      tr.dwell = (DWELL_MS[0] + this.rng() * (DWELL_MS[1] - DWELL_MS[0])) / 1000
    }
  }

  /** Positions every piece, hides the ones outside `view`, and redraws bodies that need it. */
  private apply(view: ViewRect | null, force: boolean): void {
    const inView = (x: number, y: number) =>
      !view ||
      (x > view.x0 - CULL_MARGIN &&
        x < view.x1 + CULL_MARGIN &&
        y > view.y0 - CULL_MARGIN &&
        y < view.y1 + CULL_MARGIN)
    const glowLevel = lightsAt(this.night)
    const lit = glowLevel > 0.01
    for (const [i, car] of this.cars.entries()) {
      const glow = this.glows[i]!
      car.g.zIndex = moveVehicle(car)
      const seen = inView(car.g.x, car.g.y)
      car.g.visible = seen
      glow.visible = seen && lit
      if (!seen) continue
      const before = car.drawnDir
      paintVehicle(car, force)
      glow.position.copyFrom(car.g.position)
      glow.zIndex = car.g.zIndex + 0.001
      glow.alpha = glowLevel
      if (force || car.drawnDir !== before) vehicleLights(glow, SIZE[car.kind], car.drawnDir!, this.t)
    }
    for (const tr of this.trains) {
      for (const [i, car] of tr.cars.entries()) {
        const d = tr.head - i * (CAR_LEN + CAR_GAP) - CAR_LEN / 2
        const pos = at(tr.path, d).pos
        const s = project(pos, this.t)
        car.g.position.set(s.x, s.y)
        car.g.zIndex = pos.col + pos.row
        car.glow.position.set(s.x, s.y)
        car.glow.zIndex = car.g.zIndex + 0.001
        car.glow.alpha = glowLevel
        const seen = inView(s.x, s.y)
        car.g.visible = seen
        car.glow.visible = seen && lit
        if (!seen) continue
        const dir = heading(tr.path, d, CAR_LEN * 0.4)
        const last = car.drawnDir
        if (force || !last || last.col * dir.col + last.row * dir.row < REDRAW_COS) {
          drawTrainCar({ g: car.g, t: this.t, style: BOARD_STYLE }, dir, tr.livery)
          trainLights(car.glow, dir, i === 0, i === tr.cars.length - 1, this.t)
          car.drawnDir = dir
        }
      }
    }
  }
}

type Dir = { col: number; row: number }

/** Point at `along` (forward) and `side` (to the left) of the origin, at height `z`. */
const local = (dir: Dir, along: number, side: number, z: number): Pos => ({
  col: dir.col * along - dir.row * side,
  row: dir.row * along + dir.col * side,
  z,
})

/** Headlight beam on the road ahead, two head lamps and two tail lights, around the origin. */
function vehicleLights(g: Graphics, size: { len: number; wid: number; h: number }, dir: Dir, t: number) {
  const { len, wid, h } = size
  const f = len / 2
  g.clear()
  const beam = (reach: number, spread: number, alpha: number) =>
    g
      .poly(
        projectPoly(
          [
            local(dir, f, wid * 0.4, 0.002),
            local(dir, f + reach, wid * spread, 0.002),
            local(dir, f + reach, -wid * spread, 0.002),
            local(dir, f, -wid * 0.4, 0.002),
          ],
          t,
        ),
      )
      .fill({ color: NIGHT.lamp, alpha })
  beam(0.34, 1.5, 0.16)
  beam(0.2, 1.0, 0.2)
  for (const s of [-1, 1]) {
    const head = local(dir, f, s * wid * 0.3, h * 0.5)
    g.poly(disc(head.col, head.row, 0.014, head.z, t, 8)).fill(0xfffbe8)
    const tail = local(dir, -f, s * wid * 0.32, h * 0.55)
    g.poly(disc(tail.col, tail.row, 0.011, tail.z, t, 8)).fill(0xff4d5e)
  }
}

/** A lit window band along the visible sides of a train car, plus head/tail lights at the ends. */
function trainLights(g: Graphics, dir: Dir, front: boolean, back: boolean, t: number) {
  g.clear()
  const L = CAR_LEN * 0.43
  const W = 0.087
  const [z0, z1] = [0.085, 0.135]
  // Corners of the car's outline; a side is visible when its outward normal faces the viewer (+col/+row).
  const c = [local(dir, L, W, 0), local(dir, L, -W, 0), local(dir, -L, -W, 0), local(dir, -L, W, 0)]
  for (let k = 0; k < 4; k++) {
    const a = c[k]!
    const b = c[(k + 1) % 4]!
    const nCol = b.row - a.row
    const nRow = -(b.col - a.col)
    if (nCol + nRow <= 0) continue
    g.poly(
      projectPoly(
        [
          { col: a.col, row: a.row, z: z1 },
          { col: b.col, row: b.row, z: z1 },
          { col: b.col, row: b.row, z: z0 },
          { col: a.col, row: a.row, z: z0 },
        ],
        t,
      ),
    ).fill(NIGHT.soft)
  }
  if (front) {
    g.poly(
      projectPoly(
        [
          local(dir, CAR_LEN / 2, 0.06, 0.002),
          local(dir, CAR_LEN / 2 + 0.5, 0.16, 0.002),
          local(dir, CAR_LEN / 2 + 0.5, -0.16, 0.002),
          local(dir, CAR_LEN / 2, -0.06, 0.002),
        ],
        t,
      ),
    ).fill({ color: NIGHT.lamp, alpha: 0.16 })
    const hp = local(dir, CAR_LEN / 2, 0, 0.1)
    g.poly(disc(hp.col, hp.row, 0.02, hp.z, t, 10)).fill(0xfffbe8)
  }
  if (back) {
    const tp = local(dir, -CAR_LEN / 2, 0, 0.1)
    g.poly(disc(tp.col, tp.row, 0.016, tp.z, t, 8)).fill(0xff4d5e)
  }
}
