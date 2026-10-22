import type { Action } from '../actions.ts'
import {
  endGame,
  idOf,
  land,
  moveBy,
  netWorth,
  pay,
  release,
  rollDie,
  sendToJail,
  type Ctx,
} from '../core.ts'
import type { GameState } from '../state.ts'

/** Turn flow: rolling, doubles, jail, ending the turn, round limits. */

type Check = string | null

export function checkRoll(s: GameState, seat: number): Check {
  if (seat !== s.current) return 'not your turn'
  if (s.phase !== 'preRoll') return 'already rolled'
  if (s.pending) return 'resolve the pending decision first'
  return null
}

export function applyRoll(ctx: Ctx, seat: number): void {
  const s = ctx.s
  const p = s.players[seat]!
  const d1 = rollDie(ctx)
  const d2 = rollDie(ctx)
  const total = d1 + d2
  const isDouble = d1 === d2
  s.lastDice = [d1, d2]
  ctx.events.push({ type: 'DICE_ROLLED', playerId: idOf(s, seat), dice: [d1, d2] })

  if (p.inJail) {
    if (isDouble) {
      release(ctx, seat, 'doubles')
    } else {
      p.jailTurns++
      if (p.jailTurns < s.config.maxJailTurns) {
        s.phase = 'postRoll'
        return
      }
      // Out of attempts: the fine is forced (may become a debt), then move normally.
      pay(ctx, seat, -1, s.config.jailFine, 'jailFine')
      release(ctx, seat, 'fine')
    }
    s.doubles = 0
    s.phase = 'postRoll' // leaving jail never grants another roll
    moveBy(ctx, seat, total)
    land(ctx, seat, total)
    return
  }

  if (isDouble) {
    s.doubles++
    if (s.doubles >= 3) {
      sendToJail(ctx, seat) // third double: straight to jail, no move
      return
    }
  }
  s.phase = isDouble ? 'preRoll' : 'postRoll'
  moveBy(ctx, seat, total)
  land(ctx, seat, total) // may jail the player (which forces postRoll)
}

export function checkPayJailFine(s: GameState, seat: number): Check {
  const p = s.players[seat]!
  if (seat !== s.current || s.phase !== 'preRoll') return 'only before rolling on your turn'
  if (!p.inJail) return 'not in jail'
  if (p.cash < s.config.jailFine) return 'not enough cash'
  return null
}

export function applyPayJailFine(ctx: Ctx, seat: number): void {
  pay(ctx, seat, -1, ctx.s.config.jailFine, 'jailFine')
  release(ctx, seat, 'fine')
}

export function checkUseJailCard(s: GameState, seat: number): Check {
  const p = s.players[seat]!
  if (seat !== s.current || s.phase !== 'preRoll') return 'only before rolling on your turn'
  if (!p.inJail) return 'not in jail'
  if (p.jailCards.length === 0) return 'no card to use'
  return null
}

export function applyUseJailCard(ctx: Ctx, seat: number): void {
  const p = ctx.s.players[seat]!
  const deck = p.jailCards.shift()!
  // The card goes back to the bottom of its deck. Its id is the getOutOfJailFree card in that deck.
  ctx.s.decks[deck].push(jailCardId(deck))
  release(ctx, seat, 'card')
}

/** Card index of the get-out-of-jail card in each deck (see cards.ts). */
export function jailCardId(deck: 'chance' | 'chest'): number {
  return deck === 'chance' ? 8 : 4
}

export function checkEndTurn(s: GameState, seat: number): Check {
  if (seat !== s.current) return 'not your turn'
  if (s.phase !== 'postRoll') return 'roll first'
  if (s.pending) return 'resolve the pending decision first'
  return null
}

export function applyEndTurn(ctx: Ctx): void {
  advanceTurn(ctx)
}

/** Passes the turn to the next active player, handling rounds and the round limit. */
export function advanceTurn(ctx: Ctx): void {
  const s = ctx.s
  const n = s.players.length
  let next = s.current
  for (let i = 0; i < n; i++) {
    next = (next + 1) % n
    if (!s.players[next]!.bankrupt) break
  }
  const wrapped = next <= s.current
  s.turnCount++
  s.pending = null
  s.doubles = 0
  s.lastDice = null
  s.phase = 'preRoll'
  s.current = next
  if (wrapped) {
    s.round++
    const limit = s.config.roundLimit
    if (limit > 0 && s.round > limit) {
      endGame(ctx, richest(s), 'roundLimit')
      return
    }
    if (limit > 0 && s.round === limit) ctx.events.push({ type: 'FINAL_ROUND', round: s.round })
  }
  ctx.events.push({ type: 'TURN_STARTED', playerId: idOf(s, next), round: s.round })
}

/** Highest net worth among active players; ties go to the earlier seat. */
export function richest(s: GameState): number {
  let best = -1
  let bestWorth = -Infinity
  s.players.forEach((p, i) => {
    if (p.bankrupt) return
    const w = netWorth(s, i)
    if (w > bestWorth) {
      best = i
      bestWorth = w
    }
  })
  return best
}

export function legalTurn(s: GameState, seat: number): Action[] {
  const out: Action[] = []
  if (!checkRoll(s, seat)) out.push({ type: 'ROLL' })
  if (!checkPayJailFine(s, seat)) out.push({ type: 'PAY_JAIL_FINE' })
  if (!checkUseJailCard(s, seat)) out.push({ type: 'USE_JAIL_CARD' })
  if (!checkEndTurn(s, seat)) out.push({ type: 'END_TURN' })
  return out
}
