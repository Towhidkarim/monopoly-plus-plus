import type { SoundEngine } from './engine.ts'

/** The game's background tracks (docs/ASSETS.md), streamed from public/audio/music. */
export const DAY_TRACK = `${import.meta.env.BASE_URL}audio/music/warm-drinks-and-dice.mp3`
export const NIGHT_TRACK = `${import.meta.env.BASE_URL}audio/music/skyscraper-lullaby.mp3`

type Slot = 'day' | 'night'

const TICK_MS = 500
const FADE_IN_S = 2.5
const FADE_OUT_S = 0.8
/** Day into night and back: both tracks overlap this long, a little slower than the board's sky fade. */
const CROSSFADE_S = 6
/** Sky level from which the night track plays (dusk is 0.6, dawn 0.3; see sky.ts). */
const NIGHT_AT = 0.5

interface Deck {
  el: HTMLAudioElement
  fade: GainNode
  /** Pending pause once a fade-out has finished. */
  pause: number
}

/**
 * Background music on the engine's music bus (D52, D67): one looping track for the day and one for
 * the night, picked by the board's sky level (`setNight`) and crossfaded when it changes; each
 * track resumes where it left off. Streamed by audio elements (never decoded whole), created only
 * once audio is unlocked and a track is first needed, so nothing downloads before the first click.
 * Pauses while sound is muted and resumes after. `start` can be called right away.
 */
export class MusicPlayer {
  private readonly engine: SoundEngine
  private readonly urls: Record<Slot, string>
  private timer = 0
  private decks: Partial<Record<Slot, Deck>> = {}
  /** The track the sky asks for, and the one currently faded in. */
  private want: Slot = 'day'
  private active: Slot | null = null
  /** Bumped on every switch, so a late `playing` event from an old switch does nothing. */
  private switchId = 0

  constructor(engine: SoundEngine, urls: Record<Slot, string> = { day: DAY_TRACK, night: NIGHT_TRACK }) {
    this.engine = engine
    this.urls = urls
  }

  start(): void {
    if (this.timer) return
    this.timer = window.setInterval(() => this.tick(), TICK_MS)
    // First tick after the caller's setup (and a `setNight` right after `start`) has run.
    window.setTimeout(() => this.tick(), 0)
  }

  /** The board's sky level, 0 (day) to 1 (night). */
  setNight(level: number): void {
    this.want = level >= NIGHT_AT ? 'night' : 'day'
  }

  stop(): void {
    window.clearInterval(this.timer)
    this.timer = 0
    this.switchId++
    const decks = Object.values(this.decks)
    this.decks = {}
    this.active = null
    for (const deck of decks) {
      window.clearTimeout(deck.pause)
      const t = deck.fade.context.currentTime
      deck.fade.gain.cancelScheduledValues(t)
      deck.fade.gain.setTargetAtTime(0, t, FADE_OUT_S / 3)
      window.setTimeout(
        () => {
          deck.el.pause()
          deck.el.removeAttribute('src')
          deck.el.load()
          deck.fade.disconnect()
        },
        FADE_OUT_S * 1000 + 100,
      )
    }
  }

  private tick(): void {
    if (!this.timer) return
    const io = this.engine.backgroundOut('music')
    if (!io) {
      // Not unlocked yet, or muted: hold the tracks where they are.
      for (const deck of Object.values(this.decks)) if (!deck.el.paused) deck.el.pause()
      return
    }
    if (this.active !== this.want) this.switchTo(this.want, io)
    const deck = this.active && this.decks[this.active]
    if (deck?.el.paused) void deck.el.play().catch(() => {})
  }

  /** Starts `slot` and, once it is actually playing, fades it in and the other track out. */
  private switchTo(slot: Slot, io: { ctx: AudioContext; out: AudioNode }): void {
    const from = this.active ? this.decks[this.active] : undefined
    const deck = (this.decks[slot] ??= this.createDeck(slot, io))
    this.active = slot
    const id = ++this.switchId
    window.clearTimeout(deck.pause)
    const seconds = from ? CROSSFADE_S : FADE_IN_S
    const fade = () => {
      if (id !== this.switchId) return
      const t = io.ctx.currentTime
      ramp(deck.fade, 1, t, seconds)
      if (!from) return
      ramp(from.fade, 0, t, seconds)
      window.clearTimeout(from.pause)
      from.pause = window.setTimeout(() => from.el.pause(), seconds * 1000 + 200)
    }
    // The old track keeps playing until the new one has buffered, so the switch never goes silent.
    if (!deck.el.paused && deck.el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) fade()
    else deck.el.addEventListener('playing', fade, { once: true })
    void deck.el.play().catch(() => {})
  }

  private createDeck(slot: Slot, io: { ctx: AudioContext; out: AudioNode }): Deck {
    const el = new Audio(this.urls[slot])
    el.loop = true
    el.preload = 'auto'
    const fade = io.ctx.createGain()
    fade.gain.value = 0
    io.ctx.createMediaElementSource(el).connect(fade).connect(io.out)
    return { el, fade, pause: 0 }
  }
}

/** Eases a gain to `to`, about there after `seconds`. */
function ramp(node: GainNode, to: number, t: number, seconds: number): void {
  node.gain.cancelScheduledValues(t)
  node.gain.setValueAtTime(node.gain.value, t)
  node.gain.setTargetAtTime(to, t, seconds / 3)
}
