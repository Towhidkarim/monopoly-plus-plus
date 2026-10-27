import type { SoundEngine } from './engine.ts'

/** Where ambience plays: the engine's context and its ambience bus. */
export interface AmbienceOut {
  ctx: AudioContext
  out: AudioNode
}

const TICK_MS = 250

/**
 * The city under the game, all code-generated: a low hum that slowly breathes, a car or train
 * passing in the distance now and then, birds by day and crickets at night (`setNight`, 0..1,
 * follows the board's sky). Quiet by design; its own bus and slider in the menu. Starts once the
 * engine's audio is unlocked (the first click), so `start` can be called right away.
 */
export class CityAmbience {
  private readonly engine: SoundEngine
  private timer = 0
  private night = 0
  private hum: { src: AudioBufferSourceNode; lfo: OscillatorNode; gain: GainNode } | null = null
  private noise: AudioBuffer | null = null
  private next = { bird: 0, cricket: 0, pass: 0 }

  constructor(engine: SoundEngine) {
    this.engine = engine
  }

  start(): void {
    if (this.timer) return
    this.timer = window.setInterval(() => this.tick(), TICK_MS)
  }

  stop(): void {
    window.clearInterval(this.timer)
    this.timer = 0
    const hum = this.hum
    this.hum = null
    if (!hum) return
    const t = hum.gain.context.currentTime
    hum.gain.gain.cancelScheduledValues(t)
    hum.gain.gain.setTargetAtTime(0, t, 0.3)
    hum.src.stop(t + 1.5)
    hum.lfo.stop(t + 1.5)
  }

  setNight(level: number): void {
    this.night = Math.min(1, Math.max(0, level))
    const hum = this.hum
    // The city quiets down at night.
    if (hum) hum.gain.gain.setTargetAtTime(humLevel(this.night), hum.gain.context.currentTime, 1.5)
  }

  private tick(): void {
    const io = this.engine.backgroundOut('ambience')
    if (!io) return
    const { ctx } = io
    this.noise ??= brownNoise(ctx, 4)
    this.hum ??= startHum(io, this.noise, humLevel(this.night))
    const now = ctx.currentTime
    if (now >= this.next.bird) {
      if (this.night < 0.6) birdCall(io, 1 - this.night)
      this.next.bird = now + 4 + Math.random() * 9
    }
    if (now >= this.next.cricket) {
      if (this.night > 0.3) crickets(io, this.night)
      this.next.cricket = now + 0.7 + Math.random() * 0.7
    }
    if (now >= this.next.pass) {
      // Skip the first one so a game never opens on a passing car.
      if (this.next.pass > 0) passing(io, this.noise)
      this.next.pass = now + 16 + Math.random() * 26
    }
  }
}

const humLevel = (night: number) => 0.32 - 0.12 * night

/** Brown noise (integrated white noise): a soft, low rumble, seamless as a loop. */
function brownNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < d.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
    d[i] = last * 3.5
  }
  // Fade the seam so the loop never clicks.
  const fade = Math.floor(ctx.sampleRate * 0.05)
  for (let i = 0; i < fade; i++) {
    const k = i / fade
    d[i]! *= k
    d[d.length - 1 - i]! *= k
  }
  return buf
}

function startHum({ ctx, out }: AmbienceOut, noise: AudioBuffer, level: number) {
  const src = ctx.createBufferSource()
  src.buffer = noise
  src.loop = true
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 260
  filter.Q.value = 0.4
  // The hum breathes: a very slow sweep of its brightness.
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.06
  const depth = ctx.createGain()
  depth.gain.value = 90
  lfo.connect(depth).connect(filter.frequency)
  const gain = ctx.createGain()
  gain.gain.value = 0
  gain.gain.setTargetAtTime(level, ctx.currentTime, 1.2)
  src.connect(filter).connect(gain).connect(out)
  src.start()
  lfo.start()
  return { src, lfo, gain }
}

function panned({ ctx, out }: AmbienceOut, pan: number): GainNode {
  const p = ctx.createStereoPanner()
  p.pan.value = pan
  const g = ctx.createGain()
  g.connect(p).connect(out)
  return g
}

/** A short song of two to four rising chirps, somewhere off to one side. */
function birdCall(io: AmbienceOut, level: number): void {
  const { ctx } = io
  const bus = panned(io, Math.random() * 1.4 - 0.7)
  const base = 2800 + Math.random() * 1400
  const n = 2 + Math.floor(Math.random() * 3)
  let t = ctx.currentTime + 0.05
  for (let i = 0; i < n; i++) {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    const f = base * (1 + (Math.random() - 0.5) * 0.12)
    o.frequency.setValueAtTime(f, t)
    o.frequency.exponentialRampToValueAtTime(f * 1.3, t + 0.06)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.035 * level, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
    o.connect(g).connect(bus)
    o.start(t)
    o.stop(t + 0.1)
    t += 0.11 + Math.random() * 0.07
  }
}

/** One cricket chirp: three quick pulses of a high tone. */
function crickets(io: AmbienceOut, level: number): void {
  const { ctx } = io
  const bus = panned(io, Math.random() * 1.6 - 0.8)
  const t0 = ctx.currentTime + 0.05
  const o = ctx.createOscillator()
  o.frequency.value = 4200 + Math.random() * 500
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t0)
  for (let i = 0; i < 3; i++) {
    const t = t0 + i * 0.045
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.012 * level, t + 0.008)
    g.gain.linearRampToValueAtTime(0, t + 0.028)
  }
  o.connect(g).connect(bus)
  o.start(t0)
  o.stop(t0 + 0.2)
}

/** Something passing far away: a muffled swell of noise that drifts from one side to the other. */
function passing({ ctx, out }: AmbienceOut, noise: AudioBuffer): void {
  const t = ctx.currentTime + 0.05
  const dur = 3 + Math.random() * 2
  const src = ctx.createBufferSource()
  src.buffer = noise
  src.loop = true
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 380 + Math.random() * 200
  band.Q.value = 0.8
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.5, t + dur * 0.5)
  g.gain.linearRampToValueAtTime(0, t + dur)
  const p = ctx.createStereoPanner()
  const dir = Math.random() < 0.5 ? -1 : 1
  p.pan.setValueAtTime(-0.7 * dir, t)
  p.pan.linearRampToValueAtTime(0.7 * dir, t + dur)
  src.connect(band).connect(g).connect(p).connect(out)
  src.start(t, Math.random() * 3)
  src.stop(t + dur + 0.1)
}
