import type { Deck } from '../cards.ts'
import { idOf, type Ctx } from '../core.ts'

/**
 * Card drawing and effects. STUB: draws and records the card, effects not yet applied.
 * To be implemented (see the task brief in the commit/PR description).
 */
export function drawCard(ctx: Ctx, seat: number, deck: Deck, _diceTotal: number): void {
  const pile = ctx.s.decks[deck]
  const cardId = pile.shift()
  if (cardId === undefined) return
  pile.push(cardId)
  ctx.events.push({ type: 'CARD_DRAWN', playerId: idOf(ctx.s, seat), deck, cardId })
}
