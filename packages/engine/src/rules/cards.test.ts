import { describe, expect, it } from 'vitest'
import { JAIL_INDEX } from '../board.ts'
import type { Deck } from '../cards.ts'
import type { GameState } from '../state.ts'
import { act, edit, newGame, rigDice, types } from '../testkit.ts'

/** Start spots (and rolls of 8) that land seat a on a chance or chest space. */
const SPOT = { chance7: 1, chance22: 14, chance36: 28, chest17: 9 } as const

function top(s: GameState, deck: Deck, id: number, from: number): GameState {
  return edit(s, (d) => {
    d.decks[deck] = [id, ...d.decks[deck].filter((c) => c !== id)]
    d.players[0]!.position = from
  })
}

/** Rolls seat a onto a chance/chest space with `id` on top. Dice default to a non-double 8 or 6. */
function draw(
  s: GameState,
  deck: Deck,
  id: number,
  from: number,
  ...dice: [number, number][]
): ReturnType<typeof act> {
  const steps: [number, number] = from === 1 ? [2, 4] : [3, 5]
  return act(rigDice(top(s, deck, id, from), ...(dice.length ? dice : [steps])), 'a', { type: 'ROLL' })
}

describe('deck handling', () => {
  it('sends a drawn card to the bottom of its deck', () => {
    const s = newGame()
    const before = top(s, 'chance', 7, SPOT.chance7).decks.chance
    const r = draw(s, 'chance', 7, SPOT.chance7)
    expect(r.s.decks.chance).toEqual([...before.slice(1), 7])
    expect(r.events.find((e) => e.type === 'CARD_DRAWN')).toMatchObject({
      playerId: 'a',
      deck: 'chance',
      cardId: 7,
    })
  })

  it('keeps get-out-of-jail cards with the player until used, then returns them', () => {
    const r = draw(newGame(), 'chance', 8, SPOT.chance7)
    expect(r.s.players[0]!.jailCards).toEqual(['chance'])
    expect(r.s.decks.chance).toHaveLength(15)
    expect(r.s.decks.chance).not.toContain(8)
    expect(types(r.events)).toContain('JAIL_CARD_GAINED')

    const jailed = edit(r.s, (d) => {
      d.players[0]!.inJail = true
      d.players[0]!.position = JAIL_INDEX
      d.phase = 'preRoll'
      d.pending = null
    })
    const used = act(jailed, 'a', { type: 'USE_JAIL_CARD' }).s
    expect(used.players[0]!.jailCards).toEqual([])
    expect(used.decks.chance).toHaveLength(16)
    expect(used.decks.chance.at(-1)).toBe(8)
  })
})

