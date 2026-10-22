/**
 * Pixi board world. Framework-agnostic: no React here, so any shell
 * (web, Wails desktop) can mount it. See docs/ARCHITECTURE.md section 5.
 */
export { mountBoard } from './mount.ts'
export type { BoardHandle, BoardOptions } from './mount.ts'
