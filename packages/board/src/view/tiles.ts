import { Container, Graphics } from 'pixi.js'
import { SPACES } from '@skyline/engine'
import { Spring } from '../anim/spring.ts'
import { projectPoly, zScale } from '../geometry/project.ts'
import { ringFootprint, tilePoint, type Footprint } from '../geometry/ring.ts'
import { groupColors, palette, shade } from '../palette.ts'
import { disc, isoBox, rect } from './draw.ts'

const GAP = 0.035
const THICK = 0.1
const LIFT_HOVER = 0.14
const LIFT_SELECT = 0.2

/** One of the 40 ring tiles: code-drawn geometry, lift spring, highlight rim. */
export class TileView {
  readonly container = new Container()
  private readonly base = new Graphics()
  private readonly rim = new Graphics()
  private readonly fp: Footprint
  readonly lift = new Spring(0, 260, 18)
  hovered = false
  selected = false
  /** 0..1 flash from path previews, decays each frame. */
  flash = 0
  private pulseClock = 0

  readonly index: number

  constructor(index: number) {
    this.index = index
    this.fp = ringFootprint(index)
    this.container.zIndex = this.fp.col0 + this.fp.row0
    this.rim.alpha = 0
    this.container.addChild(this.base, this.rim)
  }

  draw(t: number): void {
    const fp = this.fp
    const g = this.base.clear()
    const top = fp.corner ? palette.cornerTop : palette.tileTop
    isoBox(
      g,
      {
        col0: fp.col0 + GAP,
        row0: fp.row0 + GAP,
        col1: fp.col1 - GAP,
        row1: fp.row1 - GAP,
        z0: -THICK,
        z1: 0,
      },
      { top, left: palette.tileLeft, right: palette.tileRight },
      t,
    )
    drawIcon(g, this.index, fp, t)

    this.rim
      .clear()
      .poly(rect(fp.col0 + GAP, fp.row0 + GAP, fp.col1 - GAP, fp.row1 - GAP, 0, t))
      .fill({ color: 0xffffff, alpha: 0.18 })
      .stroke({ color: 0xffffff, width: 3, alignment: 1, join: 'round' })
  }

  update(dtMs: number, t: number): void {
    this.lift.target = this.selected ? LIFT_SELECT : this.hovered ? LIFT_HOVER : 0
    this.lift.step(dtMs)
    this.container.y = -this.lift.value * zScale(t)

    this.pulseClock += dtMs
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dtMs / 450)
    const pulse = this.selected ? 0.75 + 0.25 * Math.sin(this.pulseClock / 160) : 0
    this.rim.alpha = Math.max(this.hovered ? 1 : 0, pulse, this.flash)
    this.rim.tint = this.selected ? palette.select : palette.hover
  }
}

/** Quad in tile-local (u along edge, v outer->inner) coordinates, flattened to screen. */
function quad(fp: Footprint, u0: number, v0: number, u1: number, v1: number, t: number): number[] {
  return projectPoly(
    [tilePoint(fp, u0, v0), tilePoint(fp, u1, v0), tilePoint(fp, u1, v1), tilePoint(fp, u0, v1)].map((p) => ({
      ...p,
      z: 0,
    })),
    t,
  )
}

function polyUV(fp: Footprint, uv: readonly (readonly [number, number])[], t: number): number[] {
  return projectPoly(
    uv.map(([u, v]) => ({ ...tilePoint(fp, u, v), z: 0 })),
    t,
  )
}

function discUV(fp: Footprint, u: number, v: number, r: number, t: number): number[] {
  const c = tilePoint(fp, u, v)
  return disc(c.col, c.row, r, 0, t)
}

