import type { RoomStatusResponse } from '@skyline/protocol'
import { describe, expect, it } from 'vitest'
import { createApi, type ApiDeps, type RoomHandle } from './api.ts'

/** Rooms in a Map, a counting rate limiter and scripted random numbers. */
function fakeDeps({ limit = 100, randoms = [] as number[][] } = {}) {
  const rooms = new Map<string, { token: string }>()
  const used = new Map<string, number>()
  let draw = 0
  const deps: ApiDeps = {
    room: (code): RoomHandle => ({
      create: async () => {
        if (rooms.has(code)) return null
        rooms.set(code, { token: `host-${code}` })
        return rooms.get(code)!
      },
      status: async (): Promise<RoomStatusResponse> =>
        rooms.has(code) ? { exists: true, phase: 'lobby', locked: false, freeSeats: 6 } : { exists: false },
      connect: async () => new Response(`socket for ${code}`),
    }),
    allowCreate: async (key) => {
      used.set(key, (used.get(key) ?? 0) + 1)
      return used.get(key)! <= limit
    },
    random: (count) => randoms[draw++] ?? Array.from({ length: count }, (_, i) => draw * 7 + i),
  }
  return { app: createApi<object>(() => deps), rooms }
}

const post = { method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.9' } }

describe('api', () => {
  it('creates a room and reports its status by code, in any case', async () => {
    const { app } = fakeDeps({ randoms: [[0, 1, 2, 3, 4]] })
    const res = await app.request('/api/rooms', post)
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ code: '23456', token: 'host-23456' })
    const status = await app.request('/api/rooms/23456')
    expect(await status.json()).toMatchObject({ exists: true, phase: 'lobby' })
    expect((await app.request('/api/rooms/2345-6')).status).toBe(200)
  })

  it('draws a new code on a collision', async () => {
    const { app, rooms } = fakeDeps({
      randoms: [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [1, 1, 1, 1, 1],
      ],
    })
    await app.request('/api/rooms', post)
    const res = await app.request('/api/rooms', post)
    expect(await res.json()).toMatchObject({ code: '33333' })
    expect([...rooms.keys()]).toEqual(['22222', '33333'])
  })

  it('rate-limits room creation per IP', async () => {
    const { app } = fakeDeps({ limit: 1 })
    expect((await app.request('/api/rooms', post)).status).toBe(201)
    expect((await app.request('/api/rooms', post)).status).toBe(429)
  })

  it('answers 404 for unknown or malformed codes', async () => {
    const { app } = fakeDeps()
    expect((await app.request('/api/rooms/ZZZZZ')).status).toBe(404)
    expect(await (await app.request('/api/rooms/O0O0O')).json()).toEqual({ exists: false })
  })

  it('forwards only WebSocket upgrades to the room', async () => {
    const { app } = fakeDeps()
    expect((await app.request('/api/rooms/ABCDE/ws')).status).toBe(426)
    const res = await app.request('/api/rooms/abcde/ws', { headers: { upgrade: 'websocket' } })
    expect(await res.text()).toBe('socket for ABCDE')
  })
})
