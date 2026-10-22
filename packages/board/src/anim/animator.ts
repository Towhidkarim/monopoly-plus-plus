/**
 * Minimal promise-based tweens driven by one ticker. Enough for step-by-step choreography;
 * GSAP can replace this later if timelines get complex (DECISIONS.md D15).
 */

export type Ease = (p: number) => number

export const ease = {
  linear: (p: number) => p,
  inOutSine: (p: number) => -(Math.cos(Math.PI * p) - 1) / 2,
  outCubic: (p: number) => 1 - (1 - p) ** 3,
  inOutCubic: (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2),
} satisfies Record<string, Ease>

interface Active {
  elapsed: number
  duration: number
  update: (p: number) => void
  ease: Ease
  resolve: () => void
}

export class Animator {
  /** Global speed multiplier (settings / tuning). */
  speed = 1
  private active: Active[] = []

  tween(durationMs: number, update: (p: number) => void, easing: Ease = ease.linear): Promise<void> {
    return new Promise((resolve) => {
      if (durationMs <= 0) {
        update(1)
        resolve()
        return
      }
      this.active.push({ elapsed: 0, duration: durationMs, update, ease: easing, resolve })
    })
  }

  wait(ms: number): Promise<void> {
    return this.tween(ms, () => {})
  }

  /** Advance all tweens. Call once per frame with real elapsed ms. */
  step(deltaMs: number): void {
    if (this.active.length === 0) return
    const dt = deltaMs * this.speed
    const done: Active[] = []
    for (const a of this.active) {
      a.elapsed = Math.min(a.elapsed + dt, a.duration)
      const p = a.elapsed / a.duration
      a.update(a.ease(p))
      if (p >= 1) done.push(a)
    }
    if (done.length > 0) {
      this.active = this.active.filter((a) => !done.includes(a))
      for (const a of done) a.resolve()
    }
  }

  /** Finish everything immediately (skip animations). */
  finishAll(): void {
    const all = this.active
    this.active = []
    for (const a of all) {
      a.update(1)
      a.resolve()
    }
  }
}