function drawIcon(g: Graphics, index: number, fp: Footprint, t: number): void {
  const space = SPACES[index]!
  switch (space.kind) {
    case 'property': {
      const color = groupColors[space.group]!
      g.poly(quad(fp, 0.05, 0.76, 0.95, 0.96, t)).fill(color)
      // Pattern marks so groups never depend on color alone.
      const marks = (space.group % 4) + 1
      for (let i = 0; i < marks; i++) {
        const u = (i + 1) / (marks + 1)
        if (space.group < 4) g.poly(discUV(fp, u, 0.86, 0.045, t)).fill(shade(color, 0.6))
        else g.poly(quad(fp, u - 0.04, 0.82, u + 0.04, 0.9, t)).fill(shade(color, 0.6))
      }
      break
    }
    case 'railroad':
      for (let i = 0; i < 6; i++) {
        const u = 0.12 + i * 0.152
        g.poly(quad(fp, u - 0.025, 0.3, u + 0.025, 0.7, t)).fill(0x94a3b8)
      }
      g.poly(quad(fp, 0.04, 0.38, 0.96, 0.42, t)).fill(palette.rail)
      g.poly(quad(fp, 0.04, 0.58, 0.96, 0.62, t)).fill(palette.rail)
      break
    case 'utility':
      if (index === 12) {
        g.poly(
          polyUV(
            fp,
            [
              [0.58, 0.18],
              [0.36, 0.52],
              [0.5, 0.52],
              [0.42, 0.84],
              [0.66, 0.46],
              [0.52, 0.46],
            ],
            t,
          ),
        ).fill(palette.amber)
      } else {
        g.poly(discUV(fp, 0.5, 0.6, 0.2, t)).fill(palette.sky)
        g.poly(
          polyUV(
            fp,
            [
              [0.32, 0.56],
              [0.5, 0.18],
              [0.68, 0.56],
            ],
            t,
          ),
        ).fill(palette.sky)
      }
      break
    case 'tax':
      g.poly(discUV(fp, 0.5, 0.5, 0.3, t)).fill(palette.amber)
      g.poly(discUV(fp, 0.5, 0.5, 0.2, t)).fill(shade(palette.amber, 0.8))
      break
    case 'chance':
      g.poly(
        polyUV(
          fp,
          [
            [0.5, 0.15],
            [0.85, 0.5],
            [0.5, 0.85],
            [0.15, 0.5],
          ],
          t,
        ),
      ).fill(palette.indigo)
      g.poly(discUV(fp, 0.5, 0.5, 0.1, t)).fill(palette.tileTop)
      break
    case 'chest':
      g.poly(quad(fp, 0.2, 0.3, 0.8, 0.72, t)).fill(palette.teal)
      g.poly(quad(fp, 0.2, 0.46, 0.8, 0.52, t)).fill(shade(palette.teal, 0.7))
      break
    case 'go':
      // Start stripe plus a big arrow pointing along the walking direction (toward Jail).
      g.poly(
        polyUV(
          fp,
          [
            [0.12, 0.42],
            [0.55, 0.42],
            [0.55, 0.28],
            [0.88, 0.5],
            [0.55, 0.72],
            [0.55, 0.58],
            [0.12, 0.58],
          ],
          t,
        ),
      ).fill(palette.alert)
      break
    case 'jail':
      g.poly(quad(fp, 0.42, 0.42, 0.95, 0.95, t)).fill(palette.slabLeft)
      for (let i = 1; i <= 4; i++) {
        const u = 0.42 + i * 0.106
        g.poly(quad(fp, u - 0.015, 0.45, u + 0.015, 0.92, t)).fill(0xcbd5e1)
      }
      break
    case 'parking':
      g.poly(discUV(fp, 0.38, 0.4, 0.3, t)).fill(0x2dd4bf)
      g.poly(discUV(fp, 0.62, 0.55, 0.26, t)).fill(0x14b8a6)
      g.poly(discUV(fp, 0.4, 0.66, 0.2, t)).fill(0x5eead4)
      break
    case 'goToJail':
      g.poly(discUV(fp, 0.5, 0.5, 0.42, t)).fill(palette.alert)
      g.poly(quad(fp, 0.22, 0.45, 0.78, 0.55, t)).fill(0xf8fafc)
      break
  }
}
