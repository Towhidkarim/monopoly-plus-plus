import type { Graphics } from 'pixi.js'
import { shade } from '../palette.ts'
import { disc, isoBox, type Box } from '../view/draw.ts'

/**
 * Player piece shapes, all code-drawn. Vehicles are built from boxes in a local frame
 * (f = forward, s = sideways, z = up) and re-drawn for each of the 4 ring headings.
 */

export type PieceKind = 'taxi' | 'bus' | 'drone' | 'balloon' | 'pawn'

export const PIECES: readonly { kind: PieceKind; label: string }[] = [
  { kind: 'taxi', label: 'Taxi' },
  { kind: 'bus', label: 'City bus' },
  { kind: 'drone', label: 'Drone' },
  { kind: 'balloon', label: 'Balloon' },
  { kind: 'pawn', label: 'Classic pawn' },
]

/** 0 = +col, 1 = +row, 2 = -col, 3 = -row. Headings 0 and 1 point toward the camera. */
export type Heading = 0 | 1 | 2 | 3

/** Travel direction along each board side (side 0 runs GO -> Jail, i.e. -col). */
export const SIDE_HEADING: readonly Heading[] = [2, 3, 0, 1]

/** Horizontal screen direction of travel per heading: +1 right, -1 left. */
export const HEADING_DX: readonly number[] = [1, -1, -1, 1]

export function headingOf(dcol: number, drow: number, fallback: Heading): Heading {
  if (Math.abs(dcol) < 1e-6 && Math.abs(drow) < 1e-6) return fallback
  if (Math.abs(dcol) >= Math.abs(drow)) return dcol > 0 ? 0 : 2
  return drow > 0 ? 1 : 3
}

interface Part {
  f0: number
  f1: number
  s0: number
  s1: number
  z0: number
  z1: number
  top: number
  left: number
  right: number
  /** Only drawn when this end of the vehicle faces the camera. */
  end?: 'front' | 'back'
}

const part = (
  f0: number,
  f1: number,
  s0: number,
  s1: number,
  z0: number,
  z1: number,
  color: number,
  end?: 'front' | 'back',
): Part => ({
  f0,
  f1,
  s0,
  s1,
  z0,
  z1,
  top: color,
  left: shade(color, 0.82),
  right: shade(color, 0.62),
  ...(end ? { end } : {}),
})

/** Rotates a local (forward, side) point onto the board axes for heading `h`. */
function rotate(f: number, s: number, h: Heading): { col: number; row: number } {
  switch (h) {
    case 0:
      return { col: f, row: s }
    case 1:
      return { col: -s, row: f }
    case 2:
      return { col: -f, row: -s }
    default:
      return { col: s, row: -f }
  }
}

function toBox(p: Part, h: Heading): Box {
  const a = rotate(p.f0, p.s0, h)
  const b = rotate(p.f1, p.s1, h)
  return {
    col0: Math.min(a.col, b.col),
    col1: Math.max(a.col, b.col),
    row0: Math.min(a.row, b.row),
    row1: Math.max(a.row, b.row),
    z0: p.z0,
    z1: p.z1,
  }
}

function drawParts(g: Graphics, parts: readonly Part[], h: Heading, t: number): void {
  const frontVisible = h === 0 || h === 1
  const boxes = parts
    .filter((p) => !p.end || (p.end === 'front') === frontVisible)
    .map((p) => ({ p, b: toBox(p, h) }))
    // Lower parts first, then back-to-front.
    .toSorted((x, y) => x.b.z0 - y.b.z0 || x.b.col0 + x.b.row0 - (y.b.col0 + y.b.row0))
  for (const { p, b } of boxes) isoBox(g, b, p, t)
}

function wheels(length: number, width: number): Part[] {
  const out: Part[] = []
  for (const f of [-length * 0.3, length * 0.3]) {
    for (const s of [-width / 2 - 0.012, width / 2 - 0.035]) {
      out.push(part(f - 0.05, f + 0.05, s, s + 0.047, 0, 0.075, 0x1e293b))
    }
  }
  return out
}

function taxiParts(color: number): Part[] {
  const L = 0.42
  const W = 0.24
  return [
    ...wheels(L, W),
    part(-L / 2, L / 2, -W / 2, W / 2, 0.035, 0.13, color),
    part(-L * 0.28, L * 0.18, -W * 0.44, W * 0.44, 0.13, 0.215, 0x334e72),
    part(-L * 0.24, L * 0.14, -W * 0.38, W * 0.38, 0.215, 0.225, color),
    part(-0.04, 0.04, -0.05, 0.05, 0.225, 0.26, 0xfde68a), // roof sign
    part(L / 2, L / 2 + 0.012, -W * 0.42, -W * 0.18, 0.07, 0.1, 0xfef9c3, 'front'),
    part(L / 2, L / 2 + 0.012, W * 0.18, W * 0.42, 0.07, 0.1, 0xfef9c3, 'front'),
    part(-L / 2 - 0.012, -L / 2, -W * 0.42, -W * 0.2, 0.08, 0.11, 0xef4444, 'back'),
    part(-L / 2 - 0.012, -L / 2, W * 0.2, W * 0.42, 0.08, 0.11, 0xef4444, 'back'),
  ]
}

