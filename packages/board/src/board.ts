import { Container, Graphics, Text, type Application, type FederatedPointerEvent } from 'pixi.js'
import { GROUPS, type GameEvent } from '@skyline/engine'
import { Animator, ease } from './anim/animator.ts'
import { project, unproject, type Pos } from './geometry/project.ts'
import { cloneJuice, type JuiceConfig } from './juice/config.ts'
import { Particles } from './juice/particles.ts'
import { NIGHT, blinkAt, lightsAt, nightTint } from './art/paint.ts'
import { BOARD, ringFootprint, tileAt, tileCenter, tokenAnchor } from './geometry/ring.ts'
import { jump, travel, type MotionContext } from './pieces/motion.ts'
import { SIDE_HEADING, type PieceKind } from './pieces/shapes.ts'
import { Camera, type Bounds, type Insets } from './view/camera.ts'
import { CityView, GroundView } from './view/city.ts'
import { rect } from './view/draw.ts'
import { TileView } from './view/tiles.ts'
import { TokenView } from './view/token.ts'

/** Real-time milliseconds for a full day-to-night (or back) fade. */
const NIGHT_FADE_MS = 4000

/** Runtime switches. Feel numbers live in `JuiceConfig` (juice/config.ts). */
export interface BoardTuning {
  /** Camera follows the moving token. */
  follow: boolean
  /** Global animation speed multiplier. */
  speed: number
  /** No shake, hit-stop, confetti, or falling buildings; smaller arcs. */
  reducedMotion: boolean
  /** City life: cars drive the streets and trains run the rail loop (hidden when off). */
  ambient: boolean
}

export const DEFAULT_TUNING: BoardTuning = { follow: true, speed: 1, reducedMotion: false, ambient: true }

/**
 * Moments the board reaches while animating, for sound and other listeners. They fire in step
 * with the motion (a hop's beat fires as that hop lands), so sounds stay in sync at any speed.
 */
export type BoardBeat =
  | { kind: 'step'; piece: PieceKind; space: number; step: number }
  | { kind: 'land'; piece: PieceKind; space: number; strength: number }
  | { kind: 'liftoff'; piece: PieceKind }
  | { kind: 'build'; space: number; level: number }
  | { kind: 'own'; space: number }
  | { kind: 'pulse'; space: number; step: number }
  | { kind: 'punch'; strength: number }

export interface BoardListeners {
  /** Hovered tile changed (null = none). */
  hover?: (index: number | null) => void
  /** Every frame while a tile is hovered: tile top center in canvas CSS px (for tooltips). */
  hoverPosition?: (x: number, y: number) => void
  select?: (index: number | null) => void
  beat?: (beat: BoardBeat) => void
}

const MORPH_MS = 750

export interface BoardPlayer {
  id: string
  color: number
  piece: PieceKind
}

/** The slice of game state the board shows; the shell maps engine state into this. */
export interface BoardSnapshot {
  positions: Record<string, number>
  /** Owner player id per space, null if unowned. */
  owner: readonly (string | null)[]
  houses: readonly number[]
  mortgaged: readonly boolean[]
  bankrupt: readonly string[]
}

export class Board {
  readonly tuning: BoardTuning = { ...DEFAULT_TUNING }
  /** Live feel config; edited in place so every view holding a section sees changes. */
  readonly juice: JuiceConfig = cloneJuice()
  readonly listeners: BoardListeners = {}

  private readonly world = new Container()
  private readonly ground = new GroundView()
  private readonly tileLayer = new Container({ sortableChildren: true })
  private readonly shadowLayer = new Container()
  private readonly actorLayer = new Container({ sortableChildren: true })
  private readonly particles = new Particles()
  private readonly debugLayer = new Container()
  private readonly debugLines = new Graphics()
  private readonly debugLabels: Text[] = []

  private readonly tiles: TileView[] = []
  private readonly city: CityView
  private readonly tokens = new Map<string, TokenView>()
  private readonly colors = new Map<string, number>()
  private readonly owners: (string | null)[] = Array.from({ length: 40 }, () => null)
  private readonly levels: number[] = Array.from({ length: 40 }, () => 0)
  private readonly mortgages: boolean[] = Array.from({ length: 40 }, () => false)
  private readonly animator = new Animator()
  private readonly camera: Camera

