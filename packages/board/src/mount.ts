import { Application } from 'pixi.js'

export interface BoardOptions {
  /** Canvas clear color. */
  background?: number
}

export interface BoardHandle {
  readonly app: Application
  destroy(): void
}

/**
 * Creates the Pixi application inside `host` and keeps it sized to it.
 * Resolves to a handle whose `destroy()` removes the canvas and frees GPU resources.
 */
export async function mountBoard(host: HTMLElement, options: BoardOptions = {}): Promise<BoardHandle> {
  const app = new Application()
  await app.init({
    resizeTo: host,
    background: options.background ?? 0x0e1a30,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
  })
  host.appendChild(app.canvas)

  return {
    app,
    destroy() {
      // releaseGlobalResources: StrictMode and HMR re-create the app in the same tab.
      app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true })
    },
  }
}
