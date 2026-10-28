import { CHANCE_CARDS, CHEST_CARDS, SPACES, type GameEvent } from '@skyline/engine'

export interface LogEntry {
  id: number
  text: string
  tone: 'normal' | 'good' | 'bad' | 'muted'
  /** Wall-clock time it was logged (for fading toasts). */
  at: number
  /** Cash moving between two parties, for the toast's payer -> payee flow. Null side = the bank. */
  money?: {
    from: string | null
    to: string | null
    amount: number
    reason: 'rent' | 'salary' | 'underdog' | 'tax' | 'fine' | 'loan' | 'loanRepay'
  }
  /** A space this entry is about (buy toasts show its color band). */
  space?: number
  /** Price shown beside a purchase. */
  price?: number
  /** Icon for bad events. */
  icon?: 'lock' | 'alert'
}

const sp = (i: number) => SPACES[i]!.name

function describeRaw(e: GameEvent, name: (id: string) => string): Omit<LogEntry, 'id' | 'at'> | null {
  switch (e.type) {
    case 'TURN_STARTED':
      return { text: `Round ${e.round}: ${name(e.playerId)} to play`, tone: 'muted' }
    case 'DICE_ROLLED': {
      const triples = e.speed === e.dice[0] && e.speed === e.dice[1]
      const speed =
        e.speed === undefined
          ? ''
          : e.speed === 'bus'
            ? ' + Bus'
            : e.speed === 'scout'
              ? ' + Scout'
              : ` + ${e.speed}`
      const note = triples ? ' (triples!)' : e.dice[0] === e.dice[1] ? ' (doubles!)' : ''
      return { text: `${name(e.playerId)} rolled ${e.dice[0]} + ${e.dice[1]}${speed}${note}`, tone: 'normal' }
    }
    case 'SCOUTED':
      return { text: `${name(e.playerId)}'s Scout heads for ${sp(e.to)}`, tone: 'normal' }
    case 'MOVED':
      return e.path.length > 0
        ? { text: `${name(e.playerId)} moved to ${sp(e.path.at(-1)!)}`, tone: 'muted' }
        : null
    case 'CASH_CHANGED':
      if (e.reason === 'salary' && e.delta > 0)
        return {
          text: `${name(e.playerId)} collected ₵${e.delta} salary`,
          tone: 'good',
          money: { from: null, to: e.playerId, amount: e.delta, reason: 'salary' },
        }
      if (e.reason === 'underdog' && e.delta > 0)
        return {
          text: `${name(e.playerId)} got a ₵${e.delta} underdog bonus`,
          tone: 'good',
          money: { from: null, to: e.playerId, amount: e.delta, reason: 'underdog' },
        }
      if (e.reason === 'loanRepay' && e.delta < 0)
        return {
          text: `${name(e.playerId)} repaid ₵${-e.delta} of the loan`,
          tone: 'muted',
          money: { from: e.playerId, to: null, amount: -e.delta, reason: 'loanRepay' },
        }
      if (e.reason === 'rent' && e.delta < 0 && e.counterparty)
        return {
          text: `${name(e.playerId)} paid ₵${-e.delta} rent to ${name(e.counterparty)}`,
          tone: 'bad',
          money: { from: e.playerId, to: e.counterparty, amount: -e.delta, reason: 'rent' },
        }
      if (e.reason === 'tax')
        return {
          text: `${name(e.playerId)} paid ₵${-e.delta} tax`,
          tone: 'bad',
          money: { from: e.playerId, to: null, amount: -e.delta, reason: 'tax' },
        }
      if (e.reason === 'jailFine')
        return {
          text: `${name(e.playerId)} paid the ₵${-e.delta} fine`,
          tone: 'bad',
          money: { from: e.playerId, to: null, amount: -e.delta, reason: 'fine' },
        }
      return null
    case 'CARD_DRAWN': {
      const card = (e.deck === 'chance' ? CHANCE_CARDS : CHEST_CARDS)[e.cardId]
      return { text: `${name(e.playerId)} drew: ${card?.text ?? '?'}`, tone: 'normal' }
    }
    case 'PROPERTY_BOUGHT':
      return {
        text: `${name(e.playerId)} bought ${sp(e.space)} for ₵${e.price}`,
        tone: 'good',
        space: e.space,
        price: e.price,
      }
    case 'AUCTION_STARTED':
      return { text: `Auction for ${sp(e.space)}`, tone: 'normal' }
    case 'BID_PLACED':
      return { text: `${name(e.playerId)} bid ₵${e.amount}`, tone: 'muted' }
    case 'AUCTION_ENDED':
      return e.winner
        ? {
            text: `${name(e.winner)} won ${sp(e.space)} for ₵${e.amount}`,
            tone: 'good',
            space: e.space,
            price: e.amount,
          }
        : { text: `Nobody bought ${sp(e.space)}`, tone: 'muted' }
    case 'BUILT':
      return {
        text: `${name(e.playerId)} built on ${sp(e.space)} (${e.level === 5 ? 'hotel' : `${e.level} house${e.level === 1 ? '' : 's'}`})`,
        tone: 'good',
      }
    case 'SOLD_BUILDING':
      return { text: `${name(e.playerId)} sold a building on ${sp(e.space)}`, tone: 'normal' }
    case 'MORTGAGED':
      return { text: `${name(e.playerId)} mortgaged ${sp(e.space)}`, tone: 'normal' }
    case 'UNMORTGAGED':
      return { text: `${name(e.playerId)} lifted the mortgage on ${sp(e.space)}`, tone: 'normal' }
    case 'TRADE_PROPOSED':
      return { text: `${name(e.from)} offered ${name(e.to)} a deal`, tone: 'muted' }
    case 'TRADE_REJECTED':
      return { text: 'The offer was declined', tone: 'muted' }
    case 'PROPERTY_TRANSFERRED':
      return e.from !== 'bank' && e.to !== 'bank'
        ? { text: `${name(e.to)} got ${sp(e.space)} from ${name(e.from)}`, tone: 'normal' }
        : null
    case 'MONOPOLY_COMPLETED':
      return { text: `${name(e.playerId)} completed a color set!`, tone: 'good' }
    case 'JAILED':
      return { text: `${name(e.playerId)} went to the Lockup`, tone: 'bad', icon: 'lock' }
    case 'RELEASED':
      return { text: `${name(e.playerId)} left the Lockup`, tone: 'normal' }
    case 'DEBT_INCURRED':
      return { text: `${name(e.playerId)} must raise money to pay ₵${e.amount}`, tone: 'bad', icon: 'alert' }
    case 'BANKRUPT':
      return { text: `${name(e.playerId)} went bankrupt`, tone: 'bad' }
    case 'LOAN_TAKEN':
      return {
        text: `Second Wind! ${name(e.playerId)} borrowed ₵${e.amount} (₵${e.owed} to repay)`,
        tone: 'good',
        money: { from: null, to: e.playerId, amount: e.amount, reason: 'loan' },
      }
    case 'LOAN_REPAID':
      return { text: `${name(e.playerId)} paid off the loan. Debt free!`, tone: 'good' }
    case 'FINAL_ROUND':
      return { text: `Final round!`, tone: 'bad' }
    case 'GAME_OVER':
      return { text: `${name(e.winner)} won the game!`, tone: 'good' }
    default:
      return null
  }
}

/**
 * The player's name is "You" in solo games. It stays capitalized as the first word of a line (or
 * of a sentence after a colon), and is lowercase inside one: "Nova got Mill Avenue from you".
 */
export function lowerYou(text: string): string {
  return text.replace(/(?<=\S )(?<![:.!?] )You\b/g, 'you')
}

/** Turns an event into a human-readable log line, or null for events not worth a line. */
export function describe(e: GameEvent, name: (id: string) => string): Omit<LogEntry, 'id' | 'at'> | null {
  const line = describeRaw(e, name)
  return line && { ...line, text: lowerYou(line.text) }
}
