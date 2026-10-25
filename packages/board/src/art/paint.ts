import { FillGradient, type Graphics } from 'pixi.js'
import { TILE, project, projectPoly, zScale, type Pos } from '../geometry/project.ts'
import { disc, rect, type Box } from '../view/draw.ts'
import type { ArtStyle } from './style.ts'

/**
 * The modelling kit: low-poly isometric primitives in board units (col, row, z), lit from the
 * top-left. Visible faces of a box are its top, the +row face (lower-left on screen, lit) and the
 * +col face (lower-right, in shade). Everything goes through `project`, so the top-down morph
 * keeps working.
 */
export interface Paint {
  g: Graphics
  /** View morph (1 = isometric). */
  t: number
  style: ArtStyle
  /**
   * Night lights (lit windows, lamp glow), drawn into their own Graphics right above `g` and shown
   * as night falls. Optional: the art page and day-only callers leave it out.
   */
  lights?: Graphics
  /** Optional second lights layer for windows that switch on and off over the night. */
  lightsAlt?: Graphics
  /** Blinking night beacons (tower tips, hotel roofs), right above `lights`; the board blinks it. */
  beacons?: Graphics
  /**
   * Called as each building or lamp starts. With `lights`, it may swap `g`, `lights` and `beacons`
   * for a fresh set above everything drawn so far, so one building's night lights never paint over
   * the buildings drawn after it (in front of it) in the same layer.
   */
  mark?: () => void
}

/**
 * Richer look (DECISIONS.md D31, draft): soft shading down the walls, framed windows that glow at
 * night, warm light pooling on the ground, rounder trees. `?rich=0` draws the flat kit to compare.
 */
export const ART = { rich: true }

/**
 * Gradients are textures, and a fill's `color` does not tint them, so each color and strength gets
 * its own, cached (a city uses a few dozen).
 */
const grads = new Map<string, FillGradient>()
const rgba = (c: number, a: number) => `rgba(${(c >> 16) & 0xff},${(c >> 8) & 0xff},${c & 0xff},${a})`

/** `color` transparent at the top of a shape's box, `alpha` at its bottom. */
function fadeDown(color: number, alpha: number): FillGradient {
  const key = `d${color}:${alpha.toFixed(2)}`
  let g = grads.get(key)
  if (!g) {
    g = new FillGradient({
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: rgba(color, 0) },
        { offset: 1, color: rgba(color, alpha) },
      ],
    })
    grads.set(key, g)
  }
  return g
}

/** `color` at `alpha` in the center of a shape's box, fading out to its edge. */
function fadeOut(color: number, alpha: number): FillGradient {
  const key = `o${color}:${alpha.toFixed(2)}`
  let g = grads.get(key)
  if (!g) {
    g = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: rgba(color, alpha) },
        { offset: 0.4, color: rgba(color, alpha * 0.5) },
        { offset: 1, color: rgba(color, 0) },
      ],
    })
    grads.set(key, g)
  }
  return g
}

let vignette: FillGradient | undefined
/** Table vignette for a screen-sized rect: a faint lift in the middle, darker toward the edges. */
export function vignetteFill(): FillGradient {
  vignette ??= new FillGradient({
    type: 'radial',
    center: { x: 0.5, y: 0.54 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.54 },
    outerRadius: 0.64,
    colorStops: [
      { offset: 0, color: 'rgba(70,100,160,0.10)' },
      { offset: 0.45, color: 'rgba(70,100,160,0)' },
      { offset: 1, color: 'rgba(0,0,0,0.5)' },
    ],
  })
  return vignette
}

/** Fills a screen polygon with `color` fading out from the center of its bounding box. */
export function soft(g: Graphics, poly: number[], color: number, alpha: number): void {
  g.poly(poly).fill(fadeOut(color, alpha))
}

/** Fills a screen polygon with `color` fading in from the top of its bounding box to the bottom. */
export function fadeIn(g: Graphics, poly: number[], color: number, alpha: number): void {
  g.poly(poly).fill(fadeDown(color, alpha))
}

