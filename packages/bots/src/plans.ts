import {
  GROUPS,
  HOTEL,
  SPACES,
  isOwnable,
  legalActions,
  mortgageValue,
  ownsGroup,
  reduce,
  rentFor,
  seatOf,
  type Action,
  type GameState,
} from '@skyline/engine'

/**
 * Multi-step conveniences ("Build evenly", "Raise ₵320") planned by simulating the engine, so a
 * plan only ever contains actions `reduce` accepts in that order. The store dispatches them one
 * by one; nothing here bypasses the rules.
 */

export interface Plan {
  actions: Action[]
  /** Cash spent (building) or raised (selling, mortgaging). */
  amount: number
}

type SpaceAction = Extract<Action, { space: number }>

/** Raises every property in a color group by one level: one house each, or the hotels. */
export function buildEvenlyPlan(s: GameState, playerId: string, group: number): Plan {
  const spaces = GROUPS[group]!
  const target = Math.min(...spaces.map((i) => s.houses[i]!)) + 1
  if (target > HOTEL) return { actions: [], amount: 0 }
  return levelPlan(
    s,
    playerId,
    spaces.toSorted((a, b) => s.houses[a]! - s.houses[b]!),
    (cur, i) => cur.houses[i]! < target,
    (space) => ({ type: 'BUILD', space }),
    (i) => SPACES[i]!.houseCost,
  )
}

/** Lowers every property in a color group by one level (the mirror of `buildEvenlyPlan`). */
export function sellEvenlyPlan(s: GameState, playerId: string, group: number): Plan {
  const spaces = GROUPS[group]!
  const target = Math.max(...spaces.map((i) => s.houses[i]!)) - 1
  if (target < 0) return { actions: [], amount: 0 }
  return levelPlan(
    s,
    playerId,
    spaces.toSorted((a, b) => s.houses[b]! - s.houses[a]!),
    (cur, i) => cur.houses[i]! > target,
    (space) => ({ type: 'SELL_BUILDING', space }),
    (i) => SPACES[i]!.houseCost / 2,
  )
}

function levelPlan(
  s: GameState,
  playerId: string,
  order: readonly number[],
  wants: (cur: GameState, space: number) => boolean,
  make: (space: number) => SpaceAction,
  value: (space: number) => number,
): Plan {
  let cur = s
  const actions: Action[] = []
  let amount = 0
  for (const i of order) {
    if (!wants(cur, i)) continue
    const a = make(i)
    const r = reduce(cur, playerId, a)
    if (!r.ok) continue
    cur = r.state
    actions.push(a)
    amount += value(i)
  }
  return { actions, amount }
}

/** What one sell or mortgage action raises. */
export function raiseValue(a: Action): number {
  if (a.type === 'MORTGAGE') return mortgageValue(a.space)
  if (a.type === 'SELL_BUILDING') return SPACES[a.space]!.houseCost / 2
  return 0
}

/** Everything a player could raise by selling all buildings and mortgaging everything. */
export function liquidationValue(s: GameState, playerId: string): number {
  const seat = seatOf(s, playerId)
  let total = 0
  for (let i = 0; i < SPACES.length; i++) {
    if (s.owner[i] !== seat || !isOwnable(i)) continue
    total += (s.houses[i]! * SPACES[i]!.houseCost) / 2
    if (!s.mortgaged[i]) total += mortgageValue(i)
  }
  return total
}

/**
 * Cheapest-loss way to raise at least `goal`: mortgage lone properties, stations and utilities
 * first, then sell houses where rent drops least, and only then break up full sets.
 * Pass `Infinity` to raise everything.
 */
export function raisePlan(s: GameState, playerId: string, goal: number): Plan {
  const seat = seatOf(s, playerId)
  let cur = s
  const actions: Action[] = []
  let amount = 0
  while (amount < goal) {
    let best: { a: SpaceAction; loss: number; next: GameState } | null = null
    for (const a of raiseCandidates(cur, seat)) {
      const loss = lossOf(cur, seat, a)
      if (best && loss >= best.loss) continue
      const r = reduce(cur, playerId, a)
      if (r.ok) best = { a, loss, next: r.state }
    }
    if (!best) break
    cur = best.next
    actions.push(best.a)
    amount += raiseValue(best.a)
  }
  return { actions, amount }
}

function raiseCandidates(s: GameState, seat: number): SpaceAction[] {
  const out: SpaceAction[] = []
  for (let i = 0; i < SPACES.length; i++) {
    if (s.owner[i] !== seat) continue
    if (s.houses[i]! > 0) out.push({ type: 'SELL_BUILDING', space: i })
    else if (!s.mortgaged[i]) out.push({ type: 'MORTGAGE', space: i })
  }
  return out
}

/** Lower is a smaller sacrifice. Tiers keep the order; rent breaks ties inside a tier. */
function lossOf(s: GameState, seat: number, a: SpaceAction): number {
  const sp = SPACES[a.space]!
  if (a.type === 'SELL_BUILDING') {
    const level = s.houses[a.space]!
    return 2000 + sp.rent[level]! - sp.rent[level - 1]!
  }
  const inSet = sp.kind === 'property' && ownsGroup(s, seat, sp.group)
  return (inSet ? 4000 : 0) + rentFor(s, a.space, 7)
}

/** Color groups where "Build evenly" would do something right now (the My city badge). */
export function buildableGroups(s: GameState, playerId: string): number {
  const groups = new Set(
    legalActions(s, playerId).flatMap((a) => (a.type === 'BUILD' ? [SPACES[a.space]!.group] : [])),
  )
  return groups.size
}
