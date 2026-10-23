/**
 * Everything that shapes how a heuristic bot plays, as plain data, so personalities and
 * difficulty levels are just presets and the simulator can tune the numbers.
 */
export interface BotParams {
  name: string
  /** Cash kept in hand no matter what. */
  reserve: number
  /** Extra reserve as a share of the worst rent within one roll. */
  danger: number
  /** How much a ₵ of expected future rent is worth against a ₵ in hand (0..1). */
  incomeWeight: number
  /** Buys while cash after buying stays above reserve × this (below 1 = keen buyer). */
  buyCaution: number
  /** Builds while cash after building stays above reserve × this. */
  buildCaution: number
  /** Highest auction bid as a share of what the space is worth to us. */
  bidCap: number
  /** Random spread on valuations, so the bot is not perfectly predictable. */
  noise: number
  /** Trades: minimum gain (₵ of value) to accept or propose. */
  tradeMargin: number
  /** Trades: how much the partner's extra gain counts against us (0 = ignores, 1 = zero-sum). */
  envy: number
  /** Proposes trades at all. */
  proposes: boolean
}

export const BALANCED: BotParams = {
  name: 'Balanced',
  reserve: 120,
  danger: 0.5,
  incomeWeight: 0.55,
  buyCaution: 0.5,
  buildCaution: 1,
  bidCap: 1,
  noise: 0.1,
  tradeMargin: 40,
  envy: 0.7,
  proposes: true,
}

/** Personality presets. Difficulty levels will be derived from these later. */
export const PERSONALITIES: Record<string, BotParams> = {
  balanced: BALANCED,
  /** Hoards cash, builds late, hard to bankrupt. */
  banker: {
    ...BALANCED,
    name: 'Banker',
    reserve: 220,
    danger: 0.8,
    buyCaution: 1,
    buildCaution: 1.6,
    bidCap: 0.85,
  },
  /** Buys and builds hard, lives dangerously. */
  tycoon: {
    ...BALANCED,
    name: 'Tycoon',
    reserve: 60,
    danger: 0.25,
    buyCaution: 0.2,
    buildCaution: 0.6,
    bidCap: 1.2,
  },
  /** Lives for the deal: trades often and drives a hard bargain. */
  shark: { ...BALANCED, name: 'Shark', tradeMargin: 25, envy: 1, bidCap: 1.05 },
}