/** A small blinking beacon at a point (only drawn when the caller has a beacons layer). */
export function beacon(p: Paint, col: number, row: number, z: number, color: number): void {
  const g = p.beacons
  if (!g) return
  g.poly(disc(col, row, 0.12, z, p.t, 16)).fill({ color, alpha: 0.2 })
  g.poly(disc(col, row, 0.04, z, p.t, 12)).fill(0xfff4f4)
  g.poly(disc(col, row, 0.026, z, p.t, 10)).fill(color)
}

/** Beacon blink (aviation style, real time): brightness 0..1 at `ms`. */
export const blinkAt = (ms: number) => (ms % 1600 < 720 ? 1 : 0.25)

/**
 * Floodlight wash at night: light fading upward over a box's two visible faces, from its base to
 * `height` above it. Goes into the lights layer, so it only shows at night.
 */
export function wash(p: Paint, b: Box, height: number, color: number): void {
  const lights = p.lights
  if (!lights) return
  const e = 0.004
  const bands = [0.22, 0.14, 0.08, 0.04]
  for (const [i, alpha] of bands.entries()) {
    const z0 = b.z0 + (height * i) / bands.length
    const z1 = b.z0 + (height * (i + 1)) / bands.length
    const sides: Pos[][] = [
      [
        { col: b.col0, row: b.row1 + e, z: z1 },
        { col: b.col1, row: b.row1 + e, z: z1 },
        { col: b.col1, row: b.row1 + e, z: z0 },
        { col: b.col0, row: b.row1 + e, z: z0 },
      ],
      [
        { col: b.col1 + e, row: b.row0, z: z1 },
        { col: b.col1 + e, row: b.row1, z: z1 },
        { col: b.col1 + e, row: b.row1, z: z0 },
        { col: b.col1 + e, row: b.row0, z: z0 },
      ],
    ]
    for (const f of sides) lights.poly(projectPoly(f, p.t)).fill({ color, alpha })
  }
}

/**
 * Night palette (DECISIONS.md D28). Lights: mostly warm homes and offices, some cool white office
 * floors. Grades are multiplied over day colors at full night: a blue-violet dusk, not a blackout,
 * so the city keeps its value contrast and the lights carry the mood. Ring tiles darken least.
 */
export const NIGHT = {
  warm: 0xffcf7a,
  soft: 0xffe6b0,
  cool: 0xd2e8ff,
  lamp: 0xffd98c,
  city: 0x6470b4,
  ground: 0x56629e,
  tiles: 0xaab3dc,
} as const

/** The golden-hour color passed through on the way to night (and back at dawn). */
const DUSK = 0xf8cdb0
/** Night level where the golden hour peaks. */
const DUSK_AT = 0.4

/**
 * Tint for night level `n` (0 = day, untinted; 1 = the full `grade`): day, then a warm golden hour
 * (`warmth` scales it; the ring tiles take less), then the blue night grade.
 */
export function nightTint(grade: number, n: number, warmth = 1): number {
  const dusk = mix(0xffffff, DUSK, warmth)
  return n <= DUSK_AT ? mix(0xffffff, dusk, n / DUSK_AT) : mix(dusk, grade, (n - DUSK_AT) / (1 - DUSK_AT))
}

/** Brightness of night lights at level `n`: they switch on through the dusk (smoothstep). */
export function lightsAt(n: number): number {
  const x = Math.min(1, Math.max(0, (n - 0.25) / 0.55))
  return x * x * (3 - 2 * x)
}

/** Share of windows lit at night. */
const LIT_AT_NIGHT = 0.58

/**
 * Stable 0..1 value for a point, so night lights never consume the seeded RNG (which would change
 * the city's layout) and a window stays lit or dark every time the city is redrawn.
 */
