import { CHANCE_CARDS, CHEST_CARDS, SPACES, type GameEvent } from '@skyline/engine'

export interface LogEntry {
  id: number
  text: string
  tone: 'normal' | 'good' | 'bad' | 'muted'
  /** Wall-clock time it was logged (for fading toasts). */
  at: number
}

/** Turns an event into a human-readable log line, or null for events not worth a line. */
const sp = (i: number) => SPACES[i]!.name

export function describe(e: GameEvent, name: (id: string) => string): Omit<LogEntry, 'id' | 'at'> | null {
  switch (e.type) {
    case 'TURN_STARTED':
      return { text: `Round ${e.round}: ${name(e.playerId)} to play`, tone: 'muted' }
    case 'DICE_ROLLED':
      return {
        text: `${name(e.playerId)} rolled ${e.dice[0]} + ${e.dice[1]}${e.dice[0] === e.dice[1] ? ' (doubles!)' : ''}`,
        tone: 'normal',
      }
    case 'MOVED':
      return e.path.length > 0
        ? { text: `${name(e.playerId)} moved to ${sp(e.path.at(-1)!)}`, tone: 'muted' }
        : null
    case 'CASH_CHANGED':
      if (e.reason === 'salary' && e.delta > 0)
        return { text: `${name(e.playerId)} collected ₵${e.delta} salary`, tone: 'good' }
      if (e.reason === 'rent' && e.delta < 0 && e.counterparty)
        return { text: `${name(e.playerId)} paid ₵${-e.delta} rent to ${name(e.counterparty)}`, tone: 'bad' }
      if (e.reason === 'tax') return { text: `${name(e.playerId)} paid ₵${-e.delta} tax`, tone: 'bad' }
      if (e.reason === 'jailFine')
        return { text: `${name(e.playerId)} paid the ₵${-e.delta} fine`, tone: 'bad' }
      return null
    case 'CARD_DRAWN': {
      const card = (e.deck === 'chance' ? CHANCE_CARDS : CHEST_CARDS)[e.cardId]
      return { text: `${name(e.playerId)} drew: ${card?.text ?? '?'}`, tone: 'normal' }
    }
    case 'PROPERTY_BOUGHT':
      return { text: `${name(e.playerId)} bought ${sp(e.space)} for ₵${e.price}`, tone: 'good' }
    case 'AUCTION_STARTED':
      return { text: `Auction for ${sp(e.space)}`, tone: 'normal' }
    case 'BID_PLACED':
      return { text: `${name(e.playerId)} bid ₵${e.amount}`, tone: 'muted' }
    case 'AUCTION_ENDED':
      return e.winner
        ? { text: `${name(e.winner)} won ${sp(e.space)} for ₵${e.amount}`, tone: 'good' }
        : { text: `Nobody bought ${sp(e.space)}`, tone: 'muted' }
    case 'BUILT':
      return {
        text: `${name(e.playerId)} built on ${sp(e.space)} (${e.level === 5 ? 'hotel' : `${e.level} houses`})`,
        tone: 'good',
      }
    case 'SOLD_BUILDING':
      return { text: `${name(e.playerId)} sold a building on ${sp(e.space)}`, tone: 'normal' }
    case 'MORTGAGED':
      return { text: `${name(e.playerId)} mortgaged ${sp(e.space)}`, tone: 'normal' }
    case 'UNMORTGAGED':
      return { text: `${name(e.playerId)} lifted the mortgage on ${sp(e.space)}`, tone: 'normal' }
    case 'MONOPOLY_COMPLETED':
      return { text: `${name(e.playerId)} completed a color set!`, tone: 'good' }
    case 'JAILED':
      return { text: `${name(e.playerId)} went to the Lockup`, tone: 'bad' }
    case 'RELEASED':
      return { text: `${name(e.playerId)} left the Lockup`, tone: 'normal' }
    case 'DEBT_INCURRED':
      return { text: `${name(e.playerId)} must raise money to pay ₵${e.amount}`, tone: 'bad' }
    case 'BANKRUPT':
      return { text: `${name(e.playerId)} went bankrupt`, tone: 'bad' }
    case 'FINAL_ROUND':
      return { text: `Final round!`, tone: 'bad' }
    case 'GAME_OVER':
      return { text: `${name(e.winner)} won the game!`, tone: 'good' }
    default:
      return null
  }
}
