import { Application } from 'pixi.js'
import { Board } from './board.ts'
import { palette } from './palette.ts'

export interface BoardOptions {
  /** Canvas clear color. */
  background?: number
}

export interface BoardHandle {
  readonly app: Application
  readonly board: Board
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
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
  })
  host.appendChild(app.canvas)
  const board = new Board(app)

  return {
    app,
    board,
    destroy() {
      board.destroy()
      // releaseGlobalResources: StrictMode and HMR re-create the app in the same tab.
      app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true })
    },
  }
}
