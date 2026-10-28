import { GROUPS, HOTEL, isOwnable, JAIL_INDEX, RAILROADS, SPACES, UTILITIES, mortgageValue } from './board.ts'
import { BOARD_SIZE, wrapSpace } from './ring.ts'
import type { GameEvent } from './events.ts'
import { randFrom, type Rand } from './rng.ts'
import type { CashReason, GameState } from './state.ts'
import { drawCard } from './rules/cards.ts'
import { underdogBonus } from './rules/underdog.ts'

/**
 * Shared engine machinery. Handlers mutate `ctx.s`, a private draft cloned by `reduce`,
 * and push events in the order things happen.
 */
export interface Ctx {
  s: GameState
  events: GameEvent[]
  rand: Rand
}

export function makeCtx(s: GameState): Ctx {
  return {
    s,
    events: [],
    rand: randFrom(
      () => s.rng,
      (n) => (s.rng = n),
    ),
  }
}

export const idOf = (s: GameState, seat: number): string => s.players[seat]!.id
const party = (s: GameState, seat: number) => (seat < 0 ? ('bank' as const) : idOf(s, seat))

export function rollDie(ctx: Ctx): number {
  return 1 + ctx.rand.int(6)
}

// ---- money ------------------------------------------------------------------

/** Adds `delta` to a player's cash and records it. Never use for player-to-player debts. */
export function addCash(
  ctx: Ctx,
  seat: number,
  delta: number,
  reason: CashReason,
  counterparty?: number,
): void {
  if (delta === 0) return
  ctx.s.players[seat]!.cash += delta
  ctx.events.push({
    type: 'CASH_CHANGED',
    playerId: idOf(ctx.s, seat),
    delta,
    reason,
    ...(counterparty !== undefined ? { counterparty: party(ctx.s, counterparty) } : {}),
  })
}

/** Moves money now. Bank side (seat -1) is infinite; taxes/fines may feed the pot. */
function transfer(ctx: Ctx, from: number, to: number, amount: number, reason: CashReason): void {
  addCash(ctx, from, -amount, reason, to)
  if (to >= 0) addCash(ctx, to, amount, reason, from)
  else if (ctx.s.config.freeParkingPot && (reason === 'tax' || reason === 'jailFine' || reason === 'card')) {
    ctx.s.pot += amount
    ctx.events.push({ type: 'POT_CHANGED', amount: ctx.s.pot })
  }
}

/**
 * `from` owes `amount` to `to` (-1 = bank). Paid immediately when affordable and `from` has no
 * queued debts; otherwise queued as a debt the debtor must raise money for (or go bankrupt).
 */
export function pay(ctx: Ctx, from: number, to: number, amount: number, reason: CashReason): void {
  if (amount <= 0 || from === to) return
  const s = ctx.s
  // Only the payer's own unpaid debts force queueing (keeps their creditors in order).
  if (!s.debts.some((d) => d.debtor === from) && s.players[from]!.cash >= amount) {
    transfer(ctx, from, to, amount, reason)
    return
  }
  s.debts.push({ debtor: from, creditor: to, amount, reason })
  ctx.events.push({ type: 'DEBT_INCURRED', playerId: idOf(s, from), amount, creditor: party(s, to) })
}

/** Pays queued debts front to back while the debtor can afford them. */
export function settleDebts(ctx: Ctx): void {
  const s = ctx.s
  while (s.debts.length > 0) {
    const d = s.debts[0]!
    if (s.players[d.debtor]!.bankrupt) {
      s.debts.shift()
      continue
    }
    if (s.players[d.debtor]!.cash < d.amount) return
    s.debts.shift()
    transfer(ctx, d.debtor, d.creditor, d.amount, d.reason)
    if (!s.debts.some((x) => x.debtor === d.debtor)) {
      ctx.events.push({ type: 'DEBT_SETTLED', playerId: idOf(s, d.debtor) })
    }
  }
}

// ---- ownership --------------------------------------------------------------

export function ownsGroup(s: GameState, seat: number, group: number): boolean {
  return GROUPS[group]!.every((i) => s.owner[i] === seat)
}

export function groupHasBuildings(s: GameState, group: number): boolean {
  return GROUPS[group]!.some((i) => s.houses[i]! > 0)
}

/** Emits MONOPOLY_COMPLETED for every group `seat` just completed by acquiring `space`. */
export function checkMonopoly(ctx: Ctx, seat: number, space: number): void {
  const g = SPACES[space]!.group
  if (g >= 0 && ownsGroup(ctx.s, seat, g)) {
    ctx.events.push({ type: 'MONOPOLY_COMPLETED', playerId: idOf(ctx.s, seat), group: g })
  }
}

export function countOwned(s: GameState, seat: number, spaces: readonly number[]): number {
  return spaces.filter((i) => s.owner[i] === seat).length
}

export interface RentModifier {
  /** Card "nearest railroad": pay twice the normal rent. */
  railroadMultiplier?: number
  /** Card "nearest utility": pay 10x this dice total regardless of how many are owned. */
  utilityDiceTimesTen?: number
}

