/**
 * The HTTP API (ARCHITECTURE.md section 8). Platform-free: the Cloudflare entry passes in how
 * to reach a room, rate-limit and draw random numbers, so the routes are tested in plain Vitest.
 */

import {
  ROOM_CODE_LENGTH,
  normalizeRoomCode,
  roomCodeFrom,
  type CreateRoomResponse,
  type RoomStatusResponse,
} from '@skyline/protocol'
import { Hono } from 'hono'

/** One room, as the API sees it (the Durable Object stub in production). */
export interface RoomHandle {
  /** Creates the room under this code; null if the code is taken. */
  create(code: string): Promise<{ token: string } | null>
  status(): Promise<RoomStatusResponse>
  /** Forwards the WebSocket upgrade. */
  connect(request: Request): Promise<Response>
}

export interface ApiDeps {
  room(code: string): RoomHandle
  /** False when this key went over the creation limit. */
  allowCreate(key: string): Promise<boolean>
  /** Random 32-bit integers. */
  random(count: number): number[]
}

/** Fresh codes tried before giving up (a collision is about one in 28 million per live room). */
const CREATE_TRIES = 5

export function createApi<Env extends object>(deps: (env: Env) => ApiDeps) {
  const app = new Hono<{ Bindings: Env }>().basePath('/api')

  app.post('/rooms', async (c) => {
    const d = deps(c.env)
    if (!(await d.allowCreate(c.req.header('cf-connecting-ip') ?? 'unknown')))
      return c.json({ error: 'too many rooms, try again in a minute' }, 429)
    for (let i = 0; i < CREATE_TRIES; i++) {
      const code = roomCodeFrom(d.random(ROOM_CODE_LENGTH))
      const created = await d.room(code).create(code)
      if (created) return c.json({ code, token: created.token } satisfies CreateRoomResponse, 201)
    }
    return c.json({ error: 'no free room code, try again' }, 503)
  })

  app.get('/rooms/:code', async (c) => {
    const code = normalizeRoomCode(c.req.param('code'))
    if (!code) return c.json({ exists: false } satisfies RoomStatusResponse, 404)
    const status = await deps(c.env).room(code).status()
    return c.json(status, status.exists ? 200 : 404)
  })

  app.get('/rooms/:code/ws', async (c) => {
    if (c.req.header('upgrade')?.toLowerCase() !== 'websocket')
      return c.text('expected a WebSocket upgrade', 426)
    const code = normalizeRoomCode(c.req.param('code'))
    if (!code) return c.text('no such room', 404)
    return deps(c.env).room(code).connect(c.req.raw)
  })

  return app
}
