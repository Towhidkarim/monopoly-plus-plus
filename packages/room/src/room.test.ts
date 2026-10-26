import { createGame, expectedActor, legalActions, reduce } from '@skyline/engine'
import { CloseCode, viewChecksum, type ClientAction, type RoomSettings } from '@skyline/protocol'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, RoomCore, type RoomOptions } from './room.ts'
import { FakeHost, type FakeConn } from './testkit.ts'

interface Setup {
  /** Human names; the first is host. */
  humans?: string[]
  /** Bot personalities, seated after the humans. */
  bots?: string[]
  settings?: Partial<RoomSettings>
  options?: RoomOptions
  seed?: number
}

/** A started game. Humans sit first (the host in seat 0), then bots. */
function started({ humans = ['Ada', 'Bo'], bots = [], settings = {}, options = {}, seed = 42 }: Setup = {}) {
  const host = new FakeHost(options, seed)
  const { room, hostToken } = host.create()
  const conns = humans.map((name, i) => host.join(room, name, i === 0 ? { token: hostToken } : {}))
  const a = conns[0]!
  bots.forEach((personality, i) =>
    host.send(room, a, { type: 'set_bot', seat: humans.length + i, personality }),
  )
  host.send(room, a, { type: 'settings', settings: { ...DEFAULT_SETTINGS, ...settings } })
  for (const c of conns) host.send(room, c, { type: 'ready', ready: true })
  host.send(room, a, { type: 'start' })
  expect(a.last('snapshot')).toBeDefined()
  return { host, room, conns, a, b: conns[1]! }
}

const lastView = (c: FakeConn) => c.last('events')?.view ?? c.last('snapshot')!.view
const resume = (c: FakeConn, seq: number) => ({ epoch: c.last('welcome')!.epoch, seq })
const ROLL = { type: 'action', id: 1, action: { type: 'ROLL' } } as const

/** The player to act sends their first legal action. */
function step(host: FakeHost, room: RoomCore, conns: FakeConn[]): void {
  const view = lastView(conns[0]!)
  const seat = expectedActor(view)
  const action = legalActions(view, view.players[seat]!.id).find(
    (x): x is ClientAction => x.type !== 'TIMEOUT',
  )!
  host.send(room, conns[seat]!, { type: 'action', id: 1, action })
}

