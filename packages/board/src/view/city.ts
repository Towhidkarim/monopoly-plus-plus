import { Container, Graphics } from 'pixi.js'
import { DEPTH, BOARD } from '../geometry/ring.ts'
import { house, inset, park, pick, type Lot } from '../art/buildings.ts'
import { drawDistrict } from '../art/district.ts'
import { NIGHT, box, faces, flat, light, lightsAt, nightTint, tree, type Paint } from '../art/paint.ts'
import { BOARD_STYLE } from '../art/style.ts'
import { drawTrack } from '../art/train.ts'
import { palette } from '../palette.ts'
import { cosmeticRng, isoBox, rect } from './draw.ts'
import { Ambient } from './ambient.ts'
import { GROUND_Z, PLINTH_Z, planCity, type BeltItem, type CityPlan, type Station } from './cityPlan.ts'

const SLAB_Z = -0.1

/** Table shadow and the board slab. The city sits on top of it (CityView). */
export class GroundView {
  readonly graphics = new Graphics()

  draw(t: number): void {
    const g = this.graphics.clear()
    // Soft table shadow under the board.
    g.poly(rect(0.25, 0.45, BOARD + 0.35, BOARD + 0.55, -0.55, t)).fill({ color: 0x000000, alpha: 0.35 })
    isoBox(
      g,
      { col0: 0, row0: 0, col1: BOARD, row1: BOARD, z0: -0.5, z1: SLAB_Z },
      { top: palette.slabTop, left: palette.slabLeft, right: palette.slabRight },
      t,
    )
  }
}

/** A building's body, its night lights right above it, and its blinking beacons above those. */
interface Part {
  body: Graphics
  lights: Graphics
  beacons: Graphics
}

/**
 * One depth slice of the city, in painter's order. A slice holds a whole block, so each building
 * (or lamp) that lights up starts a new part: its lights sit right above it and below whatever is
 * drawn after it (Paint.mark), so lights never show through the buildings in front.
 */
interface Layer {
  c: Container
  parts: Part[]
  /** Parts in use since the last redraw; spare ones stay empty. */
  used: number
}

function addPart(l: Layer): Part {
  const part = { body: new Graphics(), lights: new Graphics(), beacons: new Graphics() }
  l.c.addChild(part.body, part.lights, part.beacons)
  l.parts.push(part)
  return part
}

/**
 * The board's city, generated from a cosmetic city seed (DECISIONS.md D25) in the board style.
 * Flat ground (streets, rails, plinth) goes into `base`; everything with height is drawn into
 * layers keyed by depth (col + row) inside `actors`, so it sorts with tokens. The city is static:
 * redraw it only when the view morphs or the seed changes. Traffic and trains (`life`) move on top
 * of it without ever redrawing it.
 */
export class CityView {
  /** Ground level: lawn, rails, plinth and the district's streets. */
  readonly base = new Graphics()
  private plan: CityPlan
  private readonly layers = new Map<number, Layer>()
  private readonly actors: Container
  private night = 0
  /** Cars and trains driving the streets and the rail loop. */
  readonly life: Ambient

  constructor(seed: number, actors: Container) {
    this.actors = actors
    this.plan = planCity(seed)
    this.life = new Ambient(actors)
    this.life.build(this.plan)
  }

  /** Number of Graphics objects the city uses (for profiling). */
  get graphicsCount(): number {
    let n = 0
    for (const l of this.layers.values()) n += l.parts.length * 3
    return n + 1 + this.life.graphicsCount
  }

  setSeed(seed: number): void {
    this.plan = planCity(seed)
    for (const l of this.layers.values()) l.c.destroy({ children: true })
    this.layers.clear()
    this.life.build(this.plan)
    this.life.setNight(this.night)
  }

  /** 0 = day, 1 = night: tints the city and fades its lights in. Cheap (no redraw). */
  setNight(n: number): void {
    this.night = n
    const tint = nightTint(NIGHT.city, n)
    this.base.tint = nightTint(NIGHT.ground, n, 0.6)
    const glow = lightsAt(n)
    for (const l of this.layers.values())
      for (const part of l.parts) {
        part.body.tint = tint
        part.lights.alpha = glow
        part.lights.visible = glow > 0.01
        part.beacons.visible = glow > 0.01
      }
    this.life.setNight(n)
  }

  /** Beacon brightness (night level times the blink), set each frame by the board. */
  setBlink(alpha: number): void {
    for (const l of this.layers.values()) for (const part of l.parts) part.beacons.alpha = alpha
  }

