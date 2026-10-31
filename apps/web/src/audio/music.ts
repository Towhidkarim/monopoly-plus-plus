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
/**
 * Phones decode a track whole (see `BufferTrack`): mono at this rate keeps a four-minute track near
 * 30 MB instead of about 90 MB as decoded stereo at 48 kHz (D71).
 */
const PHONE_RATE = 32_000

/** One looping track, whichever way it is played. */
interface Track {
  readonly paused: boolean
  /** Starts (or resumes where it paused); resolves once sound is actually coming out. */
  play(): Promise<void>
  pause(): void
  /** Paused for a while (the other track has taken over): may also give its memory back. */
  rest(): void
  /** Stops for good. */
  close(): void
}

interface Deck {
  track: Track
  fade: GainNode
  /** Pending rest once a fade-out has finished. */
  pause: number
}

/**
 * Background music on the engine's music bus (D52, D67): one looping track for the day and one for
 * the night, picked by the board's sky level (`setNight`) and crossfaded when it changes; each
 * track resumes where it left off. Tracks are created only once audio is unlocked and a track is
 * first needed, so nothing downloads before the first click. Pauses while sound is muted and
 * resumes after. `start` can be called right away.
 *
 * Desktop streams each track with an audio element (never decoded whole). Phones play decoded
 * buffers through Web Audio instead (D71): Android shows a media notification for any audio
 * element playing longer than about 5 s, and a page cannot hide it. Only the playing track stays
 * decoded, and the music pauses while the app is in the background (there is no notification to
 * stop it from).
 */
export class MusicPlayer {
  private readonly engine: SoundEngine
  private readonly urls: Record<Slot, string>
  private readonly decoded: boolean
  private timer = 0
  private decks: Partial<Record<Slot, Deck>> = {}
  /** The track the sky asks for, and the one currently faded in. */
  private want: Slot = 'day'
  private active: Slot | null = null
  /** Bumped on every switch, so a late start from an old switch does nothing. */
  private switchId = 0

  constructor(
    engine: SoundEngine,
    urls: Record<Slot, string> = { day: DAY_TRACK, night: NIGHT_TRACK },
    decoded = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false,
  ) {
    this.engine = engine
    this.urls = urls
    this.decoded = decoded
  }

  start(): void {
    if (this.timer) return
    this.timer = window.setInterval(() => this.tick(), TICK_MS)
    document.addEventListener('visibilitychange', this.onVisibility)
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
    document.removeEventListener('visibilitychange', this.onVisibility)
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
          deck.track.close()
          deck.fade.disconnect()
        },
        FADE_OUT_S * 1000 + 100,
      )
    }
  }

  // The interval barely runs in a background tab: react to leaving and coming back right away.
  private readonly onVisibility = (): void => this.tick()

  private tick(): void {
    if (!this.timer) return
    const io = this.engine.backgroundOut('music')
    if (!io || (this.decoded && document.hidden)) {
      // Not unlocked yet, muted, or a phone app in the background: hold the tracks where they are.
      for (const deck of Object.values(this.decks)) if (!deck.track.paused) deck.track.pause()
      return
    }
    if (this.active !== this.want) this.switchTo(this.want, io)
    const deck = this.active && this.decks[this.active]
    if (deck?.track.paused) void deck.track.play().catch(() => {})
  }

  /** Starts `slot` and, once it is actually playing, fades it in and the other track out. */
  private switchTo(slot: Slot, io: { ctx: AudioContext; out: AudioNode }): void {
    const from = this.active ? this.decks[this.active] : undefined
    const deck = (this.decks[slot] ??= this.createDeck(slot, io))
    this.active = slot
    const id = ++this.switchId
    window.clearTimeout(deck.pause)
    const seconds = from ? CROSSFADE_S : FADE_IN_S
    // The old track keeps playing until the new one sounds, so the switch never goes silent.
    void deck.track
      .play()
      .then(() => {
        if (id !== this.switchId) return
        const t = io.ctx.currentTime
        ramp(deck.fade, 1, t, seconds)
        if (!from) return
        ramp(from.fade, 0, t, seconds)
        window.clearTimeout(from.pause)
        from.pause = window.setTimeout(() => from.track.rest(), seconds * 1000 + 200)
      })
      .catch(() => {})
  }

  private createDeck(slot: Slot, io: { ctx: AudioContext; out: AudioNode }): Deck {
    const fade = io.ctx.createGain()
    fade.gain.value = 0
    fade.connect(io.out)
    const url = this.urls[slot]
    const track = this.decoded ? new BufferTrack(io.ctx, url, fade) : new ElementTrack(io.ctx, url, fade)
    return { track, fade, pause: 0 }
  }
}