  private viewT = 1
  /** Day/night level shown, and the level it eases toward. */
  private night = 0
  private nightTarget = 0
  /** Real-time clock for the beacon blink. */
  private beaconClock = 0
  /** Remaining hit-stop: the world crawls while the camera (and its shake) keeps running. */
  private freezeMs = 0
  /** Tiles passed in the current move, for rising step sounds. */
  private stepCount = 0
  private mover: TokenView | null = null
  private morphing = false
  private hovered: number | null = null
  private selected: number | null = null
  private debug = false

  private readonly app: Application

  constructor(app: Application, citySeed = 1) {
    this.app = app
    this.city = new CityView(citySeed, this.actorLayer)
    this.camera = new Camera(this.world)
    this.camera.shakeTuning = this.juice.shake
    this.world.addChild(
      this.ground.graphics,
      this.city.base,
      this.tileLayer,
      this.shadowLayer,
      this.actorLayer,
      this.particles.container,
      this.debugLayer,
    )
    for (let i = 0; i < 40; i++) {
      const tile = new TileView(i)
      tile.onImpact = this.onBuildImpact
      this.tiles.push(tile)
      this.tileLayer.addChild(tile.container)
    }
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
    this.city.life.setOn(this.tuning.ambient)
  }

  /** Update cost of the city's cars and trains (ms per frame), for profiling; `reset` starts over. */
  ambientCost(reset = false): { frames: number; avg: number; worst: number } {
    const { frames, total, worst } = this.city.life.cost
    if (reset) this.city.life.resetCost()
    return { frames, avg: frames ? total / frames : 0, worst }
  }

  /** Replaces feel values in place (the playground's live sliders). */
  setJuice(juice: JuiceConfig): void {
    const own = (key: string): key is keyof JuiceConfig => key in this.juice
    for (const [key, section] of Object.entries(juice)) if (own(key)) Object.assign(this.juice[key], section)
  }

  /** A hit the shell wants felt (big rent): hit-stop and shake scaled by `strength` (0..1). */
  punch(strength: number): void {
    const s = Math.min(1, Math.max(0, strength))
    this.hitStop(this.juice.punch.hitStopMs * s)
    this.addTrauma(this.juice.punch.trauma * s)
    this.emit({ kind: 'punch', strength: s })
  }

  /** Freezes board motion for `ms` (skipped with reduced motion). */
  hitStop(ms: number): void {
    if (this.tuning.reducedMotion) return
    this.freezeMs = Math.max(this.freezeMs, ms)
  }

  /** Screen shake (skipped with reduced motion). */
  addTrauma(amount: number): void {
    if (this.tuning.reducedMotion) return
    this.camera.shake.add(amount)
  }

  /**
   * Day/night (cosmetic, DECISIONS.md D28): 0 = day, 1 = night. The board eases toward `level`
   * over a few seconds (`instant` jumps). Tokens and markers are never darkened.
   */
  setNight(level: number, instant = false): void {
    this.nightTarget = Math.min(1, Math.max(0, level))
    if (instant || this.tuning.reducedMotion) this.applyNight(this.nightTarget)
  }

  private applyNight(n: number): void {
    this.night = n
    this.ground.graphics.tint = nightTint(NIGHT.ground, n, 0.6)
    for (const tile of this.tiles) tile.setNight(n)
    this.city.setNight(n)
    for (const token of this.tokens.values()) this.lightToken(token)
  }

  private lightToken(token: TokenView): void {
    const glow = lightsAt(this.night)
    token.halo.alpha = glow
    token.halo.visible = glow > 0.01
  }

  /** Blinks the beacons on towers and hotels (aviation style, in real time). */
  private blinkBeacons(realMs: number): void {
    const glow = lightsAt(this.night)
    if (glow <= 0.01) return
    this.beaconClock = (this.beaconClock + realMs) % 1_000_000
    const a = glow * blinkAt(this.beaconClock)
    this.city.setBlink(a)
    for (const tile of this.tiles) tile.setBlink(a)
  }

  /** Rebuilds the city from a new (cosmetic) city seed. */
  setCitySeed(seed: number): void {
    this.city.setSeed(seed)
    this.city.draw(this.viewT)
  }

  setListeners(listeners: BoardListeners): void {
    Object.assign(this.listeners, listeners)
  }

