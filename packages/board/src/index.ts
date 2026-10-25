/**
 * Pixi board world. Framework-agnostic: no React here, so any shell
 * (web, Wails desktop) can mount it. See docs/ARCHITECTURE.md section 5 and docs/BOARD.md.
 */
export { mountBoard } from './mount.ts'
export type { BoardHandle, BoardOptions } from './mount.ts'
export { Board, DEFAULT_TUNING } from './board.ts'
export type {
  BoardCursors,
  BoardBeat,
  BoardListeners,
  BoardPlayer,
  BoardSnapshot,
  BoardTuning,
} from './board.ts'
export { DEFAULT_JUICE, cloneJuice } from './juice/config.ts'
export type { JuiceConfig } from './juice/config.ts'
export type { Insets } from './view/camera.ts'
export { groupColors, tokenColors } from './palette.ts'
export { PIECES } from './pieces/shapes.ts'
export type { PieceKind } from './pieces/shapes.ts'
export { mountArtSheet } from './art/sheet.ts'
export type { ArtSheetHandle } from './art/sheet.ts'
export { STYLES } from './art/style.ts'
export { ART } from './art/paint.ts'
export type { ArtStyle } from './art/style.ts'
