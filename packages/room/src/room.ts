/**
 * RoomCore: one game room, the authority for its game (DECISIONS.md D40, D42). Pure and
 * synchronous; it handles one call at a time, so out-of-turn actions apply in arrival order.
 */

import { PERSONALITIES } from '@skyline/bots'
import {
  PRESETS,
  createGame,
  expectedActor,
  observe,
  reduce,
  type Action,
  type GameEvent,
  type PlayerId,
} from '@skyline/engine'
import {
  CloseCode,
  MAX_SEATS,
  MIN_SEATS,
  PROTOCOL_VERSION,
  encode,
  parseClientMessage,
  viewChecksum,
  type ClientMessage,
  type ErrorCode,
  type LobbyInfo,
  type RoomSettings,
  type RoomStatusResponse,
  type ServerMessage,
} from '@skyline/protocol'
import { BotSeats } from './bots.ts'
import type {
  Connection,
  Entropy,
  RoomRecord,
  RoomSnapshot,
  RoomStore,
  Scheduler,
  SeatRecord,
} from './ports.ts'

export interface LoggedAction {
  playerId: PlayerId
  action: Action
}

export interface RoomOptions {
  /** Pause before each bot move (ms). */
  botDelay?: number
  /** Save this long after the last unsaved change (ms); a room can sleep without warning. */
  saveDelay?: number
  /** Delete the room after this long without activity (ms). */
  expireAfter?: number
  /** Send view checksums at turn ends (dev builds). */
  checksums?: boolean
  /** Applied actions kept in memory for resending to reconnecting players. */
  replayBuffer?: number
}

export interface RoomDeps {
  store: RoomStore
  scheduler: Scheduler
  entropy: Entropy
  options?: RoomOptions
}

export const DEFAULT_SETTINGS: RoomSettings = {
  preset: 'standard',
  rules: {},
  turnSeconds: 0,
  botTakeover: false,
}

/** Same order as the board's token colors; bots take the first one nobody uses. */
const TOKEN_COLORS = [0xfb7185, 0x22d3ee, 0xfbbf24, 0xa78bfa, 0x34d399, 0xf8fafc]

const EMPTY: SeatRecord = { kind: 'empty', name: '', color: 0, ready: false }

interface Held {
  seq: number
  actor: PlayerId
  action: Action
  events: GameEvent[]
}

type Msg<T extends ClientMessage['type']> = Extract<ClientMessage, { type: T }>

export class RoomCore {
  private readonly store: RoomStore
  private readonly scheduler: Scheduler
  private readonly entropy: Entropy
  private readonly opts: Required<RoomOptions>
  private readonly room: RoomSnapshot
  /** Open sockets and the seat each is bound to (null until `join`). */
  private readonly conns = new Map<Connection, number | null>()
  private bots: BotSeats | null = null
  private held: Held[] = []
  private turnActions: LoggedAction[] = []
  private dirty = false
  private turnAt: number | null = null
  private botAt: number | null = null
  private saveAt: number | null = null
  private alarmAt: number | null = null
  private closed = false
  /** Names this run of the room (held events do not survive a restart). */
  private readonly epoch: string

  private constructor(room: RoomSnapshot, deps: RoomDeps) {
    this.room = room
    this.store = deps.store
    this.scheduler = deps.scheduler
    this.entropy = deps.entropy
    this.epoch = deps.entropy.token()
    this.opts = {
      botDelay: 900,
      saveDelay: 5000,
      expireAfter: 24 * 60 * 60 * 1000,
      checksums: false,
      replayBuffer: 256,
      ...deps.options,
    }
  }

  /** A new, empty room. Whoever joins with the returned token becomes host. */
  static create(code: string, deps: RoomDeps, now: number): { room: RoomCore; hostToken: string } {
    const hostToken = deps.entropy.token()
    const room = new RoomCore(
      {
        code,
        phase: 'lobby',
        locked: false,
        settings: DEFAULT_SETTINGS,
        seats: Array.from({ length: MAX_SEATS }, () => ({ ...EMPTY })),
        hostToken,
        lastActivity: now,
        game: null,
      },
      deps,
    )
    room.saveLobby()
    room.reschedule()
    return { room, hostToken }
  }

