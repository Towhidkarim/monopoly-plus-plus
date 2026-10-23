import { SPACES, type SpaceKind } from '@skyline/engine'
import { groupColors } from '@skyline/board'

const KIND_LABEL: Record<SpaceKind, string> = {
  go: 'Start',
  property: 'Property',
  railroad: 'Station',
  utility: 'Utility',
  chance: 'Opportunity card',
  chest: 'City Fund card',
  tax: 'Tax',
  jail: 'Lockup / Just visiting',
  parking: 'Free rest',
  goToJail: 'Go to Lockup',
}

/** District names per color group (placeholders, like the street names). */
const GROUP_NAMES = ['Docks', 'Old Town', 'Gardens', 'Market', 'Theater', 'Tech', 'Uptown', 'Crown']

export function cssHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

export function groupName(group: number): string {
  return GROUP_NAMES[group] ?? 'Other'
}

export function groupColor(group: number): string {
  return cssHex(groupColors[group]!)
}

export function spaceInfo(index: number) {
  const space = SPACES[index]!
  return {
    name: space.name,
    kind: KIND_LABEL[space.kind],
    color: space.group >= 0 ? groupColor(space.group) : null,
    group: space.group,
  }
}
