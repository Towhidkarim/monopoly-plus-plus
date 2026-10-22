/**
 * Simulation harness: `pnpm sim [--games 1000] [--players 4] [--preset standard] [--check]`.
 * Plays random-legal-action games headlessly, reports invariant violations and game lengths.
 * Bot-vs-bot matchups arrive with the bots milestone.
 */
import { PRESETS, playout, type PresetName } from '@skyline/engine'

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback
}

const games = Number(arg('games', '1000'))
const players = Number(arg('players', '4'))
const preset = arg('preset', 'standard')
const check = process.argv.includes('--check')
const isPreset = (p: string): p is PresetName => p === 'standard' || p === 'turbo' || p === 'classic'
if (!isPreset(preset)) throw new Error(`unknown preset ${preset}; use standard, turbo, or classic`)
const config = PRESETS[preset]

const started = performance.now()
let finished = 0
let violations = 0
let totalTurns = 0
let totalRounds = 0
let totalActions = 0
const firstFailures: string[] = []

for (let seed = 1; seed <= games; seed++) {
  const r = playout({ players, config, seed, maxActions: 30_000, checkEveryStep: check })
  if (r.finished) finished++
  totalTurns += r.state.turnCount
  totalRounds += r.state.round
  totalActions += r.actions.length
  if (r.violations.length > 0) {
    violations++
    if (firstFailures.length < 5) firstFailures.push(`seed ${seed}: ${r.violations[0]}`)
  }
}

const seconds = (performance.now() - started) / 1000
const avg = (n: number) => (n / games).toFixed(1)
console.log(`preset ${preset}, ${players} players, ${games} games${check ? ' (invariants every step)' : ''}`)
console.log(`finished:        ${finished}/${games}`)
console.log(`games with violations: ${violations}`)
console.log(
  `avg turns:       ${avg(totalTurns)}   avg rounds: ${avg(totalRounds)}   avg actions: ${avg(totalActions)}`,
)
console.log(
  `speed:           ${(games / seconds).toFixed(0)} games/s (${((games / seconds) * 60).toFixed(0)} games/min)`,
)
for (const f of firstFailures) console.log(`  ${f}`)
if (violations > 0) process.exitCode = 1
