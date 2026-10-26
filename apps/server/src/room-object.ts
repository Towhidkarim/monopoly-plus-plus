/**
 * The room Durable Object: maps hibernating WebSockets, the alarm and SQLite onto RoomCore's
 * ports (DECISIONS.md D40, D42, D43). All game logic lives in @skyline/room.
 */

import { PING, PONG, type RoomStatusResponse } from '@skyline/protocol'
import { RoomCore, type Connection, type RoomDeps, type RoomRecord } from '@skyline/room'
import { DurableObject } from 'cloudflare:workers'

export interface Env {
  ROOMS: DurableObjectNamespace<Room>
  CREATE_LIMIT: RateLimit
  ROOM_CHECKSUMS: string
}

interface Row {
  [column: string]: SqlStorageValue
  turn: number
  room: string
  actions: string
}

export class Room extends DurableObject<Env> {
  private core: RoomCore | null = null
  /** One stable Connection per socket, so RoomCore can key its map by it. */
  private readonly conns = new Map<WebSocket, Connection>()
  private readonly deps: RoomDeps

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    const sql = ctx.storage.sql
    this.deps = {
      store: {
        save: (r) =>
          void sql.exec(
            'INSERT OR REPLACE INTO rows (turn, room, actions) VALUES (?, ?, ?)',
            r.turn,
            JSON.stringify(r.room),
            JSON.stringify(r.actions),
          ),
        clear: () => void ctx.storage.deleteAll(),
      },
      scheduler: { set: (at) => void (at === null ? ctx.storage.deleteAlarm() : ctx.storage.setAlarm(at)) },
      entropy: {
        seed: () => crypto.getRandomValues(new Uint32Array(1))[0]!,
        token: () => crypto.randomUUID(),
      },
      options: { checksums: env.ROOM_CHECKSUMS === '1' },
    }
    // Keep-alive pings are answered without waking the room.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG))
    sql.exec(
      'CREATE TABLE IF NOT EXISTS rows (turn INTEGER PRIMARY KEY, room TEXT NOT NULL, actions TEXT NOT NULL)',
    )
    // The one read on wake: the latest row.
    const row = sql.exec<Row>('SELECT turn, room, actions FROM rows ORDER BY turn DESC LIMIT 1').toArray()[0]
    if (row) {
      const record: RoomRecord = {
        turn: row.turn,
        room: JSON.parse(row.room),
        actions: JSON.parse(row.actions),
      }
      this.core = RoomCore.restore(record, this.deps)
      for (const ws of ctx.getWebSockets()) {
        const token: unknown = ws.deserializeAttachment()
        if (typeof token === 'string') this.core.attach(this.conn(ws), token)
      }
    }
  }

  /** RPC from the API. Null when the code is already in use. */
  create(code: string): { token: string } | null {
    if (this.core && !this.core.expired) return null
    const { room, hostToken } = RoomCore.create(code, this.deps, Date.now())
    this.core = room
    return { token: hostToken }
  }

  status(): RoomStatusResponse {
    return this.core?.status() ?? { exists: false }
  }

  override fetch(request: Request): Response {
    if (!this.core || this.core.expired) return new Response('no such room', { status: 404 })
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
      return new Response('expected a WebSocket upgrade', { status: 426 })
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    return new Response(null, { status: 101, webSocket: client })
  }

  override webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    this.core?.message(this.conn(ws), message, Date.now())
  }

  override webSocketClose(ws: WebSocket): void {
    this.drop(ws)
  }

  override webSocketError(ws: WebSocket): void {
    this.drop(ws)
  }

  override alarm(): void {
    this.core?.alarm(Date.now())
  }

  private conn(ws: WebSocket): Connection {
    let conn = this.conns.get(ws)
    if (!conn) {
      conn = {
        send: (data) => ws.send(data),
        close: (code, reason) => ws.close(code, reason),
        // Survives hibernation with the socket, so the seat is rebound on wake.
        bound: (token) => ws.serializeAttachment(token),
      }
      this.conns.set(ws, conn)
    }
    return conn
  }

  private drop(ws: WebSocket): void {
    const conn = this.conns.get(ws)
    this.conns.delete(ws)
    if (conn) this.core?.disconnect(conn, Date.now())
  }
}
