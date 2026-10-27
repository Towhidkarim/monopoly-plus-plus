import { describe, expect, it } from 'vitest'
import { GROUPS, PRESETS, RAILROADS, createGame } from '@skyline/engine'
import { buyAdvice } from './advice.ts'

const players = [
  { id: 'a', name: 'Ada' },
  { id: 'b', name: 'Bo' },
]
const game = () => createGame(players, 1, PRESETS.classic)
const texts = (a: { text: string }[]) => a.map((x) => x.text).join(' | ')

describe('buyAdvice', () => {
  it('says when a buy completes your set', () => {
    const s = game()
    const [x, y, z] = GROUPS[1]!
    s.owner[x!] = 0
    s.owner[y!] = 0
    expect(buyAdvice(s, 0, z!, 100)[0]).toMatchObject({
      tone: 'good',
      text: expect.stringMatching(/^Completes/),
    })
  })

  it("says when a buy blocks a rival's set", () => {
    const s = game()
    const [x, y, z] = GROUPS[1]!
    s.owner[x!] = 1
    s.owner[y!] = 1
    expect(texts(buyAdvice(s, 0, z!, 100))).toMatch(/Blocks Bo/)
  })

  it('counts stations and gives the rent per visit', () => {
    const s = game()
    s.owner[RAILROADS[0]!] = 0
    expect(texts(buyAdvice(s, 0, RAILROADS[1]!, 200))).toMatch(/second station: ₵50/)
  })

  it('estimates payback, or warns when cash runs thin', () => {
    const s = game()
    const space = GROUPS[0]![0]!
    expect(texts(buyAdvice(s, 0, space, 60))).toMatch(/Pays for itself after about \d+ visits/)
    s.players[0]!.cash = 100
    expect(buyAdvice(s, 0, space, 60).at(-1)).toMatchObject({ tone: 'warn' })
    expect(texts(buyAdvice(s, 0, space, 160))).toMatch(/need ₵60 more/)
  })
})
