/**
 * Worker entry. Static assets (the web app) are served by Cloudflare before this runs; only
 * /api/* reaches it (wrangler.jsonc `run_worker_first`).
 */

import { createApi } from './api.ts'
import type { Env } from './room-object.ts'

export { Room } from './room-object.ts'

const app = createApi<Env>((env) => ({
  room: (code) => {
    const stub = env.ROOMS.getByName(code)
    return {
      create: (c) => stub.create(c),
      status: () => stub.status(),
      connect: (request) => stub.fetch(request),
    }
  },
  allowCreate: async (key) => (await env.CREATE_LIMIT.limit({ key })).success,
  random: (count) => [...crypto.getRandomValues(new Uint32Array(count))],
}))

export default app satisfies ExportedHandler<Env>
