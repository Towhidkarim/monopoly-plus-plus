import { Application } from 'pixi.js'
import { Board, type BoardCursors } from './board.ts'
import type { DiceThrowOptions, DiceThrowResult } from './dice/view.ts'
import { palette } from './palette.ts'
import { LotPortraits } from './portrait.ts'

export interface BoardOptions {
  /** Canvas clear color. */
  background?: number
  /** Seed of the generated city in the middle (cosmetic; the game's dice seed is separate). */
  citySeed?: number | undefined
  /** CSS cursor values for the canvas; defaults to the system 'grab' / 'pointer' / 'grabbing'. */
  cursors?: Partial<BoardCursors> | undefined
}

export interface BoardHandle {
  readonly app: Application
  readonly board: Board
  /**
   * Image URL of a property's lot building as the board draws it (isometric, transparent,
   * cropped). `level`: -1 empty lot for sale, 0 owned, 1 to 4 houses, 5 hotel. Null for spaces
   * without a building (stations, utilities). Cached per space, level and sky.
   */
  /** Swaps the canvas cursors live (for example when the player toggles the game cursor). */
  setCursors(cursors: Partial<BoardCursors>): void
  lotPortrait(space: number, level: number, night: boolean): Promise<string | null>
  /** Throws the dice onto the board (same as `board.throwDice`). */
  throwDice(options: DiceThrowOptions): Promise<DiceThrowResult>
  destroy(): void
}

/**
 * Creates the Pixi application inside `host`, keeps it sized to it, and builds the board.
 * Resolves to a handle whose `destroy()` removes the canvas and frees GPU resources.
 */
/**
 * Never below 2x: on standard-density screens the zoomed-out board has few pixels per shape,
 * so thin lines and edges shimmer. Rendering at 2x and letting the browser scale the canvas
 * down is cheap supersampling for flat vector art (cost: 4x the pixels on a 1x screen).
 */
export function defaultResolution(): number {
  return Math.max(2, Math.min(window.devicePixelRatio, 2))
}

export async function mountBoard(host: HTMLElement, options: BoardOptions = {}): Promise<BoardHandle> {
  const app = new Application()
  await app.init({
    resizeTo: host,
    background: options.background ?? palette.table,
    antialias: true,
    resolution: defaultResolution(),
    autoDensity: true,
  })
  host.appendChild(app.canvas)
  const board = new Board(app, options.citySeed)
  if (options.cursors) board.setCursors(options.cursors)

  const portraits = new LotPortraits(app, options.citySeed ?? 1)

  return {
    app,
    board,
    setCursors: (c) => board.setCursors(c),
    lotPortrait: (space, level, night) => portraits.get(space, level, night),
    throwDice: (o) => board.throwDice(o),
    destroy() {
      portraits.destroy()
      board.destroy()
      // releaseGlobalResources: StrictMode and HMR re-create the app in the same tab.
      app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true })
    },
  }
}
