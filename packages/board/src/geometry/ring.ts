/**
 * Ring geometry in board units (docs/BOARD.md section 2).
 * Board spans [0, BOARD] on both axes. GO is the corner at (BOARD, BOARD), which projects
 * to the bottom of the iso diamond; indices run clockwise on screen.
 */

export const SIDE_W = 1
export const DEPTH = 1.6
export const BOARD = 2 * DEPTH + 9 * SIDE_W

export interface Footprint {
  readonly col0: number
  readonly row0: number
  readonly col1: number
  readonly row1: number
  /** 0 bottom-left edge (GO..Jail), 1 top-left, 2 top-right, 3 bottom-right. */
  readonly side: number
  readonly corner: boolean
  /** Unit vector pointing from the outer edge toward the city. Diagonal for corners. */
  readonly inward: { readonly col: number; readonly row: number }
}

const INWARD = [
  { col: 0, row: -1 },
  { col: 1, row: 0 },
  { col: 0, row: 1 },
  { col: -1, row: 0 },
] as const

const CORNER_INWARD = [
  { col: -Math.SQRT1_2, row: -Math.SQRT1_2 },
  { col: Math.SQRT1_2, row: -Math.SQRT1_2 },
  { col: Math.SQRT1_2, row: Math.SQRT1_2 },
  { col: -Math.SQRT1_2, row: Math.SQRT1_2 },
] as const

export function ringFootprint(index: number): Footprint {
  const side = Math.floor(index / 10) % 4
  const k = index % 10
  const B = BOARD
  const D = DEPTH
  if (k === 0) {
    const [col0, row0] = (
      [
        [B - D, B - D],
        [0, B - D],
        [0, 0],
        [B - D, 0],
      ] as const
    )[side]!
    return { col0, row0, col1: col0 + D, row1: row0 + D, side, corner: true, inward: CORNER_INWARD[side]! }
  }
  const a = B - D - k * SIDE_W // far end when walking down from the high corner
  const b = D + (k - 1) * SIDE_W // near end when walking up from the low corner
  const inward = INWARD[side]!
  switch (side) {
    case 0:
      return { col0: a, row0: B - D, col1: a + SIDE_W, row1: B, side, corner: false, inward }
    case 1:
      return { col0: 0, row0: a, col1: D, row1: a + SIDE_W, side, corner: false, inward }
    case 2:
      return { col0: b, row0: 0, col1: b + SIDE_W, row1: D, side, corner: false, inward }
    default:
      return { col0: B - D, row0: b, col1: B, row1: b + SIDE_W, side, corner: false, inward }
  }
}

/** Ring index under a board-space point, or null for the inner city / off board. */
export function tileAt(col: number, row: number): number | null {
  const B = BOARD
  const D = DEPTH
  if (col < 0 || row < 0 || col >= B || row >= B) return null
  const inC = col >= D && col < B - D
  const inR = row >= D && row < B - D
  if (inC && inR) return null
  if (row >= B - D) {
    if (col >= B - D) return 0
    if (col < D) return 10
    return 1 + Math.floor((B - D - col) / SIDE_W)
  }
  if (row < D) {
    if (col < D) return 20
    if (col >= B - D) return 30
    return 21 + Math.floor((col - D) / SIDE_W)
  }
  if (col < D) return 11 + Math.floor((B - D - row) / SIDE_W)
  return 31 + Math.floor((row - D) / SIDE_W)
}

/**
 * Point inside a tile in tile-local coords: `u` runs along the edge (0..1, in walking
 * direction), `v` runs from the outer edge (0) to the inner edge (1).
 */
export function tilePoint(fp: Footprint, u: number, v: number): { col: number; row: number } {
  const { col0, row0, col1, row1 } = fp
  if (fp.corner) {
    // Corners: measured from the outermost corner point, u along col, v along row.
    const outer = cornerOuter(fp)
    return {
      col: outer.col + Math.sign(fp.inward.col) * u * (col1 - col0),
      row: outer.row + Math.sign(fp.inward.row) * v * (row1 - row0),
    }
  }
  switch (fp.side) {
    case 0:
      return { col: col1 - u * (col1 - col0), row: row1 - v * (row1 - row0) }
    case 1:
      return { col: col0 + v * (col1 - col0), row: row1 - u * (row1 - row0) }
    case 2:
      return { col: col0 + u * (col1 - col0), row: row0 + v * (row1 - row0) }
    default:
      return { col: col1 - v * (col1 - col0), row: row0 + u * (row1 - row0) }
  }
}

