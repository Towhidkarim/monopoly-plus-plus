import { GROUPS, SPACES, legalActions, rentFor, type GameState } from '@skyline/engine'
import { groupName } from '../spaceInfo.ts'

/** One short, situational tip for the viewing player (the hint card on the left). */
export interface Hint {
  tone: 'info' | 'warn'
  title: string
  text: string
  /** Show an "Open My city" link. */
  city?: boolean
}

/** Spaces one roll can reach from `pos` (2 to 12 ahead). */
const reach = (pos: number) => Array.from({ length: 11 }, (_, k) => (pos + 2 + k) % SPACES.length)

/** Highest priority first: danger, then opportunities. Null when there is nothing useful to say. */
export function hintFor(s: GameState, seat: number): Hint | null {
  const me = s.players[seat]
  if (!me || me.bankrupt || s.phase === 'gameOver') return null

  const threat = reach(me.position)
    .filter((i) => s.owner[i]! >= 0 && s.owner[i] !== seat && !s.mortgaged[i])
    .map((i) => ({ i, rent: rentFor(s, i, 7) }))
    .reduce<{ i: number; rent: number } | null>((a, b) => (!a || b.rent > a.rent ? b : a), null)
  if (threat && me.cash < threat.rent) {
    return {
      tone: 'warn',
      title: 'Low cash',
      text: `₵${me.cash.toLocaleString()} left, and ${SPACES[threat.i]!.name} (rent ₵${threat.rent.toLocaleString()}) is one roll away. Mortgaging raises cash.`,
      city: true,
    }
  }

  const builds = legalActions(s, me.id).filter((a) => a.type === 'BUILD')
  const buildGroup = builds.length > 0 && builds[0]!.type === 'BUILD' ? SPACES[builds[0]!.space]!.group : -1
  if (buildGroup >= 0) {
    return {
      tone: 'info',
      title: 'Hint',
      text: `Your ${groupName(buildGroup)} set is complete, so houses there multiply its rent.`,
      city: true,
    }
  }

  for (let g = 0; g < GROUPS.length; g++) {
    const spaces = GROUPS[g]!
    const missing = spaces.filter((i) => s.owner[i] !== seat)
    if (missing.length !== 1) continue
    const m = missing[0]!
    const holder = s.owner[m]!
    return {
      tone: 'info',
      title: 'Hint',
      text:
        holder < 0
          ? `${SPACES[m]!.name} is still for sale. It would complete your ${groupName(g)} set.`
          : `${s.players[holder]!.name} holds ${SPACES[m]!.name}, the last piece you need for ${groupName(g)}.`,
    }
  }
  return null
}
