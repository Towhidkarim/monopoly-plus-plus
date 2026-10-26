/**
 * Browser-side online session: the remembered display name and color, and the one open room
 * connection (DECISIONS.md D40, D44).
 */

import { tokenColors } from '@skyline/board'
import { RoomConnection, localTokens, type TokenStore } from './connection.ts'

export interface Profile {
  name: string
  color: number
}

const PROFILE_KEY = 'skyline.profile.v1'

/** Dev `?seat=tab`: each tab is its own player, so name and seat token live in sessionStorage. */
const perTab = (): boolean =>
  import.meta.env.DEV && new URLSearchParams(window.location.search).get('seat') === 'tab'

const profileStorage = (): Storage => (perTab() ? sessionStorage : localStorage)

export function loadProfile(): Profile | null {
  try {
    const raw = profileStorage().getItem(PROFILE_KEY)
    const p: unknown = raw ? JSON.parse(raw) : null
    if (typeof p !== 'object' || p === null || !('name' in p) || !('color' in p)) return null
    const { name, color } = p
    return typeof name === 'string' && typeof color === 'number' ? { name, color } : null
  } catch {
    return null
  }
}

export function saveProfile(p: Profile): void {
  try {
    profileStorage().setItem(PROFILE_KEY, JSON.stringify(p))
  } catch {
    // Best effort.
  }
}

export const defaultProfile = (): Profile => ({ name: '', color: tokenColors[0] })

/** Normally a second tab takes the seat over; `?seat=tab` lets one browser fill several seats. */
const sessionTokens: TokenStore = {
  get: (code) => sessionStorage.getItem(`skyline.seat.${code}`),
  set: (code, token) => sessionStorage.setItem(`skyline.seat.${code}`, token),
}

export function tokenStore(): TokenStore {
  return perTab() ? sessionTokens : localTokens
}

let current: RoomConnection | null = null

/**
 * The connection for a room, opened on first use. Kept outside React state so StrictMode's
 * double render and effect re-runs never open a second socket (which could take a second seat).
 */
export function roomConnection(code: string, profile: Profile): RoomConnection {
  if (current?.code === code) return current
  current?.close()
  current = new RoomConnection({ code, name: profile.name, color: profile.color, tokens: tokenStore() })
  return current
}

/** Disconnects without giving up the seat (its token reclaims it on return). */
export function closeRoom(): void {
  current?.close()
  current = null
}

/** Leaves the room for good (the seat is freed in the lobby). */
export function leaveRoom(): void {
  current?.send({ type: 'leave' })
  current?.close()
  current = null
}
