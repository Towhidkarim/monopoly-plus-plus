import { PRESETS, type Action, type GameConfig, type PresetName } from '@skyline/engine'
import type { PieceKind } from '@skyline/board'

/** One seat at the table. */
export interface SeatSetup {
  id: string
  name: string
  /**
   * `human` plays at this screen; `remote` is a human in another browser (online games, where
   * only our own seat is `human`); `bot` is played by the engine's bots.
   */
  kind: 'human' | 'bot' | 'remote'
  piece: PieceKind
  color: number
  /** Bot personality (see PERSONALITIES in @skyline/bots); assigned in turn when absent. */
  personality?: string
}

/** Optional twists on top of the preset (DECISIONS.md D61); all off when absent. */
export interface Twists {
  speedDie?: boolean
  underdogSalary?: boolean
}

/** The twists the setup screens offer, in order. */
export const TWISTS: readonly { key: keyof Twists; label: string; blurb: string }[] = [
  {
    key: 'speedDie',
    label: 'Speed die',
    blurb:
      'A third die. The Bus lets you pick where to go; the Scout grabs the nearest free lot. Faster games.',
  },
  {
    key: 'underdogSalary',
    label: 'Comeback',
    blurb: 'Players behind the leader collect a bigger salary at Launch, up to +50%.',
  },
]

export interface GameSetup {
  preset: PresetName
  /** Twists switched on (absent in old saves: none). */
  twists?: Twists
  seed: number
  /** Seed of the generated city on the board (cosmetic only; absent in old saves). */
  citySeed?: number
  seats: SeatSetup[]
}

/** The engine config for a setup: its preset plus its twists. */
export const configOf = (setup: GameSetup): GameConfig => ({ ...PRESETS[setup.preset], ...setup.twists })

/** The city a setup shows: its own seed, or one derived from the game seed for old saves. */
export const cityOf = (setup: GameSetup): number => setup.citySeed ?? (setup.seed * 2654435761) % 1_000_003

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
