/**
 * Simulation harness.
 *
 *   pnpm sim [--bots heuristic,heuristic,simple,random] [--games 1000] [--preset standard] [--speed] [--csv out.csv]
 *   pnpm sim --fuzz [--games 1000] [--players 4] [--preset standard] [--check]
 *
 * Matchups rotate seats every game so seat order cannot bias win rates. Bot names: random,
 * simple, heuristic (balanced), or heuristic:<personality> (balanced, banker, tycoon, shark).
 * `--speed` turns on the Speed die twist (DECISIONS.md D62).
 * `--fuzz` plays random-legal-action games and checks invariants (Milestone 2 harness).
 */
import { writeFileSync } from 'node:fs'
import { PRESETS, playout, type PresetName } from '@skyline/engine'
import type { Bot } from './bot.ts'
import { createHeuristicBot } from './heuristic/bot.ts'
import { PERSONALITIES } from './heuristic/params.ts'
import { playMatch } from './match.ts'
import { randomBot, simpleBot } from './simple.ts'

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback
}

const games = Number(arg('games', '1000'))
const preset = arg('preset', 'standard')
const isPreset = (p: string): p is PresetName => p === 'standard' || p === 'turbo' || p === 'classic'
if (!isPreset(preset)) throw new Error(`unknown preset ${preset}; use standard, turbo, or classic`)
const config = process.argv.includes('--speed') ? { ...PRESETS[preset], speedDie: true } : PRESETS[preset]
const started = performance.now()
const perMinute = () => ((games / ((performance.now() - started) / 1000)) * 60).toFixed(0)

/** Rough wall-clock estimate per turn at 1x speed (to be corrected by real playtests). */
const HUMAN_TURN_S = Number(arg('human-turn', '30'))
const BOT_TURN_S = Number(arg('bot-turn', '6'))

function makeBot(name: string): Bot {
  if (name === 'random') return randomBot
  if (name === 'simple') return simpleBot
  const [kind, personality = 'balanced'] = name.split(':')
  const params = PERSONALITIES[personality]
  if (kind !== 'heuristic' || !params) throw new Error(`unknown bot "${name}"`)
  return createHeuristicBot(params)
}

if (process.argv.includes('--fuzz')) fuzz()
else matchups()

function matchups(): void {
  const names = arg('bots', 'heuristic,random,random,random').split(',')
  const n = names.length
  const wins = Array.from({ length: n }, () => 0)
  const rows: string[] = ['game,seed,winner_bot,rounds,turns,actions,trades,sets,bankruptcies,last_standing']
  let rounds = 0
  let turns = 0
  let trades = 0
  let proposed = 0
  let sets = 0
  let bankruptcies = 0
  let lastStanding = 0
  let unfinished = 0
  let rejected = 0
  let violations = 0
  for (let g = 0; g < games; g++) {
    // Seat k is played by names[(k + g) % n]: every bot sits in every seat equally often.
    const order = Array.from({ length: n }, (_, k) => (k + g) % n)
    const r = playMatch({ config, seed: g + 1, bots: order.map((i) => makeBot(names[i]!)) })
    const winner = r.winner >= 0 ? order[r.winner]! : -1
    if (winner >= 0) wins[winner]!++
    else unfinished++
    const alone = r.state.players.filter((p) => !p.bankrupt).length === 1
    rounds += r.state.round
    turns += r.state.turnCount
    trades += r.trades
    proposed += r.proposed
    sets += r.sets
    bankruptcies += r.bankruptcies
    if (alone) lastStanding++
    rejected += r.rejected
    if (r.violations.length > 0) violations++
    rows.push(
      [
        g,
        g + 1,
        winner >= 0 ? names[winner] : '',
        r.state.round,
        r.state.turnCount,
        r.actions,
        r.trades,
        r.sets,
        r.bankruptcies,
        alone ? 1 : 0,
      ].join(','),
    )
  }
  const avg = (v: number) => (v / games).toFixed(2)
  const turnsPerGame = turns / games
  const minutes = (humans: number) =>
    ((turnsPerGame * ((humans * HUMAN_TURN_S + (n - humans) * BOT_TURN_S) / n)) / 60).toFixed(0)
  console.log(
    `preset ${preset}${config.speedDie ? ' + speed die' : ''}, ${games} games, seats rotate each game`,
  )
  names.forEach((name, i) => {
    const share = names.filter((x) => x === name).length
    console.log(
      `  ${`${name} #${i + 1}`.padEnd(22)} won ${((wins[i]! / games) * 100).toFixed(1)}%   (fair share ${(100 / n).toFixed(1)}%${share > 1 ? `, ${share} seats share this bot` : ''})`,
    )
  })
  console.log(
    `avg rounds ${avg(rounds)}   turns ${avg(turns)}   trades ${avg(trades)} of ${avg(proposed)} proposed   sets ${avg(sets)}   bankruptcies ${avg(bankruptcies)}`,
  )
  console.log(
    `last player standing ${((lastStanding / games) * 100).toFixed(0)}%   unfinished ${unfinished}   rejected bot actions ${rejected}   games with violations ${violations}`,
  )
  console.log(
    `estimated length: 1 human + ${n - 1} bots ~${minutes(1)} min, ${n} humans ~${minutes(n)} min (assumes ${HUMAN_TURN_S}s per human turn, ${BOT_TURN_S}s per bot turn)`,
  )
  console.log(`speed ${perMinute()} games/min`)
  const csv = arg('csv', '')
  if (csv) {
    writeFileSync(csv, rows.join('\n') + '\n')
    console.log(`wrote ${csv}`)
  }
  if (violations > 0 || rejected > 0) process.exitCode = 1
}

function fuzz(): void {
  const players = Number(arg('players', '4'))
  const check = process.argv.includes('--check')
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
  const avg = (n: number) => (n / games).toFixed(1)
  console.log(
    `fuzz: preset ${preset}, ${players} players, ${games} games${check ? ' (invariants every step)' : ''}`,
  )
  console.log(`finished: ${finished}/${games}   games with violations: ${violations}`)
  console.log(
    `avg turns ${avg(totalTurns)}   avg rounds ${avg(totalRounds)}   avg actions ${avg(totalActions)}`,
  )
  console.log(`speed ${perMinute()} games/min`)
  for (const f of firstFailures) console.log(`  ${f}`)
  if (violations > 0) process.exitCode = 1
}
