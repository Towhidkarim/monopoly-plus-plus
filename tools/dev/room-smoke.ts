/**
 * End-to-end check of the online room against a running dev server (or a deploy): creates a
 * room, seats two players, starts, rolls, reconnects one player and pings. Usage:
 * `pnpm room:smoke [baseUrl]` (default http://localhost:5173). Exits non-zero on a failure.
 */

const base = process.argv[2] ?? 'http://localhost:5173'
const wsBase = base.replace(/^http/, 'ws')

type Json = Record<string, unknown>

/** Plain fields of a parsed JSON object (anything else reads as empty). */
function json(value: unknown): Json {
  return typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : {}
}

/** A socket that collects messages and can wait for one of a given type. */
async function open(code: string) {
  const ws = new WebSocket(`${wsBase}/api/rooms/${code}/ws`)
  const inbox: (Json | string)[] = []
  const waiters: (() => void)[] = []
  ws.addEventListener('message', (e) => {
    const data = String(e.data)
    inbox.push(data === 'pong' ? data : json(JSON.parse(data)))
    for (const w of waiters.splice(0)) w()
  })
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', reject)
  })
  const next = async (type: string): Promise<Json | string> => {
    const deadline = Date.now() + 5000
    for (;;) {
      const i = inbox.findIndex((m) => (typeof m === 'string' ? m : m.type) === type)
      if (i >= 0) return inbox.splice(i, 1)[0] ?? ''
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${type}`)
      await new Promise<void>((r) => {
        waiters.push(r)
        setTimeout(r, 200)
      })
    }
  }
  return {
    ws,
    send: (m: object) => ws.send(JSON.stringify(m)),
    next: async (t: string) => json(await next(t)),
    raw: next,
  }
}

function check(ok: unknown, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`)
  console.log(`ok  ${what}`)
}

const created = await fetch(`${base}/api/rooms`, { method: 'POST' })
check(created.status === 201, 'POST /api/rooms creates a room')
const room = json(await created.json())
const code = String(room.code)
const token = room.token
const status = json(await (await fetch(`${base}/api/rooms/${code}`)).json())
check(status.exists, `GET /api/rooms/${code} finds it`)

const host = await open(code)
host.send({ type: 'join', v: 1, name: 'Ada', color: 0xfb7185, token })
const welcome = await host.next('welcome')
check(welcome.seat === 0, 'host joins seat 0 with the creation token')
const guest = await open(code)
guest.send({ type: 'join', v: 1, name: 'Bo', color: 0x22d3ee })
const guestWelcome = await guest.next('welcome')
check(guestWelcome.seat === 1, 'guest joins seat 1')

host.send({ type: 'ready', ready: true })
guest.send({ type: 'ready', ready: true })
host.send({ type: 'start' })
const snapshot = await guest.next('snapshot')
check(json(snapshot.view).rng === 0, 'game starts; snapshot hides the RNG')

host.send({ type: 'action', id: 1, action: { type: 'ROLL' } })
const rolled = await guest.next('events')
check(rolled.seq === 1 && rolled.actor === 'p1', 'roll is broadcast with seq 1')
guest.send({ type: 'action', id: 2, action: { type: 'ROLL' } })
check((await guest.next('error')).code === 'illegal_action', 'out-of-turn roll is rejected')

guest.ws.close()
const back = await open(code)
back.send({
  type: 'join',
  v: 1,
  name: 'Bo',
  color: 0x22d3ee,
  token: guestWelcome.token,
  resume: { epoch: guestWelcome.epoch, seq: 0 },
})
check((await back.next('welcome')).seat === 1, 'guest reconnects to the same seat')
check((await back.next('events')).seq === 1, 'missed events are resent')

back.ws.send('ping')
check((await back.raw('pong')) === 'pong', 'ping is answered')

host.ws.close()
back.ws.close()
console.log(`room ${code}: all good`)