function cornerOuter(fp: Footprint): { col: number; row: number } {
  return {
    col: fp.inward.col > 0 ? fp.col0 : fp.col1,
    row: fp.inward.row > 0 ? fp.row0 : fp.row1,
  }
}

export function tileCenter(index: number): { col: number; row: number } {
  const fp = ringFootprint(index)
  return { col: (fp.col0 + fp.col1) / 2, row: (fp.row0 + fp.row1) / 2 }
}

/**
 * Where token `slot` of `count` stands on a tile, so several tokens never overlap.
 * Tokens stand on the outer part of side tiles (the inner edge holds the group band).
 */
export function tokenAnchor(index: number, slot: number, count: number): { col: number; row: number } {
  const fp = ringFootprint(index)
  if (fp.corner) {
    if (count <= 1) return tileCenter(index)
    const cols = Math.min(count, 2)
    const rows = Math.ceil(count / cols)
    const span = fp.col1 - fp.col0
    return {
      col: fp.col0 + span * (0.12 + (0.76 * ((slot % cols) + 0.5)) / cols),
      row: fp.row0 + span * (0.12 + 0.76 * ((Math.floor(slot / cols) + 0.5) / rows)),
    }
  }
  // Side tiles: pieces line up on the standing strip, in front of the building lot.
  const [v0, v1] = stripV(fp)
  const cols = Math.min(count, 3)
  const rows = Math.ceil(count / cols)
  const u = 0.1 + (0.8 * ((slot % cols) + 0.5)) / cols
  const v = v0 + ((v1 - v0) * (Math.floor(slot / cols) + 0.5)) / rows
  return tilePoint(fp, u, v)
}

/**
 * Side tiles are split into a building lot and a standing strip for the pieces. The strip runs
 * along the edge nearest the camera (the outer edge on the two front sides, the inner edge on the
 * two back sides), so a piece always stands in front of its tile's building, never inside it.
 */
const STRIP = 0.3

/** True when a side tile's outer edge faces the camera (the front sides: GO-Jail and Go to Jail-GO). */
const outerFaces = (fp: Footprint) => fp.side === 0 || fp.side === 3

/** Range of `v` (0 outer edge, 1 inner edge) where pieces stand. */
export function stripV(fp: Footprint): readonly [number, number] {
  return outerFaces(fp) ? [0.02, STRIP] : [1 - STRIP, 0.98]
}

/** Height of the paved lot pad on side tiles (buildings and props stand on it). */
export const LOT_Z = 0.012

/**
 * The building lot's `v` range on a side tile, as [edge next to the pieces, far edge]: props that
 * people use (a platform, a kiosk door) go on the near side.
 */
export function lotV(fp: Footprint): readonly [number, number] {
  return outerFaces(fp) ? [STRIP + 0.05, 0.74] : [1 - STRIP - 0.05, 0.15]
}

/** A tile-local (u, v) rectangle as a board rectangle. */
export function uvRect(
  fp: Footprint,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
): { col0: number; row0: number; col1: number; row1: number } {
  const a = tilePoint(fp, u0, v0)
  const b = tilePoint(fp, u1, v1)
  return {
    col0: Math.min(a.col, b.col),
    row0: Math.min(a.row, b.row),
    col1: Math.max(a.col, b.col),
    row1: Math.max(a.row, b.row),
  }
}

/** The building lot of a side tile, as a board rectangle (between the strip and the far edge). */
export function lotRect(fp: Footprint): { col0: number; row0: number; col1: number; row1: number } {
  const [near, far] = lotV(fp)
  return uvRect(fp, 0.06, near, 0.94, far)
}

/**
 * The side tile next to `index` along the same edge that is nearer the camera, or null. Its
 * building can partly cover pieces standing on `index` (the board fades it when that happens).
 */
export function nearerNeighbor(index: number): number | null {
  const fp = ringFootprint(index)
  if (fp.corner) return null
  // Walking direction runs away from the camera on sides 0 and 1, toward it on sides 2 and 3.
  const next = fp.side <= 1 ? index - 1 : index + 1
  return ringFootprint(next % 40).corner ? null : next % 40
}
