import { createContext, useContext, useEffect, useState } from 'react'
import type { BoardHandle } from '@skyline/board'

/**
 * What cards need from the game screen: the board (for lot portraits), whether the sky is night
 * and the reduced-motion setting. Provided by GameScreen; cards outside it get calm defaults.
 */
export interface CardEnv {
  handle: BoardHandle | null
  night: boolean
  reducedMotion: boolean
}

export const BoardHandleContext = createContext<CardEnv>({ handle: null, night: false, reducedMotion: false })

export const useCardEnv = (): CardEnv => useContext(BoardHandleContext)

/** The operating system's reduced-motion preference. */
export const osReducedMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false

/** The game's reduced-motion setting or the OS preference. */
export function useReducedMotion(): boolean {
  const env = useCardEnv()
  return env.reducedMotion || osReducedMotion()
}

/**
 * The lot building image for a property, or null while loading (the card shows its window
 * background meanwhile) and for spaces without a building. `level`: see BoardHandle.lotPortrait.
 */
export function useLotPortrait(space: number, level: number, night?: boolean): string | null {
  const env = useCardEnv()
  const handle = env.handle
  const dark = night ?? env.night
  const [shown, setShown] = useState<{ key: string; url: string | null } | null>(null)
  const key = `${space}:${level}:${dark ? 1 : 0}`
  useEffect(() => {
    if (!handle) return
    let live = true
    handle
      .lotPortrait(space, level, dark)
      .then((url) => live && setShown({ key, url }))
      .catch(() => live && setShown({ key, url: null }))
    return () => {
      live = false
    }
  }, [handle, space, level, dark, key])
  // Keep the previous image while the next loads (a build changes the level, no flash).
  return shown?.url ?? null
}