export function hash3(a: number, b: number, c: number): number {
  let h = Math.imul(Math.round(a * 997), 0x27d4eb2d) ^ Math.imul(Math.round(b * 991), 0x165667b1)
  h = Math.imul(h ^ Math.round(c * 983), 0x9e3779b1)
  h ^= h >>> 15
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

/** A flat screen polygon (x, y pairs) scaled by `k` around its center. */
function grow(poly: number[], k: number): number[] {
  let cx = 0
  let cy = 0
  for (let i = 0; i < poly.length; i += 2) {
    cx += poly[i]!
    cy += poly[i + 1]!
  }
  const n = poly.length / 2
  cx /= n
  cy /= n
  return poly.map((v, i) => (i % 2 === 0 ? cx + (v - cx) * k : cy + (v - cy) * k))
}

const ch = (c: number, s: number) => (c >> s) & 0xff

/** Linear blend of two colors, k = 0 gives a. */
export function mix(a: number, b: number, k: number): number {
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * k)
  return (m(16) << 16) | (m(8) << 8) | m(0)
}

function mul(c: number, k: number): number {
  return mix(0, c, Math.min(1, k)) | 0
}

/** Face colors for a base color: shade is darker and tinted toward the style's shadow color. */
export function faces(c: number, style: ArtStyle): { top: number; left: number; right: number } {
  return {
    top: light(c, 0.06),
    left: mix(mul(c, 0.86), style.shadow, 0.08),
    right: mix(mul(c, 0.62), style.shadow, 0.26),
  }
}

/** A lighter tint (sunlit edge, highlights). */
export const light = (c: number, k = 0.25) => mix(c, 0xffffff, k)

export function flat(
  p: Paint,
  col0: number,
  row0: number,
  col1: number,
  row1: number,
  z: number,
  color: number,
) {
  p.g.poly(rect(col0, row0, col1, row1, z, p.t)).fill(color)
}

/** Shaded box. */
export function box(p: Paint, b: Box, color: number): void {
  const f = faces(color, p.style)
  const poly = (pts: Pos[], c: number) => p.g.poly(projectPoly(pts, p.t)).fill(c)
  const { col0, row0, col1, row1, z0, z1 } = b
  if (z1 > z0) {
    poly(
      [
        { col: col0, row: row1, z: z1 },
        { col: col1, row: row1, z: z1 },
        { col: col1, row: row1, z: z0 },
        { col: col0, row: row1, z: z0 },
      ],
      f.left,
    )
    poly(
      [
        { col: col1, row: row0, z: z1 },
        { col: col1, row: row1, z: z1 },
        { col: col1, row: row1, z: z0 },
        { col: col1, row: row0, z: z0 },
      ],
      f.right,
    )
    const leftFace: Pos[] = [
      { col: col0, row: row1, z: z1 },
      { col: col1, row: row1, z: z1 },
      { col: col1, row: row1, z: z0 },
      { col: col0, row: row1, z: z0 },
    ]
    const rightFace: Pos[] = [
      { col: col1, row: row0, z: z1 },
      { col: col1, row: row1, z: z1 },
      { col: col1, row: row1, z: z0 },
      { col: col1, row: row0, z: z0 },
    ]
    const big = z1 - z0 > 0.05 && col1 - col0 > 0.05 && row1 - row0 > 0.05
    if (ART.rich && big) {
      // Light falls off down the walls, and the base sits in a soft occlusion band.
      const h = z1 - z0
      const band = (pts: Pos[]) => pts.map((q) => (q.z === z1 ? { ...q, z: z0 + Math.min(h, 0.09) } : q))
      for (const [face, k] of [
        [leftFace, 0.2],
        [rightFace, 0.16],
      ] as const) {
        fadeIn(p.g, projectPoly(face, p.t), p.style.shadow, k)
        fadeIn(p.g, projectPoly(band(face), p.t), p.style.shadow, 0.22)
      }
    }
    // Ambient occlusion: walls darken where they meet the ground.
    const ao = Math.min(0.035, (z1 - z0) * 0.25)
    if (!(ART.rich && big) && ao > 0.006) {
      const dark = (c: number) => mix(c, p.style.shadow, 0.35)
      poly(
        [
          { col: col0, row: row1, z: z0 + ao },
          { col: col1, row: row1, z: z0 + ao },
          { col: col1, row: row1, z: z0 },
          { col: col0, row: row1, z: z0 },
        ],
        dark(f.left),
      )
      poly(
        [
          { col: col1, row: row0, z: z0 + ao },
          { col: col1, row: row1, z: z0 + ao },
          { col: col1, row: row1, z: z0 },
          { col: col1, row: row0, z: z0 },
        ],
        dark(f.right),
      )
    }
  }
  p.g.poly(rect(col0, row0, col1, row1, z1, p.t)).fill(f.top)
  // Sunlit rim along the top edges facing the viewer: crisp, modelled edges.
  if (z1 - z0 > 0.04 && col1 - col0 > 0.06) {
    p.g
      .poly(
        projectPoly(
          [
            { col: col0, row: row1, z: z1 },
            { col: col1, row: row1, z: z1 },
            { col: col1, row: row0, z: z1 },
          ],
          p.t,
        ),
        false,
      )
      .stroke({ color: light(color, 0.45), width: 1.2, alpha: 0.85 })
  }
}

