import type { Action } from './actions.ts'
import { isOwnable } from './board.ts'
import type { GameConfig } from './config.ts'
import { checkCashEvents, checkInvariants } from './invariants.ts'
import { legalActions } from './legal.ts'
import { expectedActor, reduce } from './reduce.ts'
import { randFrom, seedState, type Rand } from './rng.ts'
import { BOARD_SIZE } from './ring.ts'
import { createGame } from './setup.ts'
import type { GameState } from './state.ts'

/**
 * Random-legal-action playouts for fuzzing and the simulation harness. The driver has its own
 * seeded RNG (separate from the game's), so a playout is reproducible from its seed.
 */

export interface PlayoutOptions {
  players: number
  config: GameConfig
  seed: number
  /** Stop after this many actions (a safety cap; random play can stall without a round limit). */
  maxActions: number
  /** Check invariants after every action (slower; on in tests). */
  checkEveryStep: boolean
}

export interface PlayoutResult {
  state: GameState
  actions: { playerId: string; action: Action }[]
  violations: string[]
  finished: boolean
}

export function playout(opts: PlayoutOptions): PlayoutResult {
  const ids = Array.from({ length: opts.players }, (_, i) => `p${i + 1}`)
  let s = createGame(
    ids.map((id) => ({ id, name: id })),
    opts.seed,
    opts.config,
  )
  let driver = seedState(opts.seed * 7919 + 13)
  const rand = randFrom(
    () => driver,
    (n) => (driver = n),
  )
  const actions: PlayoutResult['actions'] = []
  const violations: string[] = []

  for (let step = 0; step < opts.maxActions && s.phase !== 'gameOver'; step++) {
    const pick = chooseAction(s, rand)
    if (!pick) {
      violations.push(`step ${step}: no action available`)
      break
    }
    const r = reduce(s, pick.playerId, pick.action)
    if (!r.ok) {
      violations.push(
        `step ${step}: listed action rejected: ${pick.playerId} ${JSON.stringify(pick.action)}: ${r.error}`,
      )
      break
    }
    actions.push(pick)
    if (opts.checkEveryStep) {
      const v = [...checkInvariants(r.state), ...checkCashEvents(s, r.state, r.events)]
      if (v.length > 0) {
        violations.push(...v.map((m) => `step ${step} after ${JSON.stringify(pick.action)}: ${m}`))
        s = r.state
        break
      }
    }
    s = r.state
  }
  if (!opts.checkEveryStep) violations.push(...checkInvariants(s))
  return { state: s, actions, violations, finished: s.phase === 'gameOver' }
}

/**
 * Mostly plays the expected actor's turn actions; sometimes lets anyone manage property
 * or propose a random trade, so the any-time paths get exercised too.
 */
function chooseAction(s: GameState, rand: Rand): { playerId: string; action: Action } | null {
  const actorSeat = expectedActor(s)
  const actor = s.players[actorSeat]!.id
  const roll = rand.next()

  if (roll < 0.06) {
    const proposer = randomActiveSeat(s, rand)
    const trade = randomTrade(s, proposer, rand)
    if (trade) {
      const playerId = s.players[proposer]!.id
      if (reduce(s, playerId, trade).ok) return { playerId, action: trade }
    }
  }
  if (roll < 0.14) {
    const seat = randomActiveSeat(s, rand)
    const id = s.players[seat]!.id
    const anyTime = legalActions(s, id).filter((a) => !isTurnAction(a))
    if (anyTime.length > 0) return { playerId: id, action: anyTime[rand.int(anyTime.length)]! }
  }

  const options = legalActions(s, actor)
  if (options.length === 0) return null
  const turn = options.filter(isTurnAction)
  // Prefer moving the game forward; any-time actions only occasionally for the actor.
  const pool = turn.length > 0 && rand.next() < 0.85 ? turn : options
  return { playerId: actor, action: pool[rand.int(pool.length)]! }
}

function isTurnAction(a: Action): boolean {
  switch (a.type) {
    case 'ROLL':
    case 'BUY':
    case 'DECLINE_BUY':
    case 'BID':
    case 'PASS_BID':
    case 'PAY_JAIL_FINE':
    case 'USE_JAIL_CARD':
    case 'END_TURN':
    case 'DECLARE_BANKRUPTCY':
    case 'ACCEPT_TRADE':
    case 'REJECT_TRADE':
      return true
    default:
      return false
  }
}

function randomActiveSeat(s: GameState, rand: Rand): number {
  const active = s.players.flatMap((p, i) => (p.bankrupt ? [] : [i]))
  return active[rand.int(active.length)]!
}

function randomTrade(s: GameState, from: number, rand: Rand): Action | null {
  const others = s.players.flatMap((p, i) => (p.bankrupt || i === from ? [] : [i]))
  if (others.length === 0) return null
  const to = others[rand.int(others.length)]!
  const ownedBy = (seat: number) =>
    Array.from({ length: BOARD_SIZE }, (_, i) => i).filter((i) => isOwnable(i) && s.owner[i] === seat)
  const pickSome = (spaces: number[]) => spaces.filter(() => rand.next() < 0.3)
  const give = { spaces: pickSome(ownedBy(from)), cash: rand.next() < 0.5 ? rand.int(200) : 0, jailCards: 0 }
  const get = { spaces: pickSome(ownedBy(to)), cash: rand.next() < 0.3 ? rand.int(200) : 0, jailCards: 0 }
  return { type: 'PROPOSE_TRADE', to: s.players[to]!.id, give, get }
}
