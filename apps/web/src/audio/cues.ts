import type { GameEvent } from '@skyline/engine'
import type { BoardBeat } from '@skyline/board'
import type { Fx } from '../game/store.ts'
import { TIMINGS, coinCount } from '../game/timings.ts'
import type { SoundId } from './catalog.ts'
import type { PlayOptions } from './engine.ts'

export interface Cue extends PlayOptions {
  sound: SoundId
}

/** Major scale steps in semitones: streaks climb this ladder so repeats feel like progress. */
const LADDER = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24]
const climb = (step: number) => LADDER[Math.min(step, LADDER.length - 1)]!

/** Builds within this many ms of each other count as one building spree. */
const STREAK_MS = 1600

/**
 * Maps what the game shows onto sound cues: engine events (as they play), board beats (in step
 * with motion), and shell effects (coins, pops). Pure apart from the clock it is given, so the
 * mapping is unit-tested; `connectSound` sends the cues to the engine.
 */
export class CueMapper {
  private bids = 0
  private buildStreak = 0
  private lastBuild = -Infinity
  private readonly now: () => number
  private readonly isHuman: (playerId: string) => boolean

  constructor(isHuman: (playerId: string) => boolean, now: () => number = () => performance.now()) {
    this.isHuman = isHuman
    this.now = now
  }

  /** `speed` is the animation speed, so delayed cues line up with the visuals. */
  event(e: GameEvent, speed = 1): Cue[] {
    switch (e.type) {
      case 'TURN_STARTED':
        return this.isHuman(e.playerId) ? [{ sound: 'turn.yours' }] : []
      case 'DICE_ROLLED':
        return e.dice[0] === e.dice[1]
          ? [{ sound: 'dice.roll' }, { sound: 'dice.doubles', delay: (TIMINGS.dice * 0.75) / speed }]
          : [{ sound: 'dice.roll' }]
      case 'CARD_DRAWN':
        return [{ sound: 'card.draw' }]
      case 'AUCTION_STARTED':
        this.bids = 0
        return [{ sound: 'auction.start' }]
      case 'BID_PLACED':
        return [{ sound: 'auction.bid', pitch: climb(this.bids++) * 0.5 }]
      case 'AUCTION_ENDED':
        return e.winner ? [{ sound: 'auction.sold' }] : []
      case 'SOLD_BUILDING':
        return [{ sound: 'build.sell' }]
      case 'MORTGAGED':
        return [{ sound: 'prop.mortgage' }]
      case 'UNMORTGAGED':
        return [{ sound: 'prop.unmortgage' }]
      case 'TRADE_REJECTED':
        return [{ sound: 'trade.declined' }]
      case 'TRADE_ACCEPTED':
        return [{ sound: 'trade.deal' }]
      case 'MONOPOLY_COMPLETED':
        return [{ sound: 'set.complete' }]
      case 'JAILED':
        return [{ sound: 'jail.sent' }]
      case 'RELEASED':
        return [{ sound: 'jail.free' }]
      case 'BANKRUPT':
        return [{ sound: 'game.bankrupt' }]
      case 'FINAL_ROUND':
        return [{ sound: 'game.finalRound' }]
      case 'GAME_OVER':
        return [{ sound: 'game.win' }]
      default:
        return []
    }
  }

  beat(b: BoardBeat): Cue[] {
    switch (b.kind) {
      case 'step':
        // Hoppers climb a scale; vehicles just tick, nudging up gently.
        return b.piece === 'taxi' || b.piece === 'bus'
          ? [{ sound: 'move.roll', pitch: Math.min(b.step, 10) * 0.4 }]
          : [{ sound: 'move.step', pitch: climb(b.step) }]
      case 'land':
        return [{ sound: 'move.land', gain: Math.min(1.3, 0.6 + b.strength * 0.4) }]
      case 'liftoff':
        return [{ sound: 'move.liftoff' }]
      case 'own':
        return [{ sound: 'prop.buy' }]
      case 'build': {
        const t = this.now()
        this.buildStreak = t - this.lastBuild < STREAK_MS ? this.buildStreak + 1 : 0
        this.lastBuild = t
        return b.level === 5
          ? [{ sound: 'build.hotel' }]
          : [{ sound: 'build.house', pitch: climb(this.buildStreak) }]
      }
      case 'pulse':
        return [{ sound: 'set.pulse', pitch: climb(b.step * 2) }]
      case 'punch':
        return [{ sound: 'money.big', gain: 0.6 + b.strength * 0.5 }]
    }
  }

  /** Coins tick as each one lands, climbing; the payee's pop rings the register. */
  fx(fx: Fx, speed = 1): Cue[] {
    if (fx.kind === 'pop') return [{ sound: fx.delta > 0 ? 'money.gain' : 'money.pay' }]
    if (fx.kind !== 'transfer') return []
    const cues: Cue[] = [{ sound: 'money.pay', gain: 0.8 }]
    const count = coinCount(fx.amount)
    for (let i = 0; i < count; i++) {
      cues.push({
        sound: 'money.coin',
        pitch: climb(i),
        delay: (i * TIMINGS.coinStagger + TIMINGS.coinFlight * 0.97) / speed,
      })
    }
    return cues
  }
}