describe('lobby', () => {
  it('seats players in order and makes the token holder host', () => {
    const host = new FakeHost()
    const { room, hostToken } = host.create()
    const b = host.join(room, 'Bo')
    const a = host.join(room, 'Ada', { token: hostToken })
    expect(b.last('welcome')).toMatchObject({ seat: 0, token: b.token })
    expect(a.last('welcome')).toMatchObject({ seat: 1, token: hostToken })
    const seats = b.last('lobby')!.lobby.seats
    expect(seats.slice(0, 2).map((s) => [s.name, s.host, s.connected])).toEqual([
      ['Bo', false, true],
      ['Ada', true, true],
    ])
    expect(room.status()).toEqual({ exists: true, phase: 'lobby', locked: false, freeSeats: 4 })
    expect(host.latest().room.seats[1]!.token).toBe(hostToken)
  })

  it('rejects a wrong protocol version and closes the socket', () => {
    const host = new FakeHost()
    const { room } = host.create()
    const c = host.join(room, 'Old', { v: 0 })
    expect(c.last('error')!.code).toBe('version_mismatch')
    expect(c.closed?.code).toBe(CloseCode.versionMismatch)
  })

  it('requires a join first and reports bad messages', () => {
    const host = new FakeHost()
    const { room } = host.create()
    const c = host.join(room, 'x', { name: '' })
    expect(c.last('error')).toMatchObject({ code: 'bad_message', message: expect.stringContaining('name') })
    host.send(room, c, { type: 'ready', ready: true })
    expect(c.last('error')!.code).toBe('not_joined')
  })

  it('enforces host commands, locking and a full room', () => {
    const host = new FakeHost()
    const { room, hostToken } = host.create()
    const a = host.join(room, 'Ada', { token: hostToken })
    const b = host.join(room, 'Bo')
    host.send(room, b, { type: 'set_bot', seat: 2, personality: 'banker' })
    expect(b.last('error')!.code).toBe('not_host')
    host.send(room, a, { type: 'set_bot', seat: 2, personality: 'nobody' })
    expect(a.last('error')!.message).toBe('unknown personality')
    for (const seat of [2, 3, 4, 5]) host.send(room, a, { type: 'set_bot', seat, personality: 'banker' })
    expect(host.join(room, 'Cy').last('error')!.code).toBe('room_full')
    host.send(room, a, { type: 'set_bot', seat: 5, personality: null })
    host.send(room, a, { type: 'lock', locked: true })
    expect(host.join(room, 'Cy').last('error')!.code).toBe('room_locked')
    const bots = a.last('lobby')!.lobby.seats.filter((s) => s.kind === 'bot')
    expect(new Set(bots.map((s) => s.color)).size).toBe(3)
  })

  it('gives a joining player a free color when theirs is taken', () => {
    const host = new FakeHost()
    const { room, hostToken } = host.create()
    const a = host.join(room, 'Ada', { token: hostToken, color: 0xfb7185 })
    host.send(room, a, { type: 'set_bot', seat: 1, personality: 'banker' })
    host.join(room, 'Bo', { color: 0xfb7185 })
    const colors = a
      .last('lobby')!
      .lobby.seats.slice(0, 3)
      .map((s) => s.color)
    expect(colors[0]).toBe(0xfb7185)
    expect(new Set(colors).size).toBe(3)
  })

  it('kicks players and hands the host role on when the host leaves', () => {
    const host = new FakeHost()
    const { room, hostToken } = host.create()
    const a = host.join(room, 'Ada', { token: hostToken })
    const b = host.join(room, 'Bo')
    const c = host.join(room, 'Cy')
    host.send(room, a, { type: 'kick', seat: 2 })
    expect(c.closed?.code).toBe(CloseCode.kicked)
    host.send(room, a, { type: 'leave' })
    expect(b.last('lobby')!.lobby.seats[1]).toMatchObject({ name: 'Bo', host: true })
    host.send(room, b, { type: 'lock', locked: true })
    expect(b.last('lobby')!.lobby.locked).toBe(true)
  })

  it('starts only with two seats and everyone ready', () => {
    const host = new FakeHost()
    const { room, hostToken } = host.create()
    const a = host.join(room, 'Ada', { token: hostToken })
    host.send(room, a, { type: 'start' })
    expect(a.last('error')!.code).toBe('not_ready')
    const b = host.join(room, 'Bo')
    host.send(room, a, { type: 'ready', ready: true })
    host.send(room, a, { type: 'start' })
    expect(a.last('error')!.message).toBe('waiting for everyone to be ready')
    host.send(room, b, { type: 'ready', ready: true })
    host.send(room, a, { type: 'start' })
    expect(a.last('snapshot')!.seq).toBe(0)
    expect(b.last('lobby')!.lobby.phase).toBe('playing')
    expect(host.join(room, 'Late').last('error')!.code).toBe('game_running')
  })
})