/** Vertical mullion lines across a glass box's visible faces (curtain-wall look). */
export function mullions(p: Paint, b: Box, spacing: number, color: number): void {
  const { col0, row0, col1, row1, z0, z1 } = b
  const line = (a: Pos, c: Pos) =>
    p.g.poly(projectPoly([a, c], p.t), false).stroke({ color, width: 1, alpha: 0.35 })
  for (let c = col0 + spacing; c < col1 - spacing * 0.5; c += spacing)
    line({ col: c, row: row1, z: z0 }, { col: c, row: row1, z: z1 })
  for (let r = row0 + spacing; r < row1 - spacing * 0.5; r += spacing)
    line({ col: col1, row: r, z: z0 }, { col: col1, row: r, z: z1 })
}

/** Street lamp: thin pole with a warm lamp head. */
export function lamp(p: Paint, col: number, row: number, z: number): void {
  p.mark?.()
  box(
    p,
    { col0: col - 0.008, row0: row - 0.008, col1: col + 0.008, row1: row + 0.008, z0: z, z1: z + 0.2 },
    0x64748b,
  )
  box(
    p,
    { col0: col - 0.02, row0: row - 0.02, col1: col + 0.02, row1: row + 0.02, z0: z + 0.2, z1: z + 0.225 },
    0xfde68a,
  )
  const lights = p.lights
  if (!lights) return
  if (ART.rich) {
    soft(lights, disc(col, row, 0.34, z + 0.002, p.t, 24), NIGHT.lamp, 0.55)
    soft(lights, disc(col, row, 0.07, z + 0.215, p.t, 12), 0xfff4d6, 0.9)
    lights.poly(disc(col, row, 0.022, z + 0.215, p.t, 10)).fill(0xfff4d6)
    return
  }
  // A soft pool of light on the ground and a bright head.
  for (const [r, a] of [
    [0.26, 0.1],
    [0.17, 0.14],
    [0.09, 0.22],
  ] as const)
    lights.poly(disc(col, row, r, z + 0.002, p.t, 18)).fill({ color: NIGHT.lamp, alpha: a })
  lights.poly(disc(col, row, 0.028, z + 0.215, p.t, 10)).fill(0xfff4d6)
}

/** Park bench facing +row. */
export function bench(p: Paint, col: number, row: number, z: number, color: number): void {
  box(
    p,
    { col0: col - 0.05, row0: row - 0.012, col1: col + 0.05, row1: row + 0.012, z0: z + 0.02, z1: z + 0.03 },
    color,
  )
  box(
    p,
    { col0: col - 0.05, row0: row - 0.016, col1: col + 0.05, row1: row - 0.008, z0: z + 0.03, z1: z + 0.06 },
    color,
  )
}

