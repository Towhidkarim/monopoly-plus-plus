import { BOARD, DEPTH } from '../geometry/ring.ts'
import type { Pos } from '../geometry/project.ts'
import type { BlockKind } from '../art/block.ts'
import type { Lot } from '../art/buildings.ts'
import { districtLayout, type DistrictLayout, type DistrictOptions } from '../art/district.ts'
import { at, measure, trackLoop } from '../art/train.ts'
import { cosmeticRng } from './draw.ts'

/**
 * The board's city as plain data (docs/BOARD.md section 5, DECISIONS.md D25): fixed structure (rail
 * loop, plinth, cross roads, four stations) plus seeded variation (zoning, parks, landmark, the
 * low houses and trees of the outer belt). No Pixi and no drawing, so layouts can be tested.
 */

/** Ground level inside the ring; the ring tiles stand 0.1 above it. */
export const GROUND_Z = -0.1
/** Top of the plinth that carries the district: a curb-high step, so the city sits on the ground. */
export const PLINTH_Z = GROUND_Z + 0.03

const INNER = { lo: DEPTH, hi: BOARD - DEPTH }
export const CENTER = BOARD / 2
const LOOP_INSET = 0.85
const LOOP_RADIUS = 0.85
/** Half the width of the ballast bed, in board units. */
export const BALLAST = 0.12
/** Plinth edge to the loop's center line (wide enough that the square plinth clears the rounded corners). */
const PLINTH_GAP = 0.4
const BLOCKS = 2
/** Floor cap of the back quadrant. */
export const BACK_FLOORS = 3
const CROSS_W = 0.42
/** Ring road along the plinth's outer edge: about the width of a normal street. */
export const RING_W = 0.26
/** Half the train's length (three cars): a stopped train's head sits this far past the station spot. */
const HALF_TRAIN = 0.71
/** Radial range of the outer belt, measured from the ring's inner edge toward the loop. */
const BELT = { lo: 0.1, hi: 0.58 }

export interface BeltItem {
  kind: 'house' | 'trees' | 'park'
  lot: Lot
  seed: number
}

export interface Station {
  /** Ring side it sits on (0 bottom-left, 1 top-left, 2 top-right, 3 bottom-right). */
  side: number
  /** Platform beside the track, and the hall behind it. */
  platform: Lot
  hall: Lot
  /** Long axis of the platform. */
  axis: 'col' | 'row'
  /** Ring tile this station serves (5, 15, 25, 35). */
  tile: number
}

export interface CityPlan {
  seed: number
  /** Rail loop center line. */
  loop: Pos[]
  loopBounds: { lo: number; hi: number; radius: number }
  plinth: Lot
  district: { area: Lot; seed: number; options: DistrictOptions; layout: DistrictLayout }
  belt: BeltItem[]
  stations: Station[]
  /** Street center lines for traffic, and the height vehicles drive at. */
  roads: { cols: number[]; rows: number[]; z: number }
  /** Train head positions along the loop (distance from `loop[0]`) that stop at a station, ascending. */
  stops: number[]
  /** Train livery picks (index into the style accents), one per train. */
  liveries: number[]
}

const zone = (i: number, j: number): BlockKind => (i === 0 && j === 0 ? 'midtown' : 'downtown')

const mid = (st: { lo: number; hi: number }) => (st.lo + st.hi) / 2

export function planCity(seed: number): CityPlan {
  const rng = cosmeticRng(seed * 7919 + 17)
  const lo = INNER.lo + LOOP_INSET
  const hi = INNER.hi - LOOP_INSET
  const loop = trackLoop(lo, lo, hi, hi, LOOP_RADIUS, GROUND_Z)
  const plinth: Lot = {
    col0: lo + PLINTH_GAP,
    row0: lo + PLINTH_GAP,
    col1: hi - PLINTH_GAP,
    row1: hi - PLINTH_GAP,
    z: PLINTH_Z,
  }

  // Two cross roads cut the plinth into four big blocks. The front one (1,1) is downtown with the
  // landmark; the sides (1,0) and (0,1) mix towers, offices and walk-ups; the back one (0,0) is
  // low midtown (max 3 floors) so the far tiles stay clear.
  const sideTowers = [1 + Math.floor(rng() * 2), 1 + Math.floor(rng() * 2)]
  const options: DistrictOptions = {
    blocks: { cols: BLOCKS, rows: BLOCKS },
    downtown: { col: CENTER, row: CENTER },
    landmark: true,
    landmarkAt: { i: 1, j: 1 },
    street: CROSS_W,
    edge: RING_W,
    cross: CROSS_W,
    zone,
    blockExtra: (i, j) => ({
      lots: 3,
      towers: i === 1 && j === 1 ? 3 : sideTowers[i]!,
      ...(i === 0 && j === 0 ? { maxFloors: BACK_FLOORS } : {}),
    }),
  }
  const districtSeed = Math.floor(rng() * 1e6)
  const layout = districtLayout(plinth, districtSeed, options)

  const stations = planStations()
  const path = measure(loop)
  const stops = stations.map((st) => stopHead(path, stationSpot(st))).toSorted((a, b) => a - b)

  return {
    seed,
    loop,
    loopBounds: { lo, hi, radius: LOOP_RADIUS },
    plinth,
    district: { area: plinth, seed: districtSeed, options, layout },
    belt: planBelt(rng),
    stations,
    roads: { cols: layout.colStreets.map(mid), rows: layout.rowStreets.map(mid), z: PLINTH_Z },
    stops,
    liveries: [Math.floor(rng() * 4), Math.floor(rng() * 4)],
  }
}

