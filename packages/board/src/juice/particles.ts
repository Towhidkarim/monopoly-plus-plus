import { Container, Graphics, GraphicsContext } from 'pixi.js'

/**
 * Shapes share one white context each and are tinted per particle, so they batch together.
 * Sizes are world pixels (a tile is 128 wide), so they read at the zoomed-out fit view.
 */
const makeShapes = () => ({
  confetti: new GraphicsContext().rect(-12, -7, 24, 14).fill(0xffffff),
  sparkle: new GraphicsContext().star(0, 0, 4, 16, 6).fill(0xffffff),
  dust: new GraphicsContext().circle(0, 0, 20).fill(0xffffff),
})

export type ParticleShape = keyof ReturnType<typeof makeShapes>

export interface BurstOptions {
  shape: ParticleShape
  count: number
  colors: readonly number[]
  /** Launch speed in px/s (randomized 50-100%). */
  speed: number
  /** Spread around straight up, radians (Math.PI = full half circle). */
  spread: number
  /** Px/s² downward; negative floats up. */
  gravity: number
  lifeMs: number
  /** Velocity kept per second (air drag), 0..1. */
  drag?: number
  /** Base scale. */
  scale?: number
  /** Dust grows as it fades. */
  grow?: number
}

interface Particle {
  g: Graphics
  vx: number
  vy: number
  spin: number
  age: number
  life: number
  gravity: number
  drag: number
  scale: number
  grow: number
  /** Confetti flutters by squashing its x scale. */
  flutter: number
}

const MAX = 400

/** Pooled one-shot particles in world space (confetti, sparkles, dust). */
export class Particles {
  readonly container = new Container({ eventMode: 'none' })
  private readonly live: Particle[] = []
  private readonly free: Graphics[] = []
  private readonly shapes = makeShapes()

  burst(x: number, y: number, o: BurstOptions): void {
    for (let i = 0; i < o.count && this.live.length < MAX; i++) {
      const g = this.free.pop() ?? new Graphics(this.shapes[o.shape])
      g.context = this.shapes[o.shape]
      g.tint = o.colors[i % o.colors.length]!
      g.position.set(x, y)
      g.alpha = 1
      g.rotation = Math.random() * Math.PI * 2
      this.container.addChild(g)
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * o.spread
      const speed = o.speed * (0.5 + Math.random() * 0.5)
      this.live.push({
        g,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        spin: (Math.random() - 0.5) * 14,
        age: 0,
        life: o.lifeMs * (0.7 + Math.random() * 0.3),
        gravity: o.gravity,
        drag: o.drag ?? 0.35,
        scale: (o.scale ?? 1) * (0.7 + Math.random() * 0.5),
        grow: o.grow ?? 0,
        flutter: o.shape === 'confetti' ? 6 + Math.random() * 8 : 0,
      })
    }
  }

  get count(): number {
    return this.live.length
  }

  update(dtMs: number): void {
    if (this.live.length === 0) return
    const dt = Math.min(dtMs, 50) / 1000
    let n = 0
    for (const p of this.live) {
      p.age += dtMs
      if (p.age >= p.life) {
        this.container.removeChild(p.g)
        this.free.push(p.g)
        continue
      }
      const keep = p.drag ** dt
      p.vx *= keep
      p.vy = p.vy * keep + p.gravity * dt
      p.g.x += p.vx * dt
      p.g.y += p.vy * dt
      p.g.rotation += p.spin * dt
      const k = p.age / p.life
      const s = p.scale * (1 + p.grow * k)
      p.g.scale.set(p.flutter ? s * Math.cos((p.age / 1000) * p.flutter) : s, s)
      p.g.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3
      this.live[n++] = p
    }
    this.live.length = n
  }

  clear(): void {
    for (const p of this.live) {
      this.container.removeChild(p.g)
      this.free.push(p.g)
    }
    this.live.length = 0
  }

  destroy(): void {
    this.clear()
    for (const g of this.free) g.destroy()
    for (const c of Object.values(this.shapes)) c.destroy()
    this.container.destroy()
  }
}