describe('play', () => {
  it('hides the seed and deck order from every message', () => {
    const { host, room, a, b } = started()
    host.send(room, a, { type: 'action', id: 1, action: { type: 'ROLL' } })
    host.advance(room, 5000) // idle save: the stored row holds the real state
    const real = host.latest().room.game!.state
    for (const c of [a, b]) {
      for (const view of [c.last('snapshot')!.view, c.last('events')!.view!]) {
        expect(view.rng).toBe(0)
        expect([...view.decks.chance, ...view.decks.chest].every((x) => x === -1)).toBe(true)
      }
      expect(JSON.stringify(c.sent)).not.toContain(String(real.rng))
    }
  })

  it('broadcasts accepted actions with sequence numbers and rejects illegal ones', () => {
    const { host, room, a, b } = started()
    host.send(room, b, { type: 'action', id: 9, action: { type: 'ROLL' } })
    expect(b.last('error')).toMatchObject({ code: 'illegal_action', replyTo: 9 })
    expect(b.all('events')).toHaveLength(0)
    host.send(room, a, { type: 'action', id: 1, action: { type: 'ROLL' } })
    expect(a.last('events')).toMatchObject({ seq: 1, actor: 'p1', action: { type: 'ROLL' }, replyTo: 1 })
    expect(b.last('events')).toMatchObject({ seq: 1, actor: 'p1' })
    expect(b.last('events')).not.toHaveProperty('replyTo')
    expect(b.last('events')!.events[0]!.type).toBe('DICE_ROLLED')
  })

  it('applies out-of-turn actions in arrival order', () => {
    const { host, room, a, b } = started()
    // Bo proposes during Ada's turn; Ada answers before rolling.
    const give = { spaces: [], cash: 10, jailCards: 0 }
    const get = { spaces: [], cash: 0, jailCards: 0 }
    host.send(room, b, { type: 'action', id: 1, action: { type: 'PROPOSE_TRADE', to: 'p1', give, get } })
    const tradeId = lastView(a).trades[0]!.id
    host.send(room, a, { type: 'action', id: 2, action: { type: 'ACCEPT_TRADE', tradeId } })
    host.send(room, b, { type: 'action', id: 3, action: { type: 'CANCEL_TRADE', tradeId } })
    expect(b.last('error')).toMatchObject({ code: 'illegal_action', replyTo: 3 })
    expect(lastView(b).players.map((p) => p.cash)).toEqual([1510, 1490])
    expect(a.last('events')!.seq).toBe(2)
  })

  it('times out the player to act when the turn timer runs out', () => {
    const { host, room, a } = started({ settings: { turnSeconds: 15 } })
    host.advance(room, 14_999)
    expect(a.all('events')).toHaveLength(0)
    host.advance(room, 1)
    expect(a.last('events')).toMatchObject({ seq: 1, actor: 'p1', action: { type: 'TIMEOUT' } })
  })

  it('lets a bot answer an offer out of turn', () => {
    const { host, room, a } = started({ humans: ['Ada'], bots: ['balanced'] })
    const give = { spaces: [], cash: 100, jailCards: 0 }
    const get = { spaces: [], cash: 0, jailCards: 0 }
    host.send(room, a, { type: 'action', id: 1, action: { type: 'PROPOSE_TRADE', to: 'p2', give, get } })
    host.advance(room, 499)
    expect(a.last('events')!.actor).toBe('p1')
    host.advance(room, 1)
    expect(a.last('events')).toMatchObject({
      actor: 'p2',
      action: { type: expect.stringMatching(/^(ACCEPT|REJECT)_TRADE$/) },
    })
  })

  it('plays a whole game with bots and timers, and the saved rows replay it exactly', () => {
    const { host, room, a } = started({
      humans: ['Ada'],
      bots: ['balanced', 'banker', 'shark'],
      settings: { preset: 'turbo', turnSeconds: 15, rules: { roundLimit: 6 } },
    })
    const writesAtStart = host.writes
    host.runUntil(room, () => a.last('lobby')?.lobby.phase === 'over')
    expect(a.last('lobby')!.lobby.phase).toBe('over')
    const events = a.all('events')
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1))
    expect(events.some((e) => e.actor === 'p1' && e.action.type === 'TIMEOUT')).toBe(true)
    expect(events.some((e) => e.actor === 'p4')).toBe(true)

    const rows = [...host.rows.values()].toSorted((x, y) => x.turn - y.turn)
    const game = rows.at(-1)!.room.game!
    let s = createGame(game.players, game.seed, game.config)
    for (const { playerId, action } of rows.flatMap((r) => r.actions)) {
      const r = reduce(s, playerId, action)
      if (!r.ok) throw new Error(r.error)
      s = r.state
    }
    expect(s).toEqual(game.state)
    expect(s.phase).toBe('gameOver')
    // Saving per turn (plus an idle save while a human thinks), not per action.
    const turns = events.filter((e) => e.events.some((x) => x.type === 'TURN_STARTED')).length + 1
    expect(host.writes - writesAtStart).toBeLessThanOrEqual(2 * turns + 1)
    expect(events.length).toBeGreaterThan(2 * turns + 1)
  })

  it('saves a few seconds after the last action', () => {
    const { host, room, a } = started({ options: { saveDelay: 5000 } })
    const writes = host.writes
    host.send(room, a, ROLL)
    expect(host.writes).toBe(writes)
    host.advance(room, 4999)
    expect(host.writes).toBe(writes)
    host.advance(room, 1)
    expect(host.writes).toBe(writes + 1)
    expect(host.latest().actions).toEqual([{ playerId: 'p1', action: { type: 'ROLL' } }])
  })
})

