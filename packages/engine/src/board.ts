/**
 * Board layout data: what sits on each of the 40 spaces.
 * Prices, rents, and cards arrive with the rules engine (Milestone 2).
 * All names are placeholders (see CLAUDE.md naming note).
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
}

const s = (kind: SpaceKind, name: string, group = -1): SpaceInfo => ({ kind, name, group })

export const SPACES: readonly SpaceInfo[] = [
  s('go', 'Launch'),
  s('property', 'Dockside Lane', 0),
  s('chest', 'City Fund'),
  s('property', 'Harbor Row', 0),
  s('tax', 'Income Tax'),
  s('railroad', 'South Station'),
  s('property', 'Canal Street', 1),
  s('chance', 'Opportunity'),
  s('property', 'Mill Avenue', 1),
  s('property', 'Foundry Way', 1),
  s('jail', 'Lockup'),
  s('property', 'Garden Court', 2),
  s('utility', 'Power Grid'),
  s('property', 'Willow Place', 2),
  s('property', 'Linden Square', 2),
  s('railroad', 'West Station'),
  s('property', 'Market Street', 3),
  s('chest', 'City Fund'),
  s('property', 'Bazaar Alley', 3),
  s('property', 'Exchange Plaza', 3),
  s('parking', 'Central Park'),
  s('property', 'Theater Row', 4),
  s('chance', 'Opportunity'),
  s('property', 'Gallery Walk', 4),
  s('property', 'Opera Lane', 4),
  s('railroad', 'North Station'),
  s('property', 'Tech Boulevard', 5),
  s('property', 'Circuit Drive', 5),
  s('utility', 'Water Works'),
  s('property', 'Silicon Heights', 5),
  s('goToJail', 'Go to Lockup'),
  s('property', 'Skyline Drive', 6),
  s('property', 'Summit Avenue', 6),
  s('chest', 'City Fund'),
  s('property', 'Tower Street', 6),
  s('railroad', 'East Station'),
  s('chance', 'Opportunity'),
  s('property', 'Crown Heights', 7),
  s('tax', 'Luxury Tax'),
  s('property', 'Grand Terrace', 7),
]

export const JAIL_INDEX = 10
export const GO_TO_JAIL_INDEX = 30
export const GROUP_COUNT = 8
