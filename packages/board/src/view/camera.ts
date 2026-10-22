import type { Container, FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js'
import { smooth } from '../anim/spring.ts'

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const DRAG_THRESHOLD = 6
const ZOOM_MIN_FACTOR = 0.6
const ZOOM_MAX_FACTOR = 3.2

/**
 * Pan / zoom / follow camera for the world container (DECISIONS.md D6).
 * State is a world-space center and a zoom; the applied values glide toward targets every frame.
 */
export class Camera {
  private cx = 0
  private cy = 0
  private zoom = 1
  private tx = 0
  private ty = 0
  private tz = 1
  private fitZoom = 1
  private bounds: Bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  private width = 1
  private height = 1

  private follow: (() => { x: number; y: number }) | null = null
  private pointers = new Map<number, { x: number; y: number }>()
  private dragStart: { x: number; y: number } | null = null
  private pinchDist = 0
  /** True once the current press moved past the threshold (so it is not a click). */
  dragging = false

  private readonly world: Container

  constructor(world: Container) {
    this.world = world
  }

  setViewport(width: number, height: number): void {
    this.width = width
    this.height = height
  }

  setBounds(b: Bounds): void {
    this.bounds = b
    const bw = b.maxX - b.minX
    const bh = b.maxY - b.minY
    this.fitZoom = Math.min(this.width / (bw * 1.08), this.height / (bh * 1.12))
  }

  /** Frame the whole board. */
  recenter(instant = false): void {
    this.follow = null
    this.tx = (this.bounds.minX + this.bounds.maxX) / 2
    this.ty = (this.bounds.minY + this.bounds.maxY) / 2
    this.tz = this.fitZoom
    if (instant) this.snap()
  }

  /** Glide to a world point at `zoomFactor` x the fit zoom. */
  focusOn(x: number, y: number, zoomFactor: number, instant = false): void {
    this.follow = null
    this.tx = x
    this.ty = y
    this.tz = this.fitZoom * zoomFactor
    if (instant) this.snap()
  }

  setFollow(target: (() => { x: number; y: number }) | null, zoomIn = 1.5): void {
    this.follow = target
    if (target) this.tz = Math.max(this.tz, this.fitZoom * zoomIn)
  }

  get isFollowing(): boolean {
    return this.follow !== null
  }

  update(dtMs: number): void {
    if (this.follow) {
      const p = this.follow()
      this.tx = p.x
      this.ty = p.y
    }
    this.clampTarget()
    const k = this.follow ? 7 : 14
    this.cx = smooth(this.cx, this.tx, k, dtMs)
    this.cy = smooth(this.cy, this.ty, k, dtMs)
    this.zoom = smooth(this.zoom, this.tz, 10, dtMs)
    this.apply()
  }

  // ---- input -------------------------------------------------------------

  onPointerDown(e: FederatedPointerEvent): void {
    this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y })
    if (this.pointers.size === 1) {
      this.dragStart = { x: e.global.x, y: e.global.y }
      this.dragging = false
    } else if (this.pointers.size === 2) {
      this.pinchDist = this.pinchDistance()
      this.dragging = true
    }
  }

  onPointerMove(e: FederatedPointerEvent): void {
    const prev = this.pointers.get(e.pointerId)
    if (!prev) return
    const next = { x: e.global.x, y: e.global.y }
    if (this.pointers.size >= 2) {
      this.pointers.set(e.pointerId, next)
      const d = this.pinchDistance()
      if (this.pinchDist > 0) this.zoomAt(this.pinchCenter(), d / this.pinchDist)
      this.pinchDist = d
      return
    }
    if (this.dragStart && !this.dragging) {
      if (Math.hypot(next.x - this.dragStart.x, next.y - this.dragStart.y) < DRAG_THRESHOLD) return
      this.dragging = true
      this.follow = null // a manual drag pauses follow until the next move
    }
    this.pointers.set(e.pointerId, next)
    const dx = (next.x - prev.x) / this.zoom
    const dy = (next.y - prev.y) / this.zoom
    this.tx -= dx
    this.ty -= dy
    // Panning should feel 1:1, so move the applied center too.
    this.cx -= dx
    this.cy -= dy
  }

  onPointerUp(e: FederatedPointerEvent): void {
    this.pointers.delete(e.pointerId)
    if (this.pointers.size === 0) this.dragStart = null
    this.pinchDist = this.pointers.size >= 2 ? this.pinchDistance() : 0
  }

  onWheel(e: FederatedWheelEvent): void {
    const factor = Math.exp(-e.deltaY * 0.0015)
    this.zoomAt({ x: e.global.x, y: e.global.y }, factor)
  }

  // ---- internals ---------------------------------------------------------

  /** Zoom by `factor` keeping the world point under `screen` fixed. */
  private zoomAt(screen: { x: number; y: number }, factor: number): void {
    const nz = Math.min(
      this.fitZoom * ZOOM_MAX_FACTOR,
      Math.max(this.fitZoom * ZOOM_MIN_FACTOR, this.tz * factor),
    )
    const wx = this.tx + (screen.x - this.width / 2) / this.tz
    const wy = this.ty + (screen.y - this.height / 2) / this.tz
    this.tz = nz
    this.tx = wx - (screen.x - this.width / 2) / nz
    this.ty = wy - (screen.y - this.height / 2) / nz
  }

  private clampTarget(): void {
    const b = this.bounds
    this.tx = Math.min(b.maxX, Math.max(b.minX, this.tx))
    this.ty = Math.min(b.maxY, Math.max(b.minY, this.ty))
  }

  private snap(): void {
    this.clampTarget()
    this.cx = this.tx
    this.cy = this.ty
    this.zoom = this.tz
    this.apply()
  }

  private apply(): void {
    this.world.scale.set(this.zoom)
    this.world.position.set(this.width / 2 - this.cx * this.zoom, this.height / 2 - this.cy * this.zoom)
  }

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }

  private pinchCenter(): { x: number; y: number } {
    const [a, b] = [...this.pointers.values()]
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: this.width / 2, y: this.height / 2 }
  }
}
