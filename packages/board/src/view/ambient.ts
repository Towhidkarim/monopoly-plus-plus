import { Graphics, type Container } from 'pixi.js'
import { project } from '../geometry/project.ts'
import { moveVehicle, paintVehicle, planTraffic, stepTraffic, type Vehicle } from '../art/traffic.ts'
import { CAR_GAP, CAR_LEN, at, drawTrainCar, heading, measure, type Path } from '../art/train.ts'
import { BOARD_STYLE } from '../art/style.ts'
import { cosmeticRng } from './draw.ts'
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
  private trains: Train[] = []
  private stops: number[] = []
  private on = true
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
    return this.cars.length + this.trains.length * TRAIN_CARS
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
      this.actors.addChild(g)
      this.cars.push({ ...v, g, paint: { g, t: this.t, style } })
    }

    const path = measure(plan.loop)
    this.stops = plan.stops
    for (const [k, speed] of TRAIN_SPEEDS.entries()) {
      // Spread the trains around the loop, each starting somewhere between stations.
      const head = ((k + 0.25 + rng() * 0.25) / TRAIN_SPEEDS.length) * path.total
      const cars = Array.from({ length: TRAIN_CARS }, () => {
        const g = new Graphics()
        this.actors.addChild(g)
        return { g }
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

  private *graphics(): Generator<Graphics> {
    for (const c of this.cars) yield c.g
    for (const tr of this.trains) for (const car of tr.cars) yield car.g
  }

  private clear(): void {
    for (const g of this.graphics()) g.destroy()
    this.cars = []
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
    for (const car of this.cars) {
      car.g.zIndex = moveVehicle(car)
      const seen = inView(car.g.x, car.g.y)
      car.g.visible = seen
      if (seen) paintVehicle(car, force)
    }
    for (const tr of this.trains) {
      for (const [i, car] of tr.cars.entries()) {
        const d = tr.head - i * (CAR_LEN + CAR_GAP) - CAR_LEN / 2
        const pos = at(tr.path, d).pos
        const s = project(pos, this.t)
        car.g.position.set(s.x, s.y)
        car.g.zIndex = pos.col + pos.row
        const seen = inView(s.x, s.y)
        car.g.visible = seen
        if (!seen) continue
        const dir = heading(tr.path, d, CAR_LEN * 0.4)
        const last = car.drawnDir
        if (force || !last || last.col * dir.col + last.row * dir.row < REDRAW_COS) {
          drawTrainCar({ g: car.g, t: this.t, style: BOARD_STYLE }, dir, tr.livery)
          car.drawnDir = dir
        }
      }
    }
  }
}
