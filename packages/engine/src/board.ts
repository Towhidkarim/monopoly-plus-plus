/**
 * Board data: what sits on each of the 40 spaces, with classic economy numbers.
 * All names are placeholders (see CLAUDE.md naming note); mechanics and numbers are reusable.
 */

export type SpaceKind =
  | 'go'
  | 'property'
  | 'railroad'
  | 'utility'
  | 'chance'
  | 'chest'
  | 'tax'
  | 'jail'
  | 'parking'
  | 'goToJail'

export interface SpaceInfo {
  readonly kind: SpaceKind
  readonly name: string
  /** Color group 0..7 for properties, -1 otherwise. */
  readonly group: number
  /** Purchase price for ownable spaces, 0 otherwise. */
  readonly price: number
  /**
   * Property: rent with 0..4 houses and hotel (6 entries).
   * Railroad: rent by number of railroads owned (4 entries).
   * Utility: dice multiplier by number of utilities owned (2 entries).
   */
  readonly rent: readonly number[]
  /** Cost of one house (and of the hotel step) for properties. */
  readonly houseCost: number
  /** Amount due for tax spaces. */
  readonly tax: number
}

const base = { group: -1, price: 0, rent: [], houseCost: 0, tax: 0 } as const

const prop = (name: string, group: number, price: number, houseCost: number, rent: number[]): SpaceInfo => ({
  ...base,
  kind: 'property',
  name,
  group,
  price,
  houseCost,
  rent,
})
const rail = (name: string): SpaceInfo => ({
  ...base,
  kind: 'railroad',
  name,
  price: 200,
  rent: [25, 50, 100, 200],
})
const util = (name: string): SpaceInfo => ({ ...base, kind: 'utility', name, price: 150, rent: [4, 10] })
const tax = (name: string, amount: number): SpaceInfo => ({ ...base, kind: 'tax', name, tax: amount })
const other = (kind: SpaceKind, name: string): SpaceInfo => ({ ...base, kind, name })

export const SPACES: readonly SpaceInfo[] = [
  other('go', 'Launch'),
  prop('Dockside Lane', 0, 60, 50, [2, 10, 30, 90, 160, 250]),
  other('chest', 'City Fund'),
  prop('Harbor Row', 0, 60, 50, [4, 20, 60, 180, 320, 450]),
  tax('Income Tax', 200),
  rail('South Station'),
  prop('Canal Street', 1, 100, 50, [6, 30, 90, 270, 400, 550]),
  other('chance', 'Opportunity'),
  prop('Mill Avenue', 1, 100, 50, [6, 30, 90, 270, 400, 550]),
  prop('Foundry Way', 1, 120, 50, [8, 40, 100, 300, 450, 600]),
  other('jail', 'Lockup'),
  prop('Garden Court', 2, 140, 100, [10, 50, 150, 450, 625, 750]),
  util('Power Grid'),
  prop('Willow Place', 2, 140, 100, [10, 50, 150, 450, 625, 750]),
  prop('Linden Square', 2, 160, 100, [12, 60, 180, 500, 700, 900]),
  rail('West Station'),
  prop('Market Street', 3, 180, 100, [14, 70, 200, 550, 750, 950]),
  other('chest', 'City Fund'),
  prop('Bazaar Alley', 3, 180, 100, [14, 70, 200, 550, 750, 950]),
  prop('Exchange Plaza', 3, 200, 100, [16, 80, 220, 600, 800, 1000]),
  other('parking', 'Central Park'),
  prop('Theater Row', 4, 220, 150, [18, 90, 250, 700, 875, 1050]),
  other('chance', 'Opportunity'),
  prop('Gallery Walk', 4, 220, 150, [18, 90, 250, 700, 875, 1050]),
  prop('Opera Lane', 4, 240, 150, [20, 100, 300, 750, 925, 1100]),
  rail('North Station'),
  prop('Tech Boulevard', 5, 260, 150, [22, 110, 330, 800, 975, 1150]),
  prop('Circuit Drive', 5, 260, 150, [22, 110, 330, 800, 975, 1150]),
  util('Water Works'),
  prop('Silicon Heights', 5, 280, 150, [24, 120, 360, 850, 1025, 1200]),
  other('goToJail', 'Go to Lockup'),
  prop('Skyline Drive', 6, 300, 200, [26, 130, 390, 900, 1100, 1275]),
  prop('Summit Avenue', 6, 300, 200, [26, 130, 390, 900, 1100, 1275]),
  other('chest', 'City Fund'),
  prop('Tower Street', 6, 320, 200, [28, 150, 450, 1000, 1200, 1400]),
  rail('East Station'),
  other('chance', 'Opportunity'),
  prop('Crown Heights', 7, 350, 200, [35, 175, 500, 1100, 1300, 1500]),
  tax('Luxury Tax', 100),
  prop('Grand Terrace', 7, 400, 200, [50, 200, 600, 1400, 1700, 2000]),
]

export const JAIL_INDEX = 10
export const GO_TO_JAIL_INDEX = 30
export const GROUP_COUNT = 8
export const HOTEL = 5

/** Space indices per color group. */
export const GROUPS: readonly (readonly number[])[] = Array.from({ length: GROUP_COUNT }, (_, g) =>
  SPACES.flatMap((sp, i) => (sp.group === g ? [i] : [])),
)

export const RAILROADS: readonly number[] = SPACES.flatMap((sp, i) => (sp.kind === 'railroad' ? [i] : []))
export const UTILITIES: readonly number[] = SPACES.flatMap((sp, i) => (sp.kind === 'utility' ? [i] : []))

export function isOwnable(space: number): boolean {
  const k = SPACES[space]!.kind
  return k === 'property' || k === 'railroad' || k === 'utility'
}

/** Mortgage value is half the price. */
export function mortgageValue(space: number): number {
  return SPACES[space]!.price / 2
}
