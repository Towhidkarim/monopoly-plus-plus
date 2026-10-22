/**
 * Pixi board world. Framework-agnostic: no React here, so any shell
 * (web, Wails desktop) can mount it. See docs/ARCHITECTURE.md section 5 and docs/BOARD.md.
 */
export { mountBoard } from './mount.ts'
export type { BoardHandle, BoardOptions } from './mount.ts'
export { Board, DEFAULT_TUNING } from './board.ts'
export type { BoardListeners, BoardTuning } from './board.ts'
export { groupColors, tokenColors } from './palette.ts'
