/**
 * Card decks as data (classic effects, placeholder text). Effects are applied in rules/cards.ts.
 */

export type Deck = 'chance' | 'chest'

export type CardEffect =
  /** Walk forward to `space`, collecting salary if passing GO. */
  | { type: 'advanceTo'; space: number }
  /** Walk forward to the nearest space of a kind; railroad rent x`rentMultiplier`, utility pays 10x a fresh roll. */
  | { type: 'advanceToNearest'; kind: 'railroad' | 'utility' }
  /** Move by a signed number of steps (negative = backward, no salary). */
  | { type: 'moveBy'; steps: number }
  /** Bank pays (positive) or player pays the bank (negative). */
  | { type: 'cash'; amount: number }
  /** Pay `amount` to every other active player. */
  | { type: 'payEachPlayer'; amount: number }
  /** Collect `amount` from every other active player. */
  | { type: 'collectFromEachPlayer'; amount: number }
  /** Pay per house and per hotel owned. */
  | { type: 'repairs'; perHouse: number; perHotel: number }
  | { type: 'goToJail' }
  | { type: 'getOutOfJailFree' }

export interface Card {
  readonly text: string
  readonly effect: CardEffect
}

export const CHANCE_CARDS: readonly Card[] = [
  { text: 'Advance to Grand Terrace.', effect: { type: 'advanceTo', space: 39 } },
  { text: 'Advance to Launch. Collect your salary.', effect: { type: 'advanceTo', space: 0 } },
  { text: 'Advance to Opera Lane.', effect: { type: 'advanceTo', space: 24 } },
  { text: 'Advance to Garden Court.', effect: { type: 'advanceTo', space: 11 } },
  {
    text: 'Advance to the nearest station. Pay the owner twice the rent.',
    effect: { type: 'advanceToNearest', kind: 'railroad' },
  },
  {
    text: 'Advance to the nearest station. Pay the owner twice the rent.',
    effect: { type: 'advanceToNearest', kind: 'railroad' },
  },
  {
    text: 'Advance to the nearest utility. If owned, pay 10x a fresh dice roll.',
    effect: { type: 'advanceToNearest', kind: 'utility' },
  },
  { text: 'The city pays you a dividend of 50.', effect: { type: 'cash', amount: 50 } },
  { text: 'Get out of Lockup free. Keep this card until needed.', effect: { type: 'getOutOfJailFree' } },
  { text: 'Go back 3 spaces.', effect: { type: 'moveBy', steps: -3 } },
  { text: 'Go directly to Lockup. Do not pass Launch.', effect: { type: 'goToJail' } },
  {
    text: 'Building maintenance: pay 25 per house and 100 per hotel.',
    effect: { type: 'repairs', perHouse: 25, perHotel: 100 },
  },
  { text: 'Speeding fine: pay 15.', effect: { type: 'cash', amount: -15 } },
  { text: 'Take a trip to South Station.', effect: { type: 'advanceTo', space: 5 } },
  {
    text: 'You are elected council chair. Pay each player 50.',
    effect: { type: 'payEachPlayer', amount: 50 },
  },
  { text: 'Your building loan matures. Collect 150.', effect: { type: 'cash', amount: 150 } },
]

export const CHEST_CARDS: readonly Card[] = [
  { text: 'Advance to Launch. Collect your salary.', effect: { type: 'advanceTo', space: 0 } },
  { text: 'Bank error in your favor. Collect 200.', effect: { type: 'cash', amount: 200 } },
  { text: "Doctor's fee. Pay 50.", effect: { type: 'cash', amount: -50 } },
  { text: 'You sell some shares. Collect 50.', effect: { type: 'cash', amount: 50 } },
  { text: 'Get out of Lockup free. Keep this card until needed.', effect: { type: 'getOutOfJailFree' } },
  { text: 'Go directly to Lockup. Do not pass Launch.', effect: { type: 'goToJail' } },
  { text: 'Holiday fund matures. Collect 100.', effect: { type: 'cash', amount: 100 } },
  { text: 'Tax refund. Collect 20.', effect: { type: 'cash', amount: 20 } },
  {
    text: 'It is your birthday. Collect 10 from every player.',
    effect: { type: 'collectFromEachPlayer', amount: 10 },
  },
  { text: 'Life insurance matures. Collect 100.', effect: { type: 'cash', amount: 100 } },
  { text: 'Hospital fees. Pay 100.', effect: { type: 'cash', amount: -100 } },
  { text: 'School fees. Pay 50.', effect: { type: 'cash', amount: -50 } },
  { text: 'Consulting fee. Collect 25.', effect: { type: 'cash', amount: 25 } },
  {
    text: 'Street repairs: pay 40 per house and 115 per hotel.',
    effect: { type: 'repairs', perHouse: 40, perHotel: 115 },
  },
  { text: 'You won second prize in a design contest. Collect 10.', effect: { type: 'cash', amount: 10 } },
  { text: 'You inherit 100.', effect: { type: 'cash', amount: 100 } },
]

export function deckCards(deck: Deck): readonly Card[] {
  return deck === 'chance' ? CHANCE_CARDS : CHEST_CARDS
}