/**
 * Soft contact shadow cast toward +col (screen lower-right) by something `h` tall standing on a
 * footprint. Drawn before the object.
 */
export function shadow(
  p: Paint,
  col0: number,
  row0: number,
  col1: number,
  row1: number,
  z: number,
  h: number,
  /** Buildings spill warm light onto the sidewalk at night; trees and props do not. */
  spill = true,
) {
  const dx = Math.min(0.9, h * 0.45 + 0.04)
  const dy = Math.min(0.25, h * 0.08 + 0.02)
  const pts: Pos[] = [
    { col: col0, row: row0, z },
    { col: col1, row: row0, z },
    { col: col1 + dx, row: row0 + dy, z },
    { col: col1 + dx, row: row1 + dy, z },
    { col: col0 + dx, row: row1 + dy, z },
    { col: col0, row: row1, z },
  ]
  p.g.poly(projectPoly(pts, p.t)).fill({ color: p.style.shadow, alpha: p.style.shadowAlpha })
  if (!ART.rich || h < 0.1) return
  // Soft occlusion pool hugging the footprint.
  const m = 0.07
  soft(p.g, rect(col0 - m, row0 - m, col1 + m, row1 + m, z, p.t), p.style.shadow, 0.32)
  // Warm light spilling from the ground floor onto the sidewalk in front of the two visible faces.
  const lights = p.lights
  if (!lights || !spill) return
  const k = hash3(col0, row0, h)
  if (k > 0.8) return
  const cm = (col0 + col1) / 2
  const rm = (row0 + row1) / 2
  const w = (col1 - col0) * 0.62
  const d = (row1 - row0) * 0.62
  const a = 0.45 + k * 0.35
  soft(lights, rect(cm - w, row1 - 0.06, cm + w, row1 + 0.32, z + 0.002, p.t), NIGHT.warm, a)
  soft(lights, rect(col1 - 0.06, rm - d, col1 + 0.32, rm + d, z + 0.002, p.t), NIGHT.warm, a * 0.8)
}

/**
 * Pitched roof on top of the walls `b`. `axis` is the ridge direction. The eaves overhang the
 * walls on the long sides (deeper for chunkier styles); the gable end shows on the visible end.
 */
export function gable(p: Paint, b: Box, height: number, axis: 'col' | 'row', roof: number, wall: number) {
  const { col0, row0, col1, row1, z1 } = b
  const o = 0.025 + p.style.chunk * 0.04
  const zr = z1 + height
  const rf = faces(roof, p.style)
  const wf = faces(wall, p.style)
  const poly = (pts: Pos[], c: number) => p.g.poly(projectPoly(pts, p.t)).fill(c)
  if (axis === 'col') {
    const rm = (row0 + row1) / 2
    poly(
      [
        { col: col0, row: rm, z: zr },
        { col: col1, row: rm, z: zr },
        { col: col1, row: row0 - o, z: z1 - o * 0.6 },
        { col: col0, row: row0 - o, z: z1 - o * 0.6 },
      ],
      rf.right,
    )
    poly(
      [
        { col: col0, row: rm, z: zr },
        { col: col1, row: rm, z: zr },
        { col: col1, row: row1 + o, z: z1 - o * 0.6 },
        { col: col0, row: row1 + o, z: z1 - o * 0.6 },
      ],
      light(rf.top, 0.06),
    )
    poly(
      [
        { col: col1, row: row0, z: z1 },
        { col: col1, row: row1, z: z1 },
        { col: col1, row: rm, z: zr },
      ],
      wf.right,
    )
    // Ridge line catches the light.
    p.g
      .poly(
        projectPoly(
          [
            { col: col0, row: rm, z: zr },
            { col: col1, row: rm, z: zr },
          ],
          p.t,
        ),
        false,
      )
      .stroke({ color: light(roof, 0.35), width: 1.5 })
  } else {
    const cm = (col0 + col1) / 2
    poly(
      [
        { col: cm, row: row0, z: zr },
        { col: cm, row: row1, z: zr },
        { col: col0 - o, row: row1, z: z1 - o * 0.6 },
        { col: col0 - o, row: row0, z: z1 - o * 0.6 },
      ],
      light(rf.top, 0.06),
    )
    poly(
      [
        { col: cm, row: row0, z: zr },
        { col: cm, row: row1, z: zr },
        { col: col1 + o, row: row1, z: z1 - o * 0.6 },
        { col: col1 + o, row: row0, z: z1 - o * 0.6 },
      ],
      rf.right,
    )
    poly(
      [
        { col: col0, row: row1, z: z1 },
        { col: col1, row: row1, z: z1 },
        { col: cm, row: row1, z: zr },
      ],
      wf.left,
    )
    p.g
      .poly(
        projectPoly(
          [
            { col: cm, row: row0, z: zr },
            { col: cm, row: row1, z: zr },
          ],
          p.t,
        ),
        false,
      )
      .stroke({ color: light(roof, 0.35), width: 1.5 })
  }
}

