import { Container, Graphics } from 'pixi.js'
import { shade } from '../palette.ts'

/** The Speed die's amber (DECISIONS.md D62), so the pin reads as the die's doing. */
const AMBER = 0xe8a33c
const INK = 0x1c1205
/** Fall from this high above the tile top, in world px. */
const DROP_HEIGHT = 150
const FALL_MS = 280
const SETTLE_MS = 380
const LIFT_MS = 220

/**
 * The Scout's map pin (Speed die twist): it drops onto the target lot with a squash, bobs
 * while the piece walks there, and pops away once the piece arrives. World space, above the
 * buildings; positions come from the board every frame (tiles bounce).
 */
export class ScoutPin {
  readonly container = new Container({ eventMode: 'none' })
  private readonly pin = new Container()
  private readonly shadow = new Graphics()
  private space = -1
  private age = 0
  private lifting = -1

  constructor() {
    const g = new Graphics()
    // Teardrop pin: a round head over a point, tip at the origin.
    g.moveTo(0, 0)
      .bezierCurveTo(-6, -14, -17, -24, -17, -36)
      .arc(0, -36, 17, Math.PI, 0)
      .bezierCurveTo(17, -24, 6, -14, 0, 0)
      .fill(AMBER)
      .stroke({ color: shade(AMBER, 0.45), width: 2.5, join: 'round' })
    g.circle(0, -36, 10).fill(0xfff6e3)
    g.star(0, -36, 5, 7, 3, -Math.PI / 2).fill(INK)
    this.shadow.ellipse(0, 0, 13, 5).fill({ color: 0x020610, alpha: 0.35 })
    this.pin.addChild(g)
    this.container.addChild(this.shadow, this.pin)
    this.container.visible = false
  }

  get active(): boolean {
    return this.space >= 0
  }

  drop(space: number): void {
    this.space = space
    this.age = 0
    this.lifting = -1
    this.container.visible = true
  }

  /** Pops the pin away (no-op when none is showing). */
  lift(): void {
    if (this.space >= 0 && this.lifting < 0) this.lifting = 0
  }

  /** Real ms until a dropped pin has landed (for a beat or sound in step with it). */
  get landsInMs(): number {
    return FALL_MS
  }

  update(dtMs: number, at: (space: number) => { x: number; y: number }, reduced: boolean): void {
    if (this.space < 0) return
    this.age += dtMs
    const p = at(this.space)
    this.container.position.set(p.x, p.y)
    let y = 0
    let sx = 1
    let sy = 1
    let alpha = 1
    if (reduced) {
      alpha = Math.min(1, this.age / 160)
    } else if (this.age < FALL_MS) {
      // Accelerating fall onto the tile.
      const k = this.age / FALL_MS
      y = -DROP_HEIGHT * (1 - k * k)
      sy = 1.08
      sx = 0.94
    } else if (this.age < FALL_MS + SETTLE_MS) {
      // Squash on impact, then a damped wobble back to shape.
      const k = (this.age - FALL_MS) / SETTLE_MS
      const wobble = Math.exp(-5 * k) * Math.cos(k * Math.PI * 3)
      sy = 1 - 0.28 * wobble
      sx = 1 + 0.22 * wobble
    } else {
      // A gentle bob while the piece walks over.
      y = -3 - 3 * Math.sin((this.age - FALL_MS - SETTLE_MS) / 260)
    }
    if (this.lifting >= 0) {
      this.lifting += dtMs
      const k = Math.min(1, this.lifting / LIFT_MS)
      y -= 40 * k
      alpha = 1 - k
      if (k >= 1) {
        this.space = -1
        this.container.visible = false
        return
      }
    }
    this.pin.position.set(0, y)
    this.pin.scale.set(sx, sy)
    this.pin.alpha = alpha
    const near = 1 - Math.min(1, -y / DROP_HEIGHT)
    this.shadow.alpha = alpha * (0.4 + 0.6 * near)
    this.shadow.scale.set(0.5 + 0.5 * near)
  }

  /** Hides it at once (skip, sync). */
  clear(): void {
    this.space = -1
    this.container.visible = false
  }
}
