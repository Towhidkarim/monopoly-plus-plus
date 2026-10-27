import { describe, expect, it } from 'vitest'
import { GROUPS, PRESETS, createGame, observe, type Action, type GameState } from '@skyline/engine'
import { botRng } from '../bot.ts'
import { createHeuristicBot } from './bot.ts'
import { reserveFor } from './model.ts'
import { BALANCED } from './params.ts'
import { accepts, candidates, offerKey, proposal } from './trades.ts'

function game(edit: (s: GameState) => void): GameState {
  const s = createGame(
    ['a', 'b', 'c'].map((id) => ({ id, name: id })),
    1,
    PRESETS.classic,
  )
  s.phase = 'postRoll'
  edit(s)
  return s
}

const own = (s: GameState, seat: number, spaces: readonly number[]) => {
  for (const i of spaces) s.owner[i] = seat
}

const decide = (s: GameState, bot = createHeuristicBot(), id = 'a'): Action | null =>
  bot.decide(observe(s, id), id, botRng(1))

/** Seat 0 misses GROUPS[3][2] (seat 1 has it); seat 1 misses GROUPS[0][1] (seat 0 has it). */
const swapGame = () =>
  game((x) => {
    const [a, b, c] = GROUPS[3]!
    own(x, 0, [a!, b!, GROUPS[0]![1]!])
    own(x, 1, [c!, GROUPS[0]![0]!])
  })

describe('bot trade proposals', () => {
  it('proposes a set swap when both sides complete a set', () => {
    const s = swapGame()
    s.players[0]!.cash = 900
    expect(decide(s)).toMatchObject({ type: 'PROPOSE_TRADE', to: 'b' })
    // Among the candidates is a swap that both sides like (the cheaper cash-only deal may win).
    const swaps = candidates(s, 0, 1, 500, 500, BALANCED).filter(
      (o) => o.give.spaces.includes(GROUPS[0]![1]!) && o.get.spaces.includes(GROUPS[3]![2]!),
    )
    expect(swaps.length).toBeGreaterThan(0)
    expect(swaps.some((o) => accepts(s, 1, o, BALANCED) && accepts(s, 0, o, BALANCED))).toBe(true)
  })

  it('never offers cash that leaves it below its reserve', () => {
    const excess = [0, 150, 400, 1500].map((cash) => {
      const s = swapGame()
      s.players[0]!.cash = cash
      const o = proposal(s, 0, BALANCED, () => true)
      return (o?.give.cash ?? 0) - Math.max(0, cash - reserveFor(s, 0, BALANCED) * 0.6)
    })
    expect(Math.max(...excess)).toBeLessThanOrEqual(0)
  })

  it('does not repeat an identical offer within the cooldown', () => {
    const s = swapGame()
    const bot = createHeuristicBot()
    const first = decide(s, bot)
    expect(first?.type).toBe('PROPOSE_TRADE')
    // The offer vanished (rejected) and a few turns passed: same position, same bot.
    s.turnCount += 3
    const keyOf = (a: Action | null) =>
      a?.type === 'PROPOSE_TRADE' ? offerKey({ from: 0, to: 1, give: a.give, get: a.get }) : 'none'
    expect(keyOf(decide(s, bot))).not.toBe(keyOf(first))
    // Long after, it may try again.
    s.turnCount += 40
    expect(keyOf(decide(s, bot))).toBe(keyOf(first))
  })

  it('is deterministic', () => {
    const s = swapGame()
    expect(decide(s)).toEqual(decide(s))
  })
})