/** Upright cylinder (water tanks, chimneys, columns): the visible half of the side, then the top. */
export function cylinder(
  p: Paint,
  col: number,
  row: number,
  r: number,
  z0: number,
  z1: number,
  color: number,
) {
  const f = faces(color, p.style)
  const n = 10
  const side: Pos[] = []
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 4 + (i / n) * Math.PI
    side.push({ col: col + Math.cos(a) * r, row: row + Math.sin(a) * r, z: z1 })
  }
  for (let i = n; i >= 0; i--) {
    const a = -Math.PI / 4 + (i / n) * Math.PI
    side.push({ col: col + Math.cos(a) * r, row: row + Math.sin(a) * r, z: z0 })
  }
  // Two tones across the side: lit toward +row, shaded toward +col.
  p.g.poly(projectPoly(side, p.t)).fill(f.right)
  const lit: Pos[] = []
  for (let i = n / 2; i <= n; i++) {
    const a = -Math.PI / 4 + (i / n) * Math.PI
    lit.push({ col: col + Math.cos(a) * r, row: row + Math.sin(a) * r, z: z1 })
  }
  for (let i = n; i >= n / 2; i--) {
    const a = -Math.PI / 4 + (i / n) * Math.PI
    lit.push({ col: col + Math.cos(a) * r, row: row + Math.sin(a) * r, z: z0 })
  }
  p.g.poly(projectPoly(lit, p.t)).fill(f.left)
  const top: Pos[] = []
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    top.push({ col: col + Math.cos(a) * r, row: row + Math.sin(a) * r, z: z1 })
  }
  p.g.poly(projectPoly(top, p.t)).fill(f.top)
}

/** Low-poly cone (pine trees, spires): lit half and shaded half. */
export function cone(p: Paint, col: number, row: number, r: number, z0: number, z1: number, color: number) {
  const f = faces(color, p.style)
  const apex = { col, row, z: z1 }
  const at = (a: number) => ({ col: col + Math.cos(a) * r, row: row + Math.sin(a) * r, z: z0 })
  const half = (from: number, to: number, c: number) => {
    const pts: Pos[] = [apex]
    for (let i = 0; i <= 4; i++) pts.push(at(from + ((to - from) * i) / 4))
    p.g.poly(projectPoly(pts, p.t)).fill(c)
  }
  half(-Math.PI / 4, Math.PI / 4, f.right)
  half(Math.PI / 4, (3 * Math.PI) / 4, f.left)
}

/** A slightly squashed screen-space circle (tree canopies). */
function circle(x: number, y: number, rad: number): number[] {
  const pts: number[] = []
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    pts.push(x + Math.cos(a) * rad, y + Math.sin(a) * rad * 0.94)
  }
  return pts
}

/**
 * Round low-poly canopy (a 7-sided blob) floating at height z: a shade crescent, the body, and a
 * sunlit cap toward the top-left. Drawn in screen space around the projected center.
 */