/** A rectangle on ring side `side`: `a` runs along the edge, `u` is the depth from the inner edge. */
function onSide(side: number, a0: number, a1: number, u0: number, u1: number, z: number): Lot {
  switch (side) {
    case 0:
      return { col0: a0, col1: a1, row0: INNER.hi - u1, row1: INNER.hi - u0, z }
    case 1:
      return { col0: INNER.lo + u0, col1: INNER.lo + u1, row0: a0, row1: a1, z }
    case 2:
      return { col0: a0, col1: a1, row0: INNER.lo + u0, row1: INNER.lo + u1, z }
    default:
      return { col0: INNER.hi - u1, col1: INNER.hi - u0, row0: a0, row1: a1, z }
  }
}

/** One small station per side, in the middle of the edge, nearest the railroad tile (5, 15, 25, 35). */
function planStations(): Station[] {
  const trackU = LOOP_INSET
  return [0, 1, 2, 3].map((side) => {
    const a0 = CENTER - 0.7
    const a1 = CENTER + 0.7
    const platformU: [number, number] = [trackU - BALLAST - 0.2, trackU - BALLAST]
    const platform = onSide(side, a0, a1, platformU[0], platformU[1], GROUND_Z)
    const hall = onSide(side, CENTER - 0.3, CENTER + 0.3, BELT.lo + 0.02, platformU[0] - 0.02, GROUND_Z)
    return { side, platform, hall, axis: side % 2 === 0 ? 'col' : 'row', tile: 5 + side * 10 } as const
  })
}

/** Head position at which a train's middle sits at `spot` (the nearest point on the loop). */
function stopHead(path: ReturnType<typeof measure>, spot: { col: number; row: number }): number {
  let head = 0
  let best = Infinity
  for (let d = 0; d < path.total; d += 0.02) {
    const p = at(path, d).pos
    const dist = Math.hypot(p.col - spot.col, p.row - spot.row)
    if (dist < best) {
      best = dist
      head = d
    }
  }
  return (head + HALF_TRAIN) % path.total
}

/** Where the train stops: in front of the platform, on the loop's center line. */
function stationSpot(s: Station): { col: number; row: number } {
  const c = { col: (s.platform.col0 + s.platform.col1) / 2, row: (s.platform.row0 + s.platform.row1) / 2 }
  const off = BALLAST + 0.1
  // Platform is toward the ring, the loop center line is `off` further in.
  const dir = [
    { col: 0, row: -1 },
    { col: 1, row: 0 },
    { col: 0, row: 1 },
    { col: -1, row: 0 },
  ][s.side]!
  return { col: c.col + dir.col * off, row: c.row + dir.row * off }
}

/** Sparse houses, trees and small parks between the ring and the loop. */
function planBelt(rng: () => number): BeltItem[] {
  const items: BeltItem[] = []
  const lo = INNER.lo + LOOP_INSET + PLINTH_GAP
  const hi = INNER.hi - LOOP_INSET - PLINTH_GAP
  const half = 0.9 // the station's share of the middle of each edge
  for (let side = 0; side < 4; side++) {
    // Slots along the edge on both sides of the station, three each.
    for (const [from, to] of [
      [lo, CENTER - half],
      [CENTER + half, hi],
    ] as const) {
      const n = 3
      const w = (to - from) / n
      for (let k = 0; k < n; k++) {
        const r = rng()
        const a0 = from + k * w
        const seed = Math.floor(rng() * 1e6)
        if (r < 0.34) {
          // A house, centered in the slot, one or two floors.
          const m = (w - 0.55) / 2
          items.push({ kind: 'house', lot: onSide(side, a0 + m, a0 + w - m, 0.14, 0.54, GROUND_Z), seed })
        } else if (r < 0.7) {
          items.push({
            kind: 'trees',
            lot: onSide(side, a0 + 0.06, a0 + w - 0.06, 0.1, 0.58, GROUND_Z),
            seed,
          })
        }
      }
    }
  }
  // Corners: a small park or a grove in the space outside each loop corner.
  for (const side of [0, 1, 2, 3]) {
    // Corner `side` is the one before ring side `side`'s start (GO, Jail, Parking, Go to Jail).
    const corner = [
      { col: INNER.hi, row: INNER.hi },
      { col: INNER.lo, row: INNER.hi },
      { col: INNER.lo, row: INNER.lo },
      { col: INNER.hi, row: INNER.lo },
    ][side]!
    const sc = corner.col === INNER.lo ? 1 : -1
    const sr = corner.row === INNER.lo ? 1 : -1
    const c0 = corner.col + (sc > 0 ? 0.1 : -0.85)
    const r0 = corner.row + (sr > 0 ? 0.1 : -0.85)
    const seed = Math.floor(rng() * 1e6)
    items.push({
      kind: rng() < 0.6 ? 'park' : 'trees',
      lot: { col0: c0, col1: c0 + 0.75, row0: r0, row1: r0 + 0.75, z: GROUND_Z },
      seed,
    })
  }
  return items
}
