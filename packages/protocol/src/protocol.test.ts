import { describe, expect, it } from 'vitest'
import {
  MAX_MESSAGE_LENGTH,
  PROTOCOL_VERSION,
  encode,
  isRoomCode,
  normalizeRoomCode,
  parseClientMessage,
  parseServerMessage,
  roomCodeFrom,
  type ClientMessage,
} from './index.ts'

const parse = (m: unknown) => parseClientMessage(JSON.stringify(m))
const join = { type: 'join', v: PROTOCOL_VERSION, name: 'Ada', color: 0x3b82f6 }

describe('parseClientMessage', () => {
  it('accepts every message kind', () => {
    const messages: ClientMessage[] = [
      { ...join, type: 'join', token: 'a'.repeat(32), resume: { epoch: 'e1', seq: 12 } },
      { type: 'ready', ready: true },
      { type: 'action', id: 1, action: { type: 'ROLL' } },
      { type: 'chat', text: 'gl hf' },
      { type: 'leave' },
      { type: 'set_bot', seat: 2, personality: 'banker' },
      { type: 'set_bot', seat: 2, personality: null },
      { type: 'kick', seat: 5 },
      {
        type: 'settings',
        settings: { preset: 'turbo', rules: { freeParkingPot: true }, turnSeconds: 0, botTakeover: true },
      },
      { type: 'lock', locked: true },
      { type: 'start' },
    ]
    for (const m of messages) expect(parse(m)).toEqual({ ok: true, message: m })
  })

  it('accepts every client action', () => {
    const bundle = { spaces: [1, 3], cash: 50, jailCards: 0 }
    const actions = [
      { type: 'ROLL' },
      { type: 'BUY' },
      { type: 'DECLINE_BUY' },
      { type: 'BID', amount: 120 },
      { type: 'PASS_BID' },
      { type: 'BUILD', space: 39 },
      { type: 'SELL_BUILDING', space: 1 },
      { type: 'MORTGAGE', space: 5 },
      { type: 'UNMORTGAGE', space: 5 },
      { type: 'PROPOSE_TRADE', to: 'p2', give: bundle, get: { spaces: [], cash: 0, jailCards: 1 } },
      { type: 'CANCEL_TRADE', tradeId: 3 },
      { type: 'ACCEPT_TRADE', tradeId: 3 },
      { type: 'REJECT_TRADE', tradeId: 3 },
      { type: 'PAY_JAIL_FINE' },
      { type: 'USE_JAIL_CARD' },
      { type: 'END_TURN' },
      { type: 'DECLARE_BANKRUPTCY' },
    ]
    for (const action of actions) expect(parse({ type: 'action', id: 7, action }).ok).toBe(true)
  })

  it('trims names and chat', () => {
    const r = parse({ ...join, name: '  Ada  ' })
    expect(r.ok && r.message.type === 'join' && r.message.name).toBe('Ada')
  })

  it.each([
    ['TIMEOUT from a client', { type: 'action', id: 1, action: { type: 'TIMEOUT' } }],
    ['unknown action', { type: 'action', id: 1, action: { type: 'CHEAT' } }],
    ['space off the board', { type: 'action', id: 1, action: { type: 'BUILD', space: 40 } }],
    ['fractional bid', { type: 'action', id: 1, action: { type: 'BID', amount: 10.5 } }],
    ['negative bid', { type: 'action', id: 1, action: { type: 'BID', amount: -1 } }],
    ['extra key', { type: 'action', id: 1, action: { type: 'ROLL', dice: [6, 6] } }],
    ['missing id', { type: 'action', action: { type: 'ROLL' } }],
    ['unknown message', { type: 'teleport' }],
    ['empty name', { ...join, name: '   ' }],
    ['long name', { ...join, name: 'x'.repeat(21) }],
    ['short token', { ...join, token: 'abc' }],
    ['seat out of range', { type: 'kick', seat: 6 }],
    ['bad personality', { type: 'set_bot', seat: 1, personality: 'Robert; DROP' }],
    [
      'unknown rule',
      {
        type: 'settings',
        settings: { preset: 'turbo', rules: { godMode: true }, turnSeconds: 0, botTakeover: false },
      },
    ],
    [
      'short timer',
      { type: 'settings', settings: { preset: 'turbo', rules: {}, turnSeconds: 5, botTakeover: false } },
    ],
    ['array', [1, 2]],
    ['null', null],
  ])('rejects %s', (_, m) => {
    expect(parse(m)).toEqual({ ok: false, error: expect.any(String) })
  })

  it('rejects non-text, bad JSON and oversized messages without throwing', () => {
    expect(parseClientMessage(new ArrayBuffer(4))).toEqual({ ok: false, error: 'messages must be text' })
    expect(parseClientMessage('{"type":')).toEqual({ ok: false, error: 'invalid JSON' })
    const big = JSON.stringify({ type: 'chat', text: 'x'.repeat(MAX_MESSAGE_LENGTH) })
    expect(parseClientMessage(big)).toEqual({ ok: false, error: 'message too large' })
  })

  it('names the failing field', () => {
    const r = parse({ type: 'action', id: 1, action: { type: 'BUILD', space: 99 } })
    expect(!r.ok && r.error.startsWith('action.space')).toBe(true)
  })
})

describe('parseServerMessage', () => {
  it('round-trips encode', () => {
    const m = { type: 'error', code: 'version_mismatch', message: 'reload' } as const
    expect(parseServerMessage(encode(m))).toEqual({ ok: true, message: m })
  })

  it('rejects unknown envelopes', () => {
    expect(parseServerMessage('{"type":"nope"}').ok).toBe(false)
    expect(parseServerMessage('pong').ok).toBe(false)
    expect(parseServerMessage(42).ok).toBe(false)
  })
})

describe('room codes', () => {
  it('normalizes typed codes', () => {
    expect(normalizeRoomCode(' ab2-cd ')).toBe('AB2CD')
    expect(normalizeRoomCode('ABCD')).toBeNull()
    expect(normalizeRoomCode('AB0CD')).toBeNull() // 0 is a look-alike
    expect(normalizeRoomCode('ABICD')).toBeNull()
  })

  it('builds valid codes from any integers', () => {
    const code = roomCodeFrom([0, 30, 31, -5, 4_294_967_295])
    expect(code).toBe('2Z275')
    expect(isRoomCode(code)).toBe(true)
    expect(() => roomCodeFrom([1, 2])).toThrow('need 5 values')
  })
})
