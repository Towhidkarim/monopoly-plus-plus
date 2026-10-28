import type { GameEvent } from '@skyline/engine'

/** A line a bot says out loud (a speech bubble under its card). */
export interface Bark {
  playerId: string
  text: string
}

type Moment =
  | 'paidRent'
  | 'gotRent'
  | 'bought'
  | 'set'
  | 'trade'
  | 'jailed'
  | 'bankrupt'
  | 'payday'
  | 'loan'
  | 'debtFree'
type Style = 'Balanced' | 'Banker' | 'Tycoon' | 'Shark'

/** Lines per moment and bot personality (the bots package's `BotParams.name`). */
const LINES: Record<Moment, Record<Style, readonly string[]>> = {
  paidRent: {
    Balanced: ['Ouch.', "Fair's fair.", 'That stings.'],
    Banker: ['That hurts the ledger.', 'Noted. Painfully.'],
    Tycoon: ['Small change.', "I'll earn it back."],
    Shark: ['Enjoy it while it lasts.', 'Hmph.'],
  },
  gotRent: {
    Balanced: ['Thanks for stopping by!', 'Much appreciated.'],
    Banker: ['Into the vault.', 'Interest accrues.'],
    Tycoon: ['Welcome to my street!', "Rent's due!"],
    Shark: ['Pay up.', 'Thank you, come again.'],
  },
  bought: {
    Balanced: ['Nice spot.', "I'll take it."],
    Banker: ['A sound investment.', 'Within budget.'],
    Tycoon: ['Mine!', 'Another one for the empire.'],
    Shark: ['Thanks, I needed that.', 'Interesting…'],
  },
  set: {
    Balanced: ['The whole street!', 'Set complete!'],
    Banker: ['Now we build. Carefully.'],
    Tycoon: ['Time to build skyscrapers!', 'The empire grows!'],
    Shark: ['Now it gets expensive for you.'],
  },
  trade: {
    Balanced: ['Deal!', 'Good trade.'],
    Banker: ['Agreed. On paper.'],
    Tycoon: ['Pleasure doing business!'],
    Shark: ['You drive a soft bargain.', 'Deal.'],
  },
  jailed: {
    Balanced: ['Not again…', "I'll be good."],
    Banker: ['A brief recess.'],
    Tycoon: ['Call my lawyer!'],
    Shark: ["You can't hold me forever."],
  },
  bankrupt: {
    Balanced: ['Good game!'],
    Banker: ["The numbers didn't add up."],
    Tycoon: ["I'll rebuild."],
    Shark: ["This isn't over."],
  },
  payday: {
    Balanced: ['Payday!'],
    Banker: ['Deposit received.'],
    Tycoon: ['More capital!'],
    Shark: ['Ka-ching.'],
  },
  loan: {
    Balanced: ['Not out yet!', 'Second wind!'],
    Banker: ['A prudent restructuring.', 'Terms accepted.'],
    Tycoon: ['Leverage! The empire stands.', "Can't stop me!"],
    Shark: ["I'll pay it back with your rent.", 'Still here.'],
  },
  debtFree: {
    Balanced: ['Debt free!', 'Clean slate.'],
    Banker: ['Ledger balanced.'],
    Tycoon: ['Free and clear!'],
    Shark: ['Now watch me.'],
  },
}

/** How often a moment gets a line (big moments always, small ones now and then). */
const CHANCE: Record<Moment, number> = {
  paidRent: 0.5,
  gotRent: 0.5,
  bought: 0.45,
  set: 1,
  trade: 1,
  jailed: 1,
  bankrupt: 1,
  payday: 0.15,
  loan: 1,
  debtFree: 1,
}

/** Rent at least this big always gets a reaction. */
const BIG_RENT = 100
/** Rent below this gets none. */
const SMALL_RENT = 25
/** One bot never speaks more often than this, and the table never more often than GAP_MS. */
const PER_BOT_MS = 4000
const GAP_MS = 1200

/**
 * Turns game events into bot lines. `style` gives a bot's personality name for a player id, or
 * null for humans (who never get lines). Rate-limited so the table never chatters; `rng` and
 * `now` are injectable for tests (this is UI flavor, not game logic, so Math.random is fine).
 */
export class BarkMapper {
  private readonly style: (playerId: string) => string | null
  private readonly rng: () => number
  private readonly now: () => number
  private readonly last = new Map<string, number>()
  private lastAny = -Infinity
  private readonly parties = new Map<number, [string, string]>()

  constructor(
    style: (playerId: string) => string | null,
    rng: () => number = Math.random,
    now: () => number = () => performance.now(),
  ) {
    this.style = style
    this.rng = rng
    this.now = now
  }

  event(e: GameEvent): Bark | null {
    switch (e.type) {
      case 'CASH_CHANGED': {
        if (e.reason === 'salary' && e.delta > 0) return this.say(e.playerId, 'payday')
        if (e.reason !== 'rent' || Math.abs(e.delta) < SMALL_RENT) return null
        const big = Math.abs(e.delta) >= BIG_RENT
        return this.say(e.playerId, e.delta < 0 ? 'paidRent' : 'gotRent', big)
      }
      case 'PROPERTY_BOUGHT':
        return this.say(e.playerId, 'bought')
      case 'AUCTION_ENDED':
        return e.winner ? this.say(e.winner, 'bought') : null
      case 'MONOPOLY_COMPLETED':
        return this.say(e.playerId, 'set')
      case 'TRADE_PROPOSED':
        this.parties.set(e.tradeId, [e.from, e.to])
        return null
      case 'TRADE_ACCEPTED': {
        const [a, b] = this.parties.get(e.tradeId) ?? []
        // The bot on the receiving end answers; else the proposer.
        const who = b && this.style(b) ? b : a
        return who ? this.say(who, 'trade') : null
      }
      case 'JAILED':
        return this.say(e.playerId, 'jailed')
      case 'BANKRUPT':
        return this.say(e.playerId, 'bankrupt', true)
      case 'LOAN_TAKEN':
        return this.say(e.playerId, 'loan', true)
      case 'LOAN_REPAID':
        return this.say(e.playerId, 'debtFree', true)
      default:
        return null
    }
  }

  private say(playerId: string, moment: Moment, force = false): Bark | null {
    const style = this.style(playerId)
    if (!style) return null
    const t = this.now()
    const urgent = force || CHANCE[moment] >= 1
    if (!urgent && (t - (this.last.get(playerId) ?? -Infinity) < PER_BOT_MS || t - this.lastAny < GAP_MS))
      return null
    if (!urgent && this.rng() >= CHANCE[moment]) return null
    const lines = isStyle(style) ? LINES[moment][style] : LINES[moment].Balanced
    const text = lines[Math.floor(this.rng() * lines.length)]!
    this.last.set(playerId, t)
    this.lastAny = t
    return { playerId, text }
  }
}

const isStyle = (s: string): s is Style =>
  s === 'Balanced' || s === 'Banker' || s === 'Tycoon' || s === 'Shark'
