import {
  CATALOG,
  DEFAULT_MIX,
  SOUND_IDS,
  sampleFiles,
  type Bus,
  type Mix,
  type SoundDef,
  type SoundId,
} from './catalog.ts'
import { readPack } from './pack.ts'
import { makeRoom, playLayer } from './synth.ts'

export interface SoundSettings {
  muted: boolean
  /** 0..1 each. */
  master: number
  sfx: number
  ui: number
  /** City ambience under the game (ambience.ts). */
  ambience: number
  /** Background music (music.ts). */
  music: number
}

export interface PlayOptions {
  /** Extra semitones (streaks climb with this). */
  pitch?: number
  /** Level multiplier. */
  gain?: number
  /** -1 (left) .. 1 (right). */
  pan?: number
  /** Start this many ms from now. */
  delay?: number
}

/** Sound board edits per sound: which variant plays and its slider values. */
export type SoundOverrides = Partial<Record<SoundId, { pick?: number; mix?: Record<number, Partial<Mix>> }>>

const SETTINGS_KEY = 'skyline.sound'
const OVERRIDES_KEY = 'skyline.sound.overrides'
/** The music track is mastered loud; this keeps it a bed under the game at any slider position. */
const MUSIC_TRIM = 0.35

const DEFAULT_SETTINGS: SoundSettings = {
  muted: false,
  master: 0.8,
  sfx: 1,
  ui: 0.7,
  ambience: 0.5,
  music: 0.45,
}
/** At most this many overlapping plays of one sound; extra ones are dropped. */
const MAX_VOICES = 6
/** Same sound twice within this window (seconds) plays once. */
const MIN_GAP = 0.018

/**
 * Web Audio mixer: sfx and ui buses into a master with a gentle compressor, plus one shared
 * room reverb. The context starts on the first user gesture (browsers require it); until then
 * every play is a silent no-op. Framework-agnostic; the shell and playground share one instance.
 */
export class SoundEngine {
  readonly catalog: Record<SoundId, SoundDef>
  settings: SoundSettings
  private overrides: SoundOverrides
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private buses: Partial<Record<Bus, GainNode>> = {}
  private ambience: GainNode | null = null
  private music: GainNode | null = null
  private room: ConvolverNode | null = null
  private readonly buffers = new Map<string, AudioBuffer>()
  private readonly voices = new Map<SoundId, number>()
  private readonly lastStart = new Map<SoundId, number>()
  private readonly listeners = new Set<() => void>()
  private version = 0

  constructor() {
    this.catalog = structuredClone(CATALOG)
    this.settings = readSettings(load(SETTINGS_KEY))
    this.overrides = readOverrides(load(OVERRIDES_KEY))
    this.applyOverrides()
  }

  /** Creates the audio context; call from a click or key handler. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const ctx = new AudioContext({ latencyHint: 'interactive' })
    this.ctx = ctx
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.knee.value = 10
    comp.ratio.value = 3
    comp.attack.value = 0.003
    comp.release.value = 0.25
    comp.connect(ctx.destination)
    this.master = ctx.createGain()
    this.master.connect(comp)
    for (const bus of ['sfx', 'ui'] as const) {
      const g = ctx.createGain()
      g.connect(this.master)
      this.buses[bus] = g
    }
    this.ambience = ctx.createGain()
    this.ambience.connect(this.master)
    this.music = ctx.createGain()
    this.music.connect(this.master)
    this.room = ctx.createConvolver()
    this.room.buffer = makeRoom(ctx)
    const ret = ctx.createGain()
    ret.gain.value = 0.9
    this.room.connect(ret).connect(this.master)
    this.applyLevels()
    void this.loadPacks()
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running'
  }

  /** The context and a background bus once audio runs and is not muted, else null. */
  backgroundOut(bus: 'ambience' | 'music'): { ctx: AudioContext; out: AudioNode } | null {
    const out = this[bus]
    if (!this.ready || !out || this.settings.muted) return null
    return { ctx: this.ctx!, out }
  }

  play(id: SoundId, o: PlayOptions = {}): void {
    const ctx = this.ctx
    const def = this.catalog[id]
    if (!ctx || !def || this.settings.muted || ctx.state !== 'running') return
    const variant = def.variants[def.pick]
    if (!variant || variant.layers.length === 0) return
    const t0 = ctx.currentTime + 0.005 + Math.max(0, o.delay ?? 0) / 1000
    if (Math.abs(t0 - (this.lastStart.get(id) ?? -1)) < MIN_GAP) return
    if ((this.voices.get(id) ?? 0) >= MAX_VOICES) return
    this.lastStart.set(id, t0)

    const mix = { ...DEFAULT_MIX, ...variant.mix }
    const semis = mix.pitch + (o.pitch ?? 0) + (Math.random() * 2 - 1) * mix.vary
    const rate = 2 ** (semis / 12)

    // voice -> level -> brightness -> pan -> bus (+ reverb send)
    const level = ctx.createGain()
    level.gain.value = mix.gain * (o.gain ?? 1)
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = Math.min(ctx.sampleRate / 2 - 100, 600 * 2 ** (mix.tone * 5.2))
    const pan = ctx.createStereoPanner()
    pan.pan.value = o.pan ?? 0
    level.connect(tone).connect(pan).connect(this.buses[def.bus]!)
    const send = ctx.createGain()
    send.gain.value = mix.reverb
    pan.connect(send).connect(this.room!)

    let end = t0
    for (const layer of variant.layers) {
      const at = t0 + ((layer.at ?? 0) * mix.length) / 1000
      end = Math.max(
        end,
        playLayer(ctx, level, layer, at, rate, mix.length, (f) => this.buffers.get(f)),
      )
    }
    this.voices.set(id, (this.voices.get(id) ?? 0) + 1)
    // Free the voice's nodes once it (and its reverb tail) is done.
    setTimeout(
      () => {
        this.voices.set(id, Math.max(0, (this.voices.get(id) ?? 1) - 1))
        level.disconnect()
        send.disconnect()
      },
      (end - ctx.currentTime + 1.6) * 1000,
    )
  }

