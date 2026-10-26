/**
 * One online room from the browser (DECISIONS.md D40, D44): the socket, the seat token, the
 * lobby, reconnects, and the GameStore once the game starts. Framework-agnostic; React
 * subscribes like it does to GameStore.
 */

import {
  CloseCode,
  PING,
  PROTOCOL_VERSION,
  parseServerMessage,
  viewChecksum,
  type ClientMessage,
  type ErrorCode,
  type LobbyInfo,
  type ServerMessage,
} from '@skyline/protocol'
import type { PieceKind } from '@skyline/board'
import type { GameState } from '@skyline/engine'
import { GameStore } from '../game/store.ts'
import type { GameSetup } from '../game/setup.ts'

/** The slice of the browser WebSocket this module uses (tests pass a fake). */
export type SocketLike = Pick<WebSocket, 'readyState' | 'send' | 'close' | 'onopen' | 'onmessage' | 'onclose'>

/** Where seat tokens live, keyed by room code (a refresh or a later visit reclaims the seat). */
export interface TokenStore {
  get(code: string): string | null
  set(code: string, token: string): void
}

export interface ConnectionOptions {
  code: string
  name: string
  color: number
  /** The creator's token from `POST /api/rooms`, which makes them host. */
  token?: string
  openSocket?: (url: string) => SocketLike
  tokens?: TokenStore
  /** Base for the socket URL (default: this page's origin). */
  base?: string
}

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

export interface RoomView {
  status: ConnectionStatus
  lobby: LobbyInfo | null
  /** Our seat once joined. */
  seat: number | null
  /** The game, once it started. */
  store: GameStore | null
  /** Why the connection closed or a request failed, for the UI. */
  error: { code: ErrorCode; message: string } | null
}

/** Codes after which reconnecting is pointless. */
const FINAL: ReadonlySet<number> = new Set([
  CloseCode.versionMismatch,
  CloseCode.replaced,
  CloseCode.kicked,
  CloseCode.closed,
])
const PING_MS = 25_000
const BACKOFF_MS = [500, 1000, 2000, 4000, 8000]
/** Board pieces by seat (the lobby picks colors, not pieces). */
const PIECES: readonly PieceKind[] = ['taxi', 'drone', 'balloon', 'bus', 'pawn', 'taxi']

export const localTokens: TokenStore = {
  get: (code) => {
    try {
      return localStorage.getItem(`skyline.seat.${code}`)
    } catch {
      return null
    }
  },
  set: (code, token) => {
    try {
      localStorage.setItem(`skyline.seat.${code}`, token)
    } catch {
      // Best effort: without storage a refresh takes a new seat.
    }
  },
}

export class RoomConnection {
  readonly code: string
  private readonly opts: ConnectionOptions
  private readonly tokens: TokenStore
  private view: RoomView = { status: 'connecting', lobby: null, seat: null, store: null, error: null }
  private readonly listeners = new Set<() => void>()
  private socket: SocketLike | null = null
  private token: string | null
  private epoch: string | null = null
  private seq = 0
  private attempt = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private closed = false
  /** Dev: view checksums that did not match (DECISIONS.md D40). */
  desyncs = 0

  constructor(opts: ConnectionOptions) {
    this.opts = opts
    this.code = opts.code
    this.tokens = opts.tokens ?? localTokens
    this.token = opts.token ?? this.tokens.get(opts.code)
    if (opts.token) this.tokens.set(opts.code, opts.token)
    this.open()
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): RoomView => this.view

