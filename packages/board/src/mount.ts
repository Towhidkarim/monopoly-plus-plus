import { Application } from 'pixi.js'
import { Board } from './board.ts'
import { palette } from './palette.ts'
import { LotPortraits } from './portrait.ts'

export interface BoardOptions {
  /** Canvas clear color. */
  background?: number
  /** Seed of the generated city in the middle (cosmetic; the game's dice seed is separate). */
  citySeed?: number | undefined
}

export interface BoardHandle {
  readonly app: Application
  readonly board: Board
  /**
   * Image URL of a property's lot building as the board draws it (isometric, transparent,
   * cropped). `level`: -1 empty lot for sale, 0 owned, 1 to 4 houses, 5 hotel. Null for spaces
   * without a building (stations, utilities). Cached per space, level and sky.
   */
  lotPortrait(space: number, level: number, night: boolean): Promise<string | null>
  destroy(): void
}

/**
 * Creates the Pixi application inside `host`, keeps it sized to it, and builds the board.
 * Resolves to a handle whose `destroy()` removes the canvas and frees GPU resources.
 */
export async function mountBoard(host: HTMLElement, options: BoardOptions = {}): Promise<BoardHandle> {
  const app = new Application()
  await app.init({
    resizeTo: host,
    background: options.background ?? palette.table,
    antialias: true,
    // Never below 2x: on standard-density screens the zoomed-out board has few pixels per shape,
    // so thin lines and edges shimmer. Rendering at 2x and letting the browser scale the canvas
    // down is cheap supersampling for flat vector art (cost: 4x the pixels on a 1x screen).
    resolution: Math.max(2, Math.min(window.devicePixelRatio, 2)),
    autoDensity: true,
  })
  host.appendChild(app.canvas)
  const board = new Board(app, options.citySeed)

  const portraits = new LotPortraits(app, options.citySeed ?? 1)

  return {
    app,
    board,
    lotPortrait: (space, level, night) => portraits.get(space, level, night),
    destroy() {
      portraits.destroy()
      board.destroy()
      // releaseGlobalResources: StrictMode and HMR re-create the app in the same tab.
      app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true })
    },
  }
}
