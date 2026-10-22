import { Container, Graphics, Text, type Application, type FederatedPointerEvent } from 'pixi.js'
import type { GameEvent } from '@skyline/engine'
import { Animator, ease } from './anim/animator.ts'
import { project, unproject, type Pos } from './geometry/project.ts'
import { BOARD, ringFootprint, tileAt, tileCenter, tokenAnchor } from './geometry/ring.ts'
import { Camera, type Bounds } from './view/camera.ts'
import { CityView, GroundView } from './view/city.ts'
import { rect } from './view/draw.ts'
import { TileView } from './view/tiles.ts'
import { TokenView } from './view/token.ts'

export interface BoardTuning {
  /** Peak hop height in z units. */
  hopHeight: number
  /** Duration of one tile hop. */
  stepMs: number
  /** Landing squash strength. */
  squash: number
  /** Camera follows the moving token. */
  follow: boolean
  /** Global animation speed multiplier. */
  speed: number
}

export const DEFAULT_TUNING: BoardTuning = { hopHeight: 0.45, stepMs: 190, squash: 1, follow: true, speed: 1 }

export interface BoardListeners {
  /** Hovered tile changed (null = none). */
  hover?: (index: number | null) => void
  /** Every frame while a tile is hovered: tile top center in canvas CSS px (for tooltips). */
  hoverPosition?: (x: number, y: number) => void
  select?: (index: number | null) => void
}

const MORPH_MS = 750

export class Board {
  readonly tuning: BoardTuning = { ...DEFAULT_TUNING }
  readonly listeners: BoardListeners = {}

  private readonly world = new Container()
  private readonly ground = new GroundView()
  private readonly tileLayer = new Container({ sortableChildren: true })
  private readonly shadowLayer = new Container()
  private readonly actorLayer = new Container({ sortableChildren: true })
  private readonly debugLayer = new Container()
  private readonly debugLines = new Graphics()
  private readonly debugLabels: Text[] = []

  private readonly tiles: TileView[] = []
  private readonly city = new CityView()
  private readonly tokens = new Map<string, TokenView>()
  private readonly animator = new Animator()
  private readonly camera: Camera

  private viewT = 1
  private morphing = false
  private hovered: number | null = null
  private selected: number | null = null
  private debug = false

  private readonly app: Application

  constructor(app: Application) {
    this.app = app
    this.camera = new Camera(this.world)
    this.world.addChild(
      this.ground.graphics,
      this.tileLayer,
      this.shadowLayer,
      this.actorLayer,
      this.debugLayer,
    )
    for (let i = 0; i < 40; i++) {
      const tile = new TileView(i)
      this.tiles.push(tile)
      this.tileLayer.addChild(tile.container)
    }
    for (const item of this.city.items) this.actorLayer.addChild(item.g)
    this.debugLayer.addChild(this.debugLines)
    this.debugLayer.visible = false
    this.debugLayer.eventMode = 'none'
    app.stage.addChild(this.world)

    this.redraw()
    this.bindInput()
    this.onResize()
    this.camera.recenter(true)
    app.renderer.on('resize', this.onResize)
    app.ticker.add(this.tick)
  }

  // ---- public API --------------------------------------------------------

  setTuning(tuning: Partial<BoardTuning>): void {
    Object.assign(this.tuning, tuning)
  }

  setListeners(listeners: BoardListeners): void {
    Object.assign(this.listeners, listeners)
  }

  addToken(id: string, color: number, space: number): void {
    if (this.tokens.has(id)) return
    const token = new TokenView(id, color, space, tileCenter(space))
    this.tokens.set(id, token)
    this.shadowLayer.addChild(token.shadow)
    this.actorLayer.addChild(token.pawn)
    this.layoutTile(space, true)
  }

  /** Plays one game event as an animation. Resolves when it is done. */
  async play(event: GameEvent): Promise<void> {
    switch (event.type) {
      case 'MOVED':
        return this.playMove(event.playerId, event.path)
      case 'JUMPED':
        return this.playJump(event.playerId, event.to)
      case 'DICE_ROLLED':
        return // dice tray arrives in Milestone 4
    }
  }

  /** Morph between isometric (true) and top-down (false). */
  async setIsometric(iso: boolean): Promise<void> {
    const from = this.viewT
    const to = iso ? 1 : 0
    if (from === to) return
    this.morphing = true
    this.setHover(null)
    await this.animator.tween(
      MORPH_MS,
      (p) => {
        this.viewT = from + (to - from) * p
        this.redraw()
        this.camera.recenter() // keep the board framed while its shape changes
      },
      ease.inOutCubic,
    )
    this.morphing = false
  }

