import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkInvariants } from '@skyline/engine'
import { presentFrom } from './presented.ts'
import { GameStore, type BoardPort } from './store.ts'

/** A board that finishes every animation instantly and records what it was asked to play. */
function stubBoard(): BoardPort & { played: string[] } {
  const played: string[] = []
  return {
    played,
    setPlayers: () => {},
    sync: () => {},
    play: async (e) => {
      played.push(e.type)
    },
    setTuning: () => {},
    skipAnimations: () => {},
  }
}

const seats = (kinds: ('human' | 'bot')[]) =>
  kinds.map((kind, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    kind,
    piece: 'taxi' as const,
    color: 0xffffff,
  }))

describe('GameStore playback', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('runs an all-bot game to the end with the screen matching the engine', async () => {
    const store = new GameStore({ preset: 'turbo', seed: 11, seats: seats(['bot', 'bot', 'bot']) })
    store.setSettings({ fastBots: true, speed: 50 })
    const board = stubBoard()
    store.attach(board)
    for (let i = 0; i < 20_000 && store.getSnapshot().state.phase !== 'gameOver'; i++) {
      await vi.advanceTimersByTimeAsync(100)
    }
    await vi.advanceTimersByTimeAsync(1000)
    const snap = store.getSnapshot()
    expect(snap.state.phase).toBe('gameOver')
    expect(snap.busy).toBe(false)
    expect(snap.presented).toEqual(presentFrom(snap.state))
    expect(checkInvariants(snap.state)).toEqual([])
    expect(board.played).toContain('MOVED')
    expect(snap.log.length).toBeGreaterThan(0)
    store.dispose()
  }, 120_000)

  it('waits for a human and accepts their legal actions only', async () => {
    const store = new GameStore({ preset: 'classic', seed: 3, seats: seats(['human', 'bot']) })
    store.setSettings({ fastBots: true, speed: 50 })
    store.attach(stubBoard())
    await vi.advanceTimersByTimeAsync(2000)
    // Nothing happens until the human acts.
    expect(store.getSnapshot().state.turnCount).toBe(0)
    expect(store.dispatch('p2', { type: 'ROLL' })).toMatch(/not your turn/)
    expect(store.dispatch('p1', { type: 'ROLL' })).toBeNull()
    for (let i = 0; i < 50; i++) {
      store.ackCard() // a drawn card would otherwise wait for the human
      await vi.advanceTimersByTimeAsync(100)
    }
    expect(store.getSnapshot().busy).toBe(false)
    expect(store.getSnapshot().presented).toEqual(presentFrom(store.getSnapshot().state))
    store.dispose()
  })

  it("holds a human's card until it is acknowledged; a bot's closes by itself", async () => {
    const store = new GameStore({ preset: 'classic', seed: 3, seats: seats(['human', 'bot']) })
    store.setSettings({ speed: 50 })
    store.attach(stubBoard())
    // Hand-feed a card event through the playback queue.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test reaches into the private playback queue
    const queue = store as unknown as { queue: unknown[]; pump: () => Promise<void> }
    queue.queue.push({ type: 'CARD_DRAWN', playerId: 'p1', deck: 'chance', cardId: 0 })
    void queue.pump.call(store)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(store.getSnapshot().card).toMatchObject({ playerId: 'p1', waiting: true })
    store.ackCard()
    await vi.advanceTimersByTimeAsync(10)
    expect(store.getSnapshot().card).toBeNull()

    queue.queue.push({ type: 'CARD_DRAWN', playerId: 'p2', deck: 'chest', cardId: 0 })
    void queue.pump.call(store)
    await vi.advanceTimersByTimeAsync(5)
    expect(store.getSnapshot().card).toMatchObject({ playerId: 'p2', waiting: false })
    await vi.advanceTimersByTimeAsync(1000)
    expect(store.getSnapshot().card).toBeNull()
    store.dispose()
  })

  it('emits money effects: a transfer when rent flows between players', async () => {
    const store = new GameStore({ preset: 'turbo', seed: 11, seats: seats(['bot', 'bot']) })
    store.setSettings({ fastBots: true, speed: 50 })
    const kinds = new Set<string>()
    store.onFx((fx) => kinds.add(fx.kind))
    store.attach(stubBoard())
    for (let i = 0; i < 3000 && !kinds.has('transfer'); i++) await vi.advanceTimersByTimeAsync(100)
    expect(kinds).toContain('pop')
    expect(kinds).toContain('transfer')
    store.dispose()
  }, 60_000)
})
