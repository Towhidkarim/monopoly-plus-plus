/** Bumped on any breaking change to the wire format. Checked once, in `join` and `welcome`. */
export const PROTOCOL_VERSION = 1

export const MIN_SEATS = 2
export const MAX_SEATS = 6

/**
 * Keep-alive strings, sent raw (not JSON) so the Durable Object's WebSocket auto-response
 * can answer them without waking the room (DECISIONS.md D40).
 */
export const PING = 'ping'
export const PONG = 'pong'

/** WebSocket close codes the room uses (4000-4999 is the application range). */
export const CloseCode = {
  versionMismatch: 4000,
  /** The seat was opened in another tab. */
  replaced: 4001,
  kicked: 4002,
  /** The room expired or was closed. */
  closed: 4003,
} as const
