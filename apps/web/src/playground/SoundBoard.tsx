import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { DEFAULT_MIX, SOUND_IDS, type Mix, type SoundId } from '../audio/catalog.ts'
import { playCues } from '../audio/connect.ts'
import { sound } from '../audio/engine.ts'
import { SEQUENCES } from '../audio/sequences.ts'
import { Slider } from './controls.tsx'

const SLIDERS: { key: keyof Mix; label: string; min: number; max: number; step: number; unit?: string }[] = [
  { key: 'gain', label: 'Volume', min: 0, max: 2, step: 0.05 },
  { key: 'pitch', label: 'Pitch', min: -12, max: 12, step: 0.5, unit: ' st' },
  { key: 'length', label: 'Length', min: 0.5, max: 2, step: 0.05, unit: '×' },
  { key: 'tone', label: 'Brightness', min: 0, max: 1, step: 0.02 },
  { key: 'reverb', label: 'Room echo', min: 0, max: 1, step: 0.02 },
  { key: 'vary', label: 'Randomness', min: 0, max: 2, step: 0.05, unit: ' st' },
]

const groups = [...new Set(SOUND_IDS.map((id) => sound.catalog[id].group))]

/**
 * Sound board (#sounds): hear every game sound, compare its variants, tune it with sliders,
 * and play short game moments to judge sounds in context. Choices are saved in this browser
 * and used by the game; "Copy changes" exports them to paste back into audio/catalog.ts.
 */
export function SoundBoard() {
  useSyncExternalStore(sound.subscribe, sound.getVersion)
  const [open, setOpen] = useState<SoundId | null>(null)
  const [copied, setCopied] = useState(false)
  const s = useSyncExternalStore(sound.subscribe, sound.getSettings)

  const copy = () => {
    void navigator.clipboard?.writeText(sound.exportOverrides()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="h-full overflow-y-auto bg-table text-ink">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <a href="#playground" className="text-sm text-ink-muted hover:text-ink">
              ← Board playground
            </a>
            <h1 className="text-2xl font-bold text-accent">Sound board</h1>
            <p className="max-w-xl text-sm text-ink-muted">
              Click a variant to hear it and choose it. Your choices are saved here and used in the game. When
              you like a set, press <span className="text-ink">Copy changes</span> and paste the result to
              Claude to make it the default.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              Volume
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={s.master}
                onChange={(e) => sound.setSettings({ master: Number(e.target.value) })}
                className="w-28 accent-accent"
              />
            </label>
            <Pill on={s.muted} onClick={() => sound.setSettings({ muted: !s.muted })}>
              {s.muted ? 'Muted' : 'Mute'}
            </Pill>
            <Pill on={false} onClick={copy}>
              {copied ? 'Copied' : `Copy changes (${sound.edited})`}
            </Pill>
            <Pill on={false} onClick={() => sound.resetOverrides()}>
              Reset all
            </Pill>
          </div>
        </header>

        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] font-semibold tracking-widest text-ink-muted uppercase">In context</h2>
          <div className="flex flex-wrap gap-2">
            {SEQUENCES.map((q) => (
              <button
                key={q.name}
                type="button"
                onClick={() => playCues(q.cues())}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3.5 py-1.5 text-sm transition hover:bg-panel-2 active:scale-95"
              >
                <PlayGlyph /> {q.name}
              </button>
            ))}
          </div>
        </section>

        {groups.map((group) => (
          <section key={group} className="flex flex-col gap-2">
            <h2 className="text-[11px] font-semibold tracking-widest text-ink-muted uppercase">{group}</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {SOUND_IDS.filter((id) => sound.catalog[id].group === group).map((id) => (
                <SoundCard
                  key={id}
                  id={id}
                  open={open === id}
                  onToggle={() => setOpen(open === id ? null : id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function SoundCard({ id, open, onToggle }: { id: SoundId; open: boolean; onToggle: () => void }) {
  const def = sound.catalog[id]
  const variant = def.variants[def.pick]!
  const mix = { ...DEFAULT_MIX, ...variant.mix }
  const spam = () => {
    for (let i = 0; i < 10; i++) sound.play(id, { delay: i * 110 })
  }
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-panel p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold">{def.label}</div>
          <div className="text-xs text-ink-muted">{def.when}</div>
        </div>
        <div className="flex shrink-0 gap-1">
          <IconBtn title="Play" onClick={() => sound.play(id)}>
            <PlayGlyph />
          </IconBtn>
          <IconBtn title="Play 10 times quickly (does it get annoying?)" onClick={spam}>
            ×10
          </IconBtn>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {def.variants.map((v, i) => (
          <Pill
            key={v.name}
            on={def.pick === i}
            onClick={() => {
              sound.pick(id, i)
              sound.play(id)
            }}
          >
            {String.fromCharCode(65 + i)} · {v.name}
          </Pill>
        ))}
      </div>
      <button type="button" onClick={onToggle} className="self-start text-xs text-ink-muted hover:text-ink">
        {open ? '▾ Hide sliders' : '▸ Tune'}
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-line pt-2.5">
          {SLIDERS.map((sl) => (
            <Slider
              key={sl.key}
              label={sl.label}
              value={mix[sl.key]}
              min={sl.min}
              max={sl.max}
              step={sl.step}
              onChange={(v) => sound.setMix(id, def.pick, { [sl.key]: v })}
              format={(v) => `${v.toFixed(2)}${sl.unit ?? ''}`}
            />
          ))}
          <div className="flex gap-2">
            <Pill on={false} onClick={() => sound.play(id)}>
              <PlayGlyph /> Hear it
            </Pill>
            <Pill on={false} onClick={() => sound.resetOverrides(id)}>
              Reset this sound
            </Pill>
          </div>
        </div>
      )}
    </div>
  )
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition active:scale-95 ${
        on ? 'bg-accent text-table' : 'border border-line bg-white/5 text-ink hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  )
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex h-8 min-w-8 items-center justify-center rounded-lg border border-line bg-white/5 px-2 text-xs transition hover:bg-white/10 active:scale-95"
    >
      {children}
    </button>
  )
}

/** Text-free play triangle (the ▶ character turns into an emoji on some systems). */
function PlayGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="shrink-0 fill-current">
      <path d="M2 1.2v7.6L8.6 5z" />
    </svg>
  )
}