  setDebug(on: boolean): void {
    this.debug = on
    this.debugLayer.visible = on
    if (on) this.drawDebug()
  }

  recenter(): void {
    this.camera.recenter()
  }

  /** Current frames per second (for the perf readout). */
  get fps(): number {
    return this.app.ticker.FPS
  }

  select(index: number | null): void {
    if (this.selected !== null) this.tiles[this.selected]!.selected = false
    this.selected = index
    if (index !== null) this.tiles[index]!.selected = true
    this.listeners.select?.(index)
  }

  destroy(): void {
    this.app.ticker.remove(this.tick)
    this.app.renderer.off('resize', this.onResize)
    this.animator.finishAll()
  }

  // ---- choreography ------------------------------------------------------

  private async playMove(playerId: string, path: readonly number[]): Promise<void> {
    const token = this.tokens.get(playerId)
    if (!token || path.length === 0) return
    const tune = this.tuning
    this.animator.speed = tune.speed
    if (tune.follow) this.camera.setFollow(() => this.worldPos(token))

    const origin = token.space
    // Preview: the landing tile flashes first, then the walk.
    this.tiles[path[path.length - 1]!]!.flash = 1
    token.squash.kick(4 * tune.squash) // crouch before the first hop
    await this.animator.wait(90)

    for (let i = 0; i < path.length; i++) {
      const next = path[i]!
      const last = i === path.length - 1
      token.space = next
      if (i === 0) this.layoutTile(origin) // others on the origin tile spread back out
      const to = last ? this.slotFor(token, next) : tokenAnchor(next, 0, 1)
      await this.hop(token, to, tune.hopHeight, tune.stepMs)
      this.land(token, next, last ? 1 : 0.55)
    }
    this.layoutTile(path[path.length - 1]!)
    await this.animator.wait(120)
  }

  private async playJump(playerId: string, to: number): Promise<void> {
    const token = this.tokens.get(playerId)
    if (!token) return
    this.animator.speed = this.tuning.speed
    if (this.tuning.follow) this.camera.setFollow(() => this.worldPos(token))
    const origin = token.space
    token.space = to
    this.layoutTile(origin)
    this.tiles[to]!.flash = 1
    token.squash.kick(6 * this.tuning.squash)
    await this.animator.wait(110)
    await this.hop(token, this.slotFor(token, to), this.tuning.hopHeight * 3 + 0.8, 760)
    this.land(token, to, 1.4)
    this.layoutTile(to)
    await this.animator.wait(150)
  }

  private hop(token: TokenView, to: { col: number; row: number }, height: number, ms: number): Promise<void> {
    const from = { col: token.pos.col, row: token.pos.row }
    token.squash.target = -0.12 * this.tuning.squash // stretch in the air
    return this.animator.tween(ms, (p) => {
      const h = ease.inOutSine(p)
      token.pos.col = from.col + (to.col - from.col) * h
      token.pos.row = from.row + (to.row - from.row) * h
      token.pos.z = 4 * p * (1 - p) * height
    })
  }

  private land(token: TokenView, space: number, strength: number): void {
    token.pos.z = 0
    token.squash.target = 0
    token.squash.kick(7 * strength * this.tuning.squash)
    const tile = this.tiles[space]!
    tile.lift.kick(-1.6 * strength)
    tile.flash = Math.max(tile.flash, 0.7)
  }

  /** Where `token` should stand on `space` given everyone else already there. */
  private slotFor(token: TokenView, space: number): { col: number; row: number } {
    const here = this.tokensOn(space)
    const slot = here.indexOf(token)
    return tokenAnchor(space, slot, here.length)
  }

  private tokensOn(space: number): TokenView[] {
    return [...this.tokens.values()].filter((t) => t.space === space)
  }

  /** Slides every token on `space` into its slot. */
  private layoutTile(space: number, instant = false): void {
    const here = this.tokensOn(space)
    here.forEach((token, slot) => {
      const to = tokenAnchor(space, slot, here.length)
      if (instant) {
        token.pos.col = to.col
        token.pos.row = to.row
        return
      }
      const from = { col: token.pos.col, row: token.pos.row }
      void this.animator.tween(
        200,
        (p) => {
          token.pos.col = from.col + (to.col - from.col) * p
          token.pos.row = from.row + (to.row - from.row) * p
        },
        ease.outCubic,
      )
    })
  }

  private worldPos(token: TokenView): { x: number; y: number } {
    return project({ col: token.pos.col, row: token.pos.row, z: 0 }, this.viewT)
  }

  // ---- frame loop --------------------------------------------------------

