import type { CardArtKind } from './cardInfo.ts'

const LABEL: Record<CardArtKind, string> = {
  pin: 'A map pin with a dotted route',
  coin: 'A coin with a star',
  bill: 'A bill and coins leaving',
  repair: 'A hammer and a house',
  lock: 'A padlock',
  key: 'A key',
}

const COIN = '#f2c14e'
const COIN_DARK = '#c8962a'

/** Emblem illustrations for event cards (58px grid), drawn in the deck's band color. */
export function CardArt({ kind, band, tint }: { kind: CardArtKind; band: string; tint: string }) {
  const line = {
    fill: 'none',
    stroke: band,
    strokeWidth: 3,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const
  return (
    <svg width="60" height="60" viewBox="0 0 58 58">
      <title>{LABEL[kind]}</title>
      {kind === 'pin' && (
        <>
          <path
            d="M29 6 C21 6 16 12 16 19 C16 28 29 40 29 40 C29 40 42 28 42 19 C42 12 37 6 29 6 Z"
            fill={tint}
          />
          <path d="M8 50 C16 44 22 52 30 46 C36 42 42 48 50 44" {...line} strokeDasharray="1 5" />
          <path d="M29 14 A5 5 0 1 1 28.99 14 Z" fill={band} />
        </>
      )}
      {kind === 'coin' && (
        <>
          <circle cx="29" cy="29" r="18" fill={COIN} />
          <circle cx="29" cy="29" r="13" fill="none" stroke={COIN_DARK} strokeWidth="2" />
          <path
            d="M29 20 L31.5 26 L38 26.3 L33 30.4 L34.7 36.8 L29 33.2 L23.3 36.8 L25 30.4 L20 26.3 L26.5 26 Z"
            fill={band}
          />
        </>
      )}
      {kind === 'bill' && (
        <>
          <rect x="7" y="17" width="34" height="22" rx="4" fill={tint} stroke={band} strokeWidth="3" />
          <circle cx="24" cy="28" r="5" fill="none" stroke={band} strokeWidth="2.5" />
          <circle cx="46" cy="38" r="7" fill={COIN} stroke={COIN_DARK} strokeWidth="2" />
          <path d="M42 22 H52 M48 18 L52 22 L48 26" {...line} strokeWidth="2.6" />
        </>
      )}
      {kind === 'repair' && (
        <>
          <path
            d="M10 46 V28 L25 17 L40 28 V46 Z"
            fill={tint}
            stroke={band}
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path d="M21 46 V35 H29 V46" {...line} strokeWidth="2.5" />
          <path d="M33 25 L50 8" {...line} strokeWidth="4" />
          <path d="M44 6 L52 14 L48 18 L40 10 Z" fill={band} />
        </>
      )}
      {kind === 'lock' && (
        <>
          <path d="M19 26 V19 a10 10 0 0 1 20 0 V26" {...line} strokeWidth="4" />
          <rect x="13" y="26" width="32" height="24" rx="5" fill={tint} stroke={band} strokeWidth="3" />
          <circle cx="29" cy="36" r="3.6" fill={band} />
          <path d="M29 38 V44" {...line} strokeWidth="3" />
        </>
      )}
      {kind === 'key' && (
        <>
          <circle cx="19" cy="24" r="11" fill={tint} stroke={band} strokeWidth="3" />
          <circle cx="19" cy="24" r="3.5" fill={band} />
          <path d="M27 32 L48 50 M40 44 L44 40 M45 49 L49 45" {...line} strokeWidth="3.4" />
        </>
      )}
    </svg>
  )
}
