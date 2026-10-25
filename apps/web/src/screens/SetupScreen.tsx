import { useState } from 'react'
import { PIECES, tokenColors, type PieceKind } from '@skyline/board'
import type { PresetName } from '@skyline/engine'
import { loadGame, type GameSetup, type SavedGame, type SeatSetup } from '../game/setup.ts'
import { cssHex } from '../spaceInfo.ts'
import { Btn, Eyebrow, TokenAvatar } from './game/ui.tsx'
import { SetupBackdrop } from './SetupBackdrop.tsx'

const MODES: { preset: PresetName; label: string; blurb: string; color: string; ink: string }[] = [
  {
    preset: 'standard',
    label: 'Standard',
    blurb: '2 dealt properties, 30 rounds, richest wins. About an hour.',
    color: '#f5b54a',
    ink: '#1c1205',
  },
  {
    preset: 'turbo',
    label: 'Turbo',
    blurb: '4 dealt properties, bigger salary, 20 rounds. Quick and punchy.',
    color: '#fb7185',
    ink: '#3a0c14',
  },
  {
    preset: 'classic',
    label: 'Classic',
    blurb: 'The full game. Last player standing wins.',
    color: '#6366f1',
    ink: '#ffffff',
  },
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

/** Space the floating setup panel takes on wide screens (32 margin + 540 panel); the backdrop frames the board in the rest. */
const PANEL_WIDTH = 580

const randomSeed = () => Math.floor(Math.random() * 1_000_000) // UI only: picks the game seed

const SEG_ON = 'bg-accent text-accent-ink'
const SEG_OFF = 'text-ink-muted hover:bg-white/5 hover:text-ink'
/** Shared press feel and focus ring for segmented buttons. */
const SEG_FX =
  'transition-[background-color,color,scale] duration-200 ease-spring active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

export function SetupScreen({ onStart }: { onStart: (setup: GameSetup, saved?: SavedGame) => void }) {
  const [saved] = useState(loadGame)
  const [preset, setPreset] = useState<PresetName>('standard')
  const [seats, setSeats] = useState<SeatSetup[]>(() => defaultSeats(4))
  const [seed, setSeed] = useState(randomSeed)
  const [citySeed, setCitySeed] = useState(randomSeed)

  const resize = (n: number) =>
    setSeats((prev) => {
      const fresh = defaultSeats(n)
      return fresh.map((seat, i) => prev[i] ?? seat)
    })
  const update = (i: number, patch: Partial<SeatSetup>) =>
    setSeats((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)))

  const cityPill = <CityPill citySeed={citySeed} onReroll={() => setCitySeed(randomSeed())} />

  return (
    <div className="relative h-full bg-table">
      <SetupBackdrop citySeed={citySeed} panelWidth={PANEL_WIDTH} />
      {/* The next game's city: bottom right of the board area on wide screens. */}
      <div className="absolute right-10 bottom-10 z-10 hidden lg:block">{cityPill}</div>
      <div className="relative flex h-full justify-center overflow-y-auto p-3 sm:p-6 lg:w-[580px] lg:justify-start lg:overflow-visible lg:p-8">
        <section
          aria-label="New game setup"
          className="my-auto flex w-full max-w-xl animate-rise flex-col gap-4 rounded-[28px] border border-line bg-panel p-5 shadow-panel-lg sm:p-7 lg:my-0 lg:h-full lg:max-w-none lg:overflow-y-auto"
        >
          <div className="flex flex-col gap-1">
            <h1 className="flex items-center gap-3 font-display text-[40px] leading-tight font-bold">
              <svg width="40" height="34" viewBox="0 0 26 22" aria-hidden="true">
                <path
                  d="M1 21 V13 H6 V21 M8 21 V5 H14 V21 M16 21 V9 H21 V21 M23 21 V15 H25"
                  fill="none"
                  stroke="#f5b54a"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <circle cx="11" cy="9" r="1" fill="#ffcf70" />
                <circle cx="11" cy="13" r="1" fill="#ffcf70" />
                <circle cx="18.5" cy="13" r="1" fill="#ffcf70" />
              </svg>
              Skyline
            </h1>
            <p className="text-[15px] text-ink-muted">Build the city. Bankrupt your rivals.</p>
          </div>

          <div className="lg:hidden">{cityPill}</div>

          {saved && (
            <div className="flex items-stretch overflow-hidden rounded-[14px] bg-card font-card-body text-card-ink shadow-card">
              <span className="flex flex-1 flex-col gap-0.5 px-4 py-3">
                <span className="font-card text-[17px] font-extrabold">Resume your last game</span>
                <span className="text-xs text-card-muted">
                  {saved.setup.seats.length} players ·{' '}
                  {MODES.find((m) => m.preset === saved.setup.preset)?.label} · {saved.actions.length} moves
                  played
                </span>
              </span>
              <span aria-hidden="true" className="my-2 w-0 border-l-2 border-dashed border-[#d8cfbb]" />
              <button
                type="button"
                onClick={() => onStart(saved.setup, saved)}
                className="px-5 font-card text-base font-extrabold text-[#9a7322] transition-colors hover:bg-black/[0.06] hover:text-[#7a5a14] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Continue →
              </button>
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            <Eyebrow className="text-ink-muted">Mode</Eyebrow>
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              {MODES.map((m) => {
                const on = preset === m.preset
                return (
                  <button
                    key={m.preset}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPreset(m.preset)}
                    className={`relative flex flex-col overflow-hidden rounded-[14px] bg-card text-left font-card-body text-card-ink transition-[translate,box-shadow,scale] duration-200 ease-spring active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      on
                        ? '-translate-y-1 shadow-[0_0_0_3px_#f5b54a,0_14px_26px_rgba(2,6,16,0.5)]'
                        : 'shadow-[0_8px_18px_rgba(2,6,16,0.4),0_2px_0_#e4dccb] hover:-translate-y-1 hover:shadow-[0_12px_22px_rgba(2,6,16,0.45),0_2px_0_#e4dccb]'
                    }`}
                  >
                    <span
                      className="block w-full px-3 py-2.5 font-card text-[17px] font-extrabold"
                      style={{
                        background: m.color,
                        color: m.ink,
                        backgroundImage:
                          'repeating-linear-gradient(135deg, rgba(255,255,255,0.16) 0 7px, rgba(255,255,255,0) 7px 14px)',
                      }}
                    >
                      {m.label}
                    </span>
                    <span className="px-3 pt-2.5 pb-3 text-xs leading-[1.4] text-[#3d4757]">{m.blurb}</span>
                    {on && (
                      <span
                        aria-hidden="true"
                        className="absolute top-2 right-2 flex size-[22px] items-center justify-center rounded-full bg-card"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12">
                          <path
                            d="M2 6 L5 9 L10 3"
                            fill="none"
                            stroke="#1c1205"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <Eyebrow className="text-ink-muted">Players</Eyebrow>
              <div className="flex gap-1 rounded-xl bg-table p-[3px]">
                {[2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={seats.length === n}
                    onClick={() => resize(n)}
                    className={`h-[30px] w-[34px] rounded-[9px] font-display text-sm font-bold ${SEG_FX} ${seats.length === n ? SEG_ON : SEG_OFF}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {seats.map((seat, i) => (
              <div
                key={seat.id}
                className="flex items-center gap-2.5 rounded-[14px] border border-line/60 bg-white/[0.04] px-2.5 py-2"
              >
                <TokenAvatar color={cssHex(seat.color)} piece={seat.piece} size={36} />
                <input
                  value={seat.name}
                  onChange={(e) => update(i, { name: e.target.value.slice(0, 14) || ' ' })}
                  aria-label={`Player ${i + 1} name`}
                  className="h-[38px] min-w-0 flex-1 rounded-[10px] border border-line bg-table px-3 text-sm font-bold text-ink outline-none focus:border-accent/60"
                />
                <div className="flex gap-0.5 rounded-[10px] bg-table p-[3px]">
                  {(['human', 'bot'] as const).map((kind) => {
                    const on = seat.kind === kind
                    return (
                      <button
                        key={kind}
                        type="button"
                        aria-pressed={on}
                        onClick={() => update(i, { kind })}
                        className={`h-[30px] rounded-lg px-2.5 text-xs font-extrabold ${SEG_FX} ${
                          on ? SEG_ON : SEG_OFF
                        }`}
                      >
                        {kind === 'human' ? 'Human' : 'Bot'}
                      </button>
                    )
                  })}
                </div>
                <label className="relative flex h-[30px] items-center rounded-[10px] border border-line text-xs font-bold text-ink-muted transition-colors hover:bg-white/5 hover:text-ink">
                  <select
                    value={seat.piece}
                    onChange={(e) =>
                      update(i, { piece: PIECES.find((p) => p.kind === e.target.value)?.kind ?? seat.piece })
                    }
                    aria-label={`Player ${i + 1} piece`}
                    className="h-full appearance-none rounded-[10px] bg-transparent pr-6 pl-2.5 outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    {PIECES.map((p) => (
                      <option key={p.kind} value={p.kind} className="bg-panel text-ink">
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    aria-hidden="true"
                    className="pointer-events-none absolute right-2"
                  >
                    <path d="M2 4 L5 7 L8 4" fill="none" stroke="#a8b1c4" strokeWidth="1.6" />
                  </svg>
                </label>
              </div>
            ))}
          </div>

          <div className="mt-auto flex flex-col gap-3 pt-2">
            <Btn
              kind="primary"
              onClick={() =>
                onStart({
                  preset,
                  seed,
                  citySeed,
                  seats: seats.map((s) => ({ ...s, name: s.name.trim() || s.id })),
                })
              }
              className="h-16 rounded-[18px] text-xl shadow-gold-lg"
            >
              Start game
            </Btn>
            <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
              <span>Hotseat: humans take turns on this screen.</span>
              <label className="flex items-center gap-2">
                Dice seed
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value) || 0)}
                  className="w-24 rounded-md border border-line bg-table px-2 py-1 font-mono text-ink outline-none focus:border-accent/60"
                />
              </label>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

/** "Your next city · seed N" with a cream New city button. */
function CityPill({ citySeed, onReroll }: { citySeed: number; onReroll: () => void }) {
  return (
    <div className="inline-flex items-center gap-2.5 rounded-full border border-line bg-panel py-2.5 pr-3 pl-4 shadow-[0_12px_28px_rgba(2,6,16,0.5)]">
      <span className="text-[13px] text-ink-muted">
        Your next city · seed <strong className="font-extrabold text-ink tabular-nums">{citySeed}</strong>
      </span>
      <button
        type="button"
        onClick={onReroll}
        className="flex h-9 items-center gap-1.5 rounded-full bg-card px-3.5 text-[13px] font-extrabold text-card-ink shadow-keycap transition-[translate,scale,filter] duration-200 ease-spring hover:-translate-y-px hover:brightness-[1.06] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="#1f2a3d" strokeWidth="2.2" />
          <circle cx="8.5" cy="8.5" r="1.6" fill="#1f2a3d" />
          <circle cx="15.5" cy="15.5" r="1.6" fill="#1f2a3d" />
        </svg>
        New city
      </button>
    </div>
  )
}
