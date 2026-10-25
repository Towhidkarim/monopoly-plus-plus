import { SPACES, isOwnable, type Card, type Deck } from '@skyline/engine'
import { groupColor } from '../../spaceInfo.ts'
import { fmtMoney } from './format.ts'

/** Look of each deck (D32): band, back and printed frame. */
export const DECK_STYLE = {
  chance: {
    name: 'Opportunity',
    band: '#5b5fd6',
    back: '#2b2f7a',
    backEdge: '#7c80ea',
    pip: 'M8 1 L15 8 L8 15 L1 8 Z',
  },
  chest: {
    name: 'City Fund',
    band: '#14957f',
    back: '#0e5246',
    backEdge: '#3cc2a9',
    pip: 'M8 1 A7 7 0 1 1 7.99 1 Z',
  },
} as const satisfies Record<Deck, unknown>

/** Short flavor titles per card text (web only; the engine knows nothing about them). */
const FLAVOR: Record<string, string> = {
  'Advance to Grand Terrace.': 'Grand arrival',
  'Advance to Launch. Collect your salary.': 'Fresh start',
  'Advance to Opera Lane.': 'Opening night',
  'Advance to Garden Court.': 'Garden stroll',
  'Advance to the nearest station. Pay the owner twice the rent.': 'Rail dash',
  'Advance to the nearest utility. If owned, pay 10x a fresh dice roll.': 'Power up',
  'The city pays you a dividend of 50.': 'Civic dividend',
  'Get out of Lockup free. Keep this card until needed.': 'Free pass',
  'Go back 3 spaces.': 'Wrong turn',
  'Go directly to Lockup. Do not pass Launch.': 'Caught out',
  'Building maintenance: pay 25 per house and 100 per hotel.': 'Upkeep',
  'Speeding fine: pay 15.': 'Heavy foot',
  'Take a trip to South Station.': 'Day trip',
  'You are elected council chair. Pay each player 50.': 'Council round',
  'Your building loan matures. Collect 150.': 'Lucky break',
  'Bank error in your favor. Collect 200.': 'Happy error',
  "Doctor's fee. Pay 50.": 'Checkup',
  'You sell some shares. Collect 50.': 'Market tip',
  'Holiday fund matures. Collect 100.': 'Holiday fund',
  'Tax refund. Collect 20.': 'Tax refund',
  'It is your birthday. Collect 10 from every player.': 'Party time',
  'Life insurance matures. Collect 100.': 'Rainy day',
  'Hospital fees. Pay 100.': 'Hospital bill',
  'School fees. Pay 50.': 'School run',
  'Consulting fee. Collect 25.': 'Side gig',
  'Street repairs: pay 40 per house and 115 per hotel.': 'Street works',
  'You won second prize in a design contest. Collect 10.': 'Design prize',
  'You inherit 100.': 'Family gift',
}

const FALLBACK: Record<Card['effect']['type'], string> = {
  advanceTo: 'On the move',
  advanceToNearest: 'On the move',
  moveBy: 'Change of plans',
  cash: 'City ledger',
  payEachPlayer: 'Round of payments',
  collectFromEachPlayer: 'Collection day',
  repairs: 'Upkeep',
  goToJail: 'Caught out',
  getOutOfJailFree: 'Free pass',
}

export function flavorOf(card: Card): string {
  return FLAVOR[card.text] ?? FALLBACK[card.effect.type]
}

export type CardArtKind = 'pin' | 'coin' | 'bill' | 'repair' | 'lock' | 'key'

export function artOf(card: Card): CardArtKind {
  const e = card.effect
  switch (e.type) {
    case 'advanceTo':
    case 'advanceToNearest':
    case 'moveBy':
      return 'pin'
    case 'cash':
      return e.amount < 0 ? 'bill' : 'coin'
    case 'payEachPlayer':
      return 'bill'
    case 'collectFromEachPlayer':
      return 'coin'
    case 'repairs':
      return 'repair'
    case 'goToJail':
      return 'lock'
    case 'getOutOfJailFree':
      return 'key'
  }
}

/** The money line of a card, or null when it involves none. `bad` colors it as a cost. */
export function moneyOf(card: Card, salary: number): { text: string; bad: boolean } | null {
  const e = card.effect
  switch (e.type) {
    case 'cash':
      return e.amount >= 0
        ? { text: `Collect ${fmtMoney(e.amount)}`, bad: false }
        : { text: `Pay ${fmtMoney(-e.amount)}`, bad: true }
    case 'payEachPlayer':
      return { text: `Pay ${fmtMoney(e.amount)} to each player`, bad: true }
    case 'collectFromEachPlayer':
      return { text: `Collect ${fmtMoney(e.amount)} from each player`, bad: false }
    case 'repairs':
      return { text: `${fmtMoney(e.perHouse)} per house · ${fmtMoney(e.perHotel)} per hotel`, bad: true }
    case 'advanceTo':
      return e.space === 0 ? { text: `Pass Launch: +${fmtMoney(salary)}`, bad: false } : null
    default:
      return null
  }
}

const NAMES = SPACES.flatMap((s, i) => (isOwnable(i) ? [{ name: s.name, group: s.group }] : []))
const NAME_RE = new RegExp(
  `(${NAMES.map((n) => n.name)
    .toSorted((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})`,
)

export interface TextPart {
  text: string
  /** Set for a property name: chip colors from its group. */
  chip?: { bg: string; ink: string }
}

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
}

/** Splits card text so property names can be set in a chip of their group color. */
export function textParts(text: string): TextPart[] {
  return text
    .split(NAME_RE)
    .map((part, i): TextPart => {
      if (i % 2 === 0) return { text: part }
      const group = NAMES.find((n) => n.name === part)?.group ?? -1
      const base = group >= 0 ? groupColor(group) : '#64748b'
      const [r, g, b] = hexToRgb(base)
      return {
        text: part,
        chip: {
          bg: `rgba(${r},${g},${b},0.22)`,
          ink: `rgb(${Math.round(r * 0.4)},${Math.round(g * 0.4)},${Math.round(b * 0.4)})`,
        },
      }
    })
    .filter((p) => p.text !== '')
}
