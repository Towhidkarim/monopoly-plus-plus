import { createGame, observe, reduce, type GameState } from '@skyline/engine'
import { CloseCode, viewChecksum, type LobbyInfo, type ServerMessage } from '@skyline/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Fx } from '../game/store.ts'
import { RoomConnection, citySeedOf, type TokenStore } from './connection.ts'

/** A socket the test opens, feeds and drops by hand. */
class FakeSocket {
  readyState: 0 | 1 | 2 | 3 = 0
  readonly sent: string[] = []
  onopen: ((ev: Event) => unknown) | null = null
  onmessage: ((ev: MessageEvent) => unknown) | null = null
  onclose: ((ev: CloseEvent) => unknown) | null = null
  readonly url: string
  constructor(url: string) {
    this.url = url
  }
  send(data: string): void {
    this.sent.push(data)
  }
  close(): void {
    this.readyState = 3
  }
  accept(): void {
    this.readyState = 1
    this.onopen?.(new Event('open'))
  }
  push(m: ServerMessage): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(m) }))
  }
  drop(code = 1006): void {
    this.readyState = 3
    this.onclose?.(new CloseEvent('close', { code }))
  }
  /** JSON messages sent (pings left out). */
  messages(): Record<string, unknown>[] {
    return this.sent.filter((s) => s !== 'ping').map((s) => JSON.parse(s))
  }
}

const lobby = (phase: LobbyInfo['phase']): LobbyInfo => ({
  code: 'ABCDE',
  phase,
  locked: false,
  settings: { preset: 'standard', rules: {}, turnSeconds: 0, botTakeover: false },
  seats: [
    {
      seat: 0,
      kind: 'human',
      name: 'Ada',
      color: 1,
      ready: true,
      connected: true,
      host: true,
      playerId: 'p1',
    },
    {
      seat: 1,
      kind: 'bot',
      name: 'Banker',
      color: 2,
      ready: true,
      connected: true,
      host: false,
      personality: 'banker',
      playerId: 'p2',
    },
  ],
})

const game = createGame(
  [
    { id: 'p1', name: 'Ada' },
    { id: 'p2', name: 'Banker' },
  ],
  9,
)

function setup(tokens: Record<string, string> = {}) {
  const sockets: FakeSocket[] = []
  const tokenStore: TokenStore = { get: (c) => tokens[c] ?? null, set: (c, t) => void (tokens[c] = t) }
  const conn = new RoomConnection({
    code: 'ABCDE',
    name: 'Ada',
    color: 1,
    base: 'ws://test',
    tokens: tokenStore,
    openSocket: (url) => {
      const s = new FakeSocket(url)
      sockets.push(s)
      return s
    },
  })
  const last = () => sockets.at(-1)!
  /** Accepts the socket and answers the join as the room would, with a started game. */
  const start = (view: GameState = observe(game, 'p1')) => {
    last().accept()
    last().push({
      type: 'welcome',
      v: 1,
      token: 'tok-ada-0000000000',
      seat: 0,
      epoch: 'e1',
      lobby: lobby('playing'),
    })
    last().push({ type: 'snapshot', seq: 0, view })
    const store = conn.getSnapshot().store!
    store.setSettings({ instant: true })
    return store
  }
  return { conn, sockets, last, start, tokens }
}