  private readonly tick = (ticker: { deltaMS: number }): void => {
    const dt = ticker.deltaMS
    this.animator.step(dt)
    const t = this.viewT
    for (const tile of this.tiles) tile.update(dt, t)
    for (const token of this.tokens.values()) {
      const under = tileAt(token.pos.col, token.pos.row)
      token.update(dt, t, under === null ? 0 : this.tiles[under]!.lift.value)
    }
    this.camera.update(dt)
    if (this.hovered !== null && this.listeners.hoverPosition) {
      const c = tileCenter(this.hovered)
      const p = this.world.toGlobal(project({ ...c, z: this.tiles[this.hovered]!.lift.value }, t))
      this.listeners.hoverPosition(p.x, p.y)
    }
  }

  private redraw(): void {
    const t = this.viewT
    this.ground.draw(t)
    for (const tile of this.tiles) tile.draw(t)
    for (const item of this.city.items) item.draw(t)
    if (this.debug) this.drawDebug()
    this.camera.setBounds(this.worldBounds())
  }

  private drawDebug(): void {
    const t = this.viewT
    const g = this.debugLines.clear()
    for (let c = 0; c <= Math.ceil(BOARD); c++) {
      g.moveTo(project({ col: c, row: 0, z: 0 }, t).x, project({ col: c, row: 0, z: 0 }, t).y)
      const e = project({ col: c, row: BOARD, z: 0 }, t)
      g.lineTo(e.x, e.y)
      const s2 = project({ col: 0, row: c, z: 0 }, t)
      g.moveTo(s2.x, s2.y)
      const e2 = project({ col: BOARD, row: c, z: 0 }, t)
      g.lineTo(e2.x, e2.y)
    }
    g.stroke({ color: 0x22d3ee, width: 1, alpha: 0.25 })
    for (let i = 0; i < 40; i++) {
      const fp = ringFootprint(i)
      g.poly(rect(fp.col0, fp.row0, fp.col1, fp.row1, 0, t)).stroke({ color: 0xfb7185, width: 1.5 })
      let label = this.debugLabels[i]
      if (!label) {
        label = new Text({
          text: String(i),
          style: { fontFamily: 'monospace', fontSize: 15, fill: 0x0b1426, fontWeight: 'bold' },
        })
        label.anchor.set(0.5)
        this.debugLabels.push(label)
        this.debugLayer.addChild(label)
      }
      const p = project({ ...tileCenter(i), z: 0 }, t)
      label.position.set(p.x, p.y)
    }
  }

  private worldBounds(): Bounds {
    const t = this.viewT
    const pts: Pos[] = []
    for (const col of [0, BOARD])
      for (const row of [0, BOARD]) pts.push({ col, row, z: -0.5 }, { col, row, z: 0 })
    pts.push({ col: BOARD / 2, row: BOARD / 2, z: 3.4 })
    const s = pts.map((p) => project(p, t))
    return {
      minX: Math.min(...s.map((p) => p.x)),
      maxX: Math.max(...s.map((p) => p.x)),
      minY: Math.min(...s.map((p) => p.y)),
      maxY: Math.max(...s.map((p) => p.y)),
    }
  }

  // ---- input -------------------------------------------------------------

  private bindInput(): void {
    const stage = this.app.stage
    stage.eventMode = 'static'
    stage.hitArea = this.app.screen
    stage.on('pointerdown', (e) => this.camera.onPointerDown(e))
    stage.on('globalpointermove', (e) => {
      this.camera.onPointerMove(e)
      this.pick(e)
    })
    stage.on('pointerup', (e) => this.camera.onPointerUp(e))
    stage.on('pointerupoutside', (e) => this.camera.onPointerUp(e))
    stage.on('pointertap', () => {
      if (this.camera.dragging) return
      this.select(this.hovered === this.selected ? null : this.hovered)
    })
    stage.on('wheel', (e) => this.camera.onWheel(e))
    stage.on('pointerleave', () => this.setHover(null))
  }

  private pick(e: FederatedPointerEvent): void {
    if (this.morphing || this.camera.dragging) return
    const local = this.world.toLocal(e.global)
    const { col, row } = unproject(local.x, local.y, 0, this.viewT)
    this.setHover(tileAt(col, row))
  }

  private setHover(index: number | null): void {
    if (index === this.hovered) return
    if (this.hovered !== null) this.tiles[this.hovered]!.hovered = false
    this.hovered = index
    if (index !== null) this.tiles[index]!.hovered = true
    this.app.canvas.style.cursor = index === null ? 'grab' : 'pointer'
    this.listeners.hover?.(index)
  }

  private readonly onResize = (): void => {
    this.camera.setViewport(this.app.screen.width, this.app.screen.height)
    this.camera.setBounds(this.worldBounds())
  }
}