describe('reconnect and restore', () => {
  it('reclaims the seat with the token and closes the old tab', () => {
    const { host, room, a } = started()
    const again = host.join(room, 'Ada', { token: a.token! })
    expect(a.last('error')!.code).toBe('replaced')
    expect(a.closed?.code).toBe(CloseCode.replaced)
    expect(again.last('welcome')!.seat).toBe(0)
    expect(again.last('snapshot')!.view).toEqual(lastView(a))
  })

  it('resends missed events, or a snapshot when they are no longer held', () => {
    const { host, room, conns, b } = started({ options: { replayBuffer: 2 } })
    host.send(room, conns[0]!, ROLL)
    step(host, room, conns)
    step(host, room, conns)
    const back = host.join(room, 'Bo', { token: b.token!, resume: resume(b, 1) })
    const resent = back.all('events')
    expect(resent.map((e) => e.seq)).toEqual([2, 3])
    expect(resent[0]).not.toHaveProperty('view')
    expect(resent[1]!.view).toEqual(lastView(conns[0]!))
    expect(back.all('snapshot')).toHaveLength(0)

    expect(host.join(room, 'Bo', { token: b.token!, resume: resume(b, 0) }).last('snapshot')!.seq).toBe(3)
    const current = host.join(room, 'Bo', { token: b.token!, resume: resume(b, 3) })
    expect(current.sent.map((m) => m.type)).toEqual(['welcome'])
  })

  it('restores from the latest row after the host restarts', () => {
    const { host, room, conns, a, b } = started({ options: { saveDelay: 1000 } })
    host.send(room, a, ROLL)
    for (let i = 0; i < 6; i++) step(host, room, conns)
    host.advance(room, 1000)
    const seq = a.last('events')!.seq
    const view = lastView(a)

    const woke = RoomCore.restore(host.latest(), host.deps)
    const back = [a, b].map((c) => host.join(woke, 'x', { token: c.token!, resume: resume(c, seq) }))
    // A new epoch: the room cannot trust that the client saw the same events, so it resyncs.
    expect(back[0]!.last('snapshot')).toEqual({ type: 'snapshot', seq, view })
    expect(back[0]!.last('welcome')!.epoch).not.toBe(a.last('welcome')!.epoch)
    step(host, woke, back)
    expect(back[1]!.last('events')!.seq).toBe(seq + 1)
  })

  it('rejects an unknown token once the game is running', () => {
    const { host, room } = started()
    expect(host.join(room, 'Eve', { token: 'x'.repeat(20) }).last('error')!.code).toBe('bad_token')
  })
})

describe('upkeep', () => {
  it('sends a checksum of each view at turn ends in dev mode', () => {
    const { host, room, a } = started({ options: { checksums: true }, settings: { turnSeconds: 15 } })
    host.runUntil(room, () => a.all('checksum').length > 0)
    const sum = a.last('checksum')!
    expect(sum.seq).toBe(a.last('events')!.seq)
    expect(sum.hash).toBe(viewChecksum(a.last('events')!.view!))
  })

  it('expires after a day without activity', () => {
    const host = new FakeHost()
    const { room } = host.create()
    const c = host.join(room, 'Ada')
    host.advance(room, 24 * 60 * 60 * 1000)
    expect(c.closed?.code).toBe(CloseCode.closed)
    expect(host.cleared).toBe(true)
    expect(room.status()).toEqual({ exists: false })
    expect(host.alarm).toBeNull()
  })
})
