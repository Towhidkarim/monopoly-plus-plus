import { CHANCE_CARDS, CHEST_CARDS } from './cards.ts'
import { GROUPS, HOTEL, isOwnable, SPACES } from './board.ts'
import type { GameEvent } from './events.ts'
import { legalActions } from './legal.ts'
import { expectedActor } from './reduce.ts'
import { BOARD_SIZE } from './ring.ts'
import type { GameState } from './state.ts'

/**
 * Structural invariants that must hold after every action. Returns a list of violations
 * (empty = healthy). Used by fuzz tests and the simulation harness.
 */
export function checkInvariants(s: GameState): string[] {
  const out: string[] = []
  const n = s.players.length

  s.players.forEach((p, i) => {
    if (p.cash < 0) out.push(`player ${i} has negative cash ${p.cash}`)
    if (p.bankrupt && (p.cash !== 0 || p.jailCards.length > 0))
      out.push(`bankrupt player ${i} still holds assets`)
    if (p.position < 0 || p.position >= BOARD_SIZE) out.push(`player ${i} off board`)
  })

  let housesOut = 0
  let hotelsOut = 0
  for (let i = 0; i < BOARD_SIZE; i++) {
    const owner = s.owner[i]!
    const level = s.houses[i]!
    if (!isOwnable(i) && owner !== -1) out.push(`space ${i} is not ownable but has owner ${owner}`)
    if (owner >= n || owner < -1) out.push(`space ${i} has invalid owner ${owner}`)
    if (owner >= 0 && s.players[owner]!.bankrupt) out.push(`space ${i} owned by bankrupt player ${owner}`)
    if (s.mortgaged[i] && owner < 0) out.push(`space ${i} mortgaged but unowned`)
    if (level < 0 || level > HOTEL) out.push(`space ${i} has invalid level ${level}`)
    if (level > 0) {
      if (SPACES[i]!.kind !== 'property') out.push(`space ${i} has buildings but is not a property`)
      const group = GROUPS[SPACES[i]!.group] ?? []
      if (!group.every((j) => s.owner[j] === owner)) out.push(`space ${i} built without the full group`)
      if (group.some((j) => s.mortgaged[j])) out.push(`space ${i} built while group has a mortgage`)
    }
    if (level === HOTEL) hotelsOut++
    else housesOut += level
  }
  if (s.config.evenBuild) {
    for (const group of GROUPS) {
      const levels = group.map((j) => s.houses[j]!)
      if (Math.max(...levels) - Math.min(...levels) > 1)
        out.push(`uneven building in group ${group.join(',')}`)
    }
  }
  if (s.bankHouses + housesOut !== s.config.houses) out.push('house count not conserved')
  if (s.bankHotels + hotelsOut !== s.config.hotels) out.push('hotel count not conserved')

  // Every card is either in its deck or held as a jail card, exactly once.
  for (const [deck, cards] of [
    ['chance', CHANCE_CARDS],
    ['chest', CHEST_CARDS],
  ] as const) {
    const held = s.players.reduce((acc, p) => acc + p.jailCards.filter((d) => d === deck).length, 0)
    const pile = s.decks[deck].filter((c) => c >= 0)
    if (new Set(pile).size !== pile.length) out.push(`${deck} deck has duplicates`)
    if (pile.length + held !== cards.length) out.push(`${deck} cards not conserved`)
  }

  if (s.phase === 'gameOver') {
    if (s.winner < 0) out.push('game over without a winner')
    return out
  }
  if (s.players[s.current]!.bankrupt) out.push('current player is bankrupt')
  for (const d of s.debts) if (s.players[d.debtor]!.bankrupt) out.push('debt owed by a bankrupt player')
  if (s.pending?.kind === 'auction') {
    const a = s.pending
    if (a.bidders.length === 0 || a.current < 0 || a.current >= a.bidders.length)
      out.push('auction bidder state invalid')
  }
  if (s.scoutDue && !s.pending && s.debts.length === 0) out.push('scout jump left unresolved')
  if (s.pending?.kind === 'move' && s.pending.options.length === 0) out.push('move choice without options')
  const actor = expectedActor(s)
  if (legalActions(s, s.players[actor]!.id).length === 0)
    out.push(`expected actor ${actor} has no legal action`)
  return out
}

/** Every cash change must be reported: the sum of CASH_CHANGED deltas equals the change in total cash. */
const totalCash = (s: GameState) => s.players.reduce((acc, p) => acc + p.cash, 0)

export function checkCashEvents(before: GameState, after: GameState, events: readonly GameEvent[]): string[] {
  const total = totalCash
  const reported = events.reduce((acc, e) => (e.type === 'CASH_CHANGED' ? acc + e.delta : acc), 0)
  const actual = total(after) - total(before)
  return reported === actual ? [] : [`cash changed by ${actual} but events report ${reported}`]
}
