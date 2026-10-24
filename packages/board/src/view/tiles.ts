import { Container, Graphics } from 'pixi.js'
import { SPACES } from '@skyline/engine'
import { Spring } from '../anim/spring.ts'
import type { Lot } from '../art/buildings.ts'
import { drawLot, type Family } from '../art/lots.ts'
import { NIGHT, lightsAt, nightTint } from '../art/paint.ts'
import { BOARD_STYLE } from '../art/style.ts'
import { projectPoly, zScale } from '../geometry/project.ts'
import { lotRect, ringFootprint, tilePoint, type Footprint } from '../geometry/ring.ts'
import { groupColors, palette, shade } from '../palette.ts'
import { disc, isoBox, rect } from './draw.ts'

const GAP = 0.035
const THICK = 0.1
const LIFT_HOVER = 0.14
const LIFT_SELECT = 0.2

/**
 * Architecture family per color group, cheap to expensive: houses on the first streets, glass on
 * the last. Fixed for now; the seeded city (DECISIONS.md D25) will vary it per game.
 */
const GROUP_FAMILY: readonly Family[] = [
  'cottage',
  'cottage',
  'brick',
  'brick',
  'modern',
  'modern',
  'glass',
  'glass',
]

/** The building plot: the part of a property tile behind the pieces' standing strip (ring.ts). */
const lotOf = (fp: Footprint): Lot => ({ ...lotRect(fp), z: 0 })

/** How far a building fades while it would cover pieces on the neighboring tile. */
const VEIL = 0.55

/** Game-state decoration on a tile: owner color, buildings, mortgage. */
export interface TileDeco {
  /** Owner's color, or null when unowned. */
  owner: number | null
  /** 0..4 houses, 5 = hotel. */
  level: number
  mortgaged: boolean
}

const EMPTY_DECO: TileDeco = { owner: null, level: 0, mortgaged: false }

/** How a newly built house falls into place. */
export interface DropTuning {
  dropHeight: number
  gravity: number
  bounce: number
}

/** A building in mid-fall: height above its slot and vertical speed (z units, per second). */
interface Drop {
  z: number
  v: number
  bounced: boolean
  tune: DropTuning
}

/** One of the 40 ring tiles: code-drawn geometry, lift spring, highlight rim, game decoration. */
export class TileView {
  readonly container = new Container()
  private readonly base = new Graphics()
  private readonly decoG = new Graphics()
  /**
   * The lot's building with its lights and beacons. It lives in the board's actor layer (not this
   * tile's container) so it depth-sorts with the city and the pieces; it follows the tile's lift.
   */
  readonly tower = new Container()
  /** The building on a property lot; moved as a whole while it drops in. */
  private readonly building = new Graphics()
  /** Its lit windows at night (never tinted). */
  private readonly buildingLights = new Graphics()
  private night = 0
  /** Mortgage dimming of the building (1 = none). */
  private baseAlpha = 1
  /** Eased 0..1 fade while the building would cover pieces on the tile behind it. */
  private veil = 0
  /** Set by the board when pieces rest on the tile this building could cover. */
  veiled = false
  /** A hotel's blinking roof beacon (the board blinks it). */
  private readonly buildingBeacons = new Graphics()
  private readonly rim = new Graphics()
  private readonly fp: Footprint
  private readonly family: Family | null
  readonly lift = new Spring(0, 260, 18)
  hovered = false
  selected = false
  /** 0..1 flash from path previews, decays each frame. */
  flash = 0
  private pulseClock = 0
  private deco: TileDeco = EMPTY_DECO
  private lastT = 1
  private drop: Drop | null = null
  /** Called when a dropped building first hits the tile, with the new building level. */
  onImpact: ((tile: TileView, level: number) => void) | null = null

  readonly index: number

  constructor(index: number) {
    this.index = index
    this.fp = ringFootprint(index)
    this.container.zIndex = this.fp.col0 + this.fp.row0
    const space = SPACES[index]!
    this.family = space.kind === 'property' ? GROUP_FAMILY[space.group]! : null
    this.rim.alpha = 0
    this.container.addChild(this.base, this.decoG, this.rim)
    this.tower.addChild(this.building, this.buildingLights, this.buildingBeacons)
    if (this.family) {
      const lot = lotRect(this.fp)
      this.tower.zIndex = (lot.col0 + lot.col1 + lot.row0 + lot.row1) / 2
    }
    this.buildingLights.visible = false
  }

  /** Beacon brightness (night level times the blink), set each frame by the board. */
  setBlink(alpha: number): void {
    this.buildingBeacons.alpha = alpha * this.building.alpha
  }

  /**
   * 0 = day, 1 = night. The tile darkens much less than the city and owner plates not at all, so
   * the board stays readable (DECISIONS.md D28); the lot's building gets the city grade and lights.
   */
  setNight(n: number): void {
    this.night = n
    this.base.tint = nightTint(NIGHT.tiles, n, 0.5)
    this.building.tint = nightTint(NIGHT.city, n)
    const glow = lightsAt(n)
    this.buildingLights.visible = glow > 0.01
    this.applyAlpha()
    this.buildingBeacons.visible = glow > 0.01
  }

