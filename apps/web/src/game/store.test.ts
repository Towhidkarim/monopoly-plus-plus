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
    punch: () => {},
    skipAnimations: () => {},
  }
}

/** A stub board with 3D dice: the throw lands, pops, flies (moves may start), then finishes. */
function diceBoard() {
  const board = stubBoard()
  const log: string[] = []
  let finish = (): void => {}
  const throwDice: NonNullable<BoardPort['throwDice']> = (o) => {
    log.push(`throw ${o.values.join('+')}`)
    o.onBounce?.(0.8, 0)
    o.onBounce?.(0.4, 1)
    o.onSettle?.({
      values: [o.values[0], o.values[1]],
      total: 0,
      doubles: false,
      screen: { x: 0, y: 0 },
      popInMs: 0,
    })
    o.onFly?.()
    return new Promise((r) => {
      finish = () => {
        log.push('landed in tray')
        r({ values: [o.values[0], o.values[1]], durationMs: 0, seed: 0, tries: 1 })
      }
    })
  }
  const play = board.play
  return {
    ...board,
    log,
    throwDice,
    land: () => finish(),
    play: async (e: Parameters<BoardPort['play']>[0]) => {
      log.push(e.type)
      return play(e)
    },
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

  it('throws 3D dice with the engine values, moves on as they fly, and fills the tray after', async () => {
    const store = new GameStore({ preset: 'classic', seed: 3, seats: seats(['human', 'bot']) })
    store.setSettings({ fastBots: true, speed: 50, dice3d: true })
    const board = diceBoard()
    store.attach(board)
    const fx: string[] = []
    store.onFx((f) => fx.push(f.kind))
    expect(store.dispatch('p1', { type: 'ROLL' })).toBeNull()
    await vi.advanceTimersByTimeAsync(10)
    const dice = store.getSnapshot().dice!
    expect(board.log[0]).toBe(`throw ${dice[0]}+${dice[1]}`)
    // The token moves while the dice are still flying to the tray; the tray waits for them.
    expect(board.log).toContain('MOVED')
    expect(store.getSnapshot().diceLanding).toBe(true)
    expect(fx.filter((k) => k === 'diceHit')).toHaveLength(1)
    expect(fx).toContain('diceSettle')
    board.land()
    await vi.advanceTimersByTimeAsync(2000)
    expect(store.getSnapshot().diceLanding).toBe(false)
    store.dispose()
  })

  it('rolls in the tray when 3D dice are off', async () => {
    const store = new GameStore({ preset: 'classic', seed: 3, seats: seats(['human', 'bot']) })
    store.setSettings({ fastBots: true, speed: 50, dice3d: false })
    const board = diceBoard()
    store.attach(board)
    store.dispatch('p1', { type: 'ROLL' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(board.log.some((l) => l.startsWith('throw'))).toBe(false)
    expect(board.log).toContain('MOVED')
    expect(store.getSnapshot().diceLanding).toBe(false)
    store.dispose()
  })

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

  it('bots answer offers out of turn, so bot-to-bot deals happen in the real store', async () => {
    const store = new GameStore({ preset: 'standard', seed: 5, seats: seats(['bot', 'bot', 'bot', 'bot']) })
    store.setSettings({ fastBots: true, speed: 50 })
    const deals: string[] = []
    store.onFx((fx) => fx.kind === 'callout' && fx.title.startsWith('Deal') && deals.push(fx.title))
    store.attach(stubBoard())
    for (let i = 0; i < 20_000 && deals.length === 0 && store.getSnapshot().state.phase !== 'gameOver'; i++) {
      await vi.advanceTimersByTimeAsync(100)
    }
    expect(deals.length).toBeGreaterThan(0)
    expect(store.getSnapshot().state.trades.length).toBeLessThanOrEqual(4)
    store.dispose()
  }, 120_000)

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

describe('GameStore trades with humans', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const gift = (cash: number) => ({ spaces: [], cash, jailCards: 0 })
  const nothing = gift(0)

  it('a bot answers a human offer: a token gift is declined (with a callout), a big one accepted', async () => {
    const store = new GameStore({ preset: 'turbo', seed: 4, seats: seats(['human', 'bot']) })
    store.setSettings({ fastBots: true, speed: 50 })
    const callouts: string[] = []
    store.onFx((fx) => fx.kind === 'callout' && callouts.push(fx.title))
    store.attach(stubBoard())
    expect(store.dispatch('p1', { type: 'PROPOSE_TRADE', to: 'p2', give: gift(1), get: nothing })).toBeNull()
    await vi.advanceTimersByTimeAsync(2000)
    expect(store.getSnapshot().state.trades).toEqual([])
    expect(callouts.some((t) => /declined/.test(t))).toBe(true)

    const before = store.getSnapshot().state.players[1]!.cash
    store.dispatch('p1', { type: 'PROPOSE_TRADE', to: 'p2', give: gift(300), get: nothing })
    await vi.advanceTimersByTimeAsync(2000)
    expect(store.getSnapshot().state.players[1]!.cash).toBe(before + 300)
    store.dispose()
  })

  it('the bots wait while a human has an offer to answer', async () => {
    const store = new GameStore({ preset: 'turbo', seed: 4, seats: seats(['bot', 'human']) })
    store.setSettings({ fastBots: true, speed: 50 })
    store.attach(stubBoard())
    // Before the bot's first move fires, it offers the human a deal.
    store.dispatch('p1', { type: 'PROPOSE_TRADE', to: 'p2', give: gift(10), get: nothing })
    await vi.advanceTimersByTimeAsync(5000)
    expect(store.getSnapshot().state.turnCount).toBe(0)
    expect(store.getSnapshot().state.lastDice).toBeNull()
    expect(store.getSnapshot().state.trades).toHaveLength(1)

    const tradeId = store.getSnapshot().state.trades[0]!.id
    store.dispatch('p2', { type: 'REJECT_TRADE', tradeId })
    await vi.advanceTimersByTimeAsync(5000)
    expect(store.getSnapshot().state.turnCount).toBeGreaterThan(0)
    store.dispose()
  })

  it('tells the human what a bot would want, and that amount is enough', () => {
    const store = new GameStore({ preset: 'turbo', seed: 4, seats: seats(['human', 'bot']) })
    const s = store.getSnapshot().state
    const theirs = s.owner.findIndex((o) => o === 1)
    expect(theirs).toBeGreaterThanOrEqual(0)
    const want = { spaces: [theirs], cash: 0, jailCards: 0 }
    const ask = store.tradeVerdict(store.getSnapshot().state, 0, 1, nothing, want)
    expect(ask).toMatchObject({ kind: 'bot', accepts: false })
    const more = ask.kind === 'bot' ? (ask.more ?? 0) : 0
    expect(more).toBeGreaterThan(0)
    expect(store.tradeVerdict(store.getSnapshot().state, 0, 1, gift(more), want)).toMatchObject({
      kind: 'bot',
      accepts: true,
    })
    expect(store.tradeVerdict(store.getSnapshot().state, 0, 1, gift(more - 10), want)).toMatchObject({
      accepts: false,
    })
    expect(store.tradeVerdict(store.getSnapshot().state, 1, 0, nothing, nothing)).toEqual({ kind: 'human' })
    store.dispose()
  })
})