  addToken(id: string, color: number, space: number, kind: PieceKind = 'pawn'): void {
    if (this.tokens.has(id)) return
    this.colors.set(id, color)
    const token = new TokenView(id, color, space, tileCenter(space), kind)
    token.heading = SIDE_HEADING[ringFootprint(space).side]!
    this.tokens.set(id, token)
    this.shadowLayer.addChild(token.halo, token.shadow)
    this.lightToken(token)
    this.actorLayer.addChild(token.pawn)
    this.layoutTile(space, true)
  }

  removeToken(id: string): void {
    const token = this.tokens.get(id)
    if (!token) return
    this.tokens.delete(id)
    token.destroy()
    this.layoutTile(token.space)
  }

  /** Replaces all pieces with a new player line-up, everyone on GO. */
  setPlayers(players: readonly BoardPlayer[]): void {
    // Deleting the current key while iterating a Map is safe.
    for (const id of this.tokens.keys()) this.removeToken(id)
    this.colors.clear()
    for (const p of players) this.addToken(p.id, p.color, 0, p.piece)
  }

  /** Swap a player's piece (taxi, drone, ...). Purely cosmetic. */
  setPiece(id: string, kind: PieceKind): void {
    const token = this.tokens.get(id)
    if (!token || token.kind === kind) return
    token.setKind(kind)
    token.squash.kick(8) // little pop so the swap reads
  }

  /** Completes every running animation immediately (skip). */
  skipAnimations(): void {
    this.animator.finishAll()
  }

  /** Snaps the whole board to a game state with no animation (load, reconnect, skip). */
  sync(snap: BoardSnapshot): void {
    this.animator.finishAll()
    for (let i = 0; i < 40; i++) {
      this.owners[i] = snap.owner[i] ?? null
      this.levels[i] = snap.houses[i] ?? 0
      this.mortgages[i] = snap.mortgaged[i] ?? false
      this.refreshTile(i, false)
    }
    for (const [id, space] of Object.entries(snap.positions)) {
      const token = this.tokens.get(id)
      if (!token) continue
      token.traveling = false
      token.space = space
      token.pos.z = token.restZ
    }
    for (const id of snap.bankrupt) this.removeToken(id)
    for (let i = 0; i < 40; i++) this.layoutTile(i, true)
  }

  /** Plays one game event as an animation. Resolves when it is done. */
  async play(event: GameEvent): Promise<void> {
    this.animator.speed = this.tuning.speed
    switch (event.type) {
      case 'MOVED':
        return this.playMove(event.playerId, event.path)
      case 'JUMPED':
        return this.playJump(event.playerId, event.to)
      case 'TURN_STARTED': {
        const token = this.tokens.get(event.playerId)
        if (token && this.tuning.follow)
          this.camera.setFollow(() => this.worldPos(token), this.juice.camera.followZoom * 0.83)
        token?.squash.kick(5)
        return
      }
      case 'PROPERTY_BOUGHT':
        return this.purchase(event.space, event.playerId)
      case 'AUCTION_ENDED':
        return event.winner ? this.purchase(event.space, event.winner) : undefined
      case 'PROPERTY_TRANSFERRED':
        return this.setOwner(event.space, event.to === 'bank' ? null : event.to, 140)
      case 'BUILT':
        return this.playBuild(event.space, event.level)
      case 'SOLD_BUILDING':
        this.levels[event.space] = event.level
        this.refreshTile(event.space, true)
        return this.animator.wait(240)
      case 'MONOPOLY_COMPLETED':
        return this.celebrate(event.group, event.playerId)
      case 'MORTGAGED':
      case 'UNMORTGAGED':
        this.mortgages[event.space] = event.type === 'MORTGAGED'
        this.refreshTile(event.space, true)
        return this.animator.wait(180)
      case 'BANKRUPT':
        return this.playBankrupt(event.playerId)
      default:
        return
    }
  }

  private setOwner(space: number, owner: string | null, waitMs: number, lift?: number): Promise<void> {
    this.owners[space] = owner
    if (owner === null) {
      this.levels[space] = 0
      this.mortgages[space] = false
    }
    this.refreshTile(space, true, false, lift)
    return this.animator.wait(waitMs)
  }

