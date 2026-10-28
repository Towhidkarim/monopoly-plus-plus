import { Container, Graphics, Text, type Geometry } from 'pixi.js'
import { Spring } from '../anim/spring.ts'
import { project } from '../geometry/project.ts'
import { CORNERS, speedFaceOf, speedFaceValue, topFace, type SpeedFace } from './cube.ts'
import { qaxis, qmul, qrot, v3, type Quat, type V3 } from './math.ts'
import { DieMesh, roundedCubeGeometry } from './mesh.ts'
import {
  DEFAULT_THROW_AREA,
  DEFAULT_THROW_FROM,
  poseAt,
  solveThrow,
  type DicePhysics,
  type DiceTrack,
  type Pose,
  type ThrowArea,
} from './sim.ts'

export { DEFAULT_THROW_AREA, DEFAULT_THROW_FROM }
export type { SpeedFace }

/**
 * Two code-drawn dice thrown onto the board (DECISIONS.md D38). The throw is solved ahead of
 * time (`sim.ts`); this plays the track back. Each die is a rigid rounded-cube mesh (`mesh.ts`)
 * placed every frame with the board's own projection; shadows and the total stay in Graphics/Text.
 */

export interface DiceSettle {
  /** The two white dice (the Speed die is `speedFace`). */
  values: [number, number]
  /** The Speed die's face, when one was thrown. */
  speedFace?: SpeedFace
  /** White sum plus the Speed die's number (bus and scout add nothing). */
  total: number
  /** The white dice match (the Speed die never counts). */
  doubles: boolean
  /** Where the total pops, in canvas CSS px (for a DOM callout or sound panning). */
  screen: { x: number; y: number }
  /** Real ms from now until the total pops (for a sound in step with it). */
  popInMs: number
}

export interface DiceThrowOptions {
  /** The engine's result. The dice land on these faces. */
  values: readonly [number, number]
  /** Throw a third, amber Speed die that lands on this face (D62). */
  speedFace?: SpeedFace
  /** Cosmetic seed for the throw (same seed and values, same throw). Random when omitted. */
  seed?: number
  /** Release point in board units (for example the active player's side). */
  from?: { col: number; row: number }
  /** Landing area in board units. */
  area?: ThrowArea
  /** Playback speed; defaults to the board's speed. Never changes the result. */
  speed?: number
  /** Skip the tumble: the dice appear at rest, then pop and fly. */
  instant?: boolean
  /** Fly-away target in canvas CSS px (the DOM dice tray); default bottom-right corner. */
  tray?: { x: number; y: number; size?: number }
  /** A die hit the board, the rail or the other die; intensity 0..1. */
  onBounce?: (intensity: number, die: number) => void
  /** Both dice at rest. */
  onSettle?: (settle: DiceSettle) => void
  /** The total has shown and the dice start flying to the tray (the game moves on here). */
  onFly?: () => void
  /** Frame the throw area with the camera first (board only; the view ignores it). */
  focus?: boolean
}

export interface DiceThrowResult {
  /** Top faces read off the final drawn orientation (equal to `values`). */
  values: [number, number]
  speedFace?: SpeedFace
  /** Release to rest at 1x, ms. */
  durationMs: number
  seed: number
  tries: number
}

/** What the dice need from the board. */
export interface DiceHost {
  readonly world: Container
  readonly overlay: Container
  viewT(): number
  /** Night light level 0..1 (lamp glow). */
  glow(): number
  reduced(): boolean
  /** Feel numbers, read live. */
  tuning(): DiceFeel
  hitStop(ms: number): void
  addTrauma(amount: number): void
  sparkle(x: number, y: number, colors: readonly number[]): void
  /** Canvas size in CSS px. */
  screen(): { width: number; height: number }
}

export type DiceFeel = DicePhysics & {
  hitStopMs: number
  trauma: number
  settleMs: number
  popMs: number
  flyMs: number
}

const CREAM = 0xfbf8f1
/** Die body and pips: bright white plastic, near-black pips. */
const WHITE = 0xffffff
const BLACK = 0x15171c
const INK = 0x1f2a3d
const LAMP = 0xffc874
/** Speed die: warm amber body, dark brown marks. */
const AMBER_BODY = 0xe8a33c
const AMBER_MARK = 0x2b1a06
const GOLD = 0xfbbf24

