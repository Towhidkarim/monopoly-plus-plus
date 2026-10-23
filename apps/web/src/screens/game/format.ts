/** Formatting and settings shared by the game screen components (non-component module). */

export const fmtMoney = (v: number) => `₵${v.toLocaleString()}`

export type SpeedChoice = 1 | 2 | 4 | 'instant'
export const SPEEDS: readonly SpeedChoice[] = [1, 2, 4, 'instant']