  /**
   * Updates ownership/buildings/mortgage. `animate` gives a bounce (`lift`) and a flash; with
   * `drop`, a newly built house or hotel falls from above and calls `onImpact` when it lands.
   */
  setDeco(deco: TileDeco, animate: boolean, drop: DropTuning | null = null, lift = 2.4): void {
    const d = this.deco
    if (d.owner === deco.owner && d.level === deco.level && d.mortgaged === deco.mortgaged) return
    this.deco = { ...deco }
    this.drop = null
    const built = deco.level > d.level
    if (animate && built && drop) {
      this.drop = { z: drop.dropHeight, v: 0, bounced: false, tune: drop }
    } else if (animate) {
      this.lift.kick(built || deco.owner !== d.owner ? lift : -1.4)
      this.flash = 1
    }
    this.drawDeco(this.lastT)
  }

  /** True while a building is still falling or bouncing. */
  get dropping(): boolean {
    return this.drop !== null
  }

  private stepDrop(dtMs: number): void {
    const d = this.drop!
    const dt = Math.min(dtMs, 50) / 1000
    d.v -= d.tune.gravity * dt
    d.z += d.v * dt
    if (d.z <= 0) {
      d.z = 0
      if (d.bounced || d.tune.bounce <= 0) this.drop = null
      if (!d.bounced) {
        d.bounced = true
        this.lift.kick(Math.min(3, -d.v * 0.5))
        this.flash = 1
        this.onImpact?.(this, this.deco.level)
        d.v = -d.v * d.tune.bounce
      }
    }
    this.placeBuilding(this.lastT)
  }

  private drawDeco(t: number): void {
    const g = this.decoG.clear()
    const fp = this.fp
    const { owner, level, mortgaged } = this.deco
    if (mortgaged) {
      g.poly(rect(fp.col0 + GAP, fp.row0 + GAP, fp.col1 - GAP, fp.row1 - GAP, 0, t)).fill({
        color: 0x0b1426,
        alpha: 0.5,
      })
    }
    if (owner !== null) {
      // Owner plate along the outer edge, plus a small corner chip so it reads at any zoom.
      g.poly(quad(fp, 0.06, 0.03, 0.94, 0.13, t)).fill(owner)
      g.poly(quad(fp, 0.06, 0.03, 0.94, 0.05, t)).fill(shade(owner, 0.7))
    }
    const b = this.building.clear()
    const lights = this.buildingLights.clear()
    const beacons = this.buildingBeacons.clear()
    if (this.family) {
      // Unowned is the for-sale lot (-1); then owned (0), 1 to 4 houses, hotel (5).
      drawLot(
        { g: b, lights, t, style: BOARD_STYLE, beacons },
        lotOf(fp),
        owner === null ? -1 : level,
        this.family,
        owner,
        this.index * 131 + 17,
      )
    }
    this.baseAlpha = mortgaged ? 0.55 : 1
    this.setNight(this.night)
    this.placeBuilding(t)
  }

  /** Building opacity: mortgage dimming times the veil; its lights follow. */
  private applyAlpha(): void {
    this.building.alpha = this.baseAlpha * (1 - VEIL * this.veil)
    this.buildingLights.alpha = lightsAt(this.night) * this.building.alpha
  }

  /** Lifts the building by the height it still has to fall. */
  private placeBuilding(t: number): void {
    this.building.y = -(this.drop?.z ?? 0) * zScale(t)
    this.buildingLights.y = this.building.y
    this.buildingBeacons.y = this.building.y
  }

  draw(t: number): void {
    this.lastT = t
    this.drawDeco(t)
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

  /** `speed` scales falling buildings with the game speed (springs stay real-time). */
  update(dtMs: number, t: number, speed = 1): void {
    if (this.drop) this.stepDrop(dtMs * speed)
    this.lift.target = this.selected ? LIFT_SELECT : this.hovered ? LIFT_HOVER : 0
    this.lift.step(dtMs)
    this.container.y = -this.lift.value * zScale(t)
    this.tower.y = this.container.y

    this.pulseClock += dtMs
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dtMs / 450)
    const pulse = this.selected ? 0.75 + 0.25 * Math.sin(this.pulseClock / 160) : 0
    this.rim.alpha = Math.max(this.hovered ? 1 : 0, pulse, this.flash)
    this.rim.tint = this.selected ? palette.select : palette.hover

    // Fade a tall building while pieces stand just behind it (eased, so it never pops).
    const { owner, level } = this.deco
    const want = this.veiled && owner !== null && level >= 2 ? 1 : 0
    if (this.veil !== want) {
      const step = dtMs / 220
      this.veil = Math.abs(want - this.veil) <= step ? want : this.veil + Math.sign(want - this.veil) * step
      this.applyAlpha()
    }
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
        // Dark and large enough to tell groups apart in grayscale (Milestone 6 acceptance).
        if (space.group < 4) g.poly(discUV(fp, u, 0.86, 0.06, t)).fill(shade(color, 0.38))
        else g.poly(quad(fp, u - 0.055, 0.8, u + 0.055, 0.92, t)).fill(shade(color, 0.38))
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
