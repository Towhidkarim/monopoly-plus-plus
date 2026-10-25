import { describe, expect, it } from 'vitest'
import { raiseOptions } from './auctionBids.ts'

describe('raiseOptions', () => {
  it('steps up from the high bid and adds the list price while it is higher', () => {
    expect(raiseOptions(140, 240, 1290).map((r) => [r.amount, r.step, r.key])).toEqual([
      [150, '+10', '1'],
      [165, '+25', '2'],
      [190, '+50', '3'],
      [240, 'list price', '4'],
    ])
  })
  it('drops the list price once the bidding has passed it', () => {
    expect(raiseOptions(300, 240, 1000).map((r) => r.step)).toEqual(['+10', '+25', '+50'])
  })
  it('hides what the bidder cannot afford', () => {
    expect(raiseOptions(140, 240, 170).map((r) => r.amount)).toEqual([150, 165])
  })
  it('does not repeat a step as the list price', () => {
    expect(raiseOptions(190, 200, 500).map((r) => r.step)).toEqual(['+10', '+25', '+50'])
  })
})
