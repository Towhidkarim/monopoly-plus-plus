import { Container, Graphics } from 'pixi.js'
import { Spring } from '../anim/spring.ts'
import { project, type Pos } from '../geometry/project.ts'
import {
  drawBalloon,
  drawDrone,
  drawPawn,
  drawVehicle,
  type Heading,
  type PieceKind,
} from '../pieces/shapes.ts'

/** Per-kind resting behavior. */
const REST: Record<PieceKind, { hoverZ: number; bob: number; bobHz: number }> = {
  taxi: { hoverZ: 0, bob: 0, bobHz: 0 },
  bus: { hoverZ: 0, bob: 0, bobHz: 0 },
  pawn: { hoverZ: 0, bob: 0, bobHz: 0 },
  drone: { hoverZ: 0.32, bob: 0.035, bobHz: 1.6 },
  balloon: { hoverZ: 0.28, bob: 0.05, bobHz: 0.45 },
}

/**
 * A player piece. Vehicles are re-drawn only when their heading or the view morph changes;
 * everything else per frame is position, scale, and skew.
 */
export class TokenView {
  readonly pawn = new Container()
  readonly shadow = new Graphics()
  /** A soft pool of light under the piece at night, so pieces stay easy to spot. */
  readonly halo = new Graphics()
  private readonly body = new Graphics()
  readonly id: string
  readonly color: number
  kind: PieceKind = 'pawn'
  /** Board position; `z` is height above the tile surface. */
  readonly pos: Pos
  /** Positive = squashed flat, negative = stretched tall. */
  readonly squash = new Spring(0, 420, 14)
  /** Horizontal lean (skew), for braking, acceleration, and tilting into flight. */
  readonly lean = new Spring(0, 160, 9)
  heading: Heading = 2
  /** Space index the token currently stands on (logical, updated as it travels). */
  space: number
  /** True while a travel animation owns `pos.z` (disables idle bob). */
  traveling = false
  /** The piece whose turn it is breathes gently while it waits (set by the board). */
  active = false
  private clock = Math.random() * 10_000 // cosmetic phase so pieces do not bob in sync
  private drawnHeading: Heading | -1 = -1
  private drawnT = -1

  constructor(
    id: string,
    color: number,
    space: number,
    start: { col: number; row: number },
    kind: PieceKind,
  ) {
    this.id = id
    this.color = color
    this.space = space
    this.pos = { col: start.col, row: start.row, z: 0 }
    this.pawn.addChild(this.body)
    this.shadow.ellipse(0, 0, 17, 8).fill({ color: 0x0b1426, alpha: 0.35 })
    for (const [rx, a] of [
      [40, 0.12],
      [29, 0.16],
      [18, 0.24],
    ] as const)
      this.halo.ellipse(0, 0, rx, rx * 0.47).fill({ color: 0xfff1d6, alpha: a })
    this.halo.visible = false
    this.setKind(kind)
  }

  get restZ(): number {
    return REST[this.kind].hoverZ
  }

  get airborne(): boolean {
    return this.pos.z > 0.6
  }

  setKind(kind: PieceKind): void {
    this.kind = kind
    this.pos.z = REST[kind].hoverZ
    this.drawnHeading = -1
    this.drawnT = -1
    if (kind === 'pawn') drawPawn(this.body, this.color)
    if (kind === 'balloon') drawBalloon(this.body, this.color)
    const wide = kind === 'taxi' || kind === 'bus'
    this.shadow.scale.set(wide ? 1.35 : 1, 1)
  }

  /** `groundZ` is the height of the surface under the token (tile lift). */
  update(dtMs: number, t: number, groundZ: number): void {
    this.redrawIfNeeded(t)
    this.clock += dtMs
    this.squash.step(dtMs)
    this.lean.step(dtMs)
    const s = this.squash.value
    const breathe = this.active && !this.traveling ? 0.025 * Math.sin((this.clock / 1000) * Math.PI * 1.5) : 0
    this.pawn.scale.set(1 + s * 0.6 - breathe * 0.5, 1 - s + breathe)
    this.pawn.skew.x = this.lean.value

    const rest = REST[this.kind]
    const bob = this.traveling ? 0 : Math.sin((this.clock / 1000) * rest.bobHz * Math.PI * 2) * rest.bob
    const z = this.pos.z + bob
    const ground = project({ col: this.pos.col, row: this.pos.row, z: groundZ }, t)
    const top = project({ col: this.pos.col, row: this.pos.row, z: groundZ + z }, t)
    this.shadow.position.set(ground.x, ground.y)
    this.halo.position.set(ground.x, ground.y)
    const shrink = 1 / (1 + z * 1.5)
    const wide = this.kind === 'taxi' || this.kind === 'bus'
    this.shadow.scale.set(shrink * (wide ? 1.35 : 1), shrink)
    this.shadow.alpha = 0.4 + 0.6 * shrink
    this.pawn.position.set(top.x, top.y)
    // Airborne pieces fly over the city, so they render above everything.
    this.pawn.zIndex = this.airborne ? 1000 + z : this.pos.col + this.pos.row + 0.5
  }

  private redrawIfNeeded(t: number): void {
    const k = this.kind
    if (k === 'pawn' || k === 'balloon') return // billboards: drawn once
    if (k === 'drone') {
      if (t !== this.drawnT) drawDrone(this.body, this.color, t)
    } else if (t !== this.drawnT || this.heading !== this.drawnHeading) {
      drawVehicle(this.body, k, this.color, this.heading, t)
    }
    this.drawnT = t
    this.drawnHeading = this.heading
  }

  destroy(): void {
    this.pawn.destroy({ children: true })
    this.shadow.destroy()
    this.halo.destroy()
  }
}
