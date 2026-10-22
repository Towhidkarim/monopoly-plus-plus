/** Damped spring for continuous juice (lift, squash, wobble). Semi-implicit Euler, clamped dt. */
export class Spring {
  value: number
  velocity = 0
  target: number
  stiffness: number
  damping: number

  constructor(initial = 0, stiffness = 220, damping = 16) {
    this.value = initial
    this.target = initial
    this.stiffness = stiffness
    this.damping = damping
  }

  /** Returns true while still moving. */
  step(dtMs: number): boolean {
    const dt = Math.min(dtMs, 50) / 1000
    const force = (this.target - this.value) * this.stiffness - this.velocity * this.damping
    this.velocity += force * dt
    this.value += this.velocity * dt
    if (Math.abs(this.velocity) < 1e-4 && Math.abs(this.target - this.value) < 1e-4) {
      this.value = this.target
      this.velocity = 0
      return false
    }
    return true
  }

  kick(velocity: number): void {
    this.velocity += velocity
  }
}

/** Frame-rate independent exponential smoothing toward a target. */
export function smooth(current: number, target: number, sharpness: number, dtMs: number): number {
  return target + (current - target) * Math.exp((-sharpness * dtMs) / 1000)
}