  /** Sends a lobby or chat message (game actions go through the GameStore). */
  send(message: ClientMessage): void {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(message))
  }

  close(): void {
    this.closed = true
    this.stopTimers()
    this.socket?.close(1000, 'left')
    this.view.store?.dispose()
    this.set({ status: 'closed' })
  }

  private set(patch: Partial<RoomView>): void {
    this.view = { ...this.view, ...patch }
    for (const fn of this.listeners) fn()
  }

  // One handler per socket we own; `on*` keeps SocketLike (and the test fake) small.
  /* oxlint-disable unicorn/prefer-add-event-listener */
  private open(): void {
    const base = this.opts.base ?? window.location.origin.replace(/^http/, 'ws')
    const open = this.opts.openSocket ?? ((url: string) => new WebSocket(url))
    const socket = open(`${base}/api/rooms/${this.code}/ws`)
    this.socket = socket
    socket.onopen = () => {
      this.attempt = 0
      this.send({
        type: 'join',
        v: PROTOCOL_VERSION,
        name: this.opts.name,
        color: this.opts.color,
        ...(this.token !== null && { token: this.token }),
        ...(this.epoch !== null && this.view.store && { resume: { epoch: this.epoch, seq: this.seq } }),
      })
      this.pingTimer = setInterval(() => socket.send(PING), PING_MS)
    }
    socket.onmessage = (e) => {
      const parsed = parseServerMessage(e.data)
      if (parsed.ok) this.handle(parsed.message)
    }
    socket.onclose = (e) => {
      if (this.socket !== socket) return
      this.stopTimers()
      this.socket = null
      if (this.closed || FINAL.has(e.code)) return this.set({ status: 'closed' })
      this.set({ status: 'reconnecting' })
      const delay = BACKOFF_MS[Math.min(this.attempt++, BACKOFF_MS.length - 1)]!
      this.retryTimer = setTimeout(() => this.open(), delay)
    }
  }

  /* oxlint-enable unicorn/prefer-add-event-listener */

  /** Drops the socket and reconnects at once, resuming from the last event seen. */
  private reconnect(): void {
    const socket = this.socket
    this.socket = null
    this.stopTimers()
    socket?.close(1000, 'resync')
    this.set({ status: 'reconnecting' })
    this.open()
  }

  private stopTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.retryTimer = this.pingTimer = null
  }

  private handle(m: ServerMessage): void {
    switch (m.type) {
      case 'welcome':
        this.token = m.token
        this.epoch = m.epoch
        this.tokens.set(this.code, m.token)
        return this.set({ status: 'open', seat: m.seat, lobby: m.lobby, error: null })
      case 'lobby':
        return this.set({ lobby: m.lobby })
      case 'snapshot':
        this.seq = m.seq
        if (this.view.store) return this.view.store.resync(m.view)
        return this.set({ store: this.startGame(m.view) })
      case 'events': {
        const store = this.view.store
        if (!store) return
        if (m.seq !== this.seq + 1) return this.reconnect()
        this.seq = m.seq
        return store.receive(m.events, m.view ?? null)
      }
      case 'checksum':
        if (m.seq !== this.seq || !this.view.store) return
        if (viewChecksum(this.view.store.getSnapshot().state) !== m.hash) {
          this.desyncs++
          console.warn('[skyline] view checksum mismatch at seq', m.seq)
        }
        return
      case 'error':
        if (m.replyTo !== undefined && this.view.store) return this.view.store.rejected(m.message ?? m.code)
        return this.set({ error: { code: m.code, message: m.message ?? m.code } })
      case 'chat':
        return
    }
  }

  private startGame(view: GameState): GameStore | null {
    const lobby = this.view.lobby
    const seat = this.view.seat
    const me = seat === null ? undefined : lobby?.seats[seat]?.playerId
    if (!lobby || !me) return null
    const setup: GameSetup = {
      preset: lobby.settings.preset,
      seed: 0,
      citySeed: citySeedOf(this.code),
      seats: lobby.seats.flatMap((s) =>
        s.playerId
          ? [
              {
                id: s.playerId,
                name: s.name,
                kind: s.kind === 'bot' ? ('bot' as const) : ('human' as const),
                piece: PIECES[s.seat % PIECES.length]!,
                color: s.color,
                ...(s.personality !== undefined && { personality: s.personality }),
              },
            ]
          : [],
      ),
    }
    return new GameStore(setup, [], {
      me,
      view,
      // TIMEOUT never leaves a client: only the room's timers send it.
      send: (action) => {
        if (action.type !== 'TIMEOUT') this.send({ type: 'action', id: ++this.actionId, action })
      },
    })
  }

  private actionId = 0
}

/** Everyone in a room sees the same generated city: its seed comes from the room code. */
export function citySeedOf(code: string): number {
  let h = 0
  for (const ch of code) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0
  return h % 1_000_003
}
