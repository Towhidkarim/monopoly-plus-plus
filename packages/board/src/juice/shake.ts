/**
 * Trauma-based screen shake: hits add trauma (0..1), trauma decays over time, and the felt
 * offset is trauma squared times smooth noise, so small hits barely move and big ones jolt.
 */
export class Shake {
  trauma = 0
  private clock = 0
  private readonly phase = [Math.random() * 100, Math.random() * 100] // cosmetic only

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount)
  }

  /** Advances and returns the offset to apply this frame. */
  step(dtMs: number, cfg: { maxPx: number; decay: number; hz: number }): { x: number; y: number } {
    if (this.trauma <= 0) return ZERO
    this.clock += dtMs / 1000
    this.trauma = Math.max(0, this.trauma - (cfg.decay * dtMs) / 1000)
    const k = this.trauma * this.trauma * cfg.maxPx
    const t = this.clock * cfg.hz
    return { x: k * wobble(t + this.phase[0]!), y: k * wobble(t * 1.13 + this.phase[1]!) }
  }
}

const ZERO = { x: 0, y: 0 }

/** Cheap smooth noise in [-1, 1]: a few incommensurate sines. */
function wobble(t: number): number {
  return (Math.sin(t * 6.283) + Math.sin(t * 2.71 * 6.283) * 0.5 + Math.sin(t * 0.61 * 6.283) * 0.3) / 1.8
}
