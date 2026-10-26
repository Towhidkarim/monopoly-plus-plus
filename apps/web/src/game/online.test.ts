import { createGame, expectedActor, legalActions, observe, reduce, type GameState } from '@skyline/engine'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { presentFrom } from './presented.ts'
import type { GameSetup } from './setup.ts'
import { GameStore, boardSnapshot, type BoardPort } from './store.ts'

const setup: GameSetup = {
  preset: 'standard',
  seed: 0,
  seats: [
    { id: 'p1', name: 'Ada', kind: 'human', piece: 'taxi', color: 1 },
    { id: 'p2', name: 'Bo', kind: 'remote', piece: 'drone', color: 2 },
  ],
}

/** Plays `n` legal moves from `s` (whoever is expected to act). */
function advance(s: GameState, n: number): GameState {
  for (let i = 0; i < n; i++) {
    const id = s.players[expectedActor(s)]!.id
    const action = legalActions(s, id).find((a) => a.type !== 'TIMEOUT')
    if (!action) break
    const r = reduce(s, id, action)
    if (!r.ok) throw new Error(r.error)
    s = r.state
  }
  return s
}

/** A board whose animations hang until skipped, like a real one in the middle of a move. */
function hangingBoard() {
  const synced: ReturnType<typeof boardSnapshot>[] = []
  let release = (): void => {}
  const board: BoardPort = {
    setPlayers: () => {},
    sync: (b) => void synced.push(b),
    play: () => new Promise<void>((r) => (release = r)),
    setTuning: () => {},
    punch: () => {},
    skipAnimations: () => release(),
  }
  return { board, synced }
}

describe('online store', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('drops a running animation on resync and lands exactly on the fresh view', async () => {
    const s0 = createGame(
      setup.seats.map((s) => ({ id: s.id, name: s.name })),
      3,
    )
    const store = new GameStore(setup, [], { me: 'p1', view: observe(s0, 'p1'), send: () => {} })
    store.setSettings({ dice3d: false, instant: false })
    const { board, synced } = hangingBoard()
    store.attach(board)

    const r = reduce(s0, 'p1', { type: 'ROLL' })
    if (!r.ok) throw new Error(r.error)
    store.receive(r.events, observe(r.state, 'p1'))
    await vi.advanceTimersByTimeAsync(5000)
    expect(store.getSnapshot().busy).toBe(true)

    // The connection resumed with a snapshot several moves later.
    const later = observe(advance(r.state, 6), 'p1')
    store.resync(later)
    await vi.advanceTimersByTimeAsync(5000)

    const snap = store.getSnapshot()
    expect(snap.busy).toBe(false)
    expect(snap.card).toBeNull()
    expect(snap.state).toEqual(later)
    expect(snap.presented).toEqual(presentFrom(later))
    expect(synced.at(-1)).toEqual(boardSnapshot(later))
  })

  it('resyncs at once when nothing is playing', () => {
    const s0 = createGame(
      setup.seats.map((s) => ({ id: s.id, name: s.name })),
      4,
    )
    const store = new GameStore(setup, [], { me: 'p1', view: observe(s0, 'p1'), send: () => {} })
    const { board, synced } = hangingBoard()
    store.attach(board)
    const later = observe(advance(s0, 5), 'p1')
    store.resync(later)
    expect(store.getSnapshot()).toMatchObject({ busy: false, state: later, presented: presentFrom(later) })
    expect(synced.at(-1)).toEqual(boardSnapshot(later))
  })
})