  /** The deed changes hands: the tile stamps up and sparkles in the buyer's color. */
  private purchase(space: number, owner: string): Promise<void> {
    const j = this.juice.purchase
    const color = this.colors.get(owner) ?? 0xffffff
    if (!this.tuning.reducedMotion) {
      const p = this.tileTop(space)
      this.particles.burst(p.x, p.y, {
        shape: 'sparkle',
        count: j.sparkles,
        colors: [color, 0xffffff, color],
        speed: this.juice.particles.speed * 0.8,
        spread: Math.PI * 1.1,
        gravity: this.juice.particles.gravity * 0.7,
        lifeMs: this.juice.particles.lifeMs * 0.7,
        scale: 1.1,
      })
    }
    this.addTrauma(j.trauma)
    this.emit({ kind: 'own', space })
    return this.setOwner(space, owner, 320, j.lift)
  }

  /** A house drops onto its slot; dust and a thump when it lands (see onBuildImpact). */
  private async playBuild(space: number, level: number): Promise<void> {
    this.levels[space] = level
    const drop = !this.tuning.reducedMotion
    this.refreshTile(space, true, drop)
    if (!drop) {
      this.emit({ kind: 'build', space, level })
      return this.animator.wait(240)
    }
    const b = this.juice.build
    const fallMs = 1000 * Math.sqrt((2 * b.dropHeight) / Math.max(1, b.gravity))
    await this.animator.wait(fallMs + 140)
  }

  private readonly onBuildImpact = (tile: TileView, level: number): void => {
    const b = this.juice.build
    const p = this.tileTop(tile.index)
    this.particles.burst(p.x, p.y + 6, {
      shape: 'dust',
      count: b.dust * (level === 5 ? 2 : 1),
      colors: [0xcbd5e1, 0x94a3b8, 0xe2e8f0],
      speed: this.juice.particles.speed * 0.45,
      spread: Math.PI * 1.6,
      gravity: -40,
      lifeMs: 650,
      drag: 0.04,
      scale: 0.7,
      grow: 1.6,
    })
    this.addTrauma(level === 5 ? b.hotelTrauma : b.trauma)
    this.emit({ kind: 'build', space: tile.index, level })
  }

  /** Completed set: a beat of hit-stop, then the group lights up tile by tile with confetti. */
  private async celebrate(group: number, playerId: string): Promise<void> {
    const c = this.juice.celebrate
    const spaces = GROUPS[group] ?? []
    const color = this.colors.get(playerId) ?? 0xffffff
    this.hitStop(c.hitStopMs)
    this.addTrauma(c.trauma)
    await this.animator.wait(c.hitStopMs * 0.5)
    for (const [step, space] of spaces.entries()) {
      const tile = this.tiles[space]!
      tile.lift.kick(c.lift)
      tile.flash = 1
      if (!this.tuning.reducedMotion) {
        const p = this.tileTop(space)
        this.particles.burst(p.x, p.y, {
          shape: 'confetti',
          count: c.confetti,
          colors: [color, 0xfbbf24, 0xffffff, 0x22d3ee],
          speed: this.juice.particles.speed,
          spread: Math.PI * 0.9,
          gravity: this.juice.particles.gravity,
          lifeMs: this.juice.particles.lifeMs,
        })
      }
      this.emit({ kind: 'pulse', space, step })
      await this.animator.wait(c.pulseStepMs)
    }
    await this.animator.wait(c.holdMs)
  }

  private refreshTile(space: number, animate: boolean, drop = false, lift?: number): void {
    const owner = this.owners[space] ?? null
    this.tiles[space]!.setDeco(
      {
        owner: owner === null ? null : (this.colors.get(owner) ?? 0xffffff),
        level: this.levels[space] ?? 0,
        mortgaged: this.mortgages[space] ?? false,
      },
      animate,
      drop ? this.juice.build : null,
      lift,
    )
  }

  /** Top center of a tile in world pixels (where effects spawn). */
  private tileTop(space: number): { x: number; y: number } {
    return project({ ...tileCenter(space), z: this.tiles[space]!.lift.value }, this.viewT)
  }

  private emit(beat: BoardBeat): void {
    this.listeners.beat?.(beat)
  }

