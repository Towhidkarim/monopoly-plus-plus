import type { Graphics } from 'pixi.js'
import { project, type Pos } from '../geometry/project.ts'
import { pick, type Lot } from './buildings.ts'
import type { Paint } from './paint.ts'
import { at, heading, measure, orientedBox, type Path } from './train.ts'

/**
 * Street traffic: little cars, vans and buses driving loops around the district's blocks. Each
 * vehicle keeps to its lane on a closed route (a rectangle of streets, rounded at the corners)
 * and brakes for whoever is ahead of it in the same lane. Purely cosmetic.
 */

export type VehicleKind = 'car' | 'taxi' | 'van' | 'bus'

export interface Vehicle {
  g: Graphics
  paint: Paint
  kind: VehicleKind
  color: number
  path: Path
  /** Distance along the route. */
  d: number
  /** Current and cruising speed, board units per second. */
  v: number
  cruise: number
  /** Where it was last posed: position, heading, and the heading its graphics were drawn for. */
  pose?: { pos: Pos; dir: { col: number; row: number } }
  drawnDir?: { col: number; row: number }
}

/** Redraw a vehicle once its heading turned this much (cosine of about 2 degrees). */
const REDRAW_COS = 0.9994

/** Front of a vehicle's body at its last pose (where headlights attach). */
export function vehicleFront(car: Vehicle): Pos | null {
  if (!car.pose) return null
  const h = SIZE[car.kind].len / 2
  const { pos, dir } = car.pose
  return { col: pos.col + dir.col * h, row: pos.row + dir.row * h, z: pos.z }
}

const LANE = 0.065
const CORNER = 0.1
const SIZE: Record<VehicleKind, { len: number; wid: number; h: number }> = {
  car: { len: 0.15, wid: 0.075, h: 0.04 },
  taxi: { len: 0.15, wid: 0.075, h: 0.04 },
  van: { len: 0.19, wid: 0.08, h: 0.07 },
  bus: { len: 0.32, wid: 0.085, h: 0.08 },
}

/** Street center lines of a district (perimeter streets included). */
export function streetLines(area: Lot, cols: number, rows: number, street: number) {
  const bw = (area.col1 - area.col0 - street * (cols + 1)) / cols
  const bd = (area.row1 - area.row0 - street * (rows + 1)) / rows
  return {
    cols: Array.from({ length: cols + 1 }, (_, i) => area.col0 + street / 2 + i * (bw + street)),
    rows: Array.from({ length: rows + 1 }, (_, j) => area.row0 + street / 2 + j * (bd + street)),
  }
}

/**
 * A closed lane route around the rectangle of streets (c0,r0)-(c1,r1). Driving one way keeps to
 * the inside lane, the other way to the outside lane, so opposing loops never share a lane.
 */
export function loopRoute(c0: number, r0: number, c1: number, r1: number, clockwise: boolean, z: number) {
  const k = clockwise ? LANE : -LANE
  const a = c0 + k
  const b = r0 + k
  const c = c1 - k
  const d = r1 - k
  const corners = clockwise
    ? [
        { col: a, row: b },
        { col: c, row: b },
        { col: c, row: d },
        { col: a, row: d },
      ]
    : [
        { col: a, row: b },
        { col: a, row: d },
        { col: c, row: d },
        { col: c, row: b },
      ]
  // Round each corner with a short quadratic curve.
  const pts: Pos[] = []
  for (let i = 0; i < 4; i++) {
    const prev = corners[(i + 3) % 4]!
    const p = corners[i]!
    const next = corners[(i + 1) % 4]!
    const din = unit(prev, p)
    const dout = unit(p, next)
    const s = { col: p.col - din.col * CORNER, row: p.row - din.row * CORNER }
    const e = { col: p.col + dout.col * CORNER, row: p.row + dout.row * CORNER }
    for (let t = 0; t <= 1.0001; t += 1 / 6) {
      const u = 1 - t
      pts.push({
        col: u * u * s.col + 2 * u * t * p.col + t * t * e.col,
        row: u * u * s.row + 2 * u * t * p.row + t * t * e.row,
        z,
      })
    }
  }
  return measure(pts)
}

const unit = (a: { col: number; row: number }, b: { col: number; row: number }) => {
  const l = Math.hypot(b.col - a.col, b.row - a.row) || 1
  return { col: (b.col - a.col) / l, row: (b.row - a.row) / l }
}

