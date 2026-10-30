import { describe, expect, it } from 'vitest'
import { GROUPS, JAIL_INDEX, SPACES } from './board.ts'
import { PRESETS } from './config.ts'
import { rentFor } from './core.ts'
import { legalActions } from './legal.ts'
import { observe } from './observe.ts'
import { createGame } from './setup.ts'
import type { GameState } from './state.ts'
import { act, edit, newGame, reject, rigDice, types } from './testkit.ts'

describe('createGame', () => {
  it('starts everyone on GO with starting cash and shuffled 16-card decks', () => {
    const s = newGame(3)
    expect(s.players.map((p) => [p.cash, p.position])).toEqual([
      [1500, 0],
      [1500, 0],
      [1500, 0],
    ])
    expect(s.decks.chance.toSorted((a, b) => a - b)).toEqual([...Array(16).keys()])
    expect(s.decks.chest).toHaveLength(16)
    expect(s.owner.every((o) => o === -1)).toBe(true)
  })

  it('deals properties in standard mode without ever completing a group', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = createGame(
        ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id })),
        seed,
        PRESETS.standard,
      )
      for (let seat = 0; seat < 4; seat++) {
        const mine = s.owner.filter((o) => o === seat)
        expect(mine).toHaveLength(2)
        for (const g of GROUPS) expect(g.every((i) => s.owner[i] === seat)).toBe(false)
      }
    }
  })

  it('is reproducible from the seed', () => {
    expect(newGame(4, {}, 77)).toEqual(newGame(4, {}, 77))
    expect(newGame(4, {}, 77).decks).not.toEqual(newGame(4, {}, 78).decks)
  })
})

/** Turn-flow tests decline purchases; auctions have their own tests. */
const noAuction = { auctionOnDecline: false }

describe('turn flow and movement', () => {
  it('moves by the dice and ends the turn', () => {
    let s = rigDice(newGame(2, noAuction), [2, 4])
    let r = act(s, 'a', { type: 'ROLL' })
    expect(r.s.players[0]!.position).toBe(6)
    expect(types(r.events)).toEqual(['DICE_ROLLED', 'MOVED'])
    expect(r.s.pending).toEqual({ kind: 'buy', space: 6 })
    expect(reject(r.s, 'a', { type: 'END_TURN' })).toMatch(/pending/)
    s = act(r.s, 'a', { type: 'DECLINE_BUY' }).s
    r = act(s, 'a', { type: 'END_TURN' })
    expect(r.s.current).toBe(1)
    expect(r.events.at(-1)).toMatchObject({ type: 'TURN_STARTED', playerId: 'b' })
  })

  it('rejects actions out of turn', () => {
    const s = newGame()
    expect(reject(s, 'b', { type: 'ROLL' })).toMatch(/not your turn/)
    expect(reject(s, 'zed', { type: 'ROLL' })).toMatch(/unknown/)
  })

  it('pays salary when passing GO', () => {
    let s = edit(newGame(), (d) => (d.players[0]!.position = 38))
    s = rigDice(s, [2, 3])
    const r = act(s, 'a', { type: 'ROLL' })
    expect(r.s.players[0]!.position).toBe(3)
    expect(r.s.players[0]!.cash).toBe(1700)
    expect(r.events.find((e) => e.type === 'MOVED')).toMatchObject({ passedGo: true, path: [39, 0, 1, 2, 3] })
  })

  it('gives another roll after doubles', () => {
    const s = rigDice(newGame(2, noAuction), [3, 3])
    const r = act(s, 'a', { type: 'ROLL' })
    expect(r.s.players[0]!.position).toBe(6)
    const after = act(r.s, 'a', { type: 'DECLINE_BUY' }).s
    expect(after.phase).toBe('preRoll')
    expect(legalActions(after, 'a')).toContainEqual({ type: 'ROLL' })
  })

  it('sends a player to jail on the third double without moving', () => {
    // Chest card 7 (a small refund) on top, so landing on 2 does not move the player.
    let s = edit(newGame(2, noAuction), (d) => (d.decks.chest = [7, ...d.decks.chest.filter((c) => c !== 7)]))
    s = rigDice(s, [1, 1], [2, 2], [3, 3])
    s = act(s, 'a', { type: 'ROLL' }).s // to 2 (chest)
    s = act(s, 'a', { type: 'ROLL' }).s // to 6
    s = act(s, 'a', { type: 'DECLINE_BUY' }).s
    const r = act(s, 'a', { type: 'ROLL' })
    expect(r.s.players[0]!).toMatchObject({ position: JAIL_INDEX, inJail: true })
    expect(r.s.phase).toBe('postRoll')
    expect(types(r.events)).toEqual(['DICE_ROLLED', 'JUMPED', 'JAILED'])
  })

  it('sends a player to jail from the go-to-jail space and ends their rolling', () => {
    let s = edit(newGame(), (d) => (d.players[0]!.position = 25))
    s = rigDice(s, [2, 3])
    const r = act(s, 'a', { type: 'ROLL' })
    expect(r.s.players[0]!).toMatchObject({ position: JAIL_INDEX, inJail: true })
    expect(r.s.players[0]!.cash).toBe(1500) // no salary
    expect(r.s.phase).toBe('postRoll')
  })

  it('takes tax to the bank', () => {
    const s = rigDice(newGame(), [1, 3])
    const r = act(s, 'a', { type: 'ROLL' })
    expect(r.s.players[0]!.cash).toBe(1300)
  })

  it('feeds the free-parking pot when enabled', () => {
    let s = rigDice(newGame(2, { freeParkingPot: true }), [1, 3])
    s = act(s, 'a', { type: 'ROLL' }).s
    expect(s.pot).toBe(200)
    s = act(s, 'a', { type: 'END_TURN' }).s
    s = rigDice(
      edit(s, (d) => (d.players[1]!.position = 15)),
      [2, 3],
    )
    const r = act(s, 'b', { type: 'ROLL' })
    expect(r.s.players[1]!.cash).toBe(1700)
    expect(r.s.pot).toBe(0)
  })
})

