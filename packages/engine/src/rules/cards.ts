import { HOTEL, RAILROADS, UTILITIES } from '../board.ts'
import { deckCards, type CardEffect, type Deck } from '../cards.ts'
import { addCash, advanceTo, idOf, land, moveBy, pay, rollDie, sendToJail, type Ctx } from '../core.ts'
import { wrapSpace } from '../ring.ts'

/** Draws the top card of `deck` for `seat` and applies its effect. */
export function drawCard(ctx: Ctx, seat: number, deck: Deck, diceTotal: number): void {
  const pile = ctx.s.decks[deck]
  const cardId = pile.shift()
  if (cardId === undefined) return
  ctx.events.push({ type: 'CARD_DRAWN', playerId: idOf(ctx.s, seat), deck, cardId })
  const effect = deckCards(deck)[cardId]!.effect
  if (effect.type === 'getOutOfJailFree') {
    // Held by the player; returned to the bottom of its deck when used.
    ctx.s.players[seat]!.jailCards.push(deck)
    ctx.events.push({ type: 'JAIL_CARD_GAINED', playerId: idOf(ctx.s, seat), deck })
    return
  }
  pile.push(cardId)
  applyEffect(ctx, seat, effect, diceTotal)
}

/** Nearest space in `spaces` strictly ahead of `from`, wrapping around the ring. */
function nearestAhead(from: number, spaces: readonly number[]): number {
  let best = spaces[0]!
  let bestDist = Infinity
  for (const sp of spaces) {
    const dist = wrapSpace(sp - from) || Number.POSITIVE_INFINITY
    if (dist < bestDist) {
      best = sp
      bestDist = dist
    }
  }
  return best
}

function otherActive(ctx: Ctx, seat: number): number[] {
  return ctx.s.players.flatMap((p, i) => (p.bankrupt || i === seat ? [] : [i]))
}

function applyEffect(ctx: Ctx, seat: number, effect: CardEffect, diceTotal: number): void {
  const s = ctx.s
  switch (effect.type) {
    case 'advanceTo':
      advanceTo(ctx, seat, effect.space)
      land(ctx, seat, diceTotal)
      return
    case 'advanceToNearest': {
      const target = nearestAhead(
        s.players[seat]!.position,
        effect.kind === 'railroad' ? RAILROADS : UTILITIES,
      )
      advanceTo(ctx, seat, target)
      if (effect.kind === 'railroad') {
        land(ctx, seat, diceTotal, { railroadMultiplier: 2 })
        return
      }
      const owner = s.owner[target]!
      if (owner >= 0 && owner !== seat && !s.mortgaged[target]) {
        const dice: [number, number] = [rollDie(ctx), rollDie(ctx)]
        ctx.events.push({ type: 'DICE_ROLLED', playerId: idOf(s, seat), dice })
        land(ctx, seat, diceTotal, { utilityDiceTimesTen: dice[0] + dice[1] })
      } else {
        land(ctx, seat, diceTotal)
      }
      return
    }
    case 'moveBy':
      moveBy(ctx, seat, effect.steps)
      land(ctx, seat, diceTotal)
      return
    case 'cash':
      if (effect.amount >= 0) addCash(ctx, seat, effect.amount, 'card', -1)
      else pay(ctx, seat, -1, -effect.amount, 'card')
      return
    case 'payEachPlayer':
      for (const other of otherActive(ctx, seat)) pay(ctx, seat, other, effect.amount, 'card')
      return
    case 'collectFromEachPlayer':
      for (const other of otherActive(ctx, seat)) pay(ctx, other, seat, effect.amount, 'card')
      return
    case 'repairs': {
      let houses = 0
      let hotels = 0
      for (let i = 0; i < s.owner.length; i++) {
        if (s.owner[i] !== seat) continue
        const level = s.houses[i]!
        if (level === HOTEL) hotels++
        else houses += level
      }
      pay(ctx, seat, -1, houses * effect.perHouse + hotels * effect.perHotel, 'card')
      return
    }
    case 'goToJail':
      sendToJail(ctx, seat)
      return
    case 'getOutOfJailFree':
      return
  }
}