/** `n` vehicles on random loops of the street grid. */
export function planTraffic(
  lines: { cols: number[]; rows: number[] },
  rng: () => number,
  n: number,
  z: number,
  colors: readonly number[],
): Omit<Vehicle, 'g' | 'paint'>[] {
  const span = (count: number) => {
    const i0 = Math.floor(rng() * (count - 1))
    const i1 = i0 + 1 + Math.floor(rng() * (count - 1 - i0))
    return [i0, i1] as const
  }
  const out: Omit<Vehicle, 'g' | 'paint'>[] = []
  for (let k = 0; k < n; k++) {
    const [i0, i1] = span(lines.cols.length)
    const [j0, j1] = span(lines.rows.length)
    const path = loopRoute(lines.cols[i0]!, lines.rows[j0]!, lines.cols[i1]!, lines.rows[j1]!, rng() < 0.5, z)
    const roll = rng()
    const kind: VehicleKind = roll < 0.1 ? 'bus' : roll < 0.25 ? 'van' : roll < 0.38 ? 'taxi' : 'car'
    const cruise = (kind === 'bus' ? 0.38 : kind === 'van' ? 0.48 : 0.52) + rng() * 0.12
    out.push({
      kind,
      color: kind === 'taxi' ? 0xfacc15 : kind === 'bus' ? 0xf8fafc : pick(rng, colors),
      path,
      d: rng() * path.total,
      v: cruise,
      cruise,
    })
  }
  return out
}

/** Advance every vehicle; each brakes for a vehicle close ahead in its lane. */
export function stepTraffic(cars: readonly Vehicle[], dt: number) {
  const state = cars.map((c) => ({ pos: at(c.path, c.d).pos, dir: heading(c.path, c.d, 0.05) }))
  for (const [i, car] of cars.entries()) {
    const me = state[i]!
    const reach = SIZE[car.kind].len / 2 + 0.2
    let blocked = false
    for (const [j, other] of state.entries()) {
      if (j === i) continue
      const dc = other.pos.col - me.pos.col
      const dr = other.pos.row - me.pos.row
      const ahead = dc * me.dir.col + dr * me.dir.row
      const side = Math.abs(dc * me.dir.row - dr * me.dir.col)
      const gap = ahead - SIZE[cars[j]!.kind].len / 2
      if (ahead > 0 && gap < reach && side < 0.05) {
        blocked = true
        break
      }
    }
    const target = blocked ? 0 : car.cruise
    car.v += (target - car.v) * Math.min(1, dt * (blocked ? 8 : 2))
    car.d = (car.d + car.v * dt) % car.path.total
  }
}

/**
 * Moves one vehicle's graphics to its route position and returns the depth key (col + row). The
 * body is drawn around the graphics' own origin, so moving costs no redraw.
 */
export function moveVehicle(car: Vehicle): number {
  const pos = at(car.path, car.d).pos
  car.pose = { pos, dir: heading(car.path, car.d, SIZE[car.kind].len * 0.4) }
  const s = project(pos, car.paint.t)
  car.g.position.set(s.x, s.y)
  return pos.col + pos.row
}

/**
 * Redraws the body once its heading has turned noticeably (corners) or when `force` is set (view
 * morph); on straights it does nothing.
 */
export function paintVehicle(car: Vehicle, force = false): void {
  const dir = car.pose!.dir
  const last = car.drawnDir
  if (!force && last && last.col * dir.col + last.row * dir.row >= REDRAW_COS) return
  drawVehicleBody(car, dir)
  car.drawnDir = dir
}

function drawVehicleBody(car: Vehicle, dir: { col: number; row: number }) {
  const p = car.paint
  const { len, wid, h } = SIZE[car.kind]
  const pos = { col: 0, row: 0, z: 0 }
  const z = 0
  p.g.clear()
  const glass = 0xcfe3f5
  if (car.kind === 'bus') {
    orientedBox(p, pos, dir, len, wid, z, z + h, car.color, p.style.window)
    orientedBox(p, pos, dir, len * 0.9, wid * 0.8, z + h, z + h + 0.008, 0xcbd5e1)
  } else if (car.kind === 'van') {
    orientedBox(p, pos, dir, len, wid, z, z + h, car.color)
    const front = { col: dir.col * len * 0.36, row: dir.row * len * 0.36 }
    orientedBox(p, front, dir, len * 0.26, wid * 1.02, z + h * 0.45, z + h * 0.9, glass)
  } else {
    orientedBox(p, pos, dir, len, wid, z, z + h, car.color)
    const cab = { col: -dir.col * len * 0.05, row: -dir.row * len * 0.05 }
    orientedBox(p, cab, dir, len * 0.5, wid * 0.9, z + h, z + h + 0.03, glass)
    if (car.kind === 'taxi') orientedBox(p, cab, dir, 0.03, 0.03, z + h + 0.03, z + h + 0.045, 0x1e293b)
  }
}
