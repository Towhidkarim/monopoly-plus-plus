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
  /** Whether the room still exists (default: `GET /api/rooms/:code`); asked after a failed connection. */
  roomExists?: (code: string) => Promise<boolean>
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
  error: { code: ErrorCode | 'not_found'; message: string } | null
}

/** Codes after which reconnecting is pointless. */
const FINAL: ReadonlySet<number> = new Set([
  CloseCode.versionMismatch,
  CloseCode.replaced,
  CloseCode.kicked,
  CloseCode.closed,
])
const PING_MS = 25_000
/** Nothing heard for this long (not even a pong): the socket is dead even if it looks open. */
const STALE_MS = 2 * PING_MS + 10_000
/** How long a wake-up probe ping may take before we reconnect. */
const PROBE_MS = 5000
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
  private probeTimer: ReturnType<typeof setTimeout> | null = null
  /** When the server last sent anything (ms, `Date.now()`). */
  private lastHeard = 0
  private closed = false
  /** Dev: view checksums that did not match (DECISIONS.md D40). */
  desyncs = 0

  constructor(opts: ConnectionOptions) {
    this.opts = opts
    this.code = opts.code
    this.tokens = opts.tokens ?? localTokens
    this.token = opts.token ?? this.tokens.get(opts.code)
    if (opts.token) this.tokens.set(opts.code, opts.token)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility)
    if (typeof window !== 'undefined') window.addEventListener('online', this.checkAlive)
    this.open()
  }

  /**
   * A hidden tab gets no animation frames, so the game would queue up and replay a backlog on
   * return; instead it skips to the current state while nobody is watching.
   */
  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.view.store?.skip()
    else this.checkAlive()
  }

  /**
   * After the laptop slept or the network changed, a socket can look open but be dead. On
   * return (tab visible again, back online): retry at once if a retry is pending, else probe
   * a quiet socket with a ping and reconnect if nothing comes back.
   */
  readonly checkAlive = (): void => {
    if (this.closed) return
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
      this.attempt = 0
      return this.open()
    }
    const socket = this.socket
    if (socket?.readyState !== 1 || Date.now() - this.lastHeard < PING_MS || this.probeTimer) return
    const asked = Date.now()
    socket.send(PING)
    this.probeTimer = setTimeout(() => {
      this.probeTimer = null
      if (!this.closed && this.socket === socket && this.lastHeard < asked) this.reconnect()
    }, PROBE_MS)
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
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility)
    if (typeof window !== 'undefined') window.removeEventListener('online', this.checkAlive)
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
      this.lastHeard = Date.now()
      this.send({
        type: 'join',
        v: PROTOCOL_VERSION,
        name: this.opts.name,
        color: this.opts.color,
        ...(this.token !== null && { token: this.token }),
        ...(this.epoch !== null && this.view.store && { resume: { epoch: this.epoch, seq: this.seq } }),
      })
      this.pingTimer = setInterval(() => {
        if (Date.now() - this.lastHeard > STALE_MS) this.reconnect()
        else socket.send(PING)
      }, PING_MS)
    }
    socket.onmessage = (e) => {
      this.lastHeard = Date.now()
      const parsed = parseServerMessage(e.data)
      if (parsed.ok) this.handle(parsed.message)
    }
    socket.onclose = (e) => {
      if (this.socket !== socket) return
      this.stopTimers()
      this.socket = null
      if (this.closed || FINAL.has(e.code)) return this.set({ status: 'closed' })
      this.set({ status: 'reconnecting' })
      void this.retry()
    }
  }

  /* oxlint-enable unicorn/prefer-add-event-listener */

  /** Waits out the backoff, unless the room is gone: then it will never take us back. */
  private async retry(): Promise<void> {
    const delay = BACKOFF_MS[Math.min(this.attempt++, BACKOFF_MS.length - 1)]!
    if (!(await this.exists())) {
      if (this.closed) return
      this.closed = true
      this.stopTimers()
      return this.set({
        status: 'closed',
        error: { code: 'not_found', message: 'This room does not exist (rooms expire after a day).' },
      })
    }
    if (this.closed || this.socket || this.retryTimer) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.open()
    }, delay)
  }

  /** Offline or a server hiccup counts as "exists": keep retrying. */
  private async exists(): Promise<boolean> {
    try {
      if (this.opts.roomExists) return await this.opts.roomExists(this.code)
      const base = this.opts.base?.replace(/^ws/, 'http') ?? window.location.origin
      return (await fetch(`${base}/api/rooms/${this.code}`)).status !== 404
    } catch {
      return true
    }
  }

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
    if (this.probeTimer) clearTimeout(this.probeTimer)
    this.retryTimer = this.pingTimer = this.probeTimer = null
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
        store.receive(m.events, m.view ?? null)
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') store.skip()
        return
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
                kind:
                  s.kind === 'bot'
                    ? ('bot' as const)
                    : s.playerId === me
                      ? ('human' as const)
                      : ('remote' as const),
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
