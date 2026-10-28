import { useEffect, useEffectEvent, useState } from 'react'
import {
  DEFAULT_JUICE,
  type BoardHandle,
  type DiceThrowResult,
  type JuiceConfig,
  type SpeedFace,
} from '@skyline/board'
import { sound } from '../audio/engine.ts'
import { Button, Section, Slider, Toggle } from './controls.tsx'

type Dice = JuiceConfig['dice']
type Corner = 'br' | 'bl' | 'tr' | 'tl'

const SPEEDS = [0.25, 1, 2] as const
const CORNERS: { id: Corner; label: string }[] = [
  { id: 'bl', label: 'Bottom left' },
  { id: 'br', label: 'Bottom right' },
  { id: 'tl', label: 'Top left' },
  { id: 'tr', label: 'Top right' },
]

/** The main feel knobs with their slider ranges. */
const KNOBS: { key: keyof Dice; label: string; min: number; max: number; step: number }[] = [
  { key: 'gravity', label: 'Gravity', min: 10, max: 90, step: 1 },
  { key: 'restitution', label: 'Bounce (restitution)', min: 0, max: 0.8, step: 0.01 },
  { key: 'friction', label: 'Friction', min: 0.1, max: 1.2, step: 0.01 },
  { key: 'spin', label: 'Spin', min: 0, max: 40, step: 0.5 },
  { key: 'throwSpeed', label: 'Throw speed', min: 3, max: 18, step: 0.1 },
  { key: 'size', label: 'Size (tile units)', min: 0.4, max: 0.9, step: 0.01 },
  { key: 'hitStopMs', label: 'Hit-stop ms', min: 0, max: 120, step: 1 },
  { key: 'trauma', label: 'Shake', min: 0, max: 0.5, step: 0.01 },
  { key: 'round', label: 'Edge roundness', min: 0, max: 0.5, step: 0.01 },
  { key: 'popMs', label: 'Total shows ms', min: 200, max: 1500, step: 10 },
  { key: 'flyMs', label: 'Fly to tray ms', min: 200, max: 1200, step: 10 },
]

const SPEED_PICKS: readonly (SpeedFace | null)[] = [null, 1, 2, 3, 'bus', 'scout']
const roll = () => 1 + Math.floor(Math.random() * 6) // cosmetic playground only

/**
 * Dice trial (DECISIONS.md D38): throw the 3D dice onto the board with chosen values and seed,
 * tune the physics, and check that the faces that land are the ones asked for.
 */