/** Streams the file with an audio element: light on memory, but phones show a media notification. */
class ElementTrack implements Track {
  private readonly el: HTMLAudioElement

  constructor(ctx: AudioContext, url: string, out: AudioNode) {
    this.el = new Audio(url)
    this.el.loop = true
    this.el.preload = 'auto'
    ctx.createMediaElementSource(this.el).connect(out)
  }

  get paused(): boolean {
    return this.el.paused
  }

  play(): Promise<void> {
    const el = this.el
    const sounding = !el.paused && el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
    const started = sounding
      ? Promise.resolve()
      : new Promise<void>((resolve) => el.addEventListener('playing', () => resolve(), { once: true }))
    void el.play().catch(() => {})
    return started
  }

  pause(): void {
    this.el.pause()
  }

  rest(): void {
    this.el.pause()
  }

  close(): void {
    this.el.pause()
    this.el.removeAttribute('src')
    this.el.load()
  }
}

/**
 * Fetches and decodes the whole file (mono, `PHONE_RATE`), then loops it with a buffer source.
 * Remembers its place across pauses; `rest` drops the decoded audio and decodes it again when it
 * next plays (the file itself stays in the HTTP and service worker caches).
 */
class BufferTrack implements Track {
  private readonly ctx: AudioContext
  private readonly url: string
  private readonly out: AudioNode
  private buffer: AudioBuffer | null = null
  private loading: Promise<AudioBuffer> | null = null
  private source: AudioBufferSourceNode | null = null
  /** Where in the track playback resumes (s), and the context time the current run started at. */
  private offset = 0
  private startedAt = 0
  /** Wanted playing (`play` called, no `pause` since), even while still decoding. */
  private wanted = false
  /**
   * The audio element this track falls back to when fetching or decoding fails, for example when a
   * download manager (IDM) takes over the fetch and the page gets an empty 204: music then streams
   * as on desktop, notification and all, rather than not at all.
   */
  private fallback: ElementTrack | null = null

  constructor(ctx: AudioContext, url: string, out: AudioNode) {
    this.ctx = ctx
    this.url = url
    this.out = out
  }

  get paused(): boolean {
    return this.fallback ? this.fallback.paused : !this.wanted
  }

  async play(): Promise<void> {
    this.wanted = true
    if (this.fallback) return this.fallback.play()
    if (this.source) return
    let buffer: AudioBuffer
    try {
      buffer = this.buffer ?? (await (this.loading ??= this.decode()))
    } catch {
      this.fallback ??= new ElementTrack(this.ctx, this.url, this.out)
      if (this.wanted) return this.fallback.play()
      return
    }
    // Paused or played again while decoding: that call (or the pause) wins.
    if (!this.wanted || this.source) return
    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.connect(this.out)
    source.start(0, this.offset % buffer.duration)
    this.startedAt = this.ctx.currentTime
    this.source = source
  }

  pause(): void {
    this.wanted = false
    this.fallback?.pause()
    const source = this.source
    if (!source) return
    this.source = null
    const length = source.buffer?.duration ?? 1
    this.offset = (this.offset + this.ctx.currentTime - this.startedAt) % length
    source.stop()
    source.disconnect()
  }

  rest(): void {
    this.pause()
    this.buffer = null
    // A decode still in flight is dropped too when it lands, unless the track is wanted again by then.
    void this.loading?.then(
      () => {
        if (!this.wanted) this.buffer = null
      },
      () => {},
    )
  }

  close(): void {
    this.pause()
    this.fallback?.close()
    this.buffer = null
  }

  private async decode(): Promise<AudioBuffer> {
    try {
      const res = await fetch(this.url)
      if (res.status !== 200) throw new Error(`music: ${res.status}`)
      const data = await res.arrayBuffer()
      // An offline context at the phone rate resamples while decoding; then fold stereo to mono.
      const raw = await new OfflineAudioContext(1, 1, PHONE_RATE).decodeAudioData(data)
      const mono = new AudioBuffer({ length: raw.length, numberOfChannels: 1, sampleRate: raw.sampleRate })
      const dest = mono.getChannelData(0)
      for (let c = 0; c < raw.numberOfChannels; c++) {
        const src = raw.getChannelData(c)
        for (let i = 0; i < src.length; i++) dest[i]! += src[i]! / raw.numberOfChannels
      }
      this.buffer = mono
      return mono
    } finally {
      this.loading = null
    }
  }
}

/** Eases a gain to `to`, about there after `seconds`. */
function ramp(node: GainNode, to: number, t: number, seconds: number): void {
  node.gain.cancelScheduledValues(t)
  node.gain.setValueAtTime(node.gain.value, t)
  node.gain.setTargetAtTime(to, t, seconds / 3)
}
