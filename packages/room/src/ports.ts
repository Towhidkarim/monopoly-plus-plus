/**
 * The only ways RoomCore reaches the outside (DECISIONS.md D40). The Cloudflare adapter maps
 * them onto WebSockets, `ctx.storage.sql` and the Durable Object alarm; a Node host onto `ws`,
 * SQLite and `setTimeout`. Time is never read here: every call passes `now` (ms).
 */

import type { GameConfig, GameState, PlayerId } from '@skyline/engine'
import type { RoomPhase, RoomSettings } from '@skyline/protocol'
import type { LoggedAction } from './room.ts'

export interface Connection {
  send(data: string): void
  close(code: number, reason: string): void
  /**
   * Called when the socket is bound to a seat. A host that hibernates stores the token with
   * the socket (a Durable Object attachment) and calls `RoomCore.attach` on wake.
   */
  bound?(token: string): void
}

/** A single alarm, like a Durable Object's: setting it replaces the previous one. */
export interface Scheduler {
  set(at: number | null): void
}

export interface RoomStore {
  /**
   * Upserts one row keyed by `record.turn` (0 = lobby and game start, then one per turn).
   * The latest row restores the room; all rows' actions in order, plus the seed, replay it.
   * `record` is live room state: serialize it before returning.
   */
  save(record: RoomRecord): void
  /** Deletes everything (room expiry). */
  clear(): void
}

/** Randomness the room may not make itself (the code must stay deterministic in tests). */
export interface Entropy {
  /** A 32-bit seed for a new game. */
  seed(): number
  /** An unguessable seat token, 16 to 64 characters. */
  token(): string
}

export interface SeatRecord {
  kind: 'empty' | 'human' | 'bot'
  name: string
  color: number
  ready: boolean
  token?: string
  personality?: string
  /** Running game: when this human's last socket closed (ms); absent while connected. */
  awaySince?: number
  /** A bot plays this human's seat until they return (DECISIONS.md D46). */
  standIn?: boolean
}

export interface GameRecord {
  seed: number
  config: GameConfig
  players: { id: PlayerId; name: string }[]
  state: GameState
  seq: number
}

/** Everything needed to restore a room after it slept or its host restarted. */
export interface RoomSnapshot {
  code: string
  phase: RoomPhase
  locked: boolean
  settings: RoomSettings
  seats: SeatRecord[]
  hostToken: string
  lastActivity: number
  game: GameRecord | null
}

export interface RoomRecord {
  turn: number
  room: RoomSnapshot
  /** Actions applied in this turn so far. */
  actions: LoggedAction[]
}
