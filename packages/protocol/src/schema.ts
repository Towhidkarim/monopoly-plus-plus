/**
 * Client -> room messages, validated with Valibot. The room trusts nothing it receives:
 * every socket message goes through `parseClientMessage` before it reaches RoomCore.
 */

import type { Action, Bundle, GameConfig, PresetName } from '@skyline/engine'
import * as v from 'valibot'
import { MAX_SEATS } from './constants.ts'

/** Raw messages longer than this (in UTF-16 code units) are rejected before parsing. */
export const MAX_MESSAGE_LENGTH = 8192

const int = (min: number, max: number) => v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max))
const space = int(0, 39)
const money = int(0, 1_000_000)
const playerId = v.pipe(v.string(), v.minLength(1), v.maxLength(64))
const seat = int(0, MAX_SEATS - 1)

const BundleSchema = v.strictObject({
  spaces: v.pipe(v.array(space), v.maxLength(40)),
  cash: money,
  jailCards: int(0, 2),
})

const simple = <T extends string>(type: T) => v.strictObject({ type: v.literal(type) })

export const ActionSchema = v.variant('type', [
  simple('ROLL'),
  simple('BUY'),
  simple('DECLINE_BUY'),
  v.strictObject({ type: v.literal('BID'), amount: money }),
  simple('PASS_BID'),
  v.strictObject({ type: v.literal('BUILD'), space }),
  v.strictObject({ type: v.literal('SELL_BUILDING'), space }),
  v.strictObject({ type: v.literal('MORTGAGE'), space }),
  v.strictObject({ type: v.literal('UNMORTGAGE'), space }),
  v.strictObject({
    type: v.literal('PROPOSE_TRADE'),
    to: playerId,
    give: BundleSchema,
    get: BundleSchema,
  }),
  v.strictObject({ type: v.literal('CANCEL_TRADE'), tradeId: int(0, 1e9) }),
  v.strictObject({ type: v.literal('ACCEPT_TRADE'), tradeId: int(0, 1e9) }),
  v.strictObject({ type: v.literal('REJECT_TRADE'), tradeId: int(0, 1e9) }),
  v.strictObject({ type: v.literal('CHOOSE_MOVE'), space }),
  simple('PAY_JAIL_FINE'),
  simple('USE_JAIL_CARD'),
  simple('END_TURN'),
  simple('DECLARE_BANKRUPTCY'),
  // TIMEOUT is not here: only the room's timers send it.
])

const PRESETS = ['standard', 'turbo', 'classic'] as const satisfies readonly PresetName[]

/** House-rule overrides on top of the preset. Ranges are generous; the room clamps nothing. */
const RulesSchema = v.strictObject({
  startingCash: v.exactOptional(int(0, 100_000)),
  goSalary: v.exactOptional(int(0, 10_000)),
  landOnGoBonus: v.exactOptional(v.boolean()),
  jailFine: v.exactOptional(int(0, 10_000)),
  maxJailTurns: v.exactOptional(int(1, 10)),
  auctionOnDecline: v.exactOptional(v.boolean()),
  freeParkingPot: v.exactOptional(v.boolean()),
  evenBuild: v.exactOptional(v.boolean()),
  dealtProperties: v.exactOptional(int(0, 10)),
  roundLimit: v.exactOptional(int(0, 1000)),
  mortgageInterest: v.exactOptional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
  houses: v.exactOptional(int(0, 200)),
  hotels: v.exactOptional(int(0, 100)),
  maxOpenTrades: v.exactOptional(int(1, 20)),
  speedDie: v.exactOptional(v.boolean()),
})

export const RoomSettingsSchema = v.strictObject({
  preset: v.picklist(PRESETS),
  rules: RulesSchema,
  /** Seconds per decision before TIMEOUT; 0 turns the timer off. */
  turnSeconds: v.union([v.literal(0), int(15, 600)]),
  /** A bot plays a disconnected player's seat after the grace period. */
  botTakeover: v.boolean(),
})

const name = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(20))

export const ClientMessageSchema = v.variant('type', [
  /** First message on every socket. `token` reclaims a seat; `resume` asks for missed events. */
  v.strictObject({
    type: v.literal('join'),
    v: int(0, 1e6),
    name,
    color: int(0, 0xffffff),
    token: v.exactOptional(v.pipe(v.string(), v.minLength(16), v.maxLength(64))),
    /** The `epoch` from the last `welcome` and the last `seq` seen; resends only within an epoch. */
    resume: v.exactOptional(
      v.strictObject({ epoch: v.pipe(v.string(), v.maxLength(64)), seq: int(0, Number.MAX_SAFE_INTEGER) }),
    ),
  }),
  v.strictObject({ type: v.literal('ready'), ready: v.boolean() }),
  /** `id` is echoed back as `replyTo` so the sender can match errors to its own actions. */
  v.strictObject({ type: v.literal('action'), id: int(0, 1e9), action: ActionSchema }),
  v.strictObject({
    type: v.literal('chat'),
    text: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  }),
  /** Give up the seat (lobby) or leave the game. */
  simple('leave'),
  // Host only:
  /** Put a bot in a seat (`personality`) or empty it (null). */
  v.strictObject({
    type: v.literal('set_bot'),
    seat,
    personality: v.nullable(v.pipe(v.string(), v.regex(/^[a-z][a-z0-9-]{0,23}$/))),
  }),
  v.strictObject({ type: v.literal('kick'), seat }),
  v.strictObject({ type: v.literal('settings'), settings: RoomSettingsSchema }),
  v.strictObject({ type: v.literal('lock'), locked: v.boolean() }),
  simple('start'),
])

export type ClientMessage = v.InferOutput<typeof ClientMessageSchema>
export type RoomSettings = v.InferOutput<typeof RoomSettingsSchema>
/** Every engine action a client may send (all but TIMEOUT). */
export type ClientAction = v.InferOutput<typeof ActionSchema>

// Compile-time checks: the schemas must track the engine's types exactly.
// The single-use type parameters are the standard trick for exact type equality.
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T
/** Not used at runtime; fails to compile when a schema drifts from the engine. */
export type SchemaChecks = [
  Assert<Equals<ClientAction, Exclude<Action, { type: 'TIMEOUT' }>>>,
  Assert<Equals<v.InferOutput<typeof BundleSchema>, Bundle>>,
  Assert<Equals<v.InferOutput<typeof RulesSchema>, Partial<GameConfig>>>,
]

export type ParseResult<T> = { ok: true; message: T } | { ok: false; error: string }

/** Parses one raw socket message. Never throws. */
export function parseClientMessage(raw: unknown): ParseResult<ClientMessage> {
  if (typeof raw !== 'string') return { ok: false, error: 'messages must be text' }
  if (raw.length > MAX_MESSAGE_LENGTH) return { ok: false, error: 'message too large' }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'invalid JSON' }
  }
  const result = v.safeParse(ClientMessageSchema, json)
  if (result.success) return { ok: true, message: result.output }
  const issue = result.issues[0]
  const path = issue.path?.map((p) => String(p.key)).join('.')
  return { ok: false, error: path ? `${path}: ${issue.message}` : issue.message }
}