  // ---- settings -----------------------------------------------------------

  setSettings(patch: Partial<SoundSettings>): void {
    this.settings = { ...this.settings, ...patch }
    save(SETTINGS_KEY, this.settings)
    this.applyLevels()
    this.notify()
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Changes on every settings or sound board edit (for useSyncExternalStore). */
  getVersion = (): number => this.version

  private notify(): void {
    this.version++
    for (const fn of this.listeners) fn()
  }

  private applyLevels(): void {
    const s = this.settings
    if (this.master) this.master.gain.value = s.muted ? 0 : s.master
    if (this.buses.sfx) this.buses.sfx.gain.value = s.sfx
    if (this.buses.ui) this.buses.ui.gain.value = s.ui
    if (this.ambience) this.ambience.gain.value = s.ambience
    if (this.music) this.music.gain.value = s.music * MUSIC_TRIM
  }

  // ---- sound board edits --------------------------------------------------

  /** Chooses the variant a sound plays. */
  pick(id: SoundId, index: number): void {
    this.catalog[id].pick = index
    this.overrides[id] = { ...this.overrides[id], pick: index }
    this.saveOverrides()
  }

  /** Changes one variant's sliders. */
  setMix(id: SoundId, index: number, patch: Partial<Mix>): void {
    const v = this.catalog[id].variants[index]!
    v.mix = { ...v.mix, ...patch }
    const o = this.overrides[id] ?? {}
    o.mix = { ...o.mix, [index]: { ...o.mix?.[index], ...patch } }
    this.overrides[id] = o
    this.saveOverrides()
  }

  /** Edits made on the sound board, as JSON to paste back into catalog.ts. */
  exportOverrides(): string {
    return JSON.stringify(this.overrides, null, 2)
  }

  get edited(): number {
    return Object.keys(this.overrides).length
  }

  resetOverrides(id?: SoundId): void {
    if (id) delete this.overrides[id]
    else this.overrides = {}
    const fresh: Record<SoundId, SoundDef> = structuredClone(CATALOG)
    for (const key of SOUND_IDS) if (!id || key === id) this.catalog[key] = fresh[key]
    this.applyOverrides()
    this.saveOverrides()
  }

  private applyOverrides(): void {
    for (const id of SOUND_IDS) {
      const def = this.catalog[id]
      const o = this.overrides[id]
      if (!o) continue
      if (o.pick !== undefined && o.pick < def.variants.length) def.pick = o.pick
      for (const [i, mix] of Object.entries(o.mix ?? {})) {
        const v = def.variants[Number(i)]
        if (v) v.mix = { ...v.mix, ...mix }
      }
    }
  }

  private saveOverrides(): void {
    save(OVERRIDES_KEY, this.overrides)
    this.notify()
  }

  // ---- samples ------------------------------------------------------------

  /** Fetches each sound pack the catalog uses ("casino/x.ogg" lives in casino.pack) and decodes it. */
  private async loadPacks(): Promise<void> {
    const ctx = this.ctx
    if (!ctx) return
    const packs = new Set(sampleFiles(this.catalog).map((f) => f.split('/')[0]!))
    await Promise.all(
      [...packs].map(async (pack) => {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}audio/${pack}.pack`)
          const files = readPack(await res.arrayBuffer())
          await Promise.all(
            [...files].map(async ([name, data]) => this.buffers.set(name, await ctx.decodeAudioData(data))),
          )
        } catch (err) {
          console.warn('[skyline] sound pack failed to load', pack, err)
        }
      }),
    )
  }
}

function load(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const MIX_KEYS = [
  'gain',
  'pitch',
  'length',
  'tone',
  'reverb',
  'vary',
] as const satisfies readonly (keyof Mix)[]

/** Saved settings, keeping only fields of the right type. */
function readSettings(raw: unknown): SoundSettings {
  const s = { ...DEFAULT_SETTINGS }
  if (!isRecord(raw)) return s
  if (typeof raw.muted === 'boolean') s.muted = raw.muted
  for (const k of ['master', 'sfx', 'ui', 'ambience', 'music'] as const) {
    const v = raw[k]
    if (typeof v === 'number') s[k] = Math.min(1, Math.max(0, v))
  }
  return s
}

function readMix(raw: unknown): Partial<Mix> {
  const mix: Partial<Mix> = {}
  if (!isRecord(raw)) return mix
  for (const k of MIX_KEYS) {
    const v = raw[k]
    if (typeof v === 'number') mix[k] = v
  }
  return mix
}

/** Saved sound board edits for sounds that still exist. */
function readOverrides(raw: unknown): SoundOverrides {
  const out: SoundOverrides = {}
  if (!isRecord(raw)) return out
  for (const id of SOUND_IDS) {
    const o = raw[id]
    if (!isRecord(o)) continue
    const mix: Record<number, Partial<Mix>> = {}
    if (isRecord(o.mix)) for (const [i, m] of Object.entries(o.mix)) mix[Number(i)] = readMix(m)
    out[id] = typeof o.pick === 'number' ? { pick: o.pick, mix } : { mix }
  }
  return out
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage blocked (private mode): settings just do not persist.
  }
}

/** The app's one sound engine. Unlocks itself on the first click or key press. */
export const sound = new SoundEngine()

if (typeof window !== 'undefined') {
  const unlock = () => sound.unlock()
  window.addEventListener('pointerdown', unlock, { capture: true })
  window.addEventListener('keydown', unlock, { capture: true })
}
