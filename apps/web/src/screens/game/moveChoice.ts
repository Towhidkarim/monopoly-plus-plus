import { SPACES, rentFor, type GameState } from '@skyline/engine'
import { fmtMoney } from './format.ts'

/**
 * The Speed die's Bus and triples choice (DECISIONS.md D62): what landing on each offered
 * space would mean, for the dock buttons and the tags on the board.
 */

export type MoveTone = 'rent' | 'buy' | 'bad' | 'plain'

export interface MoveOption {
  space: number
  /** Spaces walked to get there. */
  steps: number
  /** Short text for the tile tag and the button: "Rent ₵120", "For sale ₵200", "Card". */
  tag: string
  tone: MoveTone
  /** Seat that collects rent there, or -1. */
  owner: number
  /** Rough worth of landing there, for ordering triples suggestions (higher is better). */
  score: number
}

export function landing(s: GameState, seat: number, space: number, diceTotal: number): MoveOption {
  const me = s.players[seat]!
  const info = SPACES[space]!
  const steps = (space - me.position + 40) % 40
  const salary = me.position + steps >= 40 ? s.config.goSalary : 0
  const owner = s.owner[space]!
  const base = { space, steps, owner: -1 }
  const withSalary = (o: Omit<MoveOption, 'tag' | 'score'> & { tag: string; score: number }) =>
    salary > 0 ? { ...o, tag: `${o.tag} · +${fmtMoney(salary)}`, score: o.score + salary } : o

  if (info.price > 0) {
    if (owner < 0) {
      const affordable = me.cash >= info.price
      return withSalary({
        ...base,
        tag: `For sale ${fmtMoney(info.price)}`,
        tone: 'buy',
        score: affordable ? 120 : 10,
      })
    }
    if (owner === seat) return withSalary({ ...base, tag: 'Yours', tone: 'plain', score: 0 })
    const rent = rentFor(s, space, diceTotal)
    return withSalary({
      ...base,
      owner,
      tag: rent > 0 ? `Rent ${fmtMoney(rent)}` : 'No rent',
      tone: 'rent',
      score: -rent,
    })
  }
  switch (info.kind) {
    case 'tax':
      return withSalary({ ...base, tag: `Tax ${fmtMoney(info.tax)}`, tone: 'bad', score: -info.tax })
    case 'chance':
    case 'chest':
      return withSalary({ ...base, tag: 'Draw a card', tone: 'plain', score: 0 })
    case 'goToJail':
      return withSalary({ ...base, tag: 'Go to the Lockup', tone: 'bad', score: -150 })
    case 'go':
      return withSalary({ ...base, tag: 'Launch', tone: 'plain', score: 0 })
    case 'parking':
      return withSalary({
        ...base,
        tag: s.config.freeParkingPot && s.pot > 0 ? `Pot ${fmtMoney(s.pot)}` : 'Free parking',
        tone: 'plain',
        score: s.config.freeParkingPot ? s.pot : 0,
      })
    default:
      return withSalary({ ...base, tag: 'Just visiting', tone: 'plain', score: 0 })
  }
}

/**
 * The options to show for the current move choice: every Bus destination; for triples, the
 * normal move plus the best few elsewhere (all spaces stay clickable on the board).
 */
export function moveOptions(s: GameState, seat: number, suggestions = 3): MoveOption[] {
  const m = s.pending
  if (m?.kind !== 'move') return []
  const all = m.options.map((space) => landing(s, seat, space, m.diceTotal))
  if (m.reason === 'bus') return all
  const [normal, ...rest] = all
  const best = rest.toSorted((a, b) => b.score - a.score || a.steps - b.steps).slice(0, suggestions)
  return [normal!, ...best]
}
