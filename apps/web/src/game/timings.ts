/**
 * Every shell timing in one place, for feel tuning (ROADMAP Milestone 4.5 item 8).
 * Values are milliseconds at 1x speed; playback divides them by the speed setting.
 * Board-side motion (hops, squash, camera) is tuned separately via `BoardTuning`.
 */
export const TIMINGS = {
  /** Dice tumble before the token starts moving. */
  dice: 620,
  /** A bot's drawn card stays up this long before closing by itself. */
  botCard: 1700,
  /** Pause after rent or tax so the payment registers. */
  paymentBeat: 260,
  /** Coins flying between two player cards. */
  coinFlight: 950,
  /** Gap between consecutive coins in one transfer. */
  coinStagger: 85,
  /** Floating "+₵200" over a player card. */
  numberPop: 1100,
  /** HUD cash counting up or down to its new value. */
  cashTick: 420,
  /** Big-moment callout ("You paid ₵600 rent to Juno"). */
  callout: 2200,
  /** Activity toasts fade after this long (the full log keeps everything). */
  toastLife: 6000,
  /** Bot "thinking" delay: base plus a random extra up to `botThinkJitter`. */
  botThink: 380,
  botThinkJitter: 420,
  /** Bot delay in fast-bots mode. */
  botFast: 40,
} as const

/** Rent at or above this (or any rent a human pays or receives) gets a center callout. */
export const BIG_RENT = 150

/** Coins in one flying transfer: more money, more coins (also paces the coin sounds). */
export const coinCount = (amount: number) => Math.max(3, Math.min(9, Math.round(3 + amount / 120)))

/** When the last coin of a transfer lands (the payee's "+₵" pops then), at 1x. */
export const coinsLandMs = (amount: number) =>
  TIMINGS.coinFlight + (coinCount(amount) - 1) * TIMINGS.coinStagger
