/**
 * Room -> client messages and the HTTP API shapes. The server builds these, so they are
 * plain types; the client only checks the envelope (`parseServerMessage`).
 */

import type { Action, GameEvent, PlayerId, PlayerView } from '@skyline/engine'
import type { ParseResult, RoomSettings } from './schema.ts'

export type RoomPhase = 'lobby' | 'playing' | 'over'

export interface SeatInfo {
  seat: number
  kind: 'empty' | 'human' | 'bot'
  name: string
  color: number
  /** Humans only; bots are always ready. */
  ready: boolean
  connected: boolean
  host: boolean
  personality?: string
  /** Set once the game has started. */
  playerId?: PlayerId
  /** A bot plays this human's seat while they are away (host setting `botTakeover`). */
  standIn?: boolean
}

export interface LobbyInfo {
  code: string
  phase: RoomPhase
  locked: boolean
  seats: SeatInfo[]
  settings: RoomSettings
}

export type ErrorCode =
  | 'bad_message'
  | 'version_mismatch'
  | 'not_joined'
  | 'room_full'
  | 'room_locked'
  | 'game_running'
  | 'bad_token'
  | 'not_host'
  | 'not_ready'
  | 'illegal_action'
  | 'kicked'
  /** The seat was opened in another tab. */
  | 'replaced'

export type ServerMessage =
  /**
   * Reply to `join`. Keep `token` (localStorage, keyed by room code) to reclaim the seat.
   * `epoch` names this run of the room: after a restart it changes, and held events are gone.
   */
  | { type: 'welcome'; v: number; token: string; seat: number; epoch: string; lobby: LobbyInfo }
  | { type: 'lobby'; lobby: LobbyInfo }
  /** Full masked state; on game start and when missed events are no longer held. */
  | { type: 'snapshot'; seq: number; view: PlayerView }
  /**
   * One message per applied action. `seq` increases by one per message; a gap means the
   * client missed something and should rejoin with `lastSeq`.
   */
  | {
      type: 'events'
      seq: number
      actor: PlayerId
      action: Action
      events: GameEvent[]
      /**
       * This player's view after the action (clients cannot reduce: they have no seed).
       * Replayed events on reconnect carry it only on the last message.
       */
      view?: PlayerView
      /** The sender's `action.id`, only in the copy sent to the sender. */
      replyTo?: number
    }
  | { type: 'error'; code: ErrorCode; message?: string; replyTo?: number }
  | { type: 'chat'; seat: number; name: string; text: string }
  /** Dev mode: hash of this player's view at a turn end, compared with the client's own. */
  | { type: 'checksum'; seq: number; hash: string }

export type ServerMessageType = ServerMessage['type']

const SERVER_TYPES: ReadonlySet<string> = new Set<ServerMessageType>([
  'welcome',
  'lobby',
  'snapshot',
  'events',
  'error',
  'chat',
  'checksum',
])

export function encode(message: ServerMessage): string {
  return JSON.stringify(message)
}

/** Client side: checks the envelope only, the room is trusted. Never throws. */
export function parseServerMessage(raw: unknown): ParseResult<ServerMessage> {
  if (typeof raw !== 'string') return { ok: false, error: 'messages must be text' }
  try {
    const json: unknown = JSON.parse(raw)
    if (isServerMessage(json)) return { ok: true, message: json }
    return { ok: false, error: 'unknown message type' }
  } catch {
    return { ok: false, error: 'invalid JSON' }
  }
}

function isServerMessage(json: unknown): json is ServerMessage {
  return typeof json === 'object' && json !== null && 'type' in json && SERVER_TYPES.has(String(json.type))
}

/**
 * FNV-1a over the view's JSON, as hex. Room and client hash the same parsed object, so
 * equal views give equal checksums (dev-mode divergence check, DECISIONS.md D40).
 */
export function viewChecksum(view: PlayerView): string {
  const text = JSON.stringify(view)
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(16).padStart(8, '0')
}

// HTTP API (apps/server).

/** `POST /api/rooms`: the creator's token makes them host when they join. */
export interface CreateRoomResponse {
  code: string
  token: string
}

/** `GET /api/rooms/:code` */
export type RoomStatusResponse =
  | { exists: false }
  | { exists: true; phase: RoomPhase; locked: boolean; freeSeats: number }