/** Rent owed for landing on `space` with `diceTotal`, or 0 if none is due. */
export function rentFor(s: GameState, space: number, diceTotal: number, mod: RentModifier = {}): number {
  const info = SPACES[space]!
  const owner = s.owner[space]!
  if (owner < 0 || s.mortgaged[space]) return 0
  switch (info.kind) {
    case 'property': {
      const level = s.houses[space]!
      if (level > 0) return info.rent[level]!
      const base = info.rent[0]!
      return ownsGroup(s, owner, info.group) ? base * 2 : base
    }
    case 'railroad': {
      const n = countOwned(s, owner, RAILROADS)
      return info.rent[n - 1]! * (mod.railroadMultiplier ?? 1)
    }
    case 'utility': {
      if (mod.utilityDiceTimesTen !== undefined) return mod.utilityDiceTimesTen * 10
      const n = countOwned(s, owner, UTILITIES)
      return info.rent[n - 1]! * diceTotal
    }
    default:
      return 0
  }
}

// ---- movement ---------------------------------------------------------------

/** Walks `steps` forward (or backward if negative). Pays salary when passing GO forward. */
export function moveBy(ctx: Ctx, seat: number, steps: number): void {
  const s = ctx.s
  const p = s.players[seat]!
  const path: number[] = []
  const dir = Math.sign(steps)
  for (let i = 1; i <= Math.abs(steps); i++) path.push(wrapSpace(p.position + dir * i))
  const passedGo = dir > 0 && p.position + steps >= BOARD_SIZE
  p.position = path[path.length - 1] ?? p.position
  ctx.events.push({ type: 'MOVED', playerId: idOf(s, seat), path, passedGo })
  if (passedGo) {
    const bonus = underdogBonus(s, seat) // measured before the payday
    addCash(ctx, seat, s.config.goSalary, 'salary', -1)
    addCash(ctx, seat, bonus, 'underdog', -1)
  }
}

/** Walks forward until reaching `target`. */
export function advanceTo(ctx: Ctx, seat: number, target: number): void {
  const pos = ctx.s.players[seat]!.position
  const steps = wrapSpace(target - pos) || BOARD_SIZE
  moveBy(ctx, seat, steps)
}

export function sendToJail(ctx: Ctx, seat: number): void {
  const s = ctx.s
  const p = s.players[seat]!
  p.position = JAIL_INDEX
  p.inJail = true
  p.jailTurns = 0
  ctx.events.push({ type: 'JUMPED', playerId: idOf(s, seat), to: JAIL_INDEX })
  ctx.events.push({ type: 'JAILED', playerId: idOf(s, seat) })
  if (seat === s.current) {
    s.doubles = 0
    s.phase = 'postRoll'
    s.scoutDue = false
  }
}

export function release(ctx: Ctx, seat: number, how: 'doubles' | 'fine' | 'card'): void {
  const p = ctx.s.players[seat]!
  p.inJail = false
  p.jailTurns = 0
  ctx.events.push({ type: 'RELEASED', playerId: idOf(ctx.s, seat), how })
}

/** Resolves landing on the player's current space. */
export function land(ctx: Ctx, seat: number, diceTotal: number, mod: RentModifier = {}): void {
  const s = ctx.s
  const space = s.players[seat]!.position
  const info = SPACES[space]!
  if (isOwnable(space)) {
    const owner = s.owner[space]!
    if (owner < 0) s.pending = { kind: 'buy', space }
    else if (owner !== seat) pay(ctx, seat, owner, rentFor(s, space, diceTotal, mod), 'rent')
    return
  }
  switch (info.kind) {
    case 'go':
      if (s.config.landOnGoBonus) addCash(ctx, seat, s.config.goSalary, 'salary', -1)
      return
    case 'tax':
      pay(ctx, seat, -1, info.tax, 'tax')
      return
    case 'chance':
    case 'chest':
      drawCard(ctx, seat, info.kind, diceTotal)
      return
    case 'goToJail':
      sendToJail(ctx, seat)
      return
    case 'parking':
      if (s.config.freeParkingPot && s.pot > 0) {
        addCash(ctx, seat, s.pot, 'pot', -1)
        s.pot = 0
        ctx.events.push({ type: 'POT_CHANGED', amount: 0 })
      }
      return
    default:
      return
  }
}

// ---- scoring ----------------------------------------------------------------

/** Cash plus property value (mortgaged at mortgage value) plus buildings at cost. */
export function netWorth(s: GameState, seat: number): number {
  let total = s.players[seat]!.cash
  for (let i = 0; i < BOARD_SIZE; i++) {
    if (s.owner[i] !== seat) continue
    total += s.mortgaged[i] ? mortgageValue(i) : SPACES[i]!.price
    const level = s.houses[i]!
    total += (level === HOTEL ? 5 : level) * SPACES[i]!.houseCost
  }
  return total
}

export function endGame(ctx: Ctx, winner: number, reason: 'lastStanding' | 'roundLimit'): void {
  const s = ctx.s
  s.phase = 'gameOver'
  s.winner = winner
  s.pending = null
  s.debts = []
  s.trades = []
  ctx.events.push({ type: 'GAME_OVER', winner: idOf(s, winner), reason })
}