describe('buying and rent', () => {
  it('buys the landed space and completes a monopoly', () => {
    let s = edit(newGame(), (d) => (d.owner[1] = 0))
    s = rigDice(s, [1, 2])
    s = act(s, 'a', { type: 'ROLL' }).s
    const r = act(s, 'a', { type: 'BUY' })
    expect(r.s.owner[3]).toBe(0)
    expect(r.s.players[0]!.cash).toBe(1440)
    expect(types(r.events)).toEqual(['CASH_CHANGED', 'PROPERTY_BOUGHT', 'MONOPOLY_COMPLETED'])
  })

  it('cannot buy without enough cash', () => {
    let s = edit(newGame(), (d) => (d.players[0]!.cash = 50))
    s = rigDice(s, [1, 2])
    s = act(s, 'a', { type: 'ROLL' }).s
    expect(reject(s, 'a', { type: 'BUY' })).toMatch(/cash/)
    expect(legalActions(s, 'a')).toEqual([{ type: 'DECLINE_BUY' }])
  })

  it('charges base, monopoly, and house rents; nothing when mortgaged', () => {
    const base = edit(newGame(), (d) => (d.owner[1] = 1))
    expect(rentFor(base, 1, 7)).toBe(2)
    const mono = edit(base, (d) => (d.owner[3] = 1))
    expect(rentFor(mono, 1, 7)).toBe(4)
    const built = edit(mono, (d) => (d.houses[1] = 3))
    expect(rentFor(built, 1, 7)).toBe(90)
    const hotel = edit(mono, (d) => (d.houses[3] = 5))
    expect(rentFor(hotel, 3, 7)).toBe(450)
    const mortgaged = edit(base, (d) => (d.mortgaged[1] = true))
    expect(rentFor(mortgaged, 1, 7)).toBe(0)
  })

  it('scales railroad rent with railroads owned', () => {
    const rails = [5, 15, 25, 35]
    for (let n = 1; n <= 4; n++) {
      const s = edit(newGame(), (d) => rails.slice(0, n).forEach((i) => (d.owner[i] = 1)))
      expect(rentFor(s, 5, 7)).toBe([25, 50, 100, 200][n - 1])
    }
    const doubled = edit(newGame(), (d) => (d.owner[5] = 1))
    expect(rentFor(doubled, 5, 7, { railroadMultiplier: 2 })).toBe(50)
  })

  it('scales utility rent with the dice', () => {
    const one = edit(newGame(), (d) => (d.owner[12] = 1))
    expect(rentFor(one, 12, 9)).toBe(36)
    const both = edit(one, (d) => (d.owner[28] = 1))
    expect(rentFor(both, 12, 9)).toBe(90)
    expect(rentFor(one, 12, 9, { utilityDiceTimesTen: 5 })).toBe(50)
  })

  it('pays rent to the owner on landing', () => {
    let s = edit(newGame(), (d) => {
      d.owner[6] = 1
      d.owner[8] = 1
      d.owner[9] = 1
    })
    s = rigDice(s, [2, 4])
    const r = act(s, 'a', { type: 'ROLL' })
    expect(r.s.players[0]!.cash).toBe(1500 - 12)
    expect(r.s.players[1]!.cash).toBe(1500 + 12)
  })
})

