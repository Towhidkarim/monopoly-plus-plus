import type { Layer } from './catalog.ts'

/**
 * Plays one layer of a sound into `out` at time `t0` (AudioContext seconds). `rate` is the
 * pitch multiplier (2 = an octave up) and `length` stretches envelopes. Returns when the
 * layer will be silent, so the voice can be cleaned up.
 */
export function playLayer(
  ctx: BaseAudioContext,
  out: AudioNode,
  layer: Layer,
  t0: number,
  rate: number,
  length: number,
  samples: (file: string) => AudioBuffer | undefined,
): number {
  const gain = layer.gain ?? 1
  switch (layer.kind) {
    case 'sample': {
      const file = layer.files[Math.floor(Math.random() * layer.files.length)]!
      const buffer = samples(file)
      if (!buffer) return t0
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.playbackRate.value = rate * (layer.rate ?? 1)
      const g = ctx.createGain()
      g.gain.value = gain
      src.connect(g).connect(out)
      src.start(t0)
      return t0 + buffer.duration / src.playbackRate.value
    }
    case 'tone': {
      const decay = (layer.decayMs * length) / 1000
      const attack = (layer.attackMs ?? 4) / 1000
      const osc = ctx.createOscillator()
      osc.type = layer.wave
      osc.frequency.setValueAtTime(layer.freq * rate, t0)
      if (layer.to !== undefined)
        osc.frequency.exponentialRampToValueAtTime(
          layer.to * rate,
          t0 + ((layer.glideMs ?? layer.decayMs) * length) / 1000,
        )
      const env = envelope(ctx, t0, attack, decay, gain)
      let node: AudioNode = osc
      if (layer.lowpass) node = node.connect(filter(ctx, 'lowpass', layer.lowpass, 0.7))
      node.connect(env).connect(out)
      osc.start(t0)
      osc.stop(t0 + attack + decay + 0.05)
      return t0 + attack + decay
    }
    case 'bell': {
      // Two-operator FM: a sine carrier whose frequency is wobbled by a sine modulator.
      // Integer ratios ring like chimes; odd ones (1.41, 3.5) clank like metal.
      const decay = (layer.decayMs * length) / 1000
      const f = layer.freq * rate
      const carrier = ctx.createOscillator()
      carrier.frequency.value = f
      const mod = ctx.createOscillator()
      mod.frequency.value = f * layer.ratio
      const depth = ctx.createGain()
      depth.gain.setValueAtTime(f * layer.index, t0)
      depth.gain.exponentialRampToValueAtTime(Math.max(1, f * layer.index * 0.05), t0 + decay * 0.6)
      mod.connect(depth).connect(carrier.frequency)
      const env = envelope(ctx, t0, 0.002, decay, gain)
      carrier.connect(env).connect(out)
      carrier.start(t0)
      mod.start(t0)
      carrier.stop(t0 + decay + 0.05)
      mod.stop(t0 + decay + 0.05)
      return t0 + decay
    }
    case 'noise': {
      const decay = (layer.decayMs * length) / 1000
      const attack = ((layer.attackMs ?? 2) * length) / 1000
      const src = ctx.createBufferSource()
      src.buffer = noiseBuffer(ctx)
      src.loop = true
      const f = filter(ctx, layer.filter, layer.freq * rate, layer.q ?? 1)
      if (layer.to !== undefined)
        f.frequency.exponentialRampToValueAtTime(layer.to * rate, t0 + attack + decay)
      const env = envelope(ctx, t0, attack, decay, gain)
      src.connect(f).connect(env).connect(out)
      src.start(t0, Math.random())
      src.stop(t0 + attack + decay + 0.05)
      return t0 + attack + decay
    }
  }
}

/** Quick rise to `peak`, then an exponential fall to silence over `decay` seconds. */
function envelope(ctx: BaseAudioContext, t0: number, attack: number, decay: number, peak: number): GainNode {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay)
  return g
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q: number): BiquadFilterNode {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = Math.min(freq, ctx.sampleRate / 2 - 100)
  f.Q.value = q
  return f
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>()

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx)
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = b.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    noiseCache.set(ctx, b)
  }
  return b
}

/**
 * A short, dark room reverb made from decaying noise (no impulse file to download). Soft
 * reverb is most of what makes generated sounds feel modern instead of 8-bit.
 */
export function makeRoom(ctx: BaseAudioContext, seconds = 1.4): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds)
  const b = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = b.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < len; i++) {
      const k = i / len
      // One-pole low-pass that darkens the tail over time, like a furnished room.
      const a = 0.25 + 0.6 * k
      lp = lp * a + (Math.random() * 2 - 1) * (1 - a)
      data[i] = lp * (1 - k) ** 2.6
    }
  }
  return b
}
