/**
 * Skyline rules engine. Pure, deterministic, serializable.
 * See docs/ARCHITECTURE.md section 2 for the contract.
 */

export * from './board.ts'
export type * from './events.ts'

/** Number of spaces on the board ring. */
export const BOARD_SIZE = 40

/** Wraps any integer onto the ring 0..BOARD_SIZE-1. */
export function wrapSpace(index: number): number {
  return ((index % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE
}

/** Spaces entered when walking `steps` forward from `from` (excludes `from`, includes landing). */
export function walkPath(from: number, steps: number): number[] {
  const path: number[] = []
  for (let i = 1; i <= steps; i++) path.push(wrapSpace(from + i))
  return path
}
