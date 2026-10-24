import {
  Application,
  Container,
  Graphics,
  Text,
  type FederatedPointerEvent,
  type FederatedWheelEvent,
} from 'pixi.js'
import { project } from '../geometry/project.ts'
import { groupColors, palette } from '../palette.ts'
import { cosmeticRng, isoBox, rect } from '../view/draw.ts'
import { park, type Lot } from './buildings.ts'
import { STREET, drawDistrict } from './district.ts'
import { FAMILIES, LEVEL_LABELS, drawLot, type Family } from './lots.ts'
import { flat, type Paint } from './paint.ts'
import { STYLES, type ArtStyle } from './style.ts'
import { drawVehicle, planTraffic, stepTraffic, streetLines, type Vehicle } from './traffic.ts'
import { drawTrack, drawTrain, measure, trackLoop, type Path } from './train.ts'

/**
 * The art style sheet (#art): every style column shows each architecture family growing on a
 * lot, a corner park, a seeded city block and a running train, so directions can be compared
 * side by side before the real board is rebuilt with one of them.
 */
export interface ArtSheetHandle {
  /** New seed for the city blocks and building details. */
  setSeed(seed: number): void
  destroy(): void
}

const COLUMN_GAP = 140
const SECTION_GAP = 46
const TILE_STEP = 1.12
const OWNER = 0xfb7185

interface Train {
  g: Graphics
  paint: Paint
  path: Path
  livery: number
  head: number
}

export interface ArtSheetView {
  /** Show the bottom of the sheet (block, park, train) instead of the top. */
  focus?: 'top' | 'bottom'
  /** Zoom relative to fitting the width. */
  zoom?: number
}

export async function mountArtSheet(
  host: HTMLElement,
  styles: readonly ArtStyle[] = STYLES,
  seed = 1,
  view: ArtSheetView = {},
): Promise<ArtSheetHandle> {
  const app = new Application()
  await app.init({
    resizeTo: host,
    background: palette.table,
    antialias: true,
    resolution: Math.max(2, Math.min(window.devicePixelRatio, 2)),
    autoDensity: true,
  })
  host.appendChild(app.canvas)
  const world = new Container()
  app.stage.addChild(world)
  let trains: Train[] = []
  let traffic: Vehicle[] = []

  const build = (s: number) => {
    for (const child of world.removeChildren()) child.destroy({ children: true })
    trains = []
    traffic = []
    let x = 0
    for (const style of styles) {
      const col = buildColumn(style, s, trains, traffic)
      col.position.x = x - col.getLocalBounds().x
      world.addChild(col)
      x += col.getLocalBounds().width + COLUMN_GAP
    }
  }
  build(seed)
  fit()

  function fit() {
    const b = world.getLocalBounds()
    const k = Math.min(1.2, (app.screen.width - 40) / Math.max(1, b.width)) * (view.zoom ?? 1)
    world.scale.set(k)
    world.position.set(20 - b.x * k, 20 - b.y * k)
    if (view.focus === 'bottom') world.position.y = app.screen.height - 20 - (b.y + b.height) * k
  }

  const tick = (t: { deltaMS: number }) => {
    for (const tr of trains) {
      tr.head += (t.deltaMS / 1000) * 0.9
      tr.g.clear()
      drawTrain(tr.paint, tr.path, tr.head, 3, tr.livery)
    }
    stepTraffic(traffic, Math.min(0.05, t.deltaMS / 1000))
    for (const car of traffic) car.g.zIndex = drawVehicle(car)
  }
  app.ticker.add(tick)

  // Drag to pan, wheel to zoom around the pointer.
  app.stage.eventMode = 'static'
  app.stage.hitArea = app.screen
  let drag: { x: number; y: number } | null = null
  app.stage.on('pointerdown', (e: FederatedPointerEvent) => (drag = { x: e.global.x, y: e.global.y }))
  app.stage.on('pointerup', () => (drag = null))
  app.stage.on('pointerupoutside', () => (drag = null))
  app.stage.on('globalpointermove', (e: FederatedPointerEvent) => {
    if (!drag) return
    world.position.x += e.global.x - drag.x
    world.position.y += e.global.y - drag.y
    drag = { x: e.global.x, y: e.global.y }
  })
  app.stage.on('wheel', (e: FederatedWheelEvent) => {
    const k = Math.exp(-e.deltaY * 0.0015)
    const before = world.toLocal(e.global)
    world.scale.set(Math.min(4, Math.max(0.1, world.scale.x * k)))
    const after = world.toGlobal(before)
    world.position.x += e.global.x - after.x
    world.position.y += e.global.y - after.y
  })

  return {
    setSeed(s) {
      build(s)
    },
    destroy() {
      app.ticker.remove(tick)
      app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true })
    },
  }
}

/** One style: title, a growth row per family, then corner park, city block and train. */
function buildColumn(style: ArtStyle, seed: number, trains: Train[], traffic: Vehicle[]): Container {
  const col = new Container()
  let y = 0
  const add = (c: Container) => {
    const b = c.getLocalBounds()
    c.position.set(-b.x, y - b.y)
    col.addChild(c)
    y += b.height + SECTION_GAP
  }

  const title = new Container()
  const name = new Text({
    text: style.name,
    style: { fill: 0xe2e8f0, fontSize: 34, fontWeight: '700', fontFamily: 'system-ui, sans-serif' },
  })
  const blurb = new Text({
    text: style.blurb,
    style: {
      fill: 0x94a3b8,
      fontSize: 18,
      fontFamily: 'system-ui, sans-serif',
      wordWrap: true,
      wordWrapWidth: 820,
    },
  })
  blurb.y = 46
  title.addChild(name, blurb)
  add(title)

  for (const [fi, family] of FAMILIES.entries())
    add(growthRow(style, family, groupColors[fi * 2]!, seed * 101 + fi, fi === 0))

  const extras = new Container()
  const parkC = cornerPark(style, seed)
  const block = cityBlock(style, seed, traffic)
  const track = trainScene(style, seed, trains)
  let x = 0
  for (const c of [parkC, block, track]) {
    const b = c.getLocalBounds()
    c.position.set(x - b.x, -b.y)
    extras.addChild(c)
    x += b.width + 40
  }
  add(extras)
  return col
}

