/**
 * Test helpers (used by *.test.ts only). Lets tests script dice and play actions tersely.
 */
import { PRESETS, type GameConfig } from './config.ts'
import type { Action } from './actions.ts'
import type { GameEvent } from './events.ts'
import { reduce } from './reduce.ts'
import { rngStep } from './rng.ts'
import { createGame } from './setup.ts'
import { cloneState, type GameState } from './state.ts'

export const P = ['a', 'b', 'c', 'd'] as const

/** A fresh classic game (no dealt properties, no round limit) with `n` players a, b, c, ... */
export function newGame(n = 2, config: Partial<GameConfig> = {}, seed = 1): GameState {
  return createGame(
    P.slice(0, n).map((id) => ({ id, name: id.toUpperCase() })),
    seed,
    { ...PRESETS.classic, ...config },
  )
}

/** Sets the RNG so the next rolls produce exactly `rolls` (each a pair of dice). */
export function rigDice(s: GameState, ...rolls: [number, number][]): GameState {
  const want = rolls.flat()
  for (let start = 0; start < 50_000_000; start++) {
    let st = start
    let ok = true
    for (const d of want) {
      const r = rngStep(st)
      st = r.state
      if (1 + Math.floor(r.value * 6) !== d) {
        ok = false
        break
      }
    }
    if (ok) return { ...s, rng: start }
  }
  throw new Error('could not rig dice')
}

/** Applies an action, throwing on error. Returns the new state and its events. */
export function act(s: GameState, id: string, action: Action): { s: GameState; events: GameEvent[] } {
  const r = reduce(s, id, action)
  if (!r.ok) throw new Error(`${id} ${action.type}: ${r.error}`)
  return { s: r.state, events: r.events }
}

/** Expects an action to be rejected; returns the error message. */
export function reject(s: GameState, id: string, action: Action): string {
  const r = reduce(s, id, action)
  if (r.ok) throw new Error(`${id} ${action.type} should have been rejected`)
  return r.error
}

/** Returns a copy with mutations applied (for setting up scenarios). */
export function edit(s: GameState, f: (draft: GameState) => void): GameState {
  const draft = cloneState(s)
  f(draft)
  return draft
}

export function types(events: GameEvent[]): string[] {
  return events.map((e) => e.type)
}
