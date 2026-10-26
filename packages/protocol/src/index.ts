/**
 * Client/server wire format. See docs/ARCHITECTURE.md section 8 and DECISIONS.md D40.
 */

export * from './constants.ts'
export * from './roomCode.ts'
export {
  ActionSchema,
  ClientMessageSchema,
  MAX_MESSAGE_LENGTH,
  RoomSettingsSchema,
  parseClientMessage,
  type ClientAction,
  type ClientMessage,
  type ParseResult,
  type RoomSettings,
} from './schema.ts'
export {
  encode,
  parseServerMessage,
  type CreateRoomResponse,
  type ErrorCode,
  type LobbyInfo,
  type RoomPhase,
  type RoomStatusResponse,
  type SeatInfo,
  type ServerMessage,
  type ServerMessageType,
} from './messages.ts'
