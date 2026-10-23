import { TIMINGS, coinsLandMs } from '../game/timings.ts'
import { CueMapper, type Cue } from './cues.ts'

/**
 * Short scripted moments for the sound board, so sounds are judged in context and in rhythm
 * (a sound that is fine alone can grate on the seventh repeat). Timings mirror the game at 1x.
 */
export interface Sequence {
  name: string
  cues: () => Cue[]
}

const HOP_MS = 190

/** Collects cues on a timeline; `at` is ms from the start. */
function timeline(build: (add: (at: number, cues: Cue[]) => void, m: CueMapper) => void): Cue[] {
  let clock = 0
  const m = new CueMapper(
    () => true,
    () => clock,
  )
  const out: Cue[] = []
  build((at, cues) => {
    clock = at
    for (const c of cues) out.push({ ...c, delay: at + (c.delay ?? 0) })
  }, m)
  return out
}

/** Hops `count` tiles from `start` ms; returns when the piece lands. */
function hops(add: (at: number, cues: Cue[]) => void, m: CueMapper, start: number, count: number): number {
  for (let i = 0; i < count - 1; i++)
    add(start + (i + 1) * HOP_MS, m.beat({ kind: 'step', piece: 'pawn', space: i, step: i }))
  const end = start + count * HOP_MS
  add(end, m.beat({ kind: 'land', piece: 'pawn', space: count, strength: 1 }))
  return end
}

export const SEQUENCES: Sequence[] = [
  {
    name: 'Roll, hop 7, pay rent',
    cues: () =>
      timeline((add, m) => {
        add(0, m.event({ type: 'DICE_ROLLED', playerId: 'a', dice: [3, 4] }))
        const land = hops(add, m, TIMINGS.dice, 7)
        add(land + 300, m.fx({ kind: 'transfer', from: 'a', to: 'b', amount: 120 }))
        add(land + 300 + coinsLandMs(120), m.fx({ kind: 'pop', playerId: 'b', delta: 120 }))
      }),
  },
  {
    name: 'Pass GO, collect',
    cues: () =>
      timeline((add, m) => {
        add(0, m.event({ type: 'DICE_ROLLED', playerId: 'a', dice: [2, 3] }))
        const land = hops(add, m, TIMINGS.dice, 5)
        add(land + 200, m.fx({ kind: 'pop', playerId: 'a', delta: 200 }))
      }),
  },
  {
    name: 'Doubles, then buy',
    cues: () =>
      timeline((add, m) => {
        add(0, m.event({ type: 'DICE_ROLLED', playerId: 'a', dice: [4, 4] }))
        const land = hops(add, m, TIMINGS.dice, 8)
        add(land + 900, m.beat({ kind: 'own', space: 1 }))
        add(land + 900, m.fx({ kind: 'pop', playerId: 'a', delta: -180 }))
      }),
  },
  {
    name: 'Build a street',
    cues: () =>
      timeline((add, m) => {
        for (let i = 0; i < 3; i++) add(i * 420, m.beat({ kind: 'build', space: 1 + i, level: 1 }))
        for (let i = 0; i < 3; i++) add(1400 + i * 420, m.beat({ kind: 'build', space: 1 + i, level: 2 }))
        add(3200, m.beat({ kind: 'build', space: 1, level: 5 }))
      }),
  },
  {
    name: 'Complete a set',
    cues: () =>
      timeline((add, m) => {
        add(0, m.beat({ kind: 'own', space: 3 }))
        add(500, m.event({ type: 'MONOPOLY_COMPLETED', playerId: 'a', group: 0 }))
        for (let i = 0; i < 3; i++) add(565 + i * 110, m.beat({ kind: 'pulse', space: i, step: i }))
      }),
  },
  {
    name: 'Auction',
    cues: () =>
      timeline((add, m) => {
        add(0, m.event({ type: 'AUCTION_STARTED', space: 1 }))
        for (let i = 0; i < 5; i++)
          add(700 + i * 520, m.event({ type: 'BID_PLACED', playerId: 'a', amount: 10 * (i + 1) }))
        add(3600, m.event({ type: 'AUCTION_ENDED', space: 1, winner: 'a', amount: 50 }))
        add(3650, m.beat({ kind: 'own', space: 1 }))
      }),
  },
  {
    name: 'Card, then the Lockup',
    cues: () =>
      timeline((add, m) => {
        add(0, m.event({ type: 'CARD_DRAWN', playerId: 'a', deck: 'chance', cardId: 0 }))
        add(1700, [{ sound: 'card.close' }])
        add(1900, m.beat({ kind: 'liftoff', piece: 'pawn' }))
        add(2760, m.beat({ kind: 'land', piece: 'pawn', space: 10, strength: 1.4 }))
        add(2780, m.event({ type: 'JAILED', playerId: 'a' }))
      }),
  },
  {
    name: 'Big rent hit',
    cues: () =>
      timeline((add, m) => {
        add(0, m.fx({ kind: 'transfer', from: 'a', to: 'b', amount: 950 }))
        add(coinsLandMs(950), m.fx({ kind: 'pop', playerId: 'b', delta: 950 }))
        add(coinsLandMs(950), m.beat({ kind: 'punch', strength: 1 }))
      }),
  },
  {
    name: 'Mortgage and trade',
    cues: () =>
      timeline((add, m) => {
        add(0, m.event({ type: 'MORTGAGED', playerId: 'a', space: 1 }))
        add(500, m.event({ type: 'MORTGAGED', playerId: 'a', space: 3 }))
        add(1300, m.event({ type: 'TRADE_ACCEPTED', tradeId: 1 }))
        add(2100, m.event({ type: 'UNMORTGAGED', playerId: 'a', space: 1 }))
      }),
  },
  {
    name: 'Bankrupt, then victory',
    cues: () =>
      timeline((add, m) => {
        add(0, m.event({ type: 'BANKRUPT', playerId: 'b', to: 'a' }))
        add(1600, m.event({ type: 'GAME_OVER', winner: 'a', reason: 'lastStanding' }))
      }),
  },
]