export function blob(p: Paint, col: number, row: number, z: number, r: number, color: number) {
  const c = project({ col, row, z }, p.t)
  const px = r * TILE.w * 0.5
  const ngon = (x: number, y: number, rad: number, fill: number) => {
    const pts: number[] = []
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 - Math.PI / 2
      pts.push(x + Math.cos(a) * rad, y + Math.sin(a) * rad * 0.92)
    }
    p.g.poly(pts).fill(fill)
  }
  const f = faces(color, p.style)
  if (ART.rich) {
    // A round canopy: shaded body, then a soft sunlit cap and a soft shade toward the bottom.
    p.g.poly(circle(c.x, c.y, px)).fill(color)
    fadeIn(p.g, circle(c.x, c.y, px), f.right, 0.75)
    soft(p.g, circle(c.x - px * 0.3, c.y - px * 0.34, px * 0.75), light(color, 0.32), 0.85)
    return
  }
  ngon(c.x + px * 0.12, c.y + px * 0.1, px, f.right)
  ngon(c.x, c.y, px * 0.94, color)
  ngon(c.x - px * 0.28, c.y - px * 0.3, px * 0.5, light(color, 0.18))
}

/** A tree: trunk plus a round canopy or a pine cone, sized by `s` (about 0.1 to 0.25). */
export function tree(p: Paint, col: number, row: number, z: number, s: number, color: number, pine = false) {
  shadow(p, col - s * 0.5, row - s * 0.5, col + s * 0.5, row + s * 0.5, z, s * 1.2, false)
  box(
    p,
    { col0: col - 0.015, row0: row - 0.015, col1: col + 0.015, row1: row + 0.015, z0: z, z1: z + s * 0.7 },
    p.style.trunk,
  )
  if (pine) cone(p, col, row, s * 0.55, z + s * 0.35, z + s * 2.2, color)
  else blob(p, col, row, z + s * 1.15, s * 0.62, color)
}

/**
 * Window grid on a box's visible faces. One row per floor; columns spaced along each face. Lit
 * windows (style.litShare, decided by `rng`) use the warm window color.
 */
