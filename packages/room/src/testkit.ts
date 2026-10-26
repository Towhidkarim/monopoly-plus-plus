/** Fake ports for RoomCore tests: in-memory sockets, a manual clock and a row store. */

import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from '@skyline/protocol'
import type { Connection, RoomRecord } from './ports.ts'
import { RoomCore, type RoomDeps, type RoomOptions } from './room.ts'

type Of<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>

export class FakeConn implements Connection {
  readonly sent: ServerMessage[] = []
  closed: { code: number; reason: string } | null = null
  token: string | null = null

  send(data: string): void {
    this.sent.push(JSON.parse(data))
  }
  close(code: number, reason: string): void {
    this.closed = { code, reason }
  }
  bound(token: string): void {
    this.token = token
  }

  all<T extends ServerMessage['type']>(type: T): Of<T>[] {
    return this.sent.filter((m): m is Of<T> => m.type === type)
  }
  last<T extends ServerMessage['type']>(type: T): Of<T> | undefined {
    return this.all(type).at(-1)
  }
  clear(): void {
    this.sent.length = 0
  }
}

/** One room's world: clock, alarm, storage and entropy. */
export class FakeHost {
  now = 1_000_000
  alarm: number | null = null
  readonly rows = new Map<number, RoomRecord>()
  cleared = false
  /** Rows written so far. */
  writes = 0
  private tokens = 0
  readonly deps: RoomDeps

  constructor(options: RoomOptions = {}, seed = 42) {
    this.deps = {
      store: {
        save: (record) => {
          this.writes++
          this.rows.set(record.turn, JSON.parse(JSON.stringify(record)))
        },
        clear: () => {
          this.rows.clear()
          this.cleared = true
        },
      },
      scheduler: { set: (at) => void (this.alarm = at) },
      entropy: { seed: () => seed, token: () => `token-${++this.tokens}`.padEnd(16, '-') },
      options: { botDelay: 500, ...options },
    }
  }

  create(code = 'ABCDE'): { room: RoomCore; hostToken: string } {
    return RoomCore.create(code, this.deps, this.now)
  }

  /** The latest row, as a restarted host would read it on wake. */
  latest(): RoomRecord {
    return this.rows.get(Math.max(...this.rows.keys()))!
  }

  send(room: RoomCore, conn: Connection, message: ClientMessage): void {
    room.message(conn, JSON.stringify(message), this.now)
  }

  join(
    room: RoomCore,
    name: string,
    extra: Partial<Extract<ClientMessage, { type: 'join' }>> = {},
  ): FakeConn {
    const conn = new FakeConn()
    this.send(room, conn, { type: 'join', v: PROTOCOL_VERSION, name, color: 0x22d3ee, ...extra })
    return conn
  }

  /** Moves the clock forward, firing every alarm on the way. */
  advance(room: RoomCore, ms: number): void {
    const end = this.now + ms
    while (this.alarm !== null && this.alarm <= end) {
      this.now = Math.max(this.now, this.alarm)
      room.alarm(this.now)
    }
    this.now = end
  }

  /** Fires alarms until `done` holds or `cap` alarms ran. */
  runUntil(room: RoomCore, done: () => boolean, cap = 100_000): void {
    for (let i = 0; i < cap && !done() && this.alarm !== null; i++) {
      this.now = Math.max(this.now, this.alarm)
      room.alarm(this.now)
    }
  }
}
