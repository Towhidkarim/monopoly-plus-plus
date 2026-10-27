import { Container, Graphics, Rectangle, type Application } from 'pixi.js'
import { SPACES } from '@skyline/engine'
import { drawLot } from './art/lots.ts'
import { NIGHT, lightsAt, nightTint } from './art/paint.ts'
import { BOARD_STYLE } from './art/style.ts'
import { groupColors } from './palette.ts'
import { ringFootprint } from './geometry/ring.ts'
import { GROUP_FAMILY, lotOf } from './view/tiles.ts'

/** Cache key of a portrait: one image per space, level, sky and city. */
export function portraitKey(space: number, level: number, night: boolean, citySeed: number): string {
  return `${space}:${level}:${night ? 1 : 0}:${citySeed}`
}

/** Pixels per output pixel of the board art: the art is vector, so a high factor stays crisp on cards. */
const RESOLUTION = 3
const PAD = 6

/**
 * Renders property lots to images for the web shell's cards, exactly as the board draws them
 * (same art kit, family per group, seed per space), isometric on a transparent background and
 * cropped to the building. Draws into its own offscreen Container, never the live scene.
 * Results are cached per (space, level, night, citySeed) and shared by concurrent callers;
 * `destroy()` revokes the object URLs.
 */
export class LotPortraits {
  private readonly cache = new Map<string, Promise<string | null>>()
  private readonly urls: string[] = []
  private dead = false

  private readonly app: Application
  private readonly citySeed: number

  constructor(app: Application, citySeed: number) {
    this.app = app
    this.citySeed = citySeed
  }

  /**
   * `level` follows the board: -1 empty lot for sale, 0 owned with no houses, 1 to 4 houses,
   * 5 hotel. Resolves to an image URL, or null for spaces without a building (stations,
   * utilities, corners) and for a destroyed board.
   */
  get(space: number, level: number, night: boolean): Promise<string | null> {
    const sp = SPACES[space]
    if (!sp || sp.kind !== 'property' || level < -1 || level > 5) return Promise.resolve(null)
    const key = portraitKey(space, level, night, this.citySeed)
    let hit = this.cache.get(key)
    if (!hit) {
      // Yield a frame so a burst of requests never lands inside one render pass.
      hit = new Promise<void>((r) => requestAnimationFrame(() => r())).then(() =>
        this.render(space, level, night),
      )
      this.cache.set(key, hit)
    }
    return hit
  }

  private async render(space: number, level: number, night: boolean): Promise<string | null> {
    if (this.dead) return null
    const family = GROUP_FAMILY[SPACES[space]!.group]!
    const n = night ? 1 : 0
    const root = new Container()
    const building = new Graphics()
    const lights = new Graphics()
    const beacons = new Graphics()
    root.addChild(building, lights, beacons)
    drawLot(
      { g: building, lights, t: 1, style: BOARD_STYLE, beacons },
      lotOf(ringFootprint(space)),
      level,
      family,
      // Owner color tints doors and awnings; a neutral accent keeps the portrait owner-independent.
      level >= 0 ? 0xf5b54a : null,
      space * 131 + 17,
      groupColors[SPACES[space]!.group],
    )
    building.tint = nightTint(NIGHT.city, n)
    lights.alpha = lightsAt(n)
    lights.visible = n > 0
    beacons.visible = n > 0
    try {
      const b = root.getLocalBounds().rectangle
      const frame = new Rectangle(
        Math.floor(b.x) - PAD,
        Math.floor(b.y) - PAD,
        Math.ceil(b.width) + PAD * 2,
        Math.ceil(b.height) + PAD * 2,
      )
      const canvas = this.app.renderer.extract.canvas({
        target: root,
        frame,
        resolution: RESOLUTION,
        antialias: true,
        clearColor: [0, 0, 0, 0],
      })
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob?.(res, 'image/png'))
      if (!blob || this.dead) return null
      const url = URL.createObjectURL(blob)
      this.urls.push(url)
      return url
    } finally {
      root.destroy({ children: true })
    }
  }

  destroy(): void {
    this.dead = true
    for (const u of this.urls) URL.revokeObjectURL(u)
    this.urls.length = 0
    this.cache.clear()
  }
}
