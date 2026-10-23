import { useState } from 'react'
import { PIECES, tokenColors, type PieceKind } from '@skyline/board'
import type { PresetName } from '@skyline/engine'
import { loadGame, type GameSetup, type SavedGame, type SeatSetup } from '../game/setup.ts'
import { cssHex } from '../spaceInfo.ts'

const MODES: { preset: PresetName; label: string; blurb: string }[] = [
  {
    preset: 'standard',
    label: 'Standard',
    blurb: '2 dealt properties, 30 rounds, richest wins. About an hour.',
  },
  {
    preset: 'turbo',
    label: 'Turbo',
    blurb: '4 dealt properties, bigger salary, 20 rounds. Quick and punchy.',
  },
  { preset: 'classic', label: 'Classic', blurb: 'The full game. Last player standing wins.' },
]

const NAMES = ['You', 'Nova', 'Atlas', 'Juno', 'Orion', 'Vega']
const DEFAULT_PIECES: PieceKind[] = ['taxi', 'drone', 'balloon', 'bus', 'pawn', 'taxi']

function defaultSeats(n: number): SeatSetup[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: NAMES[i]!,
    kind: i === 0 ? 'human' : 'bot',
    piece: DEFAULT_PIECES[i]!,
    color: tokenColors[i]!,
  }))
}

const randomSeed = () => Math.floor(Math.random() * 1_000_000) // UI only: picks the game seed

export function SetupScreen({ onStart }: { onStart: (setup: GameSetup, saved?: SavedGame) => void }) {
  const [saved] = useState(loadGame)
  const [preset, setPreset] = useState<PresetName>('standard')
  const [seats, setSeats] = useState<SeatSetup[]>(() => defaultSeats(4))
  const [seed, setSeed] = useState(randomSeed)

  const resize = (n: number) =>
    setSeats((prev) => {
      const fresh = defaultSeats(n)
      return fresh.map((seat, i) => prev[i] ?? seat)
    })
  const update = (i: number, patch: Partial<SeatSetup>) =>
    setSeats((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)))

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-2xl animate-rise">
        <h1 className="text-4xl font-bold tracking-tight text-accent">Skyline</h1>
        <p className="mt-1 text-ink-muted">Build the city. Bankrupt your rivals.</p>

        {saved && (
          <button
            type="button"
            onClick={() => onStart(saved.setup, saved)}
            className="mt-6 flex w-full items-center justify-between rounded-xl border border-accent/40 bg-accent/10 px-5 py-4 text-left transition-transform hover:bg-accent/15 active:scale-[0.99]"
          >
            <span>
              <span className="block font-semibold text-ink">Resume your last game</span>
              <span className="text-sm text-ink-muted">
                {saved.setup.seats.length} players · {saved.setup.preset} · {saved.actions.length} moves
                played
              </span>
            </span>
            <span className="text-accent">Continue →</span>
          </button>
        )}

        <h2 className="mt-8 mb-3 text-xs font-semibold tracking-widest text-ink-muted uppercase">Mode</h2>
        <div className="grid grid-cols-3 gap-3">
          {MODES.map((m) => (
            <button
              key={m.preset}
              type="button"
              aria-pressed={preset === m.preset}
              onClick={() => setPreset(m.preset)}
              className={`rounded-xl border p-4 text-left transition-transform active:scale-[0.98] ${
                preset === m.preset ? 'border-accent bg-accent/10' : 'border-line bg-panel hover:bg-panel-2'
              }`}
            >
              <div className="font-semibold text-ink">{m.label}</div>
              <div className="mt-1 text-xs leading-relaxed text-ink-muted">{m.blurb}</div>
            </button>
          ))}
        </div>

        <div className="mt-8 mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-widest text-ink-muted uppercase">Players</h2>
          <div className="flex gap-1">
            {[2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={seats.length === n}
                onClick={() => resize(n)}
                className={`size-8 rounded-md text-sm ${seats.length === n ? 'bg-accent text-table' : 'bg-white/5 text-ink hover:bg-white/10'}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {seats.map((seat, i) => (
            <div
              key={seat.id}
              className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2"
            >
              <span className="size-6 shrink-0 rounded-full" style={{ background: cssHex(seat.color) }} />
              <input
                value={seat.name}
                onChange={(e) => update(i, { name: e.target.value.slice(0, 14) || ' ' })}
                aria-label={`Player ${i + 1} name`}
                className="w-28 rounded-md bg-transparent px-2 py-1 text-ink outline-none focus:bg-white/5"
              />
              <button
                type="button"
                onClick={() => update(i, { kind: seat.kind === 'human' ? 'bot' : 'human' })}
                className={`w-20 rounded-md px-2 py-1 text-xs font-medium ${
                  seat.kind === 'human' ? 'bg-sky/20 text-sky' : 'bg-white/5 text-ink-muted'
                }`}
              >
                {seat.kind === 'human' ? 'Human' : 'Bot'}
              </button>
              <select
                value={seat.piece}
                onChange={(e) =>
                  update(i, { piece: PIECES.find((p) => p.kind === e.target.value)?.kind ?? seat.piece })
                }
                aria-label={`Player ${i + 1} piece`}
                className="ml-auto rounded-md bg-white/5 px-2 py-1 text-sm text-ink outline-none"
              >
                {PIECES.map((p) => (
                  <option key={p.kind} value={p.kind} className="bg-panel">
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="mt-8 flex items-center gap-3">
          <button
            type="button"
            onClick={() =>
              onStart({ preset, seed, seats: seats.map((s) => ({ ...s, name: s.name.trim() || s.id })) })
            }
            className="flex-1 rounded-xl bg-accent py-3.5 text-lg font-semibold text-table shadow-lg shadow-accent/25 transition-transform hover:brightness-110 active:scale-[0.98]"
          >
            Start game
          </button>
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            Seed
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value) || 0)}
              className="w-24 rounded-md bg-white/5 px-2 py-1.5 font-mono text-ink outline-none"
            />
          </label>
        </div>
        <p className="mt-6 text-center text-xs text-ink-muted">
          Hotseat: humans take turns on this screen. Board playground at{' '}
          <a href="#playground" className="text-accent underline">
            #playground
          </a>
          .
        </p>
      </div>
    </div>
  )
}
