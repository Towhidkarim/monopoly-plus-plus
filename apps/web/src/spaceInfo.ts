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

export function cssHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

export function spaceInfo(index: number) {
  const space = SPACES[index]!
  return {
    name: space.name,
    kind: KIND_LABEL[space.kind],
    color: space.group >= 0 ? cssHex(groupColors[space.group]!) : null,
    group: space.group,
  }
}