  /** Wakes a room from its latest saved row. Sockets come back through `attach`. */
  static restore(record: RoomRecord, deps: RoomDeps): RoomCore {
    const room = new RoomCore(record.room, deps)
    const game = record.room.game
    if (game) {
      room.bots = room.makeBots()
      // A row for the turn in progress holds its actions so far; a turn-end row is complete.
      if (record.turn === game.state.turnCount + 1) room.turnActions = record.actions
      room.afterChange(record.room.lastActivity)
    }
    room.reschedule()
    return room
  }

  get code(): string {
    return this.room.code
  }

  get expired(): boolean {
    return this.closed
  }

  status(): RoomStatusResponse {
    if (this.closed) return { exists: false }
    const { phase, locked, seats } = this.room
    return { exists: true, phase, locked, freeSeats: seats.filter((s) => s.kind === 'empty').length }
  }

  /** Rebinds a socket that survived hibernation (its token was kept by `Connection.bound`). */
  attach(conn: Connection, token: string): void {
    const seat = this.room.seats.findIndex((s) => s.token === token)
    this.conns.set(conn, seat >= 0 ? seat : null)
  }

  message(conn: Connection, raw: unknown, now: number): void {
    if (this.closed) return
    if (!this.conns.has(conn)) this.conns.set(conn, null)
    const parsed = parseClientMessage(raw)
    if (!parsed.ok) return this.error(conn, 'bad_message', parsed.error)
    this.handle(conn, parsed.message, now)
    this.reschedule()
  }

  disconnect(conn: Connection): void {
    const seat = this.conns.get(conn)
    this.conns.delete(conn)
    if (seat !== undefined && seat !== null) this.broadcastLobby()
  }

  /** The scheduler's alarm went off. */
  alarm(now: number): void {
    if (this.closed) return
    this.alarmAt = null
    if (now >= this.room.lastActivity + this.opts.expireAfter) return this.expire()
    if (this.botAt !== null && now >= this.botAt) {
      this.botAt = null
      this.botStep(now)
    }
    if (this.turnAt !== null && now >= this.turnAt) {
      this.turnAt = null
      const game = this.room.game
      if (game && this.room.phase === 'playing')
        this.apply(game.state.players[expectedActor(game.state)]!.id, { type: 'TIMEOUT' }, now)
    }
    if (this.saveAt !== null && now >= this.saveAt) {
      this.saveAt = null
      if (this.dirty) this.save(false)
    }
    this.reschedule()
  }

  private handle(conn: Connection, msg: ClientMessage, now: number): void {
    if (msg.type === 'join') return this.join(conn, msg, now)
    const seat = this.conns.get(conn)
    if (seat === undefined || seat === null) return this.error(conn, 'not_joined')
    this.room.lastActivity = now
    switch (msg.type) {
      case 'action':
        return this.action(conn, seat, msg, now)
      case 'chat':
        return this.broadcast({ type: 'chat', seat, name: this.room.seats[seat]!.name, text: msg.text })
      case 'ready':
        if (this.room.phase !== 'lobby') return this.error(conn, 'game_running')
        this.room.seats[seat]!.ready = msg.ready
        return this.lobbyChanged()
      case 'leave':
        return this.leave(conn, seat)
      default:
        return this.host(conn, seat, msg, now)
    }
  }