/** Key light from the top-left-front (world, normalized). */
const LIGHT = (() => {
  // Mostly from above, then toward screen-left (-col, +row), a little toward the front.
  const l = v3(-0.141, 0.71, 1)
  const n = Math.hypot(l.x, l.y, l.z)
  return v3(l.x / n, l.y / n, l.z / n)
})()

/** A unit circle for the contact shadows. */
const CIRCLE: [number, number][] = Array.from({ length: 16 }, (_, i) => [
  Math.cos((i / 16) * Math.PI * 2),
  Math.sin((i / 16) * Math.PI * 2),
])

type Phase = 'idle' | 'throw' | 'rest' | 'pop' | 'fly'

interface Run {
  opts: DiceThrowOptions
  track: DiceTrack
  speed: number
  reduced: boolean
  /** Dice in this throw: 2, or 3 with the Speed die. */
  count: number
  /** Seconds of track played. */
  clock: number
  /** Index of the next hit to fire. */
  nextHit: number
  firstImpact: boolean
  phase: Phase
  /** Ms in the current phase. */
  phaseMs: number
  settle: DiceSettle | null
  resolve: (r: DiceThrowResult) => void
  result: DiceThrowResult
}

/** 2D projection of board-unit vectors at the current morph (linear part of `project`). */
interface Basis {
  t: number
  ex: { x: number; y: number }
  ey: { x: number; y: number }
  ez: { x: number; y: number }
  /** World direction toward the viewer (what `project` maps to zero). */
  view: V3
}

export class DiceView {
  // Own render group: redrawing the dice each frame never re-batches the rest of the world.
  readonly container = new Container({ eventMode: 'none', isRenderGroup: true })
  private readonly shadows = new Graphics()
  private geometry: Geometry
  private geometryRound: number
  private readonly dice: readonly [DieMesh, DieMesh, DieMesh]
  private readonly debugG = new Graphics()
  private readonly label = new Container({ eventMode: 'none' })
  private readonly total: Text
  private readonly sub: Text
  private readonly pop = new Spring(0, 300, 13)
  private readonly host: DiceHost
  private run: Run | null = null
  private debug = false
  private basis: Basis = { t: -1, ex: { x: 0, y: 0 }, ey: { x: 0, y: 0 }, ez: { x: 0, y: 0 }, view: v3() }
  // Scratch, so drawing allocates nothing per frame.
  private readonly pose: [Pose, Pose, Pose] = [
    { p: v3(), q: { w: 1, x: 0, y: 0, z: 0 } },
    { p: v3(), q: { w: 1, x: 0, y: 0, z: 0 } },
    { p: v3(), q: { w: 1, x: 0, y: 0, z: 0 } },
  ]

  constructor(host: DiceHost) {
    this.host = host
    this.geometryRound = host.tuning().round
    this.geometry = roundedCubeGeometry(this.geometryRound)
    const colors = { body: WHITE, pip: BLACK, lamp: LAMP }
    const amber = { body: AMBER_BODY, pip: AMBER_MARK, lamp: LAMP }
    this.dice = [
      new DieMesh(this.geometry, colors, LIGHT),
      new DieMesh(this.geometry, colors, LIGHT),
      new DieMesh(this.geometry, amber, LIGHT, true),
    ]
    this.container.addChild(
      this.shadows,
      this.dice[0].mesh,
      this.dice[1].mesh,
      this.dice[2].mesh,
      this.debugG,
    )
    this.container.visible = false
    const style = {
      fontFamily: ['Sora Variable', 'Bricolage Grotesque Variable', 'system-ui', 'sans-serif'],
      fontWeight: '800' as const,
      fill: CREAM,
      stroke: { color: INK, width: 7, join: 'round' as const },
      dropShadow: { color: 0x050a14, alpha: 0.45, blur: 6, distance: 3, angle: Math.PI / 2 },
    }
    this.total = new Text({ text: '0', style: { ...style, fontSize: 54 } })
    this.total.anchor.set(0.5, 1)
    this.sub = new Text({ text: 'DOUBLES', style: { ...style, fontSize: 15, letterSpacing: 2.5 } })
    this.sub.style.stroke = { color: INK, width: 5, join: 'round' }
    this.sub.anchor.set(0.5, 0)
    this.sub.y = 2
    this.label.addChild(this.total, this.sub)
    this.label.visible = false
    host.overlay.addChild(this.label)
  }

