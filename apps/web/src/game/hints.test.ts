import { describe, expect, it } from 'vitest'
import { GROUPS, PRESETS, SPACES, createGame, type GameState } from '@skyline/engine'
import { hintFor } from './hints.ts'

const players = [
  { id: 'a', name: 'Ada' },
  { id: 'b', name: 'Bo' },
]

/** A fresh classic game where seat 0 is mid-turn (rolled, nothing pending). */
function game(edit: (s: GameState) => void): GameState {
  const s = createGame(players, 1, PRESETS.classic)
  s.phase = 'postRoll'
  edit(s)
  return s
}

const give = (s: GameState, seat: number, spaces: readonly number[]) => {
  for (const i of spaces) s.owner[i] = seat
}

describe('hintFor', () => {
  it('warns about a big rent within one roll when cash is short', () => {
    const s = game((x) => {
      give(x, 1, GROUPS[7]!)
      x.houses[39] = 3
      x.players[0]!.position = 33
      x.players[0]!.cash = 300
    })
    const h = hintFor(s, 0)
    expect(h?.tone).toBe('warn')
    expect(h?.text).toContain(SPACES[39]!.name)
  })

  it('points at a buildable set, then at the last missing piece', () => {
    const set = game((x) => give(x, 0, GROUPS[1]!))
    expect(hintFor(set, 0)?.text).toMatch(/set is complete/)
    const near = game((x) => {
      give(x, 0, GROUPS[1]!.slice(1))
      x.owner[GROUPS[1]![0]!] = 1
    })
    expect(hintFor(near, 0)?.text).toMatch(/^Bo holds/)
  })
})
