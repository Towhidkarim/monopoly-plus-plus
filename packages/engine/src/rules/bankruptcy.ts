import type { Action } from '../actions.ts'
import { HOTEL, SPACES } from '../board.ts'
import { addCash, checkMonopoly, endGame, idOf, type Ctx } from '../core.ts'
import { BOARD_SIZE } from '../ring.ts'
import { activePlayers, type GameState } from '../state.ts'
import { advanceTurn, jailCardId } from './turn.ts'

/**
 * Declaring bankruptcy while in debt. Buildings are sold back to the bank at half cost first.
 * To a player: they get the cash, properties (mortgages kept), and jail cards.
 * To the bank: properties return unowned and unmortgaged; jail cards go back to their decks.
 */

export function checkBankruptcy(s: GameState, seat: number): string | null {
  if (s.debts[0]?.debtor !== seat) return 'only a player who cannot pay may declare bankruptcy'
  return null
}

export function applyBankruptcy(ctx: Ctx, seat: number): void {
  const s = ctx.s
  const creditor = s.debts[0]!.creditor
  const p = s.players[seat]!
  const to = creditor >= 0 ? idOf(s, creditor) : ('bank' as const)

  for (let i = 0; i < BOARD_SIZE; i++) {
    if (s.owner[i] !== seat || s.houses[i] === 0) continue
    const level = s.houses[i]!
    if (level === HOTEL) s.bankHotels++
    else s.bankHouses += level
    s.houses[i] = 0
    ctx.events.push({ type: 'SOLD_BUILDING', playerId: p.id, space: i, level: 0 })
    addCash(ctx, seat, ((level === HOTEL ? 5 : level) * SPACES[i]!.houseCost) / 2, 'sellBuilding', -1)
  }

  if (p.cash > 0) {
    if (creditor >= 0) {
      addCash(ctx, creditor, p.cash, 'bankruptcy', seat)
    }
    addCash(ctx, seat, -p.cash, 'bankruptcy', creditor)
  }

  for (let i = 0; i < BOARD_SIZE; i++) {
    if (s.owner[i] !== seat) continue
    if (creditor >= 0) {
      s.owner[i] = creditor
      ctx.events.push({ type: 'PROPERTY_TRANSFERRED', space: i, from: p.id, to })
      checkMonopoly(ctx, creditor, i)
    } else {
      s.owner[i] = -1
      s.mortgaged[i] = false
      ctx.events.push({ type: 'PROPERTY_TRANSFERRED', space: i, from: p.id, to })
    }
  }

  for (const deck of p.jailCards) {
    if (creditor >= 0) {
      s.players[creditor]!.jailCards.push(deck)
      ctx.events.push({ type: 'JAIL_CARD_GAINED', playerId: idOf(s, creditor), deck, from: p.id })
    } else {
      s.decks[deck].push(jailCardId(deck))
    }
  }
  p.jailCards = []
  p.bankrupt = true
  p.loan = 0 // the bank writes off an open Second Wind loan
  p.inJail = false

  s.debts = s.debts.filter((d) => d.debtor !== seat && d.creditor !== seat)
  for (const t of s.trades) {
    if (t.from === seat || t.to === seat) ctx.events.push({ type: 'TRADE_VOIDED', tradeId: t.id })
  }
  s.trades = s.trades.filter((t) => t.from !== seat && t.to !== seat)
  ctx.events.push({ type: 'BANKRUPT', playerId: p.id, to })

  const left = activePlayers(s)
  if (left.length === 1) {
    endGame(ctx, left[0]!, 'lastStanding')
    return
  }
  if (seat === s.current) advanceTurn(ctx)
}

export function legalBankruptcy(s: GameState, seat: number): Action[] {
  return checkBankruptcy(s, seat) ? [] : [{ type: 'DECLARE_BANKRUPTCY' }]
}