  /** Throws the dice. A throw already running finishes at once. */
  throw(opts: DiceThrowOptions, speed: number): Promise<DiceThrowResult> {
    this.finish()
    const feel = this.host.tuning()
    const seed = (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0
    const speedFace = opts.speedFace
    const wanted =
      speedFace === undefined ? [...opts.values] : [...opts.values, speedFaceValue(speedFace, seed)]
    const track = solveThrow({
      values: wanted,
      seed,
      area: opts.area ?? DEFAULT_THROW_AREA,
      from: opts.from ?? DEFAULT_THROW_FROM,
      physics: feel,
    })
    const last = (i: number) => track.poses[i]![track.poses[i]!.length - 1]!.q
    const result: DiceThrowResult = {
      values: [topFace(last(0)).value, topFace(last(1)).value],
      ...(speedFace === undefined ? {} : { speedFace: speedFaceOf(topFace(last(2)).value) }),
      durationMs: Math.round(track.duration * 1000),
      seed,
      tries: track.tries,
    }
    return new Promise((resolve) => {
      const reduced = this.host.reduced()
      this.run = {
        opts,
        track,
        speed: Math.max(0.05, speed),
        reduced,
        count: wanted.length,
        clock: opts.instant || reduced ? track.duration : 0,
        nextHit: opts.instant || reduced ? track.hits.length : 0,
        firstImpact: false,
        phase: 'throw',
        phaseMs: 0,
        settle: null,
        resolve,
        result,
      }
      this.refreshGeometry(feel.round)
      this.container.visible = true
      this.container.alpha = 1
      for (const [i, d] of this.dice.entries()) {
        d.mesh.alpha = 1
        d.mesh.visible = i < wanted.length
      }
    })
  }

  /** Ends any throw immediately (skip). */
  finish(): void {
    const run = this.run
    if (!run) return
    this.run = null
    if (!run.settle) this.settle(run)
    if (run.phase !== 'fly') run.opts.onFly?.()
    this.hide()
    run.resolve(run.result)
  }

  setDebug(on: boolean): void {
    this.debug = on
    this.debugG.clear()
  }

  /** Advance by `dtMs` of board time (already slowed by hit-stop). */
  update(dtMs: number): void {
    const run = this.run
    if (!run) return
    const feel = this.host.tuning()
    const dt = dtMs * run.speed
    run.phaseMs += dt
    this.pop.step(dt)

    if (run.phase === 'throw') {
      run.clock = Math.min(run.track.duration, run.clock + dt / 1000)
      this.fireHits(run, feel)
      if (run.clock >= run.track.duration) {
        if (run.reduced && run.phaseMs < 260) {
          // Reduced motion: no tumble, the dice settle gently into place.
        } else {
          this.settle(run)
          this.enter(run, 'rest')
        }
      }
    } else if (run.phase === 'rest' && run.phaseMs >= feel.settleMs) {
      this.enter(run, 'pop')
      this.pop.value = run.reduced ? 1 : 0
      this.pop.velocity = 0
      this.pop.target = 1
      if (!run.reduced) this.pop.kick(9)
      if (run.settle?.doubles && !run.reduced) {
        const at = this.labelWorld(run)
        this.host.sparkle(at.x, at.y, [GOLD, CREAM, GOLD])
      }
    } else if (run.phase === 'pop') {
      if (run.settle?.doubles && !run.reduced && run.phaseMs - dt < 150 && run.phaseMs >= 150)
        this.pop.kick(6)
      if (run.phaseMs >= feel.popMs) {
        this.enter(run, 'fly')
        run.opts.onFly?.()
      }
    } else if (run.phase === 'fly' && run.phaseMs >= this.flyLen(run, feel)) {
      this.run = null
      this.hide()
      run.resolve(run.result)
      return
    }
    this.draw(run, feel)
  }

  private flyLen(run: Run, feel: DiceFeel): number {
    return run.reduced ? 260 : feel.flyMs + 80
  }

  private enter(run: Run, phase: Phase): void {
    run.phase = phase
    run.phaseMs = 0
  }

  private fireHits(run: Run, feel: DiceFeel): void {
    const hits = run.track.hits
    while (run.nextHit < hits.length && hits[run.nextHit]!.t <= run.clock) {
      const hit = hits[run.nextHit++]!
      const dice: readonly number[] = hit.kind === 'dice' ? [...Array(run.count).keys()] : [hit.die]
      for (const d of dice) run.opts.onBounce?.(hit.intensity, d)
      if (!run.firstImpact && hit.kind === 'floor' && hit.intensity > 0.35) {
        run.firstImpact = true
        this.host.hitStop(feel.hitStopMs)
        this.host.addTrauma(feel.trauma * hit.intensity)
      }
    }
  }

  private settle(run: Run): void {
    const [a, b] = run.result.values
    const sf = run.result.speedFace
    const at = this.host.world.toGlobal(this.labelWorld(run))
    const popInMs = this.host.tuning().settleMs / run.speed
    const total = a + b + (typeof sf === 'number' ? sf : 0)
    run.settle = {
      values: [a, b],
      ...(sf === undefined ? {} : { speedFace: sf }),
      total,
      doubles: a === b,
      screen: { x: at.x, y: at.y },
      popInMs,
    }
    this.total.text = String(total)
    this.total.style.fill = a === b ? GOLD : CREAM
    // Under the number: DOUBLES, and for a bus or scout face what comes after the white sum.
    const note = [a === b ? 'DOUBLES' : '', sf === 'bus' ? '+ BUS' : sf === 'scout' ? '+ SCOUT' : '']
    this.sub.text = note.filter(Boolean).join('  ')
    this.sub.visible = this.sub.text !== ''
    if (run.reduced) run.opts.onBounce?.(0.35, 0)
    run.opts.onSettle?.(run.settle)
  }

  private hide(): void {
    this.container.visible = false
    this.label.visible = false
    this.shadows.clear()
    this.debugG.clear()
  }

  /** Rebuilds the shared mesh when the edge radius was retuned (playground slider). */
  private refreshGeometry(round: number): void {
    if (round === this.geometryRound) return
    const old = this.geometry
    this.geometryRound = round
    this.geometry = roundedCubeGeometry(round)
    for (const d of this.dice) d.mesh.geometry = this.geometry
    old.destroy()
  }

  /** Point above the two resting white dice where the total pops (world px). */
  private labelWorld(run: Run): { x: number; y: number } {
    let x = 0
    let y = 0
    for (const list of run.track.poses.slice(0, 2)) {
      const p = list[list.length - 1]!.p
      x += p.x / 2
      y += p.y / 2
    }
    return project({ col: x, row: y, z: run.track.half * 2 + 0.3 }, this.host.viewT())
  }

  private refreshBasis(): Basis {
    const t = this.host.viewT()
    const B = this.basis
    if (B.t === t) return B
    B.t = t
    const o = project({ col: 0, row: 0, z: 0 }, t)
    const at = (col: number, row: number, z: number) => {
      const p = project({ col, row, z }, t)
      return { x: p.x - o.x, y: p.y - o.y }
    }
    B.ex = at(1, 0, 0)
    B.ey = at(0, 1, 0)
    B.ez = at(0, 0, 1)
    // Kernel of the 2x3 map: the cross product of its rows. Make it point up (toward the camera).
    const r1 = v3(B.ex.x, B.ey.x, B.ez.x)
    const r2 = v3(B.ex.y, B.ey.y, B.ez.y)
    let vx = r1.y * r2.z - r1.z * r2.y
    let vy = r1.z * r2.x - r1.x * r2.z
    let vz = r1.x * r2.y - r1.y * r2.x
    if (vz < 0) {
      vx = -vx
      vy = -vy
      vz = -vz
    }
    const n = Math.hypot(vx, vy, vz) || 1
    B.view = v3(vx / n, vy / n, vz / n)
    return B
  }

  // ---- drawing -------------------------------------------------------------

  private draw(run: Run, feel: DiceFeel): void {
    const B = this.refreshBasis()
    const h = run.track.half
    const glow = this.host.glow()
    this.shadows.clear()
    const fly = run.phase === 'fly' ? run.phaseMs : -1
    const order = [...Array(run.count).keys()]
    for (const i of order) poseAt(run.track, i, run.clock, this.pose[i]!)
    // Reduced motion: a short drop into place instead of the tumble.
    if (run.reduced && run.phase === 'throw') {
      const k = Math.min(1, run.phaseMs / 260)
      for (const p of this.pose.slice(0, run.count)) p.p.z += (1 - k) * (1 - k) * 0.35
      for (const d of this.dice) d.mesh.alpha = k
    }
    // Far die first, so the nearest is drawn last, on top (`view` points toward the camera).
    const depth = (p: Pose) => p.p.x * B.view.x + p.p.y * B.view.y + p.p.z * B.view.z
    order.sort((i, j) => depth(this.pose[i]!) - depth(this.pose[j]!))
    for (const [k, i] of order.entries()) this.container.setChildIndex(this.dice[i]!.mesh, 1 + k)

    for (const i of order) {
      const pose = this.pose[i]!
      const die = this.dice[i]!
      // Rest point in world px, and where the die is drawn (they differ during the fly).
      const rest = project({ col: pose.p.x, row: pose.p.y, z: pose.p.z }, B.t)
      let ax = rest.x
      let ay = rest.y
      let k = 1
      let q: Quat = pose.q
      let lift = 0
      if (fly >= 0) {
        const f = this.flight(run, feel, i, fly)
        ax = rest.x + (f.x - rest.x) * f.e
        ay = rest.y + (f.y - rest.y) * f.e - f.arc
        k = 1 + (f.scale - 1) * f.e
        lift = f.lift
        ay -= lift
        die.mesh.alpha = f.alpha
        if (!run.reduced) q = qmul(qaxis(v3(0, 0, 1), f.e * (i === 1 ? -1.2 : i === 2 ? 0.9 : 1.4)), pose.q)
      }
      // Contact shadow on the board, shrinking and fading with height.
      const height = Math.max(0, pose.p.z - h) + lift / 60
      const fade = fly >= 0 ? Math.max(0, 1 - fly / 160) : 1
      const sh = Math.min(1, height / 2.4)
      const ground = project({ col: pose.p.x, row: pose.p.y, z: 0 }, B.t)
      // A soft two-layer contact shadow: a wide faint penumbra and a tighter core.
      const alpha = (1 - 0.7 * sh) * fade * die.mesh.alpha
      this.ellipse(this.shadows, B, ground.x, ground.y, h * (1.45 - 0.4 * sh))
      this.shadows.fill({ color: 0x0b1426, alpha: 0.16 * alpha })
      this.ellipse(this.shadows, B, ground.x, ground.y, h * (1.08 - 0.45 * sh))
      this.shadows.fill({ color: 0x0b1426, alpha: 0.22 * alpha })
      // The board renders at 2x resolution (mount.ts), so 2 device px per world px at zoom 1.
      die.set(B, q, h, k, ax, ay, glow, (this.host.world.scale.x || 1) * 2)
    }
    if (this.debug) this.drawDebug(run, B)
    this.drawLabel(run, feel)
  }

  /** Where die `i` is during the fly-away, in world px. */
  private flight(run: Run, feel: DiceFeel, i: number, ms: number) {
    const len = run.reduced ? 240 : feel.flyMs
    const delay = run.reduced ? 0 : i * 70
    const p = Math.min(1, Math.max(0, (ms - delay) / len))
    const screen = this.host.screen()
    const tray = run.opts.tray ?? { x: screen.width - 70, y: screen.height - 60 }
    const world = this.host.world
    const target = world.toLocal({
      x: tray.x + (i - (run.count - 1) / 2) * (tray.size ?? 34) * 1.24,
      y: tray.y,
    })
    const zoom = world.scale.x || 1
    // Size on screen: an upright die is about 2h * 110 world px wide.
    const wide = run.track.half * 2 * 110 * zoom
    const scale = (tray.size ?? 34) / wide
    if (run.reduced) return { x: target.x, y: target.y, e: 0, arc: 0, scale: 1, lift: 0, alpha: 1 - p }
    // Lift first, then an eased arc toward the tray.
    const up = Math.min(1, p / 0.22)
    const e = p < 0.12 ? 0 : easeInOut((p - 0.12) / 0.88)
    return {
      x: target.x,
      y: target.y,
      e,
      arc: (Math.sin(Math.PI * e) * 110) / zoom,
      scale,
      lift: (up * (2 - up) * 22) / zoom,
      alpha: p < 0.86 ? 1 : 1 - (p - 0.86) / 0.14,
    }
  }

  private drawLabel(run: Run, feel: DiceFeel): void {
    const show = run.phase === 'pop' || run.phase === 'fly'
    this.label.visible = show
    if (!show) return
    const at = this.host.world.toGlobal(this.labelWorld(run))
    this.label.position.set(Math.round(at.x), Math.round(at.y))
    const s = Math.max(0, this.pop.value)
    this.label.scale.set(s)
    if (run.phase === 'pop') this.label.alpha = run.reduced ? Math.min(1, run.phaseMs / 120) : 1
    else this.label.alpha = Math.max(0, 1 - run.phaseMs / (feel.flyMs * 0.45))
    this.label.y -= run.phase === 'fly' ? Math.min(1, run.phaseMs / feel.flyMs) * 16 : 0
  }

  /** A circle of radius `r` (board units) on the board plane, projected, as a path. */
  private ellipse(g: Graphics, B: Basis, cx: number, cy: number, r: number): void {
    for (let i = 0; i < CIRCLE.length; i++) {
      const [c, s] = CIRCLE[i]!
      const x = cx + (B.ex.x * c + B.ey.x * s) * r
      const y = cy + (B.ex.y * c + B.ey.y * s) * r
      if (i === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.closePath()
  }

  private drawDebug(run: Run, B: Basis): void {
    const g = this.debugG.clear()
    const a = run.opts.area ?? DEFAULT_THROW_AREA
    const p = (col: number, row: number, z = 0) => project({ col, row, z }, B.t)
    const c = [p(a.col0, a.row0), p(a.col1, a.row0), p(a.col1, a.row1), p(a.col0, a.row1)]
    g.moveTo(c[0]!.x, c[0]!.y)
    for (const pt of c.slice(1)) g.lineTo(pt.x, pt.y)
    g.closePath().stroke({ color: 0x22d3ee, width: 2, alpha: 0.9 })
    const from = run.opts.from ?? DEFAULT_THROW_FROM
    const f = p(from.col, from.row)
    g.circle(f.x, f.y, 8).stroke({ color: 0xfbbf24, width: 2 })
    // Impacts so far, and corners touching the board right now.
    for (const hit of run.track.hits) {
      if (hit.t > run.clock) break
      const s = p(hit.at.x, hit.at.y, hit.at.z)
      const r = 3 + hit.intensity * 7
      const color = hit.kind === 'floor' ? 0xfb7185 : hit.kind === 'dice' ? 0xa78bfa : 0x34d399
      g.moveTo(s.x - r, s.y)
        .lineTo(s.x + r, s.y)
        .moveTo(s.x, s.y - r)
        .lineTo(s.x, s.y + r)
      g.stroke({ color, width: 2 })
    }
    const corner = v3()
    const rad = run.track.half * this.geometryRound
    for (const pose of this.pose.slice(0, run.count)) {
      for (const k of CORNERS) {
        corner.x = k.x * (run.track.half - rad)
        corner.y = k.y * (run.track.half - rad)
        corner.z = k.z * (run.track.half - rad)
        qrot(pose.q, corner, corner)
        if (pose.p.z + corner.z - rad > 0.02) continue
        const s = p(pose.p.x + corner.x, pose.p.y + corner.y)
        g.circle(s.x, s.y, 3.5).fill(0xfb7185)
      }
    }
  }

  destroy(): void {
    this.finish()
    this.label.destroy({ children: true })
    for (const d of this.dice) d.destroy()
    this.container.destroy({ children: true })
    this.geometry.destroy()
  }
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2
}