  draw(t: number): void {
    const style = BOARD_STYLE
    const plan = this.plan
    this.base.clear()
    for (const l of this.layers.values()) {
      for (const part of l.parts) {
        part.body.clear()
        part.lights.clear()
        part.beacons.clear()
      }
      l.used = 1
    }
    const base: Paint = { g: this.base, t, style }
    const layer = (key: number): Paint => {
      const k = Math.round(key * 1e4) / 1e4
      let l = this.layers.get(k)
      if (!l) {
        l = { c: new Container({ zIndex: k }), parts: [], used: 1 }
        addPart(l)
        this.actors.addChild(l.c)
        this.layers.set(k, l)
      }
      const slice = l
      const top = slice.parts[slice.used - 1]!
      const paint: Paint = { g: top.body, lights: top.lights, beacons: top.beacons, t, style }
      paint.mark = () => {
        // Only split once the current part has lights; unlit things share a part.
        const cur = slice.parts[slice.used - 1]!
        if (cur.lights.context.instructions.length === 0) return
        const next = slice.parts[slice.used] ?? addPart(slice)
        slice.used++
        paint.g = next.body
        paint.lights = next.lights
        paint.beacons = next.beacons
      }
      return paint
    }
    flat(base, DEPTH, DEPTH, BOARD - DEPTH, BOARD - DEPTH, GROUND_Z, style.ground)
    drawTrack(base, plan.loop)
    // Raised plinth under the district.
    const pl = plan.plinth
    isoBox(
      this.base,
      { col0: pl.col0, row0: pl.row0, col1: pl.col1, row1: pl.row1, z0: GROUND_Z, z1: PLINTH_Z },
      {
        top: style.sidewalk,
        left: faces(style.sidewalk, style).left,
        right: faces(style.sidewalk, style).right,
      },
      t,
    )
    drawDistrict(base, plan.district.area, plan.district.seed, { ...plan.district.options, layer })

    for (const item of plan.belt) drawBelt(layer(depth(item.lot)), item)
    for (const s of plan.stations) drawStation(layer(depth(s.hall)), s)
    this.life.setView(t)
    this.setNight(this.night)
  }
}

const depth = (l: Lot) => (l.col0 + l.col1 + l.row0 + l.row1) / 2

function drawBelt(p: Paint, item: BeltItem): void {
  const s = p.style
  const rng = cosmeticRng(item.seed)
  const { lot } = item
  if (item.kind === 'park') {
    park(p, lot, rng)
  } else if (item.kind === 'house') {
    flat(p, lot.col0 - 0.05, lot.row0 - 0.05, lot.col1 + 0.05, lot.row1 + 0.05, lot.z + 0.003, s.park)
    house(p, lot, rng, { floors: 1 + Math.floor(rng() * 2) })
  } else {
    const spots = Array.from({ length: 3 }, () => ({
      col: lot.col0 + 0.12 + rng() * (lot.col1 - lot.col0 - 0.24),
      row: lot.row0 + 0.12 + rng() * (lot.row1 - lot.row0 - 0.24),
      size: 0.12 + rng() * 0.06,
      pine: rng() < 0.25,
      color: pick(rng, s.trees),
    }))
    for (const t of spots.toSorted((a, b) => a.col + a.row - (b.col + b.row)))
      tree(p, t.col, t.row, lot.z, t.size, t.color, t.pine)
  }
}

/** A small station: platform with a canopy on posts, and a hall behind it. */
function drawStation(p: Paint, st: Station): void {
  const s = p.style
  const z = st.platform.z
  box(p, { ...st.platform, z0: z, z1: z + 0.05 }, light(s.sidewalk, 0.1))
  box(p, { ...st.hall, z0: z, z1: z + 0.22 }, s.plaster[3]!)
  box(p, { ...inset(st.hall, -0.01), z0: z + 0.22, z1: z + 0.25 }, s.accents[1]!)
  // Canopy over the platform on two posts.
  const pf = st.platform
  const post = (col: number, row: number) =>
    box(
      p,
      {
        col0: col - 0.012,
        row0: row - 0.012,
        col1: col + 0.012,
        row1: row + 0.012,
        z0: z + 0.05,
        z1: z + 0.2,
      },
      s.plaster[0]!,
    )
  const along = st.axis === 'col'
  const mid = along ? (pf.row0 + pf.row1) / 2 : (pf.col0 + pf.col1) / 2
  for (const e of along ? [pf.col0 + 0.06, pf.col1 - 0.06] : [pf.row0 + 0.06, pf.row1 - 0.06])
    post(along ? e : mid, along ? mid : e)
  box(p, { ...pf, z0: z + 0.2, z1: z + 0.225 }, s.plaster[1]!)
}
