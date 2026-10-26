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
