/** Board palette (docs/ART_GUIDE.md section 2). Single source of truth for Pixi colors. */

export const palette = {
  table: 0x0b1426,
  slabTop: 0x1b2638,
  slabLeft: 0x2b3350,
  slabRight: 0x1b2238,
  slabRim: 0x7f8dbb,
  /** Table by day: a touch toward dusk-blue; it settles to `table` at night. */
  tableDay: 0x0f1b33,
  tileTop: 0xe2e8f0,
  cornerTop: 0xcbd5e1,
  tileLeft: 0x94a3b8,
  tileRight: 0x64748b,
  plazaTop: 0x9fb0c6,
  road: 0x334155,
  roadLine: 0xcbd5e1,
  rail: 0x475569,
  grass: 0x5eead4,
  ink: 0x1e293b,
  accent: 0x22d3ee,
  alert: 0xfb7185,
  amber: 0xfbbf24,
  indigo: 0x6366f1,
  sky: 0x60a5fa,
  teal: 0x14b8a6,
  hover: 0x22d3ee,
  select: 0xfbbf24,
} as const

/** Property group colors, in board order (also mirrored in the React shell). */
export const groupColors = [
  0xa78bfa, 0x7dd3fc, 0xf472b6, 0xfb923c, 0xf87171, 0xfbbf24, 0x34d399, 0x6366f1,
] as const

export const tokenColors = [0xfb7185, 0x22d3ee, 0xfbbf24, 0xa78bfa, 0x34d399, 0xf8fafc] as const

/** Multiplies each RGB channel by k (k < 1 darkens). */
export function shade(color: number, k: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * k))
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * k))
  const b = Math.min(255, Math.round((color & 0xff) * k))
  return (r << 16) | (g << 8) | b
}
