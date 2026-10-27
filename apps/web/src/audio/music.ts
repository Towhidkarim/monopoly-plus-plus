import type { SoundEngine } from './engine.ts'

/** The game's background track (docs/ASSETS.md), streamed from public/audio/music. */
export const GAME_TRACK = `${import.meta.env.BASE_URL}audio/music/warm-drinks-and-dice.mp3`

const TICK_MS = 500
const FADE_IN_S = 2.5
const FADE_OUT_S = 0.8

/**
 * A looping music track on the engine's music bus. Streamed by an audio element (never decoded
 * whole), created only once audio is unlocked, so nothing downloads before the first click.
 * Pauses while sound is muted and resumes after. `start` can be called right away.
 */
export class MusicPlayer {
  private readonly engine: SoundEngine
  private readonly url: string
  private timer = 0
  private el: HTMLAudioElement | null = null
  private fade: GainNode | null = null

  constructor(engine: SoundEngine, url: string = GAME_TRACK) {
    this.engine = engine
    this.url = url
  }

  start(): void {
    if (this.timer) return
    this.timer = window.setInterval(() => this.tick(), TICK_MS)
    this.tick()
  }

  stop(): void {
    window.clearInterval(this.timer)
    this.timer = 0
    const el = this.el
    const fade = this.fade
    this.el = null
    this.fade = null
    if (!el) return
    if (!fade) return el.pause()
    const t = fade.context.currentTime
    fade.gain.cancelScheduledValues(t)
    fade.gain.setTargetAtTime(0, t, FADE_OUT_S / 3)
    window.setTimeout(
      () => {
        el.pause()
        el.removeAttribute('src')
        el.load()
        fade.disconnect()
      },
      FADE_OUT_S * 1000 + 100,
    )
  }

  private tick(): void {
    const io = this.engine.backgroundOut('music')
    if (!io) {
      // Not unlocked yet, or muted: hold the track where it is.
      if (this.el && !this.el.paused) this.el.pause()
      return
    }
    if (!this.el) {
      const el = new Audio(this.url)
      el.loop = true
      el.preload = 'auto'
      const fade = io.ctx.createGain()
      fade.gain.value = 0
      io.ctx.createMediaElementSource(el).connect(fade).connect(io.out)
      fade.gain.setTargetAtTime(1, io.ctx.currentTime, FADE_IN_S / 3)
      this.el = el
      this.fade = fade
    }
    if (this.el.paused) void this.el.play().catch(() => {})
  }
}