  private async playBankrupt(id: string): Promise<void> {
    const token = this.tokens.get(id)
    if (!token) return
    token.squash.kick(-10)
    await this.animator.tween(520, (p) => {
      token.pawn.alpha = 1 - p
      token.shadow.alpha = 0.5 * (1 - p)
      token.pos.z = token.restZ + p * 0.8
    })
    this.removeToken(id)
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

  /** Screen space covered by DOM UI (HUD, dock, side panels); the board frames itself around it. */
  setInsets(insets: Insets): void {
    this.camera.setInsets(insets)
    this.camera.recenter(true)
  }

  /** Zoom the camera onto a space. */
  focus(space: number, zoomFactor = 2.6, instant = false): void {
    const p = project({ ...tileCenter(space), z: 0 }, this.viewT)
    this.camera.focusOn(p.x, p.y, zoomFactor, instant)
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
    this.particles.destroy()
  }

  // ---- choreography ------------------------------------------------------

  private async playMove(playerId: string, path: readonly number[]): Promise<void> {
    const token = this.tokens.get(playerId)
    if (!token || path.length === 0) return
    this.animator.speed = this.tuning.speed
    if (this.tuning.follow) this.camera.setFollow(() => this.worldPos(token), this.juice.camera.followZoom)
    this.mover = token
    this.stepCount = 0
    await travel(this.motion, token, path)
    this.mover = null
  }

  private async playJump(playerId: string, to: number): Promise<void> {
    const token = this.tokens.get(playerId)
    if (!token) return
    this.animator.speed = this.tuning.speed
    if (this.tuning.follow) this.camera.setFollow(() => this.worldPos(token), this.juice.camera.followZoom)
    this.mover = token
    await jump(this.motion, token, to)
    this.mover = null
    await this.animator.wait(150)
  }

  /** What movement styles may touch on the board. */
  private readonly motion: MotionContext = {
    animator: this.animator,
    tuning: this.juice.hop,
    bump: (space, strength) => {
      const tile = this.tiles[space]!
      tile.lift.kick(-1.6 * strength)
      tile.flash = Math.max(tile.flash, 0.7 * Math.min(1, strength + 0.3))
    },
    flash: (space) => {
      this.tiles[space]!.flash = 1
    },
    slotFor: (token, space) => this.slotFor(token, space),
    layoutTile: (space) => this.layoutTile(space),
    step: (space) => {
      this.emit({ kind: 'step', piece: this.mover?.kind ?? 'pawn', space, step: this.stepCount++ })
    },
    landed: (space, strength) => {
      if (strength > 1) this.addTrauma(this.juice.land.jumpTrauma)
      this.emit({ kind: 'land', piece: this.mover?.kind ?? 'pawn', space, strength })
    },
    liftoff: () => this.emit({ kind: 'liftoff', piece: this.mover?.kind ?? 'pawn' }),
    reduced: () => this.tuning.reducedMotion,
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
      if (token.traveling) return // its own motion owns the position
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
    const real = ticker.deltaMS
    // Hit-stop: the world nearly freezes for a beat; the camera (and its shake) keeps going.
    const dt = this.freezeMs > 0 ? real * 0.03 : real
    this.freezeMs = Math.max(0, this.freezeMs - real)
    this.animator.step(dt)
    const t = this.viewT
    for (const tile of this.tiles) tile.update(dt, t, this.animator.speed)
    this.blinkBeacons(real)
    for (const token of this.tokens.values()) {
      const under = tileAt(token.pos.col, token.pos.row)
      token.update(dt, t, under === null ? 0 : this.tiles[under]!.lift.value)
    }
    this.particles.update(dt)
    this.camera.update(real)
    this.city.life.update(dt, this.viewRect())
    if (this.night !== this.nightTarget) {
      // Ease in real time (about 4 s for a full dusk), unaffected by game speed or hit-stop.
      const step = real / NIGHT_FADE_MS
      const d = this.nightTarget - this.night
      this.applyNight(Math.abs(d) <= step ? this.nightTarget : this.night + Math.sign(d) * step)
    }
    if (this.hovered !== null && this.listeners.hoverPosition) {
      const c = tileCenter(this.hovered)
      const p = this.world.toGlobal(project({ ...c, z: this.tiles[this.hovered]!.lift.value }, t))
      this.listeners.hoverPosition(p.x, p.y)
    }
  }

  /** The camera's view in world pixels (for culling). */
  private viewRect(): { x0: number; y0: number; x1: number; y1: number } {
    const k = this.world.scale.x || 1
    const x0 = -this.world.x / k
    const y0 = -this.world.y / k
    return { x0, y0, x1: x0 + this.app.screen.width / k, y1: y0 + this.app.screen.height / k }
  }

  private redraw(): void {
    const t = this.viewT
    this.ground.draw(t)
    for (const tile of this.tiles) tile.draw(t)
    this.city.draw(t)
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