describe('jail', () => {
  const jailed = () =>
    edit(newGame(2, noAuction), (d) => {
      d.players[0]!.position = JAIL_INDEX
      d.players[0]!.inJail = true
    })

  it('leaves jail on doubles, moves, and does not roll again', () => {
    const r = act(rigDice(jailed(), [4, 4]), 'a', { type: 'ROLL' })
    expect(r.s.players[0]!).toMatchObject({ inJail: false, position: 18 })
    expect(r.events.find((e) => e.type === 'RELEASED')).toMatchObject({ how: 'doubles' })
    const after = act(r.s, 'a', { type: 'DECLINE_BUY' }).s
    expect(after.phase).toBe('postRoll')
  })

  it('stays on a failed roll and is forced to pay after the third failure', () => {
    let s = jailed()
    for (let attempt = 1; attempt <= 2; attempt++) {
      const r = act(rigDice(s, [1, 2]), 'a', { type: 'ROLL' })
      expect(r.s.players[0]!).toMatchObject({ inJail: true, position: JAIL_INDEX, jailTurns: attempt })
      s = edit(r.s, (d) => (d.phase = 'preRoll'))
    }
    const r = act(rigDice(s, [1, 2]), 'a', { type: 'ROLL' })
    expect(r.s.players[0]!).toMatchObject({ inJail: false, position: 13, cash: 1450 })
  })

  it('pays the fine or uses a card before rolling', () => {
    const paid = act(jailed(), 'a', { type: 'PAY_JAIL_FINE' }).s
    expect(paid.players[0]!).toMatchObject({ inJail: false, cash: 1450 })
    expect(paid.phase).toBe('preRoll')

    const withCard = edit(jailed(), (d) => {
      d.players[0]!.jailCards = ['chance']
      d.decks.chance = d.decks.chance.filter((c) => c !== 8)
    })
    const used = act(withCard, 'a', { type: 'USE_JAIL_CARD' }).s
    expect(used.players[0]!).toMatchObject({ inJail: false, jailCards: [] })
    expect(used.decks.chance.at(-1)).toBe(8)
    expect(reject(jailed(), 'a', { type: 'USE_JAIL_CARD' })).toMatch(/no card/)
  })
})

describe('debt and bankruptcy', () => {
  /** b owns Grand Terrace with a hotel; a is nearly broke and about to land on it. */
  const trap = (cash: number) =>
    rigDice(
      edit(newGame(3), (d) => {
        d.owner[37] = 1
        d.owner[39] = 1
        d.owner[11] = 0
        d.houses[39] = 5
        d.players[0]!.position = 35
        d.players[0]!.cash = cash
      }),
      [1, 3],
    )

  it('queues an unaffordable payment as a debt that blocks the turn', () => {
    const r = act(trap(300), 'a', { type: 'ROLL' })
    expect(r.s.debts).toEqual([{ debtor: 0, creditor: 1, amount: 2000, reason: 'rent' }])
    expect(r.s.players[0]!.cash).toBe(300)
    expect(reject(r.s, 'a', { type: 'END_TURN' })).toMatch(/debt/)
    expect(legalActions(r.s, 'a')).toContainEqual({ type: 'DECLARE_BANKRUPTCY' })
    expect(legalActions(r.s, 'a')).not.toContainEqual({ type: 'END_TURN' })
  })

  it('bankrupts to a player: they get cash and properties; play continues', () => {
    let s = act(trap(300), 'a', { type: 'ROLL' }).s
    const r = act(s, 'a', { type: 'DECLARE_BANKRUPTCY' })
    s = r.s
    expect(s.players[0]!.bankrupt).toBe(true)
    expect(s.players[1]!.cash).toBe(1800)
    expect(s.owner[11]).toBe(1)
    expect(s.debts).toEqual([])
    expect(s.current).toBe(1)
    expect(types(r.events)).toContain('BANKRUPT')
    expect(legalActions(s, 'a')).toEqual([])
  })

  it('ends the game when one player is left', () => {
    const two = rigDice(
      edit(newGame(2), (d) => {
        d.owner[39] = 1
        d.houses[39] = 5
        d.owner[37] = 1
        d.players[0]!.position = 35
        d.players[0]!.cash = 10
      }),
      [1, 3],
    )
    const s = act(two, 'a', { type: 'ROLL' }).s
    const r = act(s, 'a', { type: 'DECLARE_BANKRUPTCY' })
    expect(r.s.phase).toBe('gameOver')
    expect(r.s.winner).toBe(1)
    expect(r.events.at(-1)).toEqual({ type: 'GAME_OVER', winner: 'b', reason: 'lastStanding' })
  })

  it('bankrupts to the bank: properties return unowned and unmortgaged', () => {
    let s = edit(newGame(3), (d) => {
      d.owner[11] = 0
      d.mortgaged[11] = true
      d.players[0]!.position = 1
      d.players[0]!.cash = 100
    })
    s = act(rigDice(s, [1, 2]), 'a', { type: 'ROLL' }).s // lands on 4: income tax 200
    expect(s.debts[0]).toMatchObject({ creditor: -1, amount: 200 })
    s = act(s, 'a', { type: 'DECLARE_BANKRUPTCY' }).s
    expect(s.owner[11]).toBe(-1)
    expect(s.mortgaged[11]).toBe(false)
  })

  describe('bankTakesEstate (D65)', () => {
    const estate = (s: GameState) =>
      edit(s, (d) => {
        d.config.bankTakesEstate = true
        d.mortgaged[11] = true
        d.players[0]!.jailCards = ['chance']
        d.decks.chance = d.decks.chance.filter((c) => c !== 8)
      })

    it('the bank pays the creditor in full and takes back the properties', () => {
      let s = act(estate(trap(300)), 'a', { type: 'ROLL' }).s
      const r = act(s, 'a', { type: 'DECLARE_BANKRUPTCY' })
      s = r.s
      expect(s.players[0]!).toMatchObject({ bankrupt: true, cash: 0, jailCards: [] })
      expect(s.players[1]!.cash).toBe(1500 + 2000)
      expect(s.owner[11]).toBe(-1)
      expect(s.mortgaged[11]).toBe(false)
      expect(s.decks.chance.at(-1)).toBe(8)
      expect(s.debts).toEqual([])
      expect(r.events).toContainEqual({ type: 'BANKRUPT', playerId: 'a', to: 'bank' })
      expect(r.events).toContainEqual({ type: 'PROPERTY_TRANSFERRED', space: 11, from: 'a', to: 'bank' })
    })

    it('pays every player the bankrupt one owed', () => {
      let s = act(estate(trap(300)), 'a', { type: 'ROLL' }).s
      s = edit(s, (d) => d.debts.push({ debtor: 0, creditor: 2, amount: 50, reason: 'card' }))
      s = act(s, 'a', { type: 'DECLARE_BANKRUPTCY' }).s
      expect(s.players[1]!.cash).toBe(3500)
      expect(s.players[2]!.cash).toBe(1550)
    })

    it('is on in Standard and Turbo, off in Classic', () => {
      expect(PRESETS.standard.bankTakesEstate).toBe(true)
      expect(PRESETS.turbo.bankTakesEstate).toBe(true)
      expect(PRESETS.classic.bankTakesEstate).toBeUndefined()
    })
  })
})