function busParts(color: number): Part[] {
  const L = 0.5
  const W = 0.26
  return [
    ...wheels(L, W),
    part(-L / 2, L / 2, -W / 2, W / 2, 0.035, 0.12, color),
    part(-L / 2, L / 2, -W / 2, W / 2, 0.12, 0.2, 0x2b4366), // window band
    part(-L / 2, L / 2, -W / 2, W / 2, 0.2, 0.27, 0xf1f5f9),
    part(-L * 0.3, L * 0.1, -W * 0.3, W * 0.3, 0.27, 0.29, 0xcbd5e1), // roof unit
    part(L / 2, L / 2 + 0.012, -W * 0.4, W * 0.4, 0.06, 0.09, 0xfef9c3, 'front'),
    part(-L / 2 - 0.012, -L / 2, -W * 0.4, W * 0.4, 0.07, 0.1, 0xef4444, 'back'),
  ]
}

/** Draws a facing-dependent vehicle into `g` (cleared first), origin at its ground center. */
export function drawVehicle(g: Graphics, kind: 'taxi' | 'bus', color: number, h: Heading, t: number): void {
  g.clear()
  drawParts(g, kind === 'taxi' ? taxiParts(color) : busParts(color), h, t)
}

export function drawDrone(g: Graphics, color: number, t: number): void {
  g.clear()
  const arm = 0xcbd5e1
  const a = 0.26 // arm reach
  isoBox(g, { col0: -a, col1: a, row0: -0.028, row1: 0.028, z0: 0.04, z1: 0.07 }, cols(arm), t)
  isoBox(g, { col0: -0.028, col1: 0.028, row0: -a, row1: a, z0: 0.04, z1: 0.07 }, cols(arm), t)
  isoBox(g, { col0: -0.11, col1: 0.11, row0: -0.11, row1: 0.11, z0: 0, z1: 0.12 }, cols(color), t)
  isoBox(g, { col0: -0.04, col1: 0.04, row0: -0.04, row1: 0.04, z0: 0.12, z1: 0.15 }, cols(0x22d3ee), t)
  for (const [c, r] of [
    [-a, 0],
    [a, 0],
    [0, -a],
    [0, a],
  ] as const) {
    g.poly(disc(c, r, 0.11, 0.09, t, 16)).fill({ color: 0xe2e8f0, alpha: 0.45 })
    g.poly(disc(c, r, 0.025, 0.095, t, 8)).fill(0x334155)
  }
}

function cols(color: number) {
  return { top: color, left: shade(color, 0.82), right: shade(color, 0.62) }
}

/** Screen-space hot-air balloon (a billboard), basket bottom at (0, 0). */
export function drawBalloon(g: Graphics, color: number): void {
  g.clear()
  const light = shade(color, 1.25)
  const dark = shade(color, 0.7)
  // Ropes.
  g.moveTo(-6, -10).lineTo(-12, -32).moveTo(6, -10).lineTo(12, -32).stroke({ color: 0x475569, width: 1.2 })
  // Basket.
  g.roundRect(-7, -11, 14, 11, 2).fill(0x92400e)
  g.rect(-7, -11, 14, 3).fill(0xb45309)
  // Envelope: taper plus striped sphere.
  g.poly([-14, -36, 14, -36, 8, -28, -8, -28]).fill(dark)
  g.ellipse(0, -54, 22, 24).fill(color)
  g.ellipse(0, -54, 13, 24).fill(light)
  g.ellipse(0, -54, 5, 24).fill(color)
  g.ellipse(-8, -63, 5, 7).fill({ color: 0xffffff, alpha: 0.35 })
}

/** Screen-space classic pawn, foot at (0, 0). */
export function drawPawn(g: Graphics, color: number): void {
  g.clear()
  const dark = shade(color, 0.55)
  const mid = shade(color, 0.8)
  g.ellipse(0, -4, 15, 7).fill(dark)
  g.ellipse(0, -7, 15, 7).fill(mid)
  g.poly([-11, -8, 11, -8, 6, -30, -6, -30]).fill(color)
  g.poly([2, -8, 11, -8, 6, -30, 1, -30]).fill(mid)
  g.ellipse(0, -30, 8, 3.5).fill(mid)
  g.circle(0, -40, 10).fill(color)
  g.circle(-3.5, -43.5, 3.5).fill({ color: 0xffffff, alpha: 0.55 })
}
