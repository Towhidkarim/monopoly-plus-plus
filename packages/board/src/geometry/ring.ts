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
  if (count <= 1) {
    if (fp.corner) return tileCenter(index)
    return tilePoint(fp, 0.5, 0.42)
  }
  const cols = Math.min(count, 2)
  const rows = Math.ceil(count / cols)
  const c = slot % cols
  const r = Math.floor(slot / cols)
  const u = (c + 0.5) / cols
  const v = 0.2 + ((r + 0.5) / rows) * 0.5
  if (fp.corner) {
    const span = fp.col1 - fp.col0
    return {
      col: fp.col0 + span * (0.12 + 0.76 * u),
      row: fp.row0 + span * (0.12 + 0.76 * ((r + 0.5) / rows)),
    }
  }
  return tilePoint(fp, u, v)
}