describe('movement cards', () => {
  it('advances to GO and collects the salary', () => {
    const r = draw(newGame(), 'chance', 1, SPOT.chance7)
    expect(r.s.players[0]!.position).toBe(0)
    expect(r.s.players[0]!.cash).toBe(1700)
  })

  it('collects salary when the advance passes GO, then offers the property', () => {
    const r = draw(newGame(), 'chance', 3, SPOT.chance36)
    expect(r.s.players[0]!).toMatchObject({ position: 11, cash: 1700 })
    expect(r.s.pending).toEqual({ kind: 'buy', space: 11 })
  })

  it('pays double rent to the owner of the nearest railroad', () => {
    const s = edit(newGame(), (d) => (d.owner[15] = 1))
    const r = draw(s, 'chance', 4, SPOT.chance7)
    expect(r.s.players[0]!).toMatchObject({ position: 15, cash: 1450 })
    expect(r.s.players[1]!.cash).toBe(1550)
  })

  it('offers an unowned nearest railroad for purchase', () => {
    const r = draw(newGame(), 'chance', 5, SPOT.chance22)
    expect(r.s.players[0]!.position).toBe(25)
    expect(r.s.pending).toEqual({ kind: 'buy', space: 25 })
  })

  it('wraps to the nearest railroad past GO', () => {
    const r = draw(newGame(), 'chance', 4, SPOT.chance36)
    expect(r.s.players[0]!).toMatchObject({ position: 5, cash: 1700 })
  })

  it('pays 10x a fresh roll at an owned nearest utility', () => {
    const s = edit(newGame(), (d) => (d.owner[12] = 1))
    const r = draw(s, 'chance', 6, SPOT.chance7, [2, 4], [3, 4])
    expect(r.s.players[0]!).toMatchObject({ position: 12, cash: 1430 })
    expect(r.s.players[1]!.cash).toBe(1570)
    expect(r.s.lastDice).toEqual([2, 4])
    const rolls = r.events.filter((e) => e.type === 'DICE_ROLLED')
    expect(rolls).toHaveLength(2)
    expect(rolls[1]).toMatchObject({ dice: [3, 4] })
  })

  it('offers an unowned nearest utility for purchase', () => {
    const r = draw(newGame(), 'chance', 6, SPOT.chance22)
    expect(r.s.players[0]!.position).toBe(28)
    expect(r.s.pending).toEqual({ kind: 'buy', space: 28 })
    expect(r.events.filter((e) => e.type === 'DICE_ROLLED')).toHaveLength(1)
  })

  it('goes back 3 spaces without salary and resolves the landing', () => {
    const r = draw(newGame(), 'chance', 9, SPOT.chance7)
    expect(r.s.players[0]!).toMatchObject({ position: 4, cash: 1300 })
    expect(r.events.find((e) => e.type === 'MOVED' && e.path.length === 3)).toMatchObject({
      path: [6, 5, 4],
      passedGo: false,
    })
  })

  it('sends the player to jail and ends their rolling', () => {
    const r = draw(newGame(), 'chest', 5, SPOT.chest17)
    expect(r.s.players[0]!).toMatchObject({ position: JAIL_INDEX, inJail: true, cash: 1500 })
    expect(r.s.phase).toBe('postRoll')
  })
})

describe('money cards', () => {
  it('pays the player from the bank', () => {
    const r = draw(newGame(), 'chance', 7, SPOT.chance7)
    expect(r.s.players[0]!.cash).toBe(1550)
  })

  it('charges the player', () => {
    const r = draw(newGame(), 'chance', 12, SPOT.chance7)
    expect(r.s.players[0]!.cash).toBe(1485)
  })

  it('pays every other player', () => {
    const r = draw(newGame(3), 'chance', 14, SPOT.chance7)
    expect(r.s.players.map((p) => p.cash)).toEqual([1400, 1550, 1550])
  })

  it('skips bankrupt players when paying', () => {
    const s = edit(newGame(3), (d) => (d.players[2]!.bankrupt = true))
    const r = draw(s, 'chance', 14, SPOT.chance7)
    expect(r.s.players.map((p) => p.cash)).toEqual([1450, 1550, 1500])
  })

  it('collects birthday money and queues a debt for a broke player', () => {
    const s = edit(newGame(3), (d) => (d.players[2]!.cash = 0))
    const r = draw(s, 'chest', 8, SPOT.chest17)
    expect(r.s.players.map((p) => p.cash)).toEqual([1510, 1490, 0])
    expect(r.s.debts).toEqual([{ debtor: 2, creditor: 0, amount: 10, reason: 'card' }])
    expect(types(r.events)).toContain('DEBT_INCURRED')
  })

  it('charges repairs per house and hotel', () => {
    const s = edit(newGame(), (d) => {
      d.owner[1] = 0
      d.houses[1] = 3
      d.owner[3] = 0
      d.houses[3] = 5
      d.owner[6] = 0
      d.houses[6] = 2
    })
    // chance: 5 houses * 25 + 1 hotel * 100
    expect(draw(s, 'chance', 11, SPOT.chance7).s.players[0]!.cash).toBe(1275)
    // chest: 5 houses * 40 + 1 hotel * 115
    expect(draw(s, 'chest', 13, SPOT.chest17).s.players[0]!.cash).toBe(1185)
  })

  it('charges nothing for repairs without buildings', () => {
    const r = draw(newGame(), 'chance', 11, SPOT.chance7)
    expect(r.s.players[0]!.cash).toBe(1500)
    expect(r.events.some((e) => e.type === 'CASH_CHANGED')).toBe(false)
  })
})