  private join(conn: Connection, msg: Msg<'join'>, now: number): void {
    if (msg.v !== PROTOCOL_VERSION) {
      this.error(conn, 'version_mismatch', `room speaks version ${PROTOCOL_VERSION}`)
      return conn.close(CloseCode.versionMismatch, 'protocol version')
    }
    const current = this.conns.get(conn)
    if (current !== undefined && current !== null) return this.error(conn, 'bad_message', 'already joined')
    const { seats, phase } = this.room
    let seat = msg.token === undefined ? -1 : seats.findIndex((s) => s.token === msg.token)
    if (seat >= 0) {
      if (phase === 'lobby')
        Object.assign(seats[seat]!, { name: msg.name, color: this.freeColor(seat, msg.color) })
      for (const [other, s] of this.conns) {
        if (s !== seat || other === conn) continue
        this.error(other, 'replaced')
        other.close(CloseCode.replaced, 'opened in another tab')
        this.conns.delete(other)
      }
    } else {
      if (phase !== 'lobby') return this.error(conn, msg.token === undefined ? 'game_running' : 'bad_token')
      const isHost = msg.token !== undefined && msg.token === this.room.hostToken
      if (this.room.locked && !isHost) return this.error(conn, 'room_locked')
      seat = seats.findIndex((s) => s.kind === 'empty')
      if (seat < 0) return this.error(conn, 'room_full')
      const token = isHost ? this.room.hostToken : this.entropy.token()
      seats[seat] = {
        kind: 'human',
        name: msg.name,
        color: this.freeColor(seat, msg.color),
        ready: false,
        token,
      }
    }
    this.room.lastActivity = now
    const token = seats[seat]!.token!
    this.conns.set(conn, seat)
    conn.bound?.(token)
    this.send(conn, {
      type: 'welcome',
      v: PROTOCOL_VERSION,
      token,
      seat,
      epoch: this.epoch,
      lobby: this.lobby(),
    })
    this.broadcastLobby(conn)
    if (phase === 'lobby') this.saveLobby()
    else this.catchUp(conn, seat, msg.resume?.epoch === this.epoch ? msg.resume.seq : undefined)
  }

  /** Resends the events a reconnecting player missed in this epoch, or a snapshot. */
  private catchUp(conn: Connection, seat: number, lastSeq: number | undefined): void {
    const game = this.room.game!
    if (lastSeq === game.seq) return
    const first = this.held[0]?.seq
    if (lastSeq === undefined || lastSeq > game.seq || first === undefined || lastSeq + 1 < first)
      return this.send(conn, { type: 'snapshot', seq: game.seq, view: observe(game.state, playerId(seat)) })
    const missed = this.held.filter((h) => h.seq > lastSeq)
    missed.forEach((h, i) =>
      this.send(conn, {
        type: 'events',
        ...h,
        ...(i === missed.length - 1 && { view: observe(game.state, playerId(seat)) }),
      }),
    )
  }

  private action(conn: Connection, seat: number, msg: Msg<'action'>, now: number): void {
    if (this.room.phase !== 'playing') return this.error(conn, 'illegal_action', 'no game running', msg.id)
    this.apply(playerId(seat), msg.action, now, conn, msg.id)
  }

  /** Runs one action through the engine and broadcasts the result. */
  private apply(
    actor: PlayerId,
    action: Action,
    now: number,
    sender?: Connection,
    replyTo?: number,
  ): boolean {
    const game = this.room.game!
    const before = game.state
    const r = reduce(before, actor, action)
    if (!r.ok) {
      if (sender) this.error(sender, 'illegal_action', r.error, replyTo)
      return false
    }
    game.state = r.state
    game.seq++
    this.room.lastActivity = now
    this.turnActions.push({ playerId: actor, action })
    this.dirty = true
    this.held.push({ seq: game.seq, actor, action, events: r.events })
    if (this.held.length > this.opts.replayBuffer) this.held.shift()
    for (const [conn, seat] of this.conns) {
      if (seat === null) continue
      this.send(conn, {
        type: 'events',
        seq: game.seq,
        actor,
        action,
        events: r.events,
        view: observe(r.state, playerId(seat)),
        ...(conn === sender && replyTo !== undefined && { replyTo }),
      })
    }
    this.bots?.note(r.state, r.events)
    if (r.state.phase === 'gameOver') {
      this.room.phase = 'over'
      this.broadcastLobby()
    }
    if (r.events.some((e) => e.type === 'TURN_STARTED' || e.type === 'GAME_OVER'))
      this.turnEnded(before.turnCount + 1)
    this.afterChange(now)
    return true
  }

  private turnEnded(turn: number): void {
    this.save(true, turn)
    if (!this.opts.checksums) return
    const game = this.room.game!
    for (const [conn, seat] of this.conns) {
      if (seat === null) continue
      const hash = viewChecksum(observe(game.state, playerId(seat)))
      this.send(conn, { type: 'checksum', seq: game.seq, hash })
    }
  }

