import { describe, expect, it } from 'vitest'
import { Animator } from './animator.ts'

describe('Animator', () => {
  it('runs tweens over time', async () => {
    const a = new Animator()
    let p = 0
    const done = a.tween(100, (x) => (p = x))
    a.step(50)
    expect(p).toBe(0.5)
    a.step(50)
    await done
    expect(p).toBe(1)
  })

  it('a skip also finishes the steps a choreography starts afterwards, until resume', async () => {
    const a = new Animator()
    const seen: number[] = []
    // A three-step move: each step starts when the previous one ends.
    const move = (async () => {
      for (let i = 0; i < 3; i++) await a.tween(150, (x) => x === 1 && seen.push(i))
    })()
    a.step(10)
    a.skip()
    await move
    expect(seen).toEqual([0, 1, 2])

    a.resume()
    let p = 0
    void a.tween(100, (x) => (p = x))
    a.step(25)
    expect(p).toBe(0.25)
  })
})