export function DicePanel({ handle }: { handle: BoardHandle | null }) {
  const board = handle?.board ?? null
  const [picks, setPicks] = useState<[number | null, number | null]>([null, null])
  // Speed die: null = no third die.
  const [speedPick, setSpeedPick] = useState<SpeedFace | null>(null)
  const [seedText, setSeedText] = useState('')
  const [speed, setSpeed] = useState<number>(1)
  const [debug, setDebug] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [corner, setCorner] = useState<Corner>('br')
  const [dice, setDice] = useState<Dice>(() => ({ ...DEFAULT_JUICE.dice }))
  const [last, setLast] = useState<{ want: [number, number]; got: DiceThrowResult; bounces: number } | null>(
    null,
  )
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    board?.setDiceDebug(debug)
  }, [board, debug])

  const tune = (key: keyof Dice, value: number) => {
    const next = { ...dice, [key]: value }
    setDice(next)
    if (board) board.setJuice({ ...board.juice, dice: next })
  }

  const throwDice = async () => {
    if (!handle || !board) return
    const want: [number, number] = [picks[0] ?? roll(), picks[1] ?? roll()]
    const typed = Number.parseInt(seedText, 10)
    const { width, height } = handle.app.screen
    const tray = {
      x: corner.endsWith('l') ? 90 : width - 90,
      y: corner.startsWith('t') ? 70 : height - 70,
      size: 36,
    }
    setBusy(true)
    let bounces = 0
    const got = await board.throwDice({
      values: want,
      ...(speedPick === null ? {} : { speedFace: speedPick }),
      ...(Number.isFinite(typed) ? { seed: typed } : {}),
      speed,
      tray,
      onBounce: (intensity) => {
        // One real recorded throw (Kenney casino dice) from the first touchdown; per-bounce
        // synth clicks sounded like chirps. The recording's own clatter carries the bounces.
        if (bounces++ === 0) sound.play('dice.roll', { gain: 0.7 + intensity * 0.3, pan: 0.15 })
      },
      onSettle: (s) => {
        if (s.doubles) sound.play('dice.doubles', { delay: (dice.settleMs + 60) / speed })
        sound.play('set.pulse', { delay: dice.settleMs / speed, gain: 0.7, pitch: s.doubles ? 7 : 0 })
      },
    })
    setLast({ want, got, bounces })
    setBusy(false)
  }

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key.toLowerCase() !== 'd' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
    const el = e.target
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
    e.preventDefault()
    void throwDice()
  })
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  const match = last && last.got.values[0] === last.want[0] && last.got.values[1] === last.want[1]

  return (
    <>
      <Section title="Throw">
        <Button primary onClick={() => void throwDice()} disabled={!board}>
          Throw dice <kbd className="ml-1 font-mono text-xs opacity-70">D</kbd>
        </Button>
        {[0, 1].map((die) => (
          <fieldset key={die} className="flex items-center gap-1">
            <legend className="sr-only">Die {die + 1} value</legend>
            <span className="w-12 text-xs text-ink-muted">Die {die + 1}</span>
            {[null, 1, 2, 3, 4, 5, 6].map((v) => {
              const on = picks[die] === v
              return (
                <button
                  key={v ?? 'r'}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicks((p) => (die === 0 ? [v, p[1]] : [p[0], v]))}
                  className={`h-7 flex-1 rounded-md text-xs font-semibold transition-transform active:scale-95 ${
                    on ? 'bg-accent text-table' : 'border border-line bg-white/5 text-ink hover:bg-white/10'
                  }`}
                >
                  {v ?? '?'}
                </button>
              )
            })}
          </fieldset>
        ))}
        <fieldset className="flex items-center gap-1">
          <legend className="sr-only">Speed die face</legend>
          <span className="w-12 text-xs text-ink-muted">Speed</span>
          {SPEED_PICKS.map((v) => {
            const on = speedPick === v
            return (
              <button
                key={v ?? 'off'}
                type="button"
                aria-pressed={on}
                onClick={() => setSpeedPick(v)}
                className={`h-7 flex-1 rounded-md text-xs font-semibold transition-transform active:scale-95 ${
                  on ? 'bg-accent text-table' : 'border border-line bg-white/5 text-ink hover:bg-white/10'
                }`}
              >
                {v ?? 'off'}
              </button>
            )
          })}
        </fieldset>
        <label className="flex items-center justify-between gap-3 text-sm text-ink">
          Seed
          <input
            value={seedText}
            onChange={(e) => setSeedText(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="random"
            inputMode="numeric"
            className="w-32 rounded-md border border-line bg-white/5 px-2 py-1 text-right font-mono text-xs text-ink"
          />
        </label>
        <fieldset className="flex gap-1 rounded-lg bg-white/5 p-1 text-sm">
          <legend className="sr-only">Playback speed</legend>
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={speed === s}
              onClick={() => setSpeed(s)}
              className={`flex-1 rounded-md py-1 ${speed === s ? 'bg-accent font-semibold text-table' : 'text-ink hover:bg-white/10'}`}
            >
              {s}x
            </button>
          ))}
        </fieldset>
        <Toggle label="Show physics debug" checked={debug} onChange={setDebug} />
        <Toggle
          label="Reduced motion"
          checked={reduced}
          onChange={(v) => {
            setReduced(v)
            board?.setTuning({ reducedMotion: v })
          }}
        />
        <label className="flex items-center justify-between text-sm text-ink">
          Tray corner
          <select
            value={corner}
            onChange={(e) => setCorner(CORNERS.find((c) => c.id === e.target.value)?.id ?? 'br')}
            className="rounded-md border border-line bg-panel px-2 py-1 text-xs text-ink"
          >
            {CORNERS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </Section>

      <Section title="Last result">
        {last ? (
          <div className="flex flex-col gap-1 font-mono text-xs text-ink">
            <div className="flex justify-between">
              <span className="text-ink-muted">asked</span>
              {last.want.join(' + ')}
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">landed</span>
              <span className={match ? 'text-teal' : 'text-alert'}>
                {last.got.values.join(' + ')} = {last.got.values[0] + last.got.values[1]}{' '}
                {match ? 'match' : 'MISMATCH'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">seed</span>
              {last.got.seed}
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">release to rest</span>
              {last.got.durationMs} ms at 1x
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">clacks, tries</span>
              {last.bounces}, {last.got.tries}
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">{busy ? 'Rolling…' : 'Not thrown yet. Press D.'}</p>
        )}
      </Section>

      <Section title="Feel">
        {KNOBS.map((k) => (
          <Slider
            key={k.key}
            label={k.label}
            value={dice[k.key]}
            min={k.min}
            max={k.max}
            step={k.step}
            onChange={(v) => tune(k.key, v)}
            format={(v) => (k.step >= 1 ? String(Math.round(v)) : v.toFixed(2))}
          />
        ))}
        <Button
          onClick={() => {
            const fresh = { ...DEFAULT_JUICE.dice }
            setDice(fresh)
            if (board) board.setJuice({ ...board.juice, dice: fresh })
          }}
        >
          Reset dice feel
        </Button>
      </Section>
    </>
  )
}