describe('RoomConnection', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('joins with the stored token and keeps the one the room returns', () => {
    const { conn, last, tokens } = setup({ ABCDE: 'old-token-000000000' })
    expect(last().url).toBe('ws://test/api/rooms/ABCDE/ws')
    last().accept()
    expect(last().messages()[0]).toMatchObject({
      type: 'join',
      v: 1,
      name: 'Ada',
      token: 'old-token-000000000',
    })
    expect(last().messages()[0]).not.toHaveProperty('resume')
    last().push({
      type: 'welcome',
      v: 1,
      token: 'new-token-000000000',
      seat: 0,
      epoch: 'e1',
      lobby: lobby('lobby'),
    })
    expect(tokens.ABCDE).toBe('new-token-000000000')
    expect(conn.getSnapshot()).toMatchObject({ status: 'open', seat: 0, lobby: { phase: 'lobby' } })
  })

  it('starts the game from the snapshot and sends only legal actions for our seat', () => {
    const { last, start } = setup()
    const store = start()
    expect(store.setup.seats.map((s) => [s.id, s.kind, s.personality])).toEqual([
      ['p1', 'human', undefined],
      ['p2', 'bot', 'banker'],
    ])
    expect(store.setup.citySeed).toBe(citySeedOf('ABCDE'))
    expect(store.getSnapshot().viewer).toBe(0)
    expect(store.canAct('p1')).toBe(true)
    expect(store.canAct('p2')).toBe(false)

    expect(store.dispatch('p2', { type: 'ROLL' })).toBe('not your seat')
    expect(store.dispatch('p1', { type: 'END_TURN' })).toBeTypeOf('string')
    expect(store.dispatch('p1', { type: 'ROLL' })).toBeNull()
    expect(
      last()
        .messages()
        .filter((m) => m.type === 'action'),
    ).toEqual([{ type: 'action', id: 1, action: { type: 'ROLL' } }])
  })

  it('plays confirmed events and takes the view that comes with them', async () => {
    const { last, start } = setup()
    const store = start()
    const r = reduce(game, 'p1', { type: 'ROLL' })
    if (!r.ok) throw new Error(r.error)
    last().push({
      type: 'events',
      seq: 1,
      actor: 'p1',
      action: { type: 'ROLL' },
      events: r.events,
      view: observe(r.state, 'p1'),
    })
    await vi.advanceTimersByTimeAsync(1000)
    expect(store.getSnapshot().state).toEqual(observe(r.state, 'p1'))
    expect(store.getSnapshot().presented.players[0]!.position).toBe(r.state.players[0]!.position)
  })

  it('resumes after a gap in the sequence numbers', () => {
    const { sockets, last, start } = setup()
    start()
    last().push({ type: 'events', seq: 2, actor: 'p1', action: { type: 'ROLL' }, events: [] })
    expect(sockets).toHaveLength(2)
    last().accept()
    expect(last().messages()[0]).toMatchObject({ type: 'join', resume: { epoch: 'e1', seq: 0 } })
  })

  it('reconnects with backoff, but not after being replaced', () => {
    const { conn, sockets, last, start } = setup()
    start()
    last().drop()
    expect(conn.getSnapshot().status).toBe('reconnecting')
    vi.advanceTimersByTime(499)
    expect(sockets).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(sockets).toHaveLength(2)

    last().accept()
    last().push({ type: 'error', code: 'replaced' })
    last().drop(CloseCode.replaced)
    vi.advanceTimersByTime(60_000)
    expect(sockets).toHaveLength(2)
    expect(conn.getSnapshot()).toMatchObject({ status: 'closed', error: { code: 'replaced' } })
  })

  it('counts checksum mismatches and reports rejected actions', () => {
    const { conn, last, start } = setup()
    const store = start()
    const fx: Fx[] = []
    store.onFx((f) => void fx.push(f))
    last().push({ type: 'checksum', seq: 0, hash: viewChecksum(store.getSnapshot().state) })
    expect(conn.desyncs).toBe(0)
    last().push({ type: 'checksum', seq: 0, hash: 'deadbeef' })
    expect(conn.desyncs).toBe(1)
    last().push({ type: 'error', code: 'illegal_action', message: 'not your turn', replyTo: 1 })
    expect(fx).toEqual([{ kind: 'callout', tone: 'bad', title: 'Not allowed', detail: 'not your turn' }])
  })

  it('pings to keep the socket alive and stops on close', () => {
    const { conn, last } = setup()
    last().accept()
    vi.advanceTimersByTime(25_000)
    expect(last().sent.filter((s) => s === 'ping')).toHaveLength(1)
    conn.close()
    vi.advanceTimersByTime(100_000)
    expect(last().sent.filter((s) => s === 'ping')).toHaveLength(1)
  })
})