  /** Restarts the decision timer and bot pacing after the game state changed. */
  private afterChange(now: number): void {
    const game = this.room.game
    if (!game || this.room.phase !== 'playing') {
      this.turnAt = this.botAt = null
      return
    }
    const s = game.state
    const secs = this.room.settings.turnSeconds
    const human = this.room.seats[seatIndex(s.players[expectedActor(s)]!.id)]!.kind === 'human'
    this.turnAt = secs > 0 && human ? now + secs * 1000 : null
    this.botAt = this.bots?.pending(s) ? now + this.opts.botDelay : null
  }

  private botStep(now: number): void {
    const game = this.room.game
    if (!game || this.room.phase !== 'playing' || !this.bots) return
    const move = this.bots.next(game.state)
    if (move && !this.apply(move.playerId, move.action, now)) this.apply(move.playerId, move.fallback, now)
  }

  private leave(conn: Connection, seat: number): void {
    if (this.room.phase !== 'lobby') {
      this.conns.delete(conn)
      conn.close(1000, 'left')
      return this.broadcastLobby()
    }
    this.conns.set(conn, null)
    this.vacate(seat)
  }

  private host(
    conn: Connection,
    seat: number,
    msg: Msg<'set_bot' | 'kick' | 'settings' | 'lock' | 'start'>,
    now: number,
  ) {
    const { room } = this
    if (room.seats[seat]!.token !== room.hostToken) return this.error(conn, 'not_host')
    if (msg.type === 'lock') {
      room.locked = msg.locked
      return this.lobbyChanged()
    }
    if (room.phase !== 'lobby') return this.error(conn, 'game_running')
    switch (msg.type) {
      case 'settings':
        room.settings = msg.settings
        return this.lobbyChanged()
      case 'set_bot': {
        const target = room.seats[msg.seat]!
        if (target.kind === 'human') return this.error(conn, 'bad_message', 'seat is taken')
        if (msg.personality === null) {
          room.seats[msg.seat] = { ...EMPTY }
          return this.lobbyChanged()
        }
        const params = PERSONALITIES[msg.personality]
        if (!params) return this.error(conn, 'bad_message', 'unknown personality')
        const color = this.freeColor(msg.seat, null)
        room.seats[msg.seat] = {
          kind: 'bot',
          name: params.name,
          color,
          ready: true,
          personality: msg.personality,
        }
        return this.lobbyChanged()
      }
      case 'kick':
        if (msg.seat === seat) return this.error(conn, 'bad_message', 'cannot kick yourself')
        for (const [other, s] of this.conns) {
          if (s !== msg.seat) continue
          this.error(other, 'kicked')
          other.close(CloseCode.kicked, 'removed by the host')
          this.conns.delete(other)
        }
        return this.vacate(msg.seat)
      case 'start':
        return this.start(conn, now)
    }
  }

  private start(conn: Connection, now: number): void {
    const { room } = this
    const filled = room.seats.flatMap((s, i) => (s.kind === 'empty' ? [] : [i]))
    if (filled.length < MIN_SEATS) return this.error(conn, 'not_ready', `need at least ${MIN_SEATS} players`)
    if (filled.some((i) => room.seats[i]!.kind === 'human' && !room.seats[i]!.ready))
      return this.error(conn, 'not_ready', 'waiting for everyone to be ready')
    const players = filled.map((i) => ({ id: playerId(i), name: room.seats[i]!.name }))
    const config = { ...PRESETS[room.settings.preset], ...room.settings.rules }
    const seed = this.entropy.seed()
    room.game = { seed, config, players, state: createGame(players, seed, config), seq: 0 }
    room.phase = 'playing'
    room.lastActivity = now
    this.bots = this.makeBots()
    this.save(true, 0)
    this.broadcastLobby()
    for (const [c, seat] of this.conns)
      if (seat !== null)
        this.send(c, { type: 'snapshot', seq: 0, view: observe(room.game.state, playerId(seat)) })
    this.afterChange(now)
  }

