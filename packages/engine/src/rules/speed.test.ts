import { describe, expect, it } from 'vitest'
import { SPACES } from '../board.ts'
import { legalActions } from '../legal.ts'
import { act, edit, newGame, reject, rigDice, types } from '../testkit.ts'

/** The Speed die (DECISIONS.md D62): faces 1, 2, 3, Bus, Scout, Scout (rolled values 4, 5, 6). */
const speed = { speedDie: true, auctionOnDecline: false }
const BUS = 4
const SCOUT = 5

describe('speed die', () => {
  it('is off by default: two dice, no speed face', () => {
    const { events } = act(rigDice(newGame(), [2, 4]), 'a', { type: 'ROLL' })
    expect(events[0]).not.toHaveProperty('speed')
  })

  it('adds a number face to the move', () => {
    const { s, events } = act(rigDice(newGame(2, speed), [2, 3, 1]), 'a', { type: 'ROLL' })
    expect(events[0]).toMatchObject({ type: 'DICE_ROLLED', dice: [2, 3], speed: 1 })
    expect(s.players[0]!.position).toBe(6)
    expect(s.lastSpeed).toBe(1)
    expect(s.phase).toBe('postRoll')
  })

  it('counts only the white dice for doubles', () => {
    const { s } = act(rigDice(newGame(2, speed), [3, 3, 2]), 'a', { type: 'ROLL' })
    expect(s.players[0]!.position).toBe(8)
    expect(s.phase).toBe('preRoll') // doubles: roll again
    expect(s.doubles).toBe(1)
  })

  it('sends the third double to jail without moving', () => {
    let s = rigDice(newGame(2, speed), [1, 1, 3], [2, 2, 1], [3, 3, 2])
    s = edit(s, (d) => (d.owner = d.owner.map((_, i) => (SPACES[i]!.price > 0 ? 1 : -1))))
    s = act(s, 'a', { type: 'ROLL' }).s
    s = act(s, 'a', { type: 'ROLL' }).s
    s = act(s, 'a', { type: 'ROLL' }).s
    expect(s.players[0]!.inJail).toBe(true)
  })

  it('does not roll the speed die in jail', () => {
    const s = edit(rigDice(newGame(2, speed), [1, 2]), (d) => {
      d.players[0]!.inJail = true
      d.players[0]!.position = 10
    })
    const { events } = act(s, 'a', { type: 'ROLL' })
    expect(events[0]).not.toHaveProperty('speed')
  })

  describe('bus', () => {
    it('offers one die or both, the sum first', () => {
      const s = act(rigDice(newGame(2, speed), [2, 5, BUS]), 'a', { type: 'ROLL' }).s
      expect(s.lastSpeed).toBe('bus')
      expect(s.pending).toEqual({ kind: 'move', reason: 'bus', options: [7, 2, 5], diceTotal: 7 })
      expect(s.players[0]!.position).toBe(0)
      const moves = legalActions(s, 'a').filter((x) => x.type === 'CHOOSE_MOVE')
      expect(moves).toEqual([7, 2, 5].map((space) => ({ type: 'CHOOSE_MOVE', space })))
      expect(reject(s, 'a', { type: 'END_TURN' })).toBeTruthy()
      expect(reject(s, 'a', { type: 'CHOOSE_MOVE', space: 3 })).toBeTruthy()
      expect(reject(s, 'b', { type: 'CHOOSE_MOVE', space: 5 })).toBeTruthy()
    })

    it('moves to the chosen space and resolves it', () => {
      const s = act(rigDice(newGame(2, speed), [2, 5, BUS]), 'a', { type: 'ROLL' }).s
      const r = act(s, 'a', { type: 'CHOOSE_MOVE', space: 5 })
      expect(SPACES[5]!.kind).toBe('railroad')
      expect(r.s.players[0]!.position).toBe(5)
      expect(r.s.pending).toEqual({ kind: 'buy', space: 5 })
      expect(types(r.events)).toEqual(['MOVED'])
    })

    it('offers two choices on doubles and still rolls again', () => {
      let s = act(rigDice(newGame(2, speed), [3, 3, BUS]), 'a', { type: 'ROLL' }).s
      expect(s.pending).toMatchObject({ kind: 'move', options: [6, 3] })
      s = edit(s, (d) => (d.owner[3] = 1))
      s = act(s, 'a', { type: 'CHOOSE_MOVE', space: 3 }).s
      expect(s.phase).toBe('preRoll')
    })

    it('takes the sum on a timeout', () => {
      const s = act(rigDice(newGame(2, speed), [2, 4, BUS]), 'a', { type: 'ROLL' }).s
      expect(act(s, 'a', { type: 'TIMEOUT' }).s.players[0]!.position).toBe(6)
    })
  })

  describe('scout', () => {
    it('after paying rent, jumps to the nearest unowned property', () => {
      const s = edit(rigDice(newGame(2, speed), [1, 2, SCOUT]), (d) => (d.owner[3] = 1))
      const { s: after, events } = act(s, 'a', { type: 'ROLL' })
      expect(events[0]).toMatchObject({ type: 'DICE_ROLLED', speed: 'scout' })
      expect(types(events)).toEqual([
        'DICE_ROLLED',
        'MOVED',
        'CASH_CHANGED',
        'CASH_CHANGED',
        'SCOUTED',
        'MOVED',
      ])
      expect(events).toContainEqual({ type: 'SCOUTED', playerId: 'a', to: 5 })
      expect(after.players[0]!.position).toBe(5)
      expect(after.pending).toEqual({ kind: 'buy', space: 5 })
      expect(after.scoutDue).toBe(false)
    })

    it('waits until the buy decision on the first space is made', () => {
      let s = act(rigDice(newGame(2, speed), [1, 2, SCOUT]), 'a', { type: 'ROLL' }).s
      expect(s.pending).toEqual({ kind: 'buy', space: 3 })
      expect(s.scoutDue).toBe(true)
      const r = act(s, 'a', { type: 'BUY' })
      s = r.s
      expect(types(r.events)).toEqual(['CASH_CHANGED', 'PROPERTY_BOUGHT', 'SCOUTED', 'MOVED'])
      expect(s.pending).toEqual({ kind: 'buy', space: 5 })
    })

    it('waits for an auction to finish', () => {
      let s = act(rigDice(newGame(2, { speedDie: true }), [1, 2, SCOUT]), 'a', { type: 'ROLL' }).s
      s = act(s, 'a', { type: 'DECLINE_BUY' }).s
      expect(s.pending?.kind).toBe('auction')
      expect(s.players[0]!.position).toBe(3)
      s = act(s, 'b', { type: 'PASS_BID' }).s
      s = act(s, 'a', { type: 'BID', amount: 10 }).s
      expect(s.players[0]!.position).toBe(5)
      expect(s.pending).toEqual({ kind: 'buy', space: 5 })
    })

    it('with nothing left to buy, goes to the nearest rival property and pays rent', () => {
      const s = edit(rigDice(newGame(2, speed), [1, 2, SCOUT]), (d) => {
        d.owner = d.owner.map((_, i) => (SPACES[i]!.price > 0 ? 1 : -1))
        d.mortgaged[5] = true
      })
      const after = act(s, 'a', { type: 'ROLL' }).s
      expect(after.players[0]!.position).toBe(6) // skips the mortgaged railroad
      // Both sets are complete, so unimproved rent is doubled.
      expect(after.players[0]!.cash).toBe(1500 - 2 * SPACES[3]!.rent[0]! - 2 * SPACES[6]!.rent[0]!)
    })

    it('stays put when the player owns everything else', () => {
      const s = edit(rigDice(newGame(2, speed), [1, 2, SCOUT]), (d) => {
        d.owner = d.owner.map((_, i) => (SPACES[i]!.price > 0 ? 0 : -1))
      })
      const { s: after, events } = act(s, 'a', { type: 'ROLL' })
      expect(after.players[0]!.position).toBe(3)
      expect(types(events)).not.toContain('SCOUTED')
    })

    it('is cancelled by going to jail', () => {
      const s = edit(rigDice(newGame(2, speed), [2, 3, SCOUT]), (d) => (d.players[0]!.position = 25))
      const after = act(s, 'a', { type: 'ROLL' }).s
      expect(after.players[0]!.inJail).toBe(true)
      expect(after.scoutDue).toBe(false)
    })
  })

  describe('triples', () => {
    it('lets the player move to any other space and ends the rolling', () => {
      let s = act(rigDice(newGame(2, speed), [2, 2, 2]), 'a', { type: 'ROLL' }).s
      expect(s.pending).toMatchObject({ kind: 'move', reason: 'triples', diceTotal: 4 })
      const options = s.pending?.kind === 'move' ? s.pending.options : []
      expect(options[0]).toBe(6) // the normal move comes first (the timeout default)
      expect(options).toHaveLength(39)
      expect(options).not.toContain(0)
      s = act(s, 'a', { type: 'CHOOSE_MOVE', space: 39 }).s
      expect(s.players[0]!.position).toBe(39)
      expect(s.phase).toBe('postRoll')
      expect(s.doubles).toBe(0)
    })

    it('pays the salary when the chosen space is past the start', () => {
      let s = edit(rigDice(newGame(2, speed), [1, 1, 1]), (d) => (d.players[0]!.position = 35))
      s = act(s, 'a', { type: 'ROLL' }).s
      s = act(s, 'a', { type: 'CHOOSE_MOVE', space: 1 }).s
      expect(s.players[0]!.cash).toBe(1500 + 200)
    })
  })
})
