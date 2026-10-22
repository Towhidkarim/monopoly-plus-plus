/**
 * Skyline rules engine. Pure, deterministic, serializable.
 * See docs/ARCHITECTURE.md section 2 for the contract.
 */

/** Number of spaces on the board ring. */
export const BOARD_SIZE = 40

/** Wraps any integer onto the ring 0..BOARD_SIZE-1. */
export function wrapSpace(index: number): number {
  return ((index % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE
}