/** A ring-style tile slab with a group band, at board offset `col0`. */
function tile(p: Paint, col0: number, w: number, d: number, band: number) {
  isoBox(
    p.g,
    { col0: col0 + 0.03, row0: 0.03, col1: col0 + w - 0.03, row1: d - 0.03, z0: -0.1, z1: 0 },
    { top: palette.tileTop, left: palette.tileLeft, right: palette.tileRight },
    p.t,
  )
  p.g.poly(rect(col0 + 0.03, 0.03, col0 + w - 0.03, 0.22, 0.001, p.t)).fill(band)
}

function growthRow(style: ArtStyle, family: Family, band: number, seed: number, labels: boolean): Container {
  // Each lot in its own container, lined up left to right on screen (not along the board axis).
  const c = new Container()
  const d = 1.45
  const levels = [-1, 0, 1, 2, 3, 4, 5]
  const step = TILE_STEP * 150
  for (const [i, level] of levels.entries()) {
    const cell = new Container()
    const g = new Graphics()
    cell.addChild(g)
    const p: Paint = { g, t: 1, style }
    tile(p, 0, 1, d, band)
    const lot: Lot = { col0: 0.1, row0: 0.32, col1: 0.9, row1: d - 0.1, z: 0 }
    drawLot(p, lot, level, family, level >= 0 ? OWNER : null, seed * 13 + i)
    if (labels) {
      const at = project({ col: 1, row: d, z: 0 }, 1)
      const t = new Text({
        text: LEVEL_LABELS[i]!,
        style: { fill: 0x94a3b8, fontSize: 18, fontFamily: 'system-ui, sans-serif' },
      })
      t.anchor.set(0.5, 0)
      t.position.set(at.x, at.y + 14)
      cell.addChild(t)
    }
    cell.position.x = i * step
    c.addChild(cell)
  }
  const label = new Text({
    text: family,
    style: { fill: 0x64748b, fontSize: 20, fontWeight: '600', fontFamily: 'system-ui, sans-serif' },
  })
  label.anchor.set(1, 0.5)
  label.position.set(-110, 90)
  c.addChild(label)
  return c
}

/** A corner space as a little park with a fountain (the "free rest" corner). */
function cornerPark(style: ArtStyle, seed: number): Container {
  const c = new Container()
  const g = new Graphics()
  c.addChild(g)
  const p: Paint = { g, t: 1, style }
  isoBox(
    g,
    { col0: 0.03, row0: 0.03, col1: 1.6, row1: 1.6, z0: -0.1, z1: 0 },
    { top: palette.cornerTop, left: palette.tileLeft, right: palette.tileRight },
    1,
  )
  park(p, { col0: 0.15, row0: 0.15, col1: 1.48, row1: 1.48, z: 0 }, cosmeticRng(seed + 5), { fountain: true })
  return c
}

function cityBlock(style: ArtStyle, seed: number, traffic: Vehicle[]): Container {
  // Depth-sorted: streets at the bottom, then blocks, parked and moving cars by col + row.
  const c = new Container({ sortableChildren: true })
  const g = new Graphics({ zIndex: -1e9 })
  c.addChild(g)
  const p: Paint = { g, t: 1, style }
  const layer = (key: number): Paint => {
    const lg = new Graphics({ zIndex: key })
    c.addChild(lg)
    return { g: lg, t: 1, style }
  }
  // A 3 x 3 block district around a downtown with the landmark, as the board's city will be.
  const size = 3 * 1.9 + 4 * STREET
  flat(p, -0.12, -0.12, size + 0.12, size + 0.12, -0.006, style.ground)
  drawDistrict(p, { col0: 0, row0: 0, col1: size, row1: size, z: 0 }, seed * 7 + 3, {
    blocks: { cols: 3, rows: 3 },
    downtown: { col: size / 2, row: size / 2 },
    landmark: true,
    layer,
  })
  const area = { col0: 0, row0: 0, col1: size, row1: size, z: 0 }
  const lines = streetLines(area, 3, 3, STREET)
  for (const plan of planTraffic(lines, cosmeticRng(seed * 13 + 1), 16, 0.002, [
    ...style.accents,
    0xf8fafc,
    0x475569,
  ])) {
    const vg = new Graphics()
    c.addChild(vg)
    const car: Vehicle = { ...plan, g: vg, paint: { g: vg, t: 1, style } }
    vg.zIndex = drawVehicle(car)
    traffic.push(car)
  }
  return c
}

function trainScene(style: ArtStyle, seed: number, trains: Train[]): Container {
  const c = new Container()
  const ground = new Graphics()
  const g = new Graphics()
  c.addChild(ground, g)
  const p: Paint = { g: ground, t: 1, style }
  flat(p, 0, 0, 3.2, 2.2, -0.003, style.ground)
  const pts = trackLoop(0.3, 0.3, 2.9, 1.9, 0.55, 0)
  drawTrack(p, pts)
  park(p, { col0: 1.0, row0: 0.85, col1: 2.2, row1: 1.35, z: 0 }, cosmeticRng(seed + 9), { fountain: false })
  const livery = style.accents[((seed % style.accents.length) + style.accents.length) % style.accents.length]!
  trains.push({ g, paint: { g, t: 1, style }, path: measure(pts), livery, head: seed % 5 })
  return c
}