  /** `wanted` if no other seat has it, else the first token color nobody uses. */
  private freeColor(seat: number, wanted: number | null): number {
    const used = new Set(
      this.room.seats.filter((s, i) => s.kind !== 'empty' && i !== seat).map((s) => s.color),
    )
    if (wanted !== null && !used.has(wanted)) return wanted
    return TOKEN_COLORS.find((c) => !used.has(c)) ?? TOKEN_COLORS[seat % TOKEN_COLORS.length]!
  }

  private makeBots(): BotSeats {
    const game = this.room.game!
    const personalities = game.players.map((p) => {
      const seat = this.room.seats[seatIndex(p.id)]!
      return seat.kind === 'bot' ? (seat.personality ?? 'balanced') : null
    })
    return new BotSeats(personalities, game.seed)
  }

  /** Frees a lobby seat; the host role passes to the next human in seat order. */
  private vacate(seat: number): void {
    const { room } = this
    const wasHost = room.seats[seat]!.token === room.hostToken
    room.seats[seat] = { ...EMPTY }
    if (wasHost) {
      const next = room.seats.find((s) => s.kind === 'human')
      if (next?.token) room.hostToken = next.token
    }
    this.lobbyChanged()
  }

  private lobbyChanged(): void {
    this.broadcastLobby()
    if (this.room.phase === 'lobby') this.saveLobby()
    else this.dirty = true
  }

  private saveLobby(): void {
    this.store.save({ turn: 0, room: this.room, actions: [] })
  }

  /** Writes the row for the current turn; at a turn end it completes that row. */
  private save(turnEnd: boolean, turn?: number): void {
    const game = this.room.game
    const row = turn ?? (game ? game.state.turnCount + 1 : 0)
    this.store.save({ turn: row, room: this.room, actions: this.turnActions })
    if (turnEnd) this.turnActions = []
    this.dirty = false
    this.saveAt = null
  }

  private expire(): void {
    this.closed = true
    for (const conn of this.conns.keys()) conn.close(CloseCode.closed, 'room expired')
    this.conns.clear()
    this.store.clear()
    this.scheduler.set(null)
    this.alarmAt = null
  }

  /** Points the single alarm at the earliest pending deadline. */
  private reschedule(): void {
    if (this.closed) return
    if (this.dirty && this.saveAt === null) this.saveAt = this.room.lastActivity + this.opts.saveDelay
    const at = Math.min(
      this.room.lastActivity + this.opts.expireAfter,
      this.turnAt ?? Infinity,
      this.botAt ?? Infinity,
      this.saveAt ?? Infinity,
    )
    if (at === this.alarmAt) return
    this.alarmAt = at
    this.scheduler.set(at)
  }

  private lobby(): LobbyInfo {
    const { code, phase, locked, settings, seats, hostToken, game } = this.room
    const online = new Set(this.conns.values())
    return {
      code,
      phase,
      locked,
      settings,
      seats: seats.map((s, seat) => ({
        seat,
        kind: s.kind,
        name: s.name,
        color: s.color,
        ready: s.ready,
        connected: s.kind === 'bot' || online.has(seat),
        host: s.kind === 'human' && s.token === hostToken,
        ...(s.personality !== undefined && { personality: s.personality }),
        ...(game?.players.some((p) => p.id === playerId(seat)) && { playerId: playerId(seat) }),
      })),
    }
  }

  private broadcastLobby(except?: Connection): void {
    const lobby = this.lobby()
    for (const [conn, seat] of this.conns)
      if (seat !== null && conn !== except) this.send(conn, { type: 'lobby', lobby })
  }

  private broadcast(message: ServerMessage): void {
    const data = encode(message)
    for (const [conn, seat] of this.conns) if (seat !== null) conn.send(data)
  }

  private send(conn: Connection, message: ServerMessage): void {
    conn.send(encode(message))
  }

  private error(conn: Connection, code: ErrorCode, message?: string, replyTo?: number): void {
    this.send(conn, {
      type: 'error',
      code,
      ...(message !== undefined && { message }),
      ...(replyTo !== undefined && { replyTo }),
    })
  }
}

/** Game player ids follow room seats, so a seat keeps its id across reconnects and restores. */
function playerId(seat: number): PlayerId {
  return `p${seat + 1}`
}

function seatIndex(id: PlayerId): number {
  return Number(id.slice(1)) - 1
}
