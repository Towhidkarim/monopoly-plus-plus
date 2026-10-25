import type { PieceKind } from '@skyline/board'

/** Inline stroke icons (24px grid, currentColor). Decorative unless a label is passed. */

const PATHS = {
  dice: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 8h.01M16 16h.01M12 12h.01',
  city: 'M3 21h18M5 21V9l5-3v15M14 21V4l5 3v14M8 11h.01M8 15h.01M17 10h.01M17 14h.01',
  trade: 'M7 7h11l-3-3M17 17H6l3 3',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  next: 'M5 12h14M13 6l6 6-6 6',
  skip: 'M5 5l9 7-9 7zM19 5v14',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  chance: 'M12 3l8 9-8 9-8-9z',
  fund: 'M4 10h16M6 10v8M10 10v8M14 10v8M18 10v8M3 21h18M12 3l9 5H3z',
  sound: 'M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
  muted: 'M11 5 6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

/** Simple 24px stroke glyphs for the player pieces (same kinds as the board's token shapes). */
const PIECE_PATHS: Record<PieceKind, string> = {
  taxi: 'M4 16 L5.5 11 H18.5 L20 16 V19 H4 Z M7 19 V21 M17 19 V21 M9 8 H15 V11 H9 Z',
  bus: 'M5 4 H19 V17 H5 Z M5 11 H19 M8 17 V20 M16 17 V20',
  drone: 'M12 10 V14 M8 12 H16 M4 8 H8 M16 8 H20 M6 8 V11 L9 12 M18 8 V11 L15 12',
  balloon:
    'M12 3 A6 6 0 0 1 18 9 C18 13 14 16 12 17 C10 16 6 13 6 9 A6 6 0 0 1 12 3 Z M10.5 17 L11 20 H13 L13.5 17',
  pawn: 'M12 3.5 A3 3 0 0 1 12 9.5 A3 3 0 0 1 12 3.5 Z M10.5 10 L9 18 H15 L13.5 10 M7 20.5 H17',
}

export function PieceIcon({
  piece,
  size = 20,
  stroke = '#1a1020',
}: {
  piece: PieceKind
  size?: number
  stroke?: string
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={PIECE_PATHS[piece]}
        fill="none"
        stroke={stroke}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 16px tag glyph ("For sale"). */
export function TagIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2 8 V2 H8 L15 9 L9 15 Z"
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="5.5" cy="5.5" r="1.3" fill={color} />
    </svg>
  )
}

/** 16px gavel glyph ("Auction"). */
export function GavelIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 9 L9 3 M6 12 L12 6 M5 7 L9 11 M10 12 L14 16 M1 15 H8"
        fill="none"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** 14px five-point star (SET COMPLETE pill). */
export function StarIcon({ size = 10, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M7 1 L8.6 5.2 L13 5.4 L9.6 8.2 L10.8 12.6 L7 10.1 L3.2 12.6 L4.4 8.2 L1 5.4 L5.4 5.2 Z"
        fill={color}
      />
    </svg>
  )
}

/** Gold skyline glyph (My city header). */
export function SkylineIcon({ size = 22, color = '#f5b54a' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M2 18 V9 H7 V18 M8 18 V3 H13 V18 M14 18 V7 H18 V18"
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Hammer-and-wedge build glyph (Build button). */
export function BuildIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 13 L9 7 M7 3 L13 9 M6 4 L10 2 L14 6 L12 10"
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Rank medal: a disc on a ribbon, silver by default. */
export function MedalIcon({ rank }: { rank: number }) {
  const fill = rank === 1 ? '#f5b54a' : rank === 2 ? '#c9d1dc' : rank === 3 ? '#c98a5a' : '#64748b'
  return (
    <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden="true">
      <circle cx="8" cy="11" r="6" fill={fill} />
      <path d="M4 1 L6 6 M12 1 L10 6" stroke="#5b8ec2" strokeWidth="2.5" />
    </svg>
  )
}
