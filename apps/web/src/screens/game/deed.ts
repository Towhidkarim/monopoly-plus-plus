import { GROUPS, RAILROADS, SPACES, UTILITIES, ownsGroup, type GameState } from '@skyline/engine'
import { groupColor, groupName } from '../../spaceInfo.ts'

/** The spaces that count together with `index` for rent: its color group, stations or utilities. */
export function familyOf(index: number): readonly number[] {
  const sp = SPACES[index]!
  if (sp.kind === 'railroad') return RAILROADS
  if (sp.kind === 'utility') return UTILITIES
  return GROUPS[sp.group] ?? [index]
}

export function familyName(index: number): string {
  const sp = SPACES[index]!
  if (sp.kind === 'railroad') return 'Stations'
  if (sp.kind === 'utility') return 'Utilities'
  return groupName(sp.group)
}

export function familyColor(index: number): string {
  const g = SPACES[index]!.group
  return g >= 0 ? groupColor(g) : '#94a3b8'
}

/** Which TitleDeed row applies to an owned space right now (see TitleDeed `active`). */
export function activeRow(s: GameState, index: number): number {
  const owner = s.owner[index]!
  if (owner < 0 || s.mortgaged[index]) return -1
  const sp = SPACES[index]!
  const count = familyOf(index).filter((i) => s.owner[i] === owner).length
  if (sp.kind !== 'property') return count - 1
  const level = s.houses[index]!
  return level > 0 ? level + 1 : ownsGroup(s, owner, sp.group) ? 1 : 0
}

/** "You'd own 2 of 3" style progress for a seat considering `index`. */
export function setProgress(s: GameState, seat: number, index: number) {
  const family = familyOf(index)
  const mine = family.filter((i) => s.owner[i] === seat).length + (s.owner[index] === seat ? 0 : 1)
  const others = family.filter((i) => i !== index && s.owner[i] !== seat)
  const held = others.filter((i) => s.owner[i]! >= 0)
  const note =
    mine === family.length
      ? 'This completes your set!'
      : others.length === 0
        ? ''
        : held.length === 0
          ? `Nobody owns the other ${others.length === 1 ? 'one' : others.length} yet.`
          : held.map((i) => `${s.players[s.owner[i]!]!.name} owns ${SPACES[i]!.name}`).join(', ') + '.'
  return { total: family.length, mine, note, name: familyName(index), color: familyColor(index) }
}

export const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

/** Dark ink on light bands, white on deep ones. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.5 ? '#0b2a3a' : '#ffffff'
}
