import type { Action, PresetName } from '@skyline/engine'
import type { PieceKind } from '@skyline/board'

/** One seat at the table. */
export interface SeatSetup {
  id: string
  name: string
  kind: 'human' | 'bot'
  piece: PieceKind
  color: number
}

export interface GameSetup {
  preset: PresetName
  seed: number
  seats: SeatSetup[]
}

export interface SavedGame {
  version: 1
  setup: GameSetup
  /** Every accepted action in order; replaying them from the seed rebuilds the game exactly. */
  actions: { playerId: string; action: Action }[]
}

const KEY = 'skyline.savedGame.v1'

/** localStorage can throw or be empty (private mode, blocked storage); saving is best effort. */
export function saveGame(game: SavedGame): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(game))
  } catch {
    // Not fatal: the game just will not resume after a reload.
  }
}

export function loadGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isSavedGame(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function clearSavedGame(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

function isSavedGame(v: unknown): v is SavedGame {
  if (typeof v !== 'object' || v === null) return false
  const g = v as Partial<SavedGame>
  return g.version === 1 && typeof g.setup === 'object' && Array.isArray(g.actions)
}
