import {
  CHANCE_CARDS,
  CHEST_CARDS,
  GO_TO_JAIL_INDEX,
  JAIL_INDEX,
  RAILROADS,
  SPACES,
  UTILITIES,
  type Card,
} from '@skyline/engine'

/**
 * How often each space is landed on, from the real dice and card decks: the board as a Markov
 * chain (Ash and Bishop, "Monopoly as a Markov Process", 1972), solved by power iteration once
 * at load. States are the 40 spaces plus "in jail". Jail uses the short policy (leave on the next
 * roll); triple doubles are ignored (about 0.5% of turns), which keeps the chain small.
 */

const N = SPACES.length
const IN_JAIL = N
const STATES = N + 1

/** Probability of each two-dice total (index = total). */
export const DICE: readonly number[] = Array.from({ length: 13 }, (_, t) =>
  t < 2 ? 0 : (6 - Math.abs(t - 7)) / 36,
)

/** Expected rolls per turn: doubles roll again (1 + 1/6 + 1/36, ignoring the third-doubles jail). */
const ROLLS_PER_TURN = 1 + 1 / 6 + 1 / 36

const nextOf = (from: number, kinds: readonly number[]) => {
  for (let k = 1; k <= N; k++) if (kinds.includes((from + k) % N)) return (from + k) % N
  return from
}

/** Where a card sends a player standing on `at` (IN_JAIL for jail; `at` if it does not move). */
function cardTarget(card: Card, at: number): number {
  const e = card.effect
  switch (e.type) {
    case 'advanceTo':
      return e.space
    case 'advanceToNearest':
      return nextOf(at, e.kind === 'railroad' ? RAILROADS : UTILITIES)
    case 'moveBy':
      return (at + e.steps + N) % N
    case 'goToJail':
      return IN_JAIL
    default:
      return at
  }
}

/** Final resting distribution after landing on `space` (cards and go-to-jail resolved). */
function resolve(space: number, depth = 0): Map<number, number> {
  const out = new Map<number, number>()
  const add = (s: number, p: number) => out.set(s, (out.get(s) ?? 0) + p)
  if (space === GO_TO_JAIL_INDEX) {
    add(IN_JAIL, 1)
    return out
  }
  const kind = SPACES[space]!.kind
  if ((kind !== 'chance' && kind !== 'chest') || depth > 1) {
    add(space, 1)
    return out
  }
  const deck = kind === 'chance' ? CHANCE_CARDS : CHEST_CARDS
  for (const card of deck) {
    const t = cardTarget(card, space)
    // "Go back 3" can land on another card space: resolve one more level.
    if (t !== IN_JAIL && t !== space) for (const [s, p] of resolve(t, depth + 1)) add(s, p / deck.length)
    else add(t, 1 / deck.length)
  }
  return out
}

function transitions(): number[][] {
  const m = Array.from({ length: STATES }, () => Array.from({ length: STATES }, () => 0))
  for (let from = 0; from < STATES; from++) {
    const start = from === IN_JAIL ? JAIL_INDEX : from
    for (let total = 2; total <= 12; total++) {
      for (const [to, p] of resolve((start + total) % N)) m[from]![to]! += DICE[total]! * p
    }
  }
  return m
}

function stationary(m: number[][]): number[] {
  let v = Array.from({ length: STATES }, () => 1 / STATES)
  for (let iter = 0; iter < 500; iter++) {
    const next = Array.from({ length: STATES }, () => 0)
    for (let i = 0; i < STATES; i++) for (let j = 0; j < STATES; j++) next[j]! += v[i]! * m[i]![j]!
    v = next
  }
  return v
}

const PI = stationary(transitions())

/** Share of all rolls that end on each space (index 40 = in jail). Sums to 1. */
export const LANDING_SHARE: readonly number[] = PI

/** Expected landings per space during one opponent turn. */
export const LANDING: readonly number[] = PI.slice(0, N).map((p) => p * ROLLS_PER_TURN)