describe('rounds and game end', () => {
  it('announces the final round and ends by net worth at the round limit', () => {
    let s = edit(newGame(2, { roundLimit: 2 }), (d) => {
      d.owner[39] = 1
      d.phase = 'postRoll'
    })
    s = act(s, 'a', { type: 'END_TURN' }).s
    s = edit(s, (d) => (d.phase = 'postRoll'))
    const r = act(s, 'b', { type: 'END_TURN' })
    expect(types(r.events)).toContain('FINAL_ROUND')
    s = edit(r.s, (d) => (d.phase = 'postRoll'))
    s = act(s, 'a', { type: 'END_TURN' }).s
    s = edit(s, (d) => (d.phase = 'postRoll'))
    const end = act(s, 'b', { type: 'END_TURN' })
    expect(end.s.phase).toBe('gameOver')
    expect(end.events.at(-1)).toEqual({ type: 'GAME_OVER', winner: 'b', reason: 'roundLimit' })
  })
})

describe('engine contract', () => {
  it('never mutates its input', () => {
    const s = rigDice(newGame(), [2, 4])
    const before = JSON.stringify(s)
    act(s, 'a', { type: 'ROLL' })
    expect(JSON.stringify(s)).toBe(before)
  })

  it('maps TIMEOUT to the default choice for the expected actor only', () => {
    const s = rigDice(newGame(), [2, 4])
    expect(reject(s, 'b', { type: 'TIMEOUT' })).toMatch(/not waiting/)
    const rolled = act(s, 'a', { type: 'TIMEOUT' }).s
    expect(rolled.players[0]!.position).toBe(6)
    const declined = act(rolled, 'a', { type: 'TIMEOUT' }).s
    expect(declined.pending).toMatchObject({ kind: 'auction', space: 6 })
  })

  it('round-trips through JSON', () => {
    const s = act(rigDice(newGame(4), [2, 4]), 'a', { type: 'ROLL' }).s
    expect(JSON.parse(JSON.stringify(s))).toEqual(s)
  })

  it('hides deck order and RNG in observations', () => {
    const v = observe(newGame(), 'a')
    expect(v.rng).toBe(0)
    expect(v.decks.chance.every((c) => c === -1)).toBe(true)
    expect(v.decks.chance).toHaveLength(16)
  })

  it('has board data that adds up', () => {
    expect(SPACES.filter((sp) => sp.kind === 'property').every((sp) => sp.rent.length === 6)).toBe(true)
  })
})
