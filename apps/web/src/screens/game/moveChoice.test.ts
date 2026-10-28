import { describe, expect, it } from 'vitest'
import { PRESETS, createGame, type GameState } from '@skyline/engine'
import { landing, moveOptions } from './moveChoice.ts'

function game(edit: (s: GameState) => void): GameState {
  const s = createGame(
    [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
    1,
    { ...PRESETS.classic, speedDie: true },
  )
  edit(s)
  return s
}

describe('move choice tags', () => {
  it('names rent, sales, taxes and cards', () => {
    const s = game((d) => (d.owner[3] = 1))
    expect(landing(s, 0, 3, 3)).toMatchObject({ tag: 'Rent ₵4', tone: 'rent', owner: 1, steps: 3 })
    expect(landing(s, 0, 1, 1)).toMatchObject({ tag: 'For sale ₵60', tone: 'buy' })
    expect(landing(s, 0, 4, 4)).toMatchObject({ tag: 'Tax ₵200', tone: 'bad' })
    expect(landing(s, 0, 2, 2).tag).toBe('Draw a card')
  })

  it('adds the salary when the move passes the start', () => {
    const s = game((d) => (d.players[0]!.position = 38))
    expect(landing(s, 0, 1, 3).tag).toBe('For sale ₵60 · +₵200')
  })

  it('lists every Bus option, and for triples the normal move plus the best few', () => {
    const bus = game((d) => (d.pending = { kind: 'move', reason: 'bus', options: [7, 2, 5], diceTotal: 7 }))
    expect(moveOptions(bus, 0).map((o) => o.space)).toEqual([7, 2, 5])

    const triples = game((d) => {
      d.owner = d.owner.map(() => 1)
      d.owner[39] = -1
      d.pending = {
        kind: 'move',
        reason: 'triples',
        options: [6, ...Array.from({ length: 40 }, (_, i) => i).filter((i) => i !== 0 && i !== 6)],
        diceTotal: 4,
      }
    })
    const shown = moveOptions(triples, 0)
    expect(shown[0]!.space).toBe(6)
    expect(shown[1]!.space).toBe(39) // the only lot still for sale
    expect(shown).toHaveLength(4)
  })
})
