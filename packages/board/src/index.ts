/**
 * Pixi board world. Framework-agnostic: no React here, so any shell
 * (web, Wails desktop) can mount it. See docs/ARCHITECTURE.md section 5 and docs/BOARD.md.
 */
export { mountBoard } from './mount.ts'
export type { BoardHandle, BoardOptions } from './mount.ts'
export { BANKRUPT_HOLD_MS, Board, DEFAULT_TUNING } from './board.ts'
export type {
  BoardCursors,
  BoardBeat,
  BoardListeners,
  BoardPlayer,
  BoardSnapshot,
  BoardTuning,
} from './board.ts'
export { DEFAULT_JUICE, cloneJuice } from './juice/config.ts'
export { DEFAULT_THROW_AREA, DEFAULT_THROW_FROM } from './dice/view.ts'
export type { DiceSettle, DiceThrowOptions, DiceThrowResult, SpeedFace } from './dice/view.ts'
export type { ThrowArea } from './dice/sim.ts'
export type { JuiceConfig } from './juice/config.ts'
export type { OddsMark } from './view/odds.ts'
export type { Insets } from './view/camera.ts'
export { groupColors, tokenColors } from './palette.ts'
export { PIECES } from './pieces/shapes.ts'
export type { PieceKind } from './pieces/shapes.ts'
export { mountArtSheet } from './art/sheet.ts'
export type { ArtSheetHandle } from './art/sheet.ts'
export { STYLES } from './art/style.ts'
export { ART } from './art/paint.ts'
export type { ArtStyle } from './art/style.ts'
