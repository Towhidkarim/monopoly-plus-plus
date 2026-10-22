import { Container, Graphics } from 'pixi.js'
import { Spring } from '../anim/spring.ts'
import { project, type Pos } from '../geometry/project.ts'
import { shade } from '../palette.ts'

/**
 * A player pawn. Drawn once in screen space (a billboard), so the morph never redraws it;
 * only its position, squash, and shadow change per frame.
 */
export class TokenView {
  readonly pawn = new Container()
  readonly shadow = new Graphics()
  private readonly body = new Graphics()
  /** Board position; `z` is height above the tile surface. */
  readonly pos: Pos
  /** Positive = squashed flat, negative = stretched tall. */
  readonly squash = new Spring(0, 420, 14)
  /** Space index the token currently stands on (logical, updated as it walks). */
  space: number

  readonly id: string

  constructor(id: string, color: number, space: number, start: { col: number; row: number }) {
    this.id = id
    this.space = space
    this.pos = { col: start.col, row: start.row, z: 0 }
    drawPawn(this.body, color)
    this.pawn.addChild(this.body)
    this.shadow.ellipse(0, 0, 17, 8).fill({ color: 0x0b1426, alpha: 0.35 })
  }

  /** `groundZ` is the height of the surface under the token (tile lift). */
  update(dtMs: number, t: number, groundZ: number): void {
    this.squash.step(dtMs)
    const s = this.squash.value
    this.pawn.scale.set(1 + s * 0.6, 1 - s)

    const ground = project({ col: this.pos.col, row: this.pos.row, z: groundZ }, t)
    const top = project({ col: this.pos.col, row: this.pos.row, z: groundZ + this.pos.z }, t)
    this.shadow.position.set(ground.x, ground.y)
    const shrink = 1 / (1 + this.pos.z * 1.5)
    this.shadow.scale.set(shrink)
    this.shadow.alpha = 0.5 + 0.5 * shrink
    this.pawn.position.set(top.x, top.y)
    this.pawn.zIndex = this.pos.col + this.pos.row + 0.5
  }

  destroy(): void {
    this.pawn.destroy({ children: true })
    this.shadow.destroy()
  }
}

/** Pawn with its foot at (0, 0): base, tapered body, head with a highlight. */
function drawPawn(g: Graphics, color: number): void {
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