export function windows(
  p: Paint,
  b: Box,
  floors: number,
  rng: () => number,
  opts: { spacing?: number; width?: number; ribbon?: boolean; from?: number } = {},
): void {
  const { col0, row0, col1, row1, z0, z1 } = b
  const base = opts.from ?? 0
  const fh = (z1 - z0 - base) / floors
  const spacing = opts.spacing ?? 0.11 - p.style.chunk * 0.01
  // Ribbon glass is near-continuous panes split by thin mullions; punched windows are smaller.
  const w = opts.ribbon ? spacing * 0.9 : (opts.width ?? spacing * (0.5 + p.style.chunk * 0.12))
  const day = faces(p.style.window, p.style)
  const pick = (c: number) => (rng() < p.style.litShare ? p.style.windowLit : c)
  // Whole floors of an office tend to be lit together; a building is warm or cool.
  const cool = !opts.ribbon ? false : hash3(col0, row0, z0) < (ART.rich ? 0.2 : 0.5)
  const quad = (pts: Pos[], c: number) => {
    const poly = projectPoly(pts, p.t)
    if (ART.rich && !opts.ribbon) {
      // A recessed frame around punched windows, and a pale reflection fading down the glass.
      p.g.poly(grow(poly, 1.22)).fill(mix(c, p.style.shadow, 0.5))
      p.g.poly(poly).fill(c)
      fadeIn(p.g, poly, 0xffffff, 0.28)
    } else p.g.poly(poly).fill(c)
    const lights = p.lights
    if (!lights) return
    const at = pts[0]!
    const floorLit = hash3(col0 + row0, z0, Math.round(at.z * 50)) < 0.75
    const k = hash3(at.col, at.row, at.z)
    // Windows near the lit/unlit threshold go into `lightsAlt`: they switch on and off at night.
    const flicker = p.lightsAlt && Math.abs(k - LIT_AT_NIGHT) < 0.09
    if (!flicker && (!floorLit || k > LIT_AT_NIGHT)) return
    const target = flicker ? p.lightsAlt! : lights
    const color = cool ? NIGHT.cool : k < LIT_AT_NIGHT * 0.25 ? NIGHT.soft : NIGHT.warm
    if (ART.rich) {
      // A smooth glow around the pane, the warm pane, and a brighter lower half (lamps inside).
      soft(target, grow(poly, opts.ribbon ? 2.2 : 3.6), color, opts.ribbon ? 0.4 : 0.55)
      target.poly(poly).fill(mix(color, 0xd9822b, cool ? 0 : 0.28))
      fadeIn(target, poly, cool ? 0xf4f8ff : NIGHT.soft, 0.55)
      return
    }
    // A soft halo first (the pane grown around its center), then the pane: cheap static "bloom".
    target.poly(grow(poly, 2.1)).fill({ color, alpha: 0.13 })
    target.poly(poly).fill(color)
  }
  for (let f = 0; f < floors; f++) {
    const za = z0 + base + f * fh + fh * (opts.ribbon ? 0.22 : 0.3)
    const zb = z0 + base + f * fh + fh * (opts.ribbon ? 0.84 : 0.78)
    // +row face (lit) runs along col; +col face (shade) runs along row.
    for (const face of ['row', 'col'] as const) {
      const a0 = face === 'row' ? col0 : row0
      const a1 = face === 'row' ? col1 : row1
      const n = Math.max(1, Math.floor((a1 - a0 - 0.04) / spacing))
      const pad = (a1 - a0 - n * spacing) / 2
      for (let i = 0; i < n; i++) {
        const a = a0 + pad + i * spacing + (spacing - w) / 2
        const pts =
          face === 'row'
            ? [
                { col: a, row: row1, z: zb },
                { col: a + w, row: row1, z: zb },
                { col: a + w, row: row1, z: za },
                { col: a, row: row1, z: za },
              ]
            : [
                { col: col1, row: a, z: zb },
                { col: col1, row: a + w, z: zb },
                { col: col1, row: a + w, z: za },
                { col: col1, row: a, z: za },
              ]
        quad(pts, pick(face === 'row' ? day.left : day.right))
      }
    }
  }
}

/** A horizontal band painted on a box's two visible faces only (shopfronts, sign bands). */
export function stripe(p: Paint, b: Box, z0: number, z1: number, color: number): void {
  const f = faces(color, p.style)
  const e = 0.003
  const poly = (pts: Pos[], c: number) => p.g.poly(projectPoly(pts, p.t)).fill(c)
  poly(
    [
      { col: b.col0, row: b.row1 + e, z: z1 },
      { col: b.col1 + e, row: b.row1 + e, z: z1 },
      { col: b.col1 + e, row: b.row1 + e, z: z0 },
      { col: b.col0, row: b.row1 + e, z: z0 },
    ],
    f.left,
  )
  poly(
    [
      { col: b.col1 + e, row: b.row0, z: z1 },
      { col: b.col1 + e, row: b.row1 + e, z: z1 },
      { col: b.col1 + e, row: b.row1 + e, z: z0 },
      { col: b.col1 + e, row: b.row0, z: z0 },
    ],
    f.right,
  )
}

/** A door on the +row face, centered at `col`. */
export function door(p: Paint, col: number, row: number, z: number, w: number, h: number, color: number) {
  p.g
    .poly(
      projectPoly(
        [
          { col: col - w / 2, row, z: z + h },
          { col: col + w / 2, row, z: z + h },
          { col: col + w / 2, row, z },
          { col: col - w / 2, row, z },
        ],
        p.t,
      ),
    )
    .fill(color)
}

/** Screen px per board-unit of height (for code that sizes things in pixels). */
export const zPx = (t: number) => zScale(t)
