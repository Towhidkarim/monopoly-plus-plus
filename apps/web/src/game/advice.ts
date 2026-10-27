import { GROUPS, RAILROADS, SPACES, UTILITIES, rentFor, type GameState } from '@skyline/engine'
import { groupName } from '../spaceInfo.ts'

export interface Advice {
  tone: 'good' | 'info' | 'warn'
  text: string
}

/** Cash left below this after paying reads as risky (matches the HUD's low-cash warning). */
const LOW_CASH = 150

/**
 * One or two short lines on whether buying `space` for `price` is a good idea for `seat`: what
 * it does for sets (completes yours, blocks someone's), station and utility counts, how many
 * visits pay it back, and a warning when it leaves cash thin. Most telling first.
 */
export function buyAdvice(s: GameState, seat: number, space: number, price: number): Advice[] {
  const sp = SPACES[space]!
  const out: Advice[] = []
  const after = { ...s, owner: s.owner.map((o, i) => (i === space ? seat : o)) }
  const name = (x: number) => s.players[x]!.name

  if (sp.kind === 'property') {
    const family = GROUPS[sp.group]!
    const others = family.filter((i) => i !== space)
    const holders = new Set(others.map((i) => s.owner[i]!))
    if (others.every((i) => s.owner[i] === seat)) {
      out.push({
        tone: 'good',
        text: `Completes ${groupName(sp.group)}: rent doubles and you can build.`,
      })
    } else if (holders.size === 1 && !holders.has(seat) && !holders.has(-1)) {
      const rival = [...holders][0]!
      out.push({ tone: 'good', text: `Blocks ${name(rival)} from completing ${groupName(sp.group)}.` })
    }
  } else if (sp.kind === 'railroad') {
    const n = RAILROADS.filter((i) => after.owner[i] === seat).length
    out.push({
      tone: n > 1 ? 'good' : 'info',
      text: `Your ${ORDINAL[n - 1]} station: ₵${rentFor(after, space, 7)} a visit${n > 1 ? ', and each of your stations earns that' : ''}.`,
    })
  } else if (sp.kind === 'utility') {
    const both = UTILITIES.every((i) => after.owner[i] === seat)
    out.push({
      tone: both ? 'good' : 'info',
      text: both ? 'Both utilities: 10× the dice a visit.' : '4× the dice a visit; 10× with both.',
    })
  }

  const cashAfter = s.players[seat]!.cash - price
  if (cashAfter < LOW_CASH) {
    out.push({
      tone: 'warn',
      text:
        cashAfter < 0
          ? `You'd need ₵${-cashAfter} more: mortgage or sell first.`
          : `Leaves you ₵${cashAfter}: one big rent could force you to sell.`,
    })
  } else {
    // A typical visit: the rent now (utilities at an average roll of 7).
    const rent = rentFor(after, space, 7)
    if (rent > 0) {
      const visits = Math.ceil(price / rent)
      out.push({
        tone: 'info',
        text: `Pays for itself after about ${visits} ${visits === 1 ? 'visit' : 'visits'}.`,
      })
    }
  }
  return out.slice(0, 2)
}

const ORDINAL = ['first', 'second', 'third', 'fourth']
