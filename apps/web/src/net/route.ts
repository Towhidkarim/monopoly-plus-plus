/**
 * Path routes for online play: `/online` (create or join) and `/r/<code>` (a room). A small
 * pathname switch instead of a router until there are more screens (DECISIONS.md D44).
 */

import { useEffect, useState } from 'react'
import { normalizeRoomCode } from '@skyline/protocol'

export type Route = { kind: 'home' } | { kind: 'online' } | { kind: 'room'; code: string }

export function routeOf(pathname: string): Route {
  if (pathname === '/online') return { kind: 'online' }
  const room = /^\/r\/([^/]+)\/?$/.exec(pathname)
  const code = room ? normalizeRoomCode(decodeURIComponent(room[1]!)) : null
  return code ? { kind: 'room', code } : { kind: 'home' }
}

export function navigate(path: string): void {
  if (window.location.pathname === path) return
  // Keep dev query options (?seat=tab) across online screens.
  window.history.pushState(null, '', path + window.location.search)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function useRoute(): Route {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return routeOf(path)
}
